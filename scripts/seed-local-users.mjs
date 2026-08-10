/**
 * 建立本機預設管理者帳號
 *   竹山店長：admin / admin123（site=zhushan）
 *   老闆：boss / boss123（site=zhushan，可跨店切換）
 *   集集店長：jiji / jiji123（site=jiji）
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
];

const AUTH_EMAIL_DOMAIN = "yaosheng.app";

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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
  console.log("完成！登入方式（店長／老闆分頁）：");
  console.log("  竹山店長 → admin / admin123");
  console.log("  老闆　　 → boss / boss123（可切換店別）");
  console.log("  集集店長 → jiji / jiji123");
  console.log("");
  console.log("請在首次登入後修改密碼（員工管理 → 變更我的密碼）。");
}

main().catch((err) => {
  console.error("Seed 失敗：", err.message);
  process.exit(1);
});
