// ============================================================
// [已廢止] 舊版員工無密碼登入 Edge Function
// 現行流程：店長在「員工管理」建立帳號密碼，員工以 signInWithPassword 登入
// 本機自架請使用 scripts/seed-local-users.mjs 建立預設管理者
// ============================================================

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      error: "此登入方式已廢止，請使用店長提供的帳號與密碼登入",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
