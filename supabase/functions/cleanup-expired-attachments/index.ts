// ============================================================
// 耀聖藥局智慧排班系統 - Cleanup Expired Attachments Edge Function
// 用於定時清理超過 168 小時（7天）的附件
// ============================================================

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // 處理 CORS preflight 請求
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

    // 計算 168 小時前的時間
    const expirationThreshold = new Date();
    expirationThreshold.setHours(expirationThreshold.getHours() - 168);

    console.log("開始清理附件，截止時間：", expirationThreshold.toISOString());

    // 查詢所有超過期限且狀態為 active 的附件
    const { data: expiredAttachments, error: selectError } = await supabaseAdmin
      .from("leave_attachments")
      .select("id, storage_path, file_name")
      .eq("status", "active")
      .lt("uploaded_at", expirationThreshold.toISOString());

    if (selectError) {
      console.error("查詢過期附件失敗：", selectError);
      return new Response(
        JSON.stringify({ error: "查詢失敗" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!expiredAttachments || expiredAttachments.length === 0) {
      console.log("無需清理的過期附件");
      return new Response(
        JSON.stringify({
          success: true,
          message: "無需清理的過期附件",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(`找到 ${expiredAttachments.length} 個過期附件待清理`);

    let successCount = 0;
    let failCount = 0;

    // 逐個處理附件
    for (const attachment of expiredAttachments) {
      try {
        // 1. 從 Storage 中刪除檔案
        const { error: storageError } = await supabaseAdmin.storage
          .from("leave-attachments")
          .remove([attachment.storage_path]);

        if (storageError) {
          console.error(`刪除 Storage 檔案失敗：`, attachment.file_name, storageError);
          // 更新狀態為 delete_failed
          await supabaseAdmin
            .from("leave_attachments")
            .update({ status: "delete_failed" })
            .eq("id", attachment.id);
          failCount++;
        } else {
            // 更新狀態為 expired
            await supabaseAdmin
              .from("leave_attachments")
              .update({ status: "expired", deleted_at: new Date().toISOString() })
              .eq("id", attachment.id);
            successCount++;
        }
      } catch (error) {
        console.error(`處理附件失敗：`, attachment.file_name, error);
        // 更新狀態為 delete_failed
        await supabaseAdmin
          .from("leave_attachments")
          .update({ status: "delete_failed" })
          .eq("id", attachment.id);
        failCount++;
      }
    }

    console.log(`清理完成：成功 ${successCount} 個，失敗 ${failCount} 個`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `清理完成：成功 ${successCount} 個，失敗 ${failCount} 個`,
        successCount,
        failCount,
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
