import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  isLocalStoragePath,
  readLocalAttachment,
  removeAttachmentObject,
  resolveAttachmentAccessUrl,
  uploadAttachmentObject,
} from "@/lib/storage/fileStore";

const BUCKET = "training-materials";
const MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

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

function isTrainingAdmin(role: string): boolean {
  return ["boss", "owner", "manager", "deputy"].includes(role);
}

/** 上傳訓練教材（PDF／PPT／影片，≤50MB） */
export async function POST(req: NextRequest) {
  try {
    const caller = await getCaller(req);
    if (!caller || !isTrainingAdmin(caller.role)) {
      return NextResponse.json({ error: "僅老闆／店長／副店可上傳教材" }, { status: 403 });
    }

    const form = await req.formData();
    const courseId = String(form.get("courseId") ?? "");
    const title = String(form.get("title") ?? "").trim();
    const file = form.get("file");
    if (!courseId || !title || !(file instanceof File)) {
      return NextResponse.json({ error: "參數不完整" }, { status: 400 });
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json({ error: "僅支援 PDF、PPT、MP4／WebM 影片" }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return NextResponse.json({ error: "檔案需小於 50MB" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: course, error: courseError } = await admin
      .from("training_courses")
      .select("id")
      .eq("id", courseId)
      .single();
    if (courseError || !course) {
      return NextResponse.json({ error: "找不到課程" }, { status: 404 });
    }

    const safeName = file.name.replace(/[^\w.\u4e00-\u9fff-]+/g, "_").slice(0, 120);
    const objectPath = `${courseId}/${Date.now()}_${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    let uploaded;
    try {
      uploaded = await uploadAttachmentObject({
        admin,
        bucket: BUCKET,
        objectPath,
        buffer,
        contentType: file.type,
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "上傳失敗" },
        { status: 500 }
      );
    }

    const { count } = await admin
      .from("training_materials")
      .select("*", { count: "exact", head: true })
      .eq("course_id", courseId);

    const { data: row, error: insertError } = await admin
      .from("training_materials")
      .insert({
        course_id: courseId,
        title,
        sort_order: count ?? 0,
        storage_path: uploaded.storagePath,
        file_name: file.name.slice(0, 200),
        mime_type: file.type,
        file_size: file.size,
      })
      .select("*")
      .single();

    if (insertError || !row) {
      await removeAttachmentObject({
        admin,
        bucket: BUCKET,
        storagePath: uploaded.storagePath,
      });
      return NextResponse.json({ error: insertError?.message || "寫入教材失敗" }, { status: 500 });
    }

    return NextResponse.json({ material: row, driver: uploaded.driver });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "上傳失敗" },
      { status: 500 }
    );
  }
}

/** 取得教材預覽／下載 */
export async function GET(req: NextRequest) {
  try {
    const caller = await getCaller(req);
    if (!caller) {
      return NextResponse.json({ error: "尚未登入" }, { status: 401 });
    }

    const materialId = req.nextUrl.searchParams.get("id");
    if (!materialId) {
      return NextResponse.json({ error: "缺少教材 id" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: row, error } = await admin
      .from("training_materials")
      .select("id, storage_path, file_name, mime_type, course_id")
      .eq("id", materialId)
      .single();

    if (error || !row?.storage_path) {
      return NextResponse.json({ error: "找不到教材" }, { status: 404 });
    }

    const wantRaw = req.nextUrl.searchParams.get("raw") === "1";
    if (isLocalStoragePath(row.storage_path)) {
      if (wantRaw) {
        const buf = await readLocalAttachment(row.storage_path);
        return new NextResponse(new Uint8Array(buf), {
          headers: {
            "Content-Type": row.mime_type || "application/octet-stream",
            "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
              row.file_name || "file"
            )}`,
            "Cache-Control": "private, max-age=60",
          },
        });
      }
      return NextResponse.json({
        url: `${req.nextUrl.pathname}?id=${encodeURIComponent(materialId)}&raw=1`,
        fileName: row.file_name,
        mimeType: row.mime_type,
      });
    }

    try {
      const url = await resolveAttachmentAccessUrl({
        admin,
        bucket: BUCKET,
        storagePath: row.storage_path,
        apiRawUrl: `${req.nextUrl.pathname}?id=${encodeURIComponent(materialId)}&raw=1`,
        expiresSec: 3600,
      });
      return NextResponse.json({
        url,
        fileName: row.file_name,
        mimeType: row.mime_type,
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "產生連結失敗" },
        { status: 500 }
      );
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "取得教材失敗" },
      { status: 500 }
    );
  }
}
