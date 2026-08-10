/**
 * 建立本機預設管理者帳號＋集集目錄落地
 *   竹山店長：admin / admin123（site=zhushan）
 *   老闆：boss / boss123（site=zhushan，可跨店切換）
 *   集集店長：jiji / jiji123（site=jiji）
 *   集集示範員工：jiji01 / jiji01123、jiji02 / jiji02123
 *   集集店家設定：store_config:jiji 載入總店班別範本（若尚無／目錄為空）
 *
 * 前置：supabase start && supabase db push
 * 執行：npm run data:seed-users
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "./supabase-client.mjs";
import { loadEnvFile } from "./load-env.mjs";

loadEnvFile(".env.local-db");

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = process.env.LOCAL_SUPABASE_URL || "http://127.0.0.1:54321";
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error("錯誤：請在 scripts/.env.local-db 設定 LOCAL_SUPABASE_SERVICE_ROLE_KEY");
  console.error("提示：執行 supabase status 可取得金鑰");
  process.exit(1);
}

const DEFAULT_ACCOUNTS = [
  {
    username: "admin",
    password: "admin123",
    name: "竹山",
    role: "manager",
    site_id: "zhushan",
  },
  {
    username: "boss",
    password: "boss123",
    name: "老闆",
    role: "boss",
    site_id: "zhushan",
  },
  {
    username: "jiji",
    password: "jiji123",
    name: "集集",
    role: "manager",
    site_id: "jiji",
  },
  {
    username: "jiji01",
    password: "jiji01123",
    name: "小美",
    role: "employee",
    site_id: "jiji",
  },
  {
    username: "jiji02",
    password: "jiji02123",
    name: "小華",
    role: "employee",
    site_id: "jiji",
  },
];

const AUTH_EMAIL_DOMAIN = "yaosheng.app";
const JIJI_STORE_CONFIG_ID = "store_config:jiji";

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function loadHeadStoreTemplate() {
  const path = join(__dirname, "..", "lib", "shift-catalog", "head-store-template.json");
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => ({
    ...item,
    id:
      typeof item.id === "string" && item.id.trim()
        ? item.id.trim()
        : `seed-jiji-${index + 1}`,
    sortOrder: typeof item.sortOrder === "number" ? item.sortOrder : index,
    enabled: typeof item.enabled === "boolean" ? item.enabled : true,
  }));
}

function buildJijiStoreConfig() {
  const catalog = loadHeadStoreTemplate();
  const pick = (...codes) =>
    codes.find((code) => catalog.some((s) => s.code === code && s.enabled)) ??
    catalog.find((s) => s.enabled)?.code ??
    "白班1";

  return {
    version: 1,
    storeName: "家禾藥局",
    siteId: "jiji",
    shifts: [
      { code: "A", name: "全天", enabled: true },
      { code: "B", name: "白班", enabled: true },
      { code: "C", name: "上午", enabled: true },
      { code: "D", name: "下午", enabled: true },
      { code: "E", name: "下午+晚", enabled: true },
      { code: "X", name: "休假", enabled: true },
    ],
    defaultWeekdayShift: pick("白班5", "白班4", "白班1"),
    defaultSaturdayShift: pick("白班2", "白班1", "白班3"),
    features: {
      rotationEvening: false,
      weekdayOffRule: false,
      customShiftCatalog: true,
    },
    rotationEvening: {
      weekdays: [3],
      onDutyShift: pick("晚班1", "晚班2", "白班5"),
      offDutyShift: pick("白班5", "白班4", "白班1"),
      monthlyOffLimit: null,
      menuLabel: "禮三晚班",
    },
    ruleTags: [
      {
        id: "rotation_evening",
        label: "輪值晚班",
        description: "依選休輪流上晚班／全天班",
      },
      {
        id: "weekday_off",
        label: "平日不排休",
        description: "平日正常上班，排休只能選週六",
      },
    ],
    shiftCatalog: catalog,
  };
}

async function seedAccount({ username, password, name, role, site_id }) {
  const email = `${username}@${AUTH_EMAIL_DOMAIN}`;
  const siteId = site_id === "jiji" ? "jiji" : "zhushan";

  const { data: existingProfile } = await supabase
    .from("users")
    .select("id, username")
    .eq("username", username)
    .maybeSingle();

  if (existingProfile) {
    await supabase.auth.admin.updateUserById(existingProfile.id, { password });
    // 不覆寫 name：老闆可能已在員工管理改成真實姓名
    const { error: updateError } = await supabase
      .from("users")
      .update({
        role,
        is_active: true,
        site_id: siteId,
      })
      .eq("id", existingProfile.id);
    if (updateError) throw new Error(`${username}：${updateError.message}`);
    console.log(`  [更新] ${username} / ${password}（保留原姓名，${siteId}）`);
    return;
  }

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    if (authError.message.includes("already been registered")) {
      const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const existing = listData.users.find((u) => u.email?.toLowerCase() === email);
      if (!existing) throw new Error(`${username}：找不到既有 auth 使用者`);

      await supabase.auth.admin.updateUserById(existing.id, { password });
      const { error: insertError } = await supabase.from("users").upsert({
        id: existing.id,
        username,
        name,
        role,
        is_active: true,
        hire_date: "2026-04-01",
        site_id: siteId,
      });
      if (insertError) throw new Error(`${username}：${insertError.message}`);
      console.log(`  [修復資料] ${username} / ${password}（${name}，${siteId}）`);
      return;
    }
    throw new Error(`${username}：${authError.message}`);
  }

  const { error: insertError } = await supabase.from("users").insert({
    id: authData.user.id,
    username,
    name,
    role,
    is_active: true,
    hire_date: "2026-04-01",
    site_id: siteId,
  });

  if (insertError) {
    await supabase.auth.admin.deleteUser(authData.user.id);
    throw new Error(`${username}：${insertError.message}`);
  }

  console.log(`  [新建] ${username} / ${password}（${name}，${siteId}）`);
}

async function seedSchedulingRules() {
  const { count } = await supabase
    .from("scheduling_rules")
    .select("*", { count: "exact", head: true });

  if (count && count > 0) return;

  const { error } = await supabase.from("scheduling_rules").insert({
    monthly_leave_quota: 8,
    saturday_leave_quota: 2,
    weekday_leave_quota: 2,
    min_evening_staff: 2,
  });

  if (error) {
    console.warn(`  排班規則 seed 略過：${error.message}`);
  } else {
    console.log("  [新建] 預設排班規則");
  }
}

async function seedJijiStoreConfig() {
  const { data, error } = await supabase
    .from("app_settings")
    .select("id, value")
    .eq("id", JIJI_STORE_CONFIG_ID)
    .maybeSingle();
  if (error) throw new Error(`讀取集集店家設定失敗：${error.message}`);

  const catalog = data?.value?.shiftCatalog;
  const needsSeed = !data || !Array.isArray(catalog) || catalog.length === 0;
  if (!needsSeed) {
    console.log("  [略過] store_config:jiji 已有班別目錄，不覆寫");
    return;
  }

  const value = buildJijiStoreConfig();
  const { error: upsertError } = await supabase.from("app_settings").upsert({
    id: JIJI_STORE_CONFIG_ID,
    value,
    updated_at: new Date().toISOString(),
  });
  if (upsertError) throw new Error(`寫入集集店家設定失敗：${upsertError.message}`);
  console.log(
    `  [寫入] store_config:jiji（總店範本 ${value.shiftCatalog.length} 班；預設平日 ${value.defaultWeekdayShift}／週六 ${value.defaultSaturdayShift}）`
  );
}

async function main() {
  console.log("========================================");
  console.log("  建立本機預設帳號＋集集目錄落地");
  console.log("========================================");
  console.log(`目標：${url}`);
  console.log("");

  await seedSchedulingRules();

  console.log("建立帳號：");
  for (const account of DEFAULT_ACCOUNTS) {
    await seedAccount(account);
  }

  console.log("");
  console.log("集集店家設定：");
  await seedJijiStoreConfig();

  console.log("");
  console.log("完成！登入方式：");
  console.log("  竹山店長 → admin / admin123（店長/老闆分頁）");
  console.log("  老闆　　 → boss / boss123（可切換店別）");
  console.log("  集集店長 → jiji / jiji123（店長/老闆分頁）");
  console.log("  集集員工 → jiji01 / jiji01123、jiji02 / jiji02123（員工分頁）");
  console.log("");
  console.log("請在首次登入後修改密碼；店長真實姓名請於員工管理修改。");
}

main().catch((err) => {
  console.error("Seed 失敗：", err.message);
  process.exit(1);
});
