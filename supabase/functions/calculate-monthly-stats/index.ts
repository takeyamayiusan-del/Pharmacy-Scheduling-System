// ============================================================
// 耀聖藥局智慧排班系統 - Calculate Monthly Stats Edge Function
// 用於計算並更新員工月度工時統計
// ============================================================

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type CalculationResult = {
  userId: string;
  userName: string;
  user_id: string;
  year: number;
  month: number;
  work_days: number;
  work_hours: number;
  overtime_hours: number;
  comp_leave_hours: number;
  leave_hours: number;
};

// 各班別對應的工時（小時）
const SHIFT_HOURS: Record<string, number> = {
  A: 8,
  B: 8,
  C: 3.5,
  D: 4.5,
  E: 8,
  X: 0,
};

const TAIWAN_HOLIDAYS_2026 = new Set([
  "2026-01-01",
  "2026-01-28",
  "2026-01-29",
  "2026-01-30",
  "2026-01-31",
  "2026-02-01",
  "2026-02-28",
  "2026-04-04",
  "2026-04-05",
  "2026-05-01",
  "2026-06-19",
  "2026-09-28",
  "2026-10-10",
  "2026-10-31",
  "2026-11-12",
  "2026-12-25",
]);

// 計算兩個時間字串之間的時數差
function calculateDuration(startTime: string, endTime: string): number {
  const parseMinutes = (time: string): number => {
    const parts = time.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    return hours * 60 + minutes;
  };

  const startMinutes = parseMinutes(startTime);
  const endMinutes = parseMinutes(endTime);
  const diffMinutes = endMinutes - startMinutes;

  return diffMinutes / 60;
}

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

    // 取得要計算的年月（預設為上個月）
    let { year, month } = await req.json();
    
    if (!year || !month) {
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      year = lastMonth.getFullYear();
      month = lastMonth.getMonth() + 1;
    }

    console.log(`開始計算 ${year} 年 ${month} 月的工時統計`);

    // 計算該月的起始和結束日期
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    // 取得所有活躍員工
    const { data: users, error: usersError } = await supabaseAdmin
      .from("users")
      .select("id, name")
      .eq("is_active", true);

    if (usersError) {
      console.error("查詢員工失敗：", usersError);
      return new Response(
        JSON.stringify({ error: "查詢員工失敗" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!users || users.length === 0) {
      console.log("無活躍員工");
      return new Response(
        JSON.stringify({ success: true, message: "無活躍員工" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const results: CalculationResult[] = [];

    // 逐個員工計算
    for (const user of users) {
      try {
        // 1. 取得該員工該月的班表
        const { data: scheduleEntries, error: scheduleError } = await supabaseAdmin
          .from("schedule_entries")
          .select("date, shift_code")
          .eq("user_id", user.id)
          .gte("date", startDate)
          .lte("date", endDate);

        if (scheduleError) {
          console.error(`查詢 ${user.name} 班表失敗：`, scheduleError);
          continue;
        }

        // 2. 取得該員工該月已審核通過的加班申請
        const { data: overtimeApps, error: overtimeError } = await supabaseAdmin
          .from("overtime_applications")
          .select("start_time, end_time, compensation")
          .eq("user_id", user.id)
          .eq("status", "approved")
          .gte("overtime_date", startDate)
          .lte("overtime_date", endDate);

        if (overtimeError) {
          console.error(`查詢 ${user.name} 加班申請失敗：`, overtimeError);
        }

        // 3. 取得該員工該月已審核通過的請假申請
        const { data: leaveApps, error: leaveError } = await supabaseAdmin
          .from("leave_applications")
          .select("period")
          .eq("user_id", user.id)
          .eq("status", "approved")
          .gte("leave_date", startDate)
          .lte("leave_date", endDate);

        if (leaveError) {
          console.error(`查詢 ${user.name} 請假申請失敗：`, leaveError);
        }

        // 計算工時
        const workDays = scheduleEntries?.filter(e => e.shift_code !== 'X').length || 0;
        const workHours = scheduleEntries?.reduce((sum, e) => sum + (SHIFT_HOURS[e.shift_code] || 0), 0) || 0;
        
        const overtimeHours = overtimeApps?.filter(o => o.compensation === 'pay')
          .reduce((sum, o) => sum + calculateDuration(o.start_time, o.end_time), 0) || 0;

        const holidayOvertimeHours = scheduleEntries
          ?.filter((entry) => entry.shift_code !== "X" && TAIWAN_HOLIDAYS_2026.has(entry.date))
          .reduce((sum, entry) => sum + (SHIFT_HOURS[entry.shift_code] || 0), 0) || 0;
        
        const compLeaveHours = overtimeApps?.filter(o => o.compensation === 'comp_leave')
          .reduce((sum, o) => sum + calculateDuration(o.start_time, o.end_time), 0) || 0;
        
        const leaveHours = leaveApps?.reduce((sum, l) => sum + (l.period === 'full_day' ? 8 : 4), 0) || 0;

        // 儲存或更新統計資料
        const { data: existingStat } = await supabaseAdmin
          .from("monthly_attendance_stats")
          .select("id")
          .eq("user_id", user.id)
          .eq("year", year)
          .eq("month", month)
          .single();

        const statData = {
          user_id: user.id,
          year,
          month,
          work_days: workDays,
          work_hours: parseFloat(workHours.toFixed(2)),
          overtime_hours: parseFloat((overtimeHours + holidayOvertimeHours).toFixed(2)),
          comp_leave_hours: parseFloat(compLeaveHours.toFixed(2)),
          leave_hours: parseFloat(leaveHours.toFixed(2)),
        };

        if (existingStat) {
          await supabaseAdmin
            .from("monthly_attendance_stats")
            .update(statData)
            .eq("id", existingStat.id);
        } else {
          await supabaseAdmin
            .from("monthly_attendance_stats")
            .insert(statData);
        }

        results.push({
          userId: user.id,
          userName: user.name,
          ...statData,
        });

        console.log(`已計算 ${user.name} 的工時統計`);
      } catch (error) {
        console.error(`計算 ${user.name} 工時失敗：`, error);
      }
    }

    console.log(`工時統計計算完成，共處理 ${results.length} 位員工`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `工時統計計算完成，共處理 ${results.length} 位員工`,
        year,
        month,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in calculate-monthly-stats function:", error);
    return new Response(
      JSON.stringify({ error: "伺服器錯誤" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
