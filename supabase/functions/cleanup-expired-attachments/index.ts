// ============================================================
// 耀聖藥局智慧排班系統 - Cleanup Expired Attachments Edge Function
// 請假附件：超過 168 小時（7 天）
// 獎金佐證：超過 expires_at（預設 30 天）
// ============================================================

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type CleanupResult = {
  bucket: string;
  table: string;
  successCount: number;
  failCount: number;
};

async function cleanupLeaveAttachments(
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<CleanupResult> {
  const expirationThreshold = new Date();
  expirationThreshold.setHours(expirationThreshold.getHours() - 168);

  const { data: expiredAttachments, error: selectError } = await supabaseAdmin
    .from("leave_attachments")
    .select("id, storage_path, file_name")
    .eq("status", "active")
    .lt("uploaded_at", expirationThreshold.toISOString());

  if (selectError) {
    throw new Error(`查詢請假附件失敗：${selectError.message}`);
  }

  let successCount = 0;
  let failCount = 0;

  for (const attachment of expiredAttachments ?? []) {
    try {
      const { error: storageError } = await supabaseAdmin.storage
        .from("leave-attachments")
        .remove([attachment.storage_path]);

      if (storageError) {
        await supabaseAdmin
          .from("leave_attachments")
          .update({ status: "delete_failed" })
          .eq("id", attachment.id);
        failCount++;
      } else {
        await supabaseAdmin
          .from("leave_attachments")
          .update({ status: "expired", deleted_at: new Date().toISOString() })
          .eq("id", attachment.id);
        successCount++;
      }
    } catch {
      await supabaseAdmin
        .from("leave_attachments")
        .update({ status: "delete_failed" })
        .eq("id", attachment.id);
      failCount++;
    }
  }

  return {
    bucket: "leave-attachments",
    table: "leave_attachments",
    successCount,
    failCount,
  };
}

async function cleanupPayrollBonusAttachments(
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<CleanupResult> {
  const nowIso = new Date().toISOString();

  const { data: expiredAttachments, error: selectError } = await supabaseAdmin
    .from("payroll_adjustment_attachments")
    .select("id, storage_path, file_name")
    .lt("expires_at", nowIso);

  if (selectError) {
    throw new Error(`查詢獎金附件失敗：${selectError.message}`);
  }

  let successCount = 0;
  let failCount = 0;

  for (const attachment of expiredAttachments ?? []) {
    try {
      const { error: storageError } = await supabaseAdmin.storage
        .from("payroll-bonus-attachments")
        .remove([attachment.storage_path]);

      if (storageError) {
        failCount++;
        continue;
      }

      const { error: deleteError } = await supabaseAdmin
        .from("payroll_adjustment_attachments")
        .delete()
        .eq("id", attachment.id);

      if (deleteError) {
        failCount++;
      } else {
        successCount++;
      }
    } catch {
      failCount++;
    }
  }

  return {
    bucket: "payroll-bonus-attachments",
    table: "payroll_adjustment_attachments",
    successCount,
    failCount,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const results = await Promise.all([
      cleanupLeaveAttachments(supabaseAdmin),
      cleanupPayrollBonusAttachments(supabaseAdmin),
    ]);

    const successCount = results.reduce((sum, r) => sum + r.successCount, 0);
    const failCount = results.reduce((sum, r) => sum + r.failCount, 0);

    return new Response(
      JSON.stringify({
        success: true,
        message: `清理完成：成功 ${successCount} 個，失敗 ${failCount} 個`,
        successCount,
        failCount,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in cleanup-expired-attachments function:", error);
    return new Response(
      JSON.stringify({ error: "伺服器錯誤" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
