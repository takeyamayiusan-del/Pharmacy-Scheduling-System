/**
 * 建立本機預設管理者帳號
 *   店長：admin / admin123
 *   老闆：boss / boss123
 *
 * 前置：supabase start && supabase db push
 * 執行：npm run data:seed-users
 */

import { createClient } from "./supabase-client.mjs";
import { loadEnvFile } from "./load-env.mjs";

loadEnvFile(".env.local-db");

const url = process.env.LOCAL_SUPABASE_URL || "http://127.0.0.1:54321";
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error("錯誤：請在 scripts/.env.local-db 設定 LOCAL_SUPABASE_SERVICE_ROLE_KEY");
  console.error("提示：執行 supabase status 可取得金鑰");
  process.exit(1);
}

const DEFAULT_ACCOUNTS = [
  { username: "admin", password: "admin123", name: "店長", role: "manager" },
  { username: "boss", password: "boss123", name: "老闆", role: "boss" },
];

const AUTH_EMAIL_DOMAIN = "yaosheng.app";

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seedAccount({ username, password, name, role }) {
  const email = `${username}@${AUTH_EMAIL_DOMAIN}`;

  const { data: existingProfile } = await supabase
    .from("users")
    .select("id, username")
    .eq("username", username)
    .maybeSingle();

  if (existingProfile) {
    await supabase.auth.admin.updateUserById(existingProfile.id, { password });
    console.log(`  [更新密碼] ${username}（${name}）`);
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
      });
      if (insertError) throw new Error(`${username}：${insertError.message}`);
      console.log(`  [修復資料] ${username}（${name}）`);
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
  });

  if (insertError) {
    await supabase.auth.admin.deleteUser(authData.user.id);
    throw new Error(`${username}：${insertError.message}`);
  }

  console.log(`  [新建] ${username} / ${password}（${name}，${role}）`);
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

async function main() {
  console.log("========================================");
  console.log("  建立本機預設管理者帳號");
  console.log("========================================");
  console.log(`目標：${url}`);
  console.log("");

  await seedSchedulingRules();

  console.log("建立管理者：");
  for (const account of DEFAULT_ACCOUNTS) {
    await seedAccount(account);
  }

  console.log("");
  console.log("完成！登入方式：");
  console.log("  店長分頁 → admin / admin123");
  console.log("  老闆分頁 → boss / boss123");
  console.log("");
  console.log("請在首次登入後修改密碼（員工管理 → 編輯自己的帳號）。");
}

main().catch((err) => {
  console.error("Seed 失敗：", err.message);
  process.exit(1);
});
