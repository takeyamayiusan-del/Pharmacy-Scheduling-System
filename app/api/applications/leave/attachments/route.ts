import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "application/pdf"]);
const MAX_BYTES = 10 * 1024 * 1024;

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
    .select("id, role, is_active")
    .eq("id", user.id)
    .single();
  if (!profile?.is_active) return null;
  return profile;
}

/** 上傳請假附件（JPEG／PNG／PDF，單檔 ≤10MB） */
export async function POST(req: NextRequest) {
  try {
    const caller = await getCaller(req);
    if (!caller) {
      return NextResponse.json({ error: "尚未登入或會話已失效" }, { status: 401 });
    }

    const form = await req.formData();
    const applicationId = String(form.get("applicationId") ?? "");
    const file = form.get("file");
    if (!applicationId || !(file instanceof File)) {
      return NextResponse.json({ error: "參數不完整" }, { status: 400 });
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json({ error: "僅支援 JPEG、PNG、PDF" }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return NextResponse.json({ error: "檔案需小於 10MB" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: leave, error: leaveError } = await admin
      .from("leave_applications")
      .select("id, user_id")
      .eq("id", applicationId)
      .single();

    if (leaveError || !leave) {
      return NextResponse.json({ error: "找不到請假申請" }, { status: 404 });
    }

    const isManager = ["boss", "manager", "owner"].includes(caller.role);
    if (leave.user_id !== caller.id && !isManager) {
      return NextResponse.json({ error: "無權上傳此申請的附件" }, { status: 403 });
    }

    const safeName = file.name.replace(/[^\w.\u4e00-\u9fff-]+/g, "_").slice(0, 120);
    const storagePath = `${leave.user_id}/${applicationId}/${Date.now()}_${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await admin.storage
      .from("leave-attachments")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: row, error: insertError } = await admin
      .from("leave_attachments")
      .insert({
        application_id: applicationId,
        storage_path: storagePath,
        file_name: file.name.slice(0, 200),
        file_size: file.size,
        mime_type: file.type,
        status: "active",
      })
      .select("id, storage_path, file_name, file_size, mime_type, status, uploaded_at")
      .single();

    if (insertError || !row) {
      await admin.storage.from("leave-attachments").remove([storagePath]);
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

/** 取得附件簽名網址以便預覽／下載 */
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
      .from("leave_attachments")
      .select(
        "id, storage_path, file_name, mime_type, status, application_id, leave_applications(user_id)"
      )
      .eq("id", attachmentId)
      .single();

    if (error || !row) {
      return NextResponse.json({ error: "找不到附件" }, { status: 404 });
    }

    const leaveRel = row.leave_applications as { user_id?: string } | { user_id?: string }[] | null;
    const leaveUserId = Array.isArray(leaveRel) ? leaveRel[0]?.user_id : leaveRel?.user_id;
    const isManager = ["boss", "manager", "owner"].includes(caller.role);
    if (leaveUserId !== caller.id && !isManager) {
      return NextResponse.json({ error: "無權查看此附件" }, { status: 403 });
    }

    if (row.status !== "active") {
      return NextResponse.json({ error: "附件已失效" }, { status: 410 });
    }

    const { data: signed, error: signError } = await admin.storage
      .from("leave-attachments")
      .createSignedUrl(row.storage_path, 60 * 10);

    if (signError || !signed?.signedUrl) {
      return NextResponse.json({ error: signError?.message || "產生連結失敗" }, { status: 500 });
    }

    return NextResponse.json({
      url: signed.signedUrl,
      fileName: row.file_name,
      mimeType: row.mime_type,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "取得附件失敗" },
      { status: 500 }
    );
  }
}
