import { promises as fs } from "fs";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";

/** 本機附件根目錄（與分店 SOP 的 data/storage 一致） */
export function attachmentRootDir(): string {
  return (
    process.env.ATTACHMENT_ROOT?.trim() ||
    path.join(process.cwd(), "data", "storage")
  );
}

export const LOCAL_STORAGE_PREFIX = "local:";

export function isLocalStoragePath(storagePath: string): boolean {
  return storagePath.startsWith(LOCAL_STORAGE_PREFIX);
}

export function toLocalStoragePath(bucket: string, objectPath: string): string {
  return `${LOCAL_STORAGE_PREFIX}${bucket}/${objectPath.replace(/^\/+/, "")}`;
}

function absoluteFromLocalPath(storagePath: string): string {
  const rel = storagePath.startsWith(LOCAL_STORAGE_PREFIX)
    ? storagePath.slice(LOCAL_STORAGE_PREFIX.length)
    : storagePath;
  const full = path.resolve(attachmentRootDir(), rel);
  const root = path.resolve(attachmentRootDir());
  if (!full.startsWith(root + path.sep) && full !== root) {
    throw new Error("非法附件路徑");
  }
  return full;
}

export async function saveLocalAttachment(params: {
  bucket: string;
  objectPath: string;
  buffer: Buffer;
}): Promise<string> {
  const storagePath = toLocalStoragePath(params.bucket, params.objectPath);
  const full = absoluteFromLocalPath(storagePath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, params.buffer);
  return storagePath;
}

export async function readLocalAttachment(storagePath: string): Promise<Buffer> {
  const full = absoluteFromLocalPath(storagePath);
  return fs.readFile(full);
}

export async function removeLocalAttachment(storagePath: string): Promise<void> {
  if (!isLocalStoragePath(storagePath)) return;
  const full = absoluteFromLocalPath(storagePath);
  await fs.unlink(full).catch(() => undefined);
}

export function shouldUseLocalAttachmentStorage(): boolean {
  const mode = (process.env.ATTACHMENT_STORAGE || "").trim().toLowerCase();
  if (mode === "local") return true;
  if (mode === "supabase") return false;
  // 預設：本機／自架優先走 data/storage，避開 storage schema 權限問題
  return true;
}

export function shouldFallbackToLocal(errorMessage: string): boolean {
  const m = String(errorMessage || "").toLowerCase();
  return (
    (m.includes("permission denied") && m.includes("storage")) ||
    m.includes("schema storage") ||
    (m.includes("bucket") && (m.includes("not found") || m.includes("does not exist"))) ||
    m.includes("row-level security") ||
    m.includes("jwt")
  );
}

export type UploadAttachmentResult = {
  storagePath: string;
  driver: "local" | "supabase";
};

/** 上傳附件：可強制本機，或 Supabase 失敗後自動改存 data/storage */
export async function uploadAttachmentObject(params: {
  admin: SupabaseClient;
  bucket: string;
  objectPath: string;
  buffer: Buffer;
  contentType: string;
}): Promise<UploadAttachmentResult> {
  const preferLocal = shouldUseLocalAttachmentStorage();

  if (!preferLocal) {
    const { error } = await params.admin.storage
      .from(params.bucket)
      .upload(params.objectPath, params.buffer, {
        contentType: params.contentType,
        upsert: false,
      });
    if (!error) {
      return { storagePath: params.objectPath, driver: "supabase" };
    }
    if (!shouldFallbackToLocal(error.message)) {
      throw new Error(error.message);
    }
  }

  const storagePath = await saveLocalAttachment({
    bucket: params.bucket,
    objectPath: params.objectPath,
    buffer: params.buffer,
  });
  return { storagePath, driver: "local" };
}

export async function removeAttachmentObject(params: {
  admin: SupabaseClient;
  bucket: string;
  storagePath: string;
}): Promise<void> {
  if (isLocalStoragePath(params.storagePath)) {
    await removeLocalAttachment(params.storagePath);
    return;
  }
  await params.admin.storage.from(params.bucket).remove([params.storagePath]);
}

/** 產生前端可用的下載／預覽 URL（本機改走 API raw） */
export async function resolveAttachmentAccessUrl(params: {
  admin: SupabaseClient;
  bucket: string;
  storagePath: string;
  apiRawUrl: string;
  expiresSec?: number;
}): Promise<string> {
  if (isLocalStoragePath(params.storagePath)) {
    return params.apiRawUrl;
  }
  const { data, error } = await params.admin.storage
    .from(params.bucket)
    .createSignedUrl(params.storagePath, params.expiresSec ?? 600);
  if (error || !data?.signedUrl) {
    // Supabase 簽名失敗時，若檔案其實在本機也試 raw
    throw new Error(error?.message || "產生附件連結失敗");
  }
  return data.signedUrl;
}
