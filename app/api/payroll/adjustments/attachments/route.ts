import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { fromDbRole } from "@/lib/auth/roles";
import { parseUserCapabilities } from "@/lib/auth/permissions";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "application/pdf"]);
const MAX_BYTES = 10 * 1024 * 1024;
const BUCKET = "payroll-bonus-attachments";

async function getCaller(req: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll() {
          return;
        },
      },
    }
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("id, role, site_id, is_active, capabilities")
    .eq("id", user.id)
    .single();
  if (!profile?.is_active) return null;
  return profile;
}

function isSettlementUser(profile: {
  role: string;
  capabilities?: unknown;
}): boolean {
  const role = fromDbRole(profile.role);
  if (role === "owner") return true;
  return parseUserCapabilities(profile.capabilities).payroll === true;
}

function isBonusSubmitUser(profile: {
  role: string;
  capabilities?: unknown;
}): boolean {
  if (isSettlementUser(profile)) return true;
  const role = fromDbRole(profile.role);
  return role === "manager" || role === "deputy";
}

async function canAccessAdjustment(
  admin: ReturnType<typeof createAdminClient>,
  caller: NonNullable<Awaited<ReturnType<typeof getCaller>>>,
  adjustmentId: string
): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const { data: adj, error } = await admin
    .from("payroll_adjustments")
    .select("id, user_id")
    .eq("id", adjustmentId)
    .single();

  if (error || !adj) {
    return { ok: false, status: 404, error: "找不到加扣項" };
  }

  if (isSettlementUser(caller)) {
    return { ok: true, userId: adj.user_id };
  }

  if (!isBonusSubmitUser(caller)) {
    return { ok: false, status: 403, error: "無權上傳獎金附件" };
  }

  const { data: target } = await admin
    .from("users")
    .select("site_id")
    .eq("id", adj.user_id)
    .single();

  if (!target || target.site_id !== caller.site_id) {
    return { ok: false, status: 403, error: "僅能為同店員工上傳附件" };
  }

  return { ok: true, userId: adj.user_id };
}

/** 上傳獎金加扣項佐證（JPEG／PNG／PDF，單檔 ≤10MB，30 天後自動刪除） */
export async function POST(req: NextRequest) {
  try {
    const caller = await getCaller(req);
    if (!caller) {
      return NextResponse.json({ error: "尚未登入或會話已失效" }, { status: 401 });
    }

    const form = await req.formData();
    const adjustmentId = String(form.get("adjustmentId") ?? "");
    const file = form.get("file");
    if (!adjustmentId || !(file instanceof File)) {
      return NextResponse.json({ error: "參數不完整" }, { status: 400 });
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json({ error: "僅支援 JPEG、PNG、PDF" }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return NextResponse.json({ error: "檔案需小於 10MB" }, { status: 400 });
    }

    const admin = createAdminClient();
    const access = await canAccessAdjustment(admin, caller, adjustmentId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const safeName = file.name.replace(/[^\w.\u4e00-\u9fff-]+/g, "_").slice(0, 120);
    const storagePath = `${caller.site_id}/${adjustmentId}/${Date.now()}_${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const { data: row, error: insertError } = await admin
      .from("payroll_adjustment_attachments")
      .insert({
        adjustment_id: adjustmentId,
        storage_path: storagePath,
        file_name: file.name.slice(0, 200),
        file_size: file.size,
        mime_type: file.type,
        uploaded_by: caller.id,
        expires_at: expiresAt.toISOString(),
      })
      .select("id, adjustment_id, file_name, file_size, mime_type, expires_at, created_at")
      .single();

    if (insertError || !row) {
      await admin.storage.from(BUCKET).remove([storagePath]);
      return NextResponse.json(
        { error: insertError?.message || "寫入附件失敗" },
        { status: 500 }
      );
    }

    return NextResponse.json({ attachment: row });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "上傳失敗" },
      { status: 500 }
    );
  }
}

/** 取得獎金附件簽名網址以便預覽／下載 */
export async function GET(req: NextRequest) {
  try {
    const caller = await getCaller(req);
    if (!caller) {
      return NextResponse.json({ error: "尚未登入或會話已失效" }, { status: 401 });
    }

    const attachmentId = req.nextUrl.searchParams.get("id");
    if (!attachmentId) {
      return NextResponse.json({ error: "缺少附件 id" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: row, error } = await admin
      .from("payroll_adjustment_attachments")
      .select("id, storage_path, file_name, mime_type, expires_at, adjustment_id")
      .eq("id", attachmentId)
      .single();

    if (error || !row) {
      return NextResponse.json({ error: "找不到附件" }, { status: 404 });
    }

    const access = await canAccessAdjustment(admin, caller, row.adjustment_id);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: "附件已過期" }, { status: 410 });
    }

    const { data: signed, error: signError } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(row.storage_path, 60 * 10);

    if (signError || !signed?.signedUrl) {
      return NextResponse.json({ error: signError?.message || "產生連結失敗" }, { status: 500 });
    }

    return NextResponse.json({
      url: signed.signedUrl,
      fileName: row.file_name,
      mimeType: row.mime_type,
      expiresAt: row.expires_at,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "取得附件失敗" },
      { status: 500 }
    );
  }
}
