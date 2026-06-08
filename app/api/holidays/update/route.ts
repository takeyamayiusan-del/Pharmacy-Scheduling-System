import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase/server";

async function assertManagerAuth(req: NextRequest) {
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
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { error: "尚未登入或會話已失效", status: 401 };
  }

  const admin = createAdminClient();
  const { data: user, error } = await admin
    .from("users")
    .select("role")
    .eq("id", session.user.id)
    .single();

  if (error || !user || !["boss", "manager"].includes(user.role)) {
    return { error: "此帳號沒有更新假期的權限", status: 403 };
  }

  return { callerId: session.user.id };
}

const holidayNameMap: Record<string, string> = {
  "Republic Day": "元旦",
  "Chinese New Year": "農曆春節",
  "Lunar New Year": "農曆春節",
  "Day before Lunar New Year's Eve": "除夕",
  "Lunar New Year's Eve": "除夕",
  "Lunar New Year Holiday": "春節假期",
  "Peace Memorial Day": "二二八",
  "Peace Memorial Day (in lieu)": "二二八補假",
  "Tomb Sweeping Day": "清明節",
  "Labor Day": "勞動節",
  "Dragon Boat Festival": "端午節",
  "Mid-Autumn Festival": "中秋節",
  "Children's Day": "兒童節",
  "National Day": "國慶日",
  "Christmas Day": "聖誕節",
  "Constitution Day": "憲法紀念日",
  "Youth Day": "青年節",
};

function normalizeHolidayName(summary: string): string {
  const clean = summary.replace(/^Taiwan:\s*/i, "").trim();
  const name = clean.replace(/^Taiwan:\s*/i, "");
  for (const [key, value] of Object.entries(holidayNameMap)) {
    if (name.toLowerCase().includes(key.toLowerCase())) {
      return value;
    }
  }
  return "國定\n假日";
}

function parseICSHolidays(ics: string, year: number) {
  const lines = ics
    .replace(/\r\n/g, "\n")
    .split("\n")
    .reduce<string[]>((acc, line) => {
      if (line.startsWith(" ") || line.startsWith("\t")) {
        if (acc.length === 0) return acc;
        acc[acc.length - 1] += line.trim();
      } else {
        acc.push(line);
      }
      return acc;
    }, []);

  const events: Array<{ date: string; name: string }> = [];
  let current: Record<string, string> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) {
        const dt = current["DTSTART;VALUE=DATE"] || current["DTSTART"];
        const summary = current["SUMMARY"];
        if (dt && summary) {
          const rawDate = dt.includes(":") ? dt.split(":")[1] : dt;
          if (/^\d{8}$/.test(rawDate)) {
            const date = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
            if (date.startsWith(String(year))) {
              events.push({ date, name: normalizeHolidayName(summary) });
            }
          }
        }
      }
      current = null;
      continue;
    }
    if (current) {
      const match = line.match(/^([^:]+):(.*)$/);
      if (!match) continue;
      const fullKey = match[1];
      const value = match[2];
      current[fullKey] = value;
      const baseKey = fullKey.split(";")[0];
      if (!current[baseKey]) {
        current[baseKey] = value;
      }
    }
  }

  return events;
}

export async function POST(req: NextRequest) {
  const auth = await assertManagerAuth(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get("year");
    const year = yearParam ? Number(yearParam) : null;

    if (!year || Number.isNaN(year) || year < 2024 || year > 2100) {
      return NextResponse.json({ error: "請提供有效年份，例如 2026" }, { status: 400 });
    }

    const response = await fetch(
      "https://www.officeholidays.com/ics/ics_country.php?tbl_country=Taiwan",
      { headers: { Accept: "text/calendar" } }
    );

    if (!response.ok) {
      return NextResponse.json({ error: "無法取得假日資料來源" }, { status: 502 });
    }

    const ics = await response.text();
    const holidays = parseICSHolidays(ics, year);

    if (holidays.length === 0) {
      return NextResponse.json({ error: `未找到 ${year} 年的假日資料` }, { status: 404 });
    }

    const admin = createAdminClient();
    const { error: deleteError } = await admin
      .from("holidays")
      .delete()
      .eq("year", year);
    if (deleteError) {
      console.error("holiday delete error", deleteError);
      return NextResponse.json(
        { error: `刪除舊假日資料失敗：${deleteError.message}` },
        { status: 500 }
      );
    }

    const { error: insertError } = await admin
      .from("holidays")
      .insert(
        holidays.map((holiday) => ({
          holiday_date: holiday.date,
          name: holiday.name,
          year,
        }))
      );

    if (insertError) {
      console.error("holiday insert error", insertError);
      return NextResponse.json({ error: "儲存假日資料失敗" }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: holidays.length });
  } catch (err) {
    console.error("/api/holidays/update error", err);
    return NextResponse.json({ error: "更新假日時發生錯誤" }, { status: 500 });
  }
}
