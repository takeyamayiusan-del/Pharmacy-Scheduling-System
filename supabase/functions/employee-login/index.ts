// ============================================================
// 耀聖藥局智慧排班系統 - Employee Login Edge Function
// 用於員工無密碼登入：驗證姓名存在且 is_active = true，使用 Service Role 建立 session
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
    const { employeeName } = await req.json();

    if (!employeeName) {
      return new Response(
        JSON.stringify({ error: "employeeName 為必填欄位" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 建立 Service Role Client（用於管理用戶）
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

    // 查詢該員工是否存在且為活躍狀態
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("id, name, role, is_active")
      .eq("name", employeeName)
      .single();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "查無此員工" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!user.is_active) {
      return new Response(
        JSON.stringify({ error: "此帳號已停用" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (user.role !== "employee") {
      return new Response(
        JSON.stringify({ error: "此功能僅供員工使用" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 為該員工建立一次性登入連結（無密碼）
    const { data: magicLinkData, error: magicLinkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: `${user.id}@temp.local`,
      });

    if (magicLinkError) {
      return new Response(
        JSON.stringify({ error: "建立登入連結失敗" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 使用 token_hash 交換 session
    const { data: sessionData, error: sessionError } =
      await supabaseAdmin.auth.verifyOtp({
        token_hash: magicLinkData.properties!.hashed_token!,
        type: "magiclink",
      });

    if (sessionError) {
      return new Response(
        JSON.stringify({ error: "驗證失敗" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        session: sessionData.session,
        user: user,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in employee-login function:", error);
    return new Response(
      JSON.stringify({ error: "伺服器錯誤" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
