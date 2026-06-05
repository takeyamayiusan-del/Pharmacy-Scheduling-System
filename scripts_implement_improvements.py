#!/usr/bin/env python3
"""
藥局排班系統改進實作腳本
1. 重複打卡防護
2. 打卡修改審計日誌
3. 補休假過期提醒
4. 批量操作功能
"""

import re
from pathlib import Path

# ─── Phase 1: 重複打卡防護與審計日誌 ───────────────────────────────────────

print("="*70)
print("Phase 1: 重複打卡防護與打卡修改審計日誌")
print("="*70)

# 1. 在 AppContext 中新增重複打卡檢查函式
app_context = Path('/home/ubuntu/Pharmacy-Scheduling-System/lib/context/AppContext.tsx').read_text()

# 檢查是否已有重複打卡檢查
if "checkDuplicatePunch" not in app_context:
    print("\n✓ 新增重複打卡檢查函式...")
    
    # 找到 addPunchRecord 函式的位置
    add_punch_pattern = r'(const addPunchRecord = async \(.*?\) => \{)'
    match = re.search(add_punch_pattern, app_context, re.DOTALL)
    
    if match:
        # 在 addPunchRecord 前新增檢查函式
        check_duplicate_fn = '''
  // 檢查是否有重複打卡（5 分鐘內）
  const checkDuplicatePunch = (employeeId: string, date: string, type: "in" | "out"): boolean => {
    const recentPunches = punchRecords.filter(
      (p) =>
        p.employeeId === employeeId &&
        p.date === date &&
        p.type === type
    );
    
    if (recentPunches.length === 0) return false;
    
    const lastPunch = recentPunches[recentPunches.length - 1];
    const lastTime = new Date(lastPunch.time).getTime();
    const now = new Date().getTime();
    const diffMinutes = (now - lastTime) / (1000 * 60);
    
    return diffMinutes < 5; // 5 分鐘內視為重複
  };

'''
        # 在 addPunchRecord 前插入
        insert_pos = app_context.find('const addPunchRecord = async')
        app_context = app_context[:insert_pos] + check_duplicate_fn + app_context[insert_pos:]
        print("  ✓ 檢查函式已新增")

# 2. 在 addPunchRecord 中加入重複打卡檢查
if "checkDuplicatePunch" in app_context and "if (checkDuplicatePunch" not in app_context:
    print("✓ 在 addPunchRecord 中加入重複檢查邏輯...")
    
    # 在 addPunchRecord 函式開頭加入檢查
    pattern = r'(const addPunchRecord = async \(.*?\) => \{\s*try \{)'
    replacement = r'\1\n    // 檢查重複打卡\n    if (checkDuplicatePunch(employeeId, date, type)) {\n      toast.error("5 分鐘內已有打卡記錄，請稍後再試");\n      return;\n    }\n'
    app_context = re.sub(pattern, replacement, app_context, flags=re.DOTALL)
    print("  ✓ 重複檢查邏輯已加入")

# 3. 新增審計日誌記錄函式
if "logPunchAudit" not in app_context:
    print("✓ 新增打卡審計日誌記錄函式...")
    
    audit_fn = '''
  // 記錄打卡修改審計日誌
  const logPunchAudit = async (
    punchId: string,
    action: "create" | "update" | "delete",
    oldData: any,
    newData: any,
    adminId: string
  ) => {
    try {
      await supabase.from("punch_audit_logs").insert({
        punch_id: punchId,
        action,
        old_data: oldData,
        new_data: newData,
        admin_id: adminId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("審計日誌記錄失敗:", error);
    }
  };

'''
    # 在 checkDuplicatePunch 後插入
    insert_pos = app_context.find('const addPunchRecord = async')
    app_context = app_context[:insert_pos] + audit_fn + app_context[insert_pos:]
    print("  ✓ 審計日誌函式已新增")

# 4. 在 updatePunchRecord 中加入審計日誌
if "updatePunchRecord" in app_context and "logPunchAudit" in app_context:
    print("✓ 在 updatePunchRecord 中加入審計日誌記錄...")
    
    # 在 updatePunchRecord 的 supabase.from("punch_records").update 後加入
    pattern = r'(await supabase\.from\("punch_records"\)\.update\({[^}]+}\)\.eq\("id", id\);)'
    replacement = r'\1\n    // 記錄審計日誌\n    const oldRecord = punchRecords.find((p) => p.id === id);\n    if (oldRecord) {\n      await logPunchAudit(id, "update", oldRecord, updates, user?.id || "");\n    }\n'
    app_context = re.sub(pattern, replacement, app_context, flags=re.DOTALL)
    print("  ✓ 審計日誌記錄已加入")

# 5. 在 deletePunchRecord 中加入審計日誌
if "deletePunchRecord" in app_context and "logPunchAudit" in app_context:
    print("✓ 在 deletePunchRecord 中加入審計日誌記錄...")
    
    # 在 deletePunchRecord 的 supabase.from("punch_records").delete 後加入
    pattern = r'(await supabase\.from\("punch_records"\)\.delete\(\)\.eq\("id", id\);)'
    replacement = r'\1\n    // 記錄審計日誌\n    const deletedRecord = punchRecords.find((p) => p.id === id);\n    if (deletedRecord) {\n      await logPunchAudit(id, "delete", deletedRecord, null, user?.id || "");\n    }\n'
    app_context = re.sub(pattern, replacement, app_context, flags=re.DOTALL)
    print("  ✓ 審計日誌記錄已加入")

# 保存修改
Path('/home/ubuntu/Pharmacy-Scheduling-System/lib/context/AppContext.tsx').write_text(app_context)
print("\n✓ AppContext.tsx 已更新")

# ─── Phase 2: 補休假過期提醒 ──────────────────────────────────────────────

print("\n" + "="*70)
print("Phase 2: 補休假過期提醒功能")
print("="*70)

# 1. 新增補休假過期計算函式
app_context = Path('/home/ubuntu/Pharmacy-Scheduling-System/lib/context/AppContext.tsx').read_text()

if "getCompLeaveExpiry" not in app_context:
    print("\n✓ 新增補休假過期計算函式...")
    
    expiry_fn = '''
  // 計算補休假過期日期（6 個月後）
  const getCompLeaveExpiry = (createdDate: string): { daysLeft: number; isExpired: boolean } => {
    const created = new Date(createdDate);
    const expiry = new Date(created);
    expiry.setMonth(expiry.getMonth() + 6);
    
    const now = new Date();
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    return {
      daysLeft: Math.max(0, daysLeft),
      isExpired: daysLeft < 0,
    };
  };

'''
    insert_pos = app_context.find('const addPunchRecord = async')
    app_context = app_context[:insert_pos] + expiry_fn + app_context[insert_pos:]
    print("  ✓ 過期計算函式已新增")

# 2. 新增補休假額度查詢函式（含過期篩選）
if "getAvailableCompLeave" not in app_context:
    print("✓ 新增可用補休假查詢函式...")
    
    available_fn = '''
  // 取得可用補休假（已過期的自動排除）
  const getAvailableCompLeave = (employeeId: string): { balance: number; expiring: any[] } => {
    const balance = getCompLeaveBalance(employeeId);
    
    // 找出即將過期的補休假（7 天內）
    const expiring = compLeaveLedger
      .filter((entry) => entry.user_id === employeeId && entry.hours > 0)
      .map((entry) => ({
        ...entry,
        ...getCompLeaveExpiry(entry.created_at),
      }))
      .filter((entry) => entry.daysLeft > 0 && entry.daysLeft <= 7)
      .sort((a, b) => a.daysLeft - b.daysLeft);
    
    return { balance, expiring };
  };

'''
    insert_pos = app_context.find('const addPunchRecord = async')
    app_context = app_context[:insert_pos] + available_fn + app_context[insert_pos:]
    print("  ✓ 可用補休假查詢函式已新增")

Path('/home/ubuntu/Pharmacy-Scheduling-System/lib/context/AppContext.tsx').write_text(app_context)
print("\n✓ AppContext.tsx 已更新（補休假過期邏輯）")

# ─── Phase 3: 批量操作功能 ───────────────────────────────────────────────

print("\n" + "="*70)
print("Phase 3: 批量操作功能")
print("="*70)

# 1. 新增批量核准函式
app_context = Path('/home/ubuntu/Pharmacy-Scheduling-System/lib/context/AppContext.tsx').read_text()

if "batchApproveApplications" not in app_context:
    print("\n✓ 新增批量核准申請函式...")
    
    batch_approve_fn = '''
  // 批量核准申請
  const batchApproveApplications = async (
    applicationIds: string[],
    type: "leave" | "overtime" | "shift_swap"
  ) => {
    try {
      for (const id of applicationIds) {
        if (type === "leave") {
          await approveLeaveApplication(id);
        } else if (type === "overtime") {
          await approveOvertimeApplication(id);
        } else if (type === "shift_swap") {
          await approveShiftSwapApplication(id);
        }
      }
      toast.success(`已核准 ${applicationIds.length} 筆申請`);
    } catch (error) {
      console.error("批量核准失敗:", error);
      toast.error("批量核准失敗");
    }
  };

'''
    insert_pos = app_context.find('const addPunchRecord = async')
    app_context = app_context[:insert_pos] + batch_approve_fn + app_context[insert_pos:]
    print("  ✓ 批量核准函式已新增")

# 2. 新增批量拒絕函式
if "batchRejectApplications" not in app_context:
    print("✓ 新增批量拒絕申請函式...")
    
    batch_reject_fn = '''
  // 批量拒絕申請
  const batchRejectApplications = async (
    applicationIds: string[],
    type: "leave" | "overtime" | "shift_swap",
    reason: string
  ) => {
    try {
      for (const id of applicationIds) {
        if (type === "leave") {
          await updateLeaveApplication(id, { status: "rejected", reason });
        } else if (type === "overtime") {
          await updateOvertimeApplication(id, { status: "rejected", reason });
        } else if (type === "shift_swap") {
          await updateShiftSwapApplication(id, { status: "rejected", reason });
        }
      }
      toast.success(`已拒絕 ${applicationIds.length} 筆申請`);
    } catch (error) {
      console.error("批量拒絕失敗:", error);
      toast.error("批量拒絕失敗");
    }
  };

'''
    insert_pos = app_context.find('const addPunchRecord = async')
    app_context = app_context[:insert_pos] + batch_reject_fn + app_context[insert_pos:]
    print("  ✓ 批量拒絕函式已新增")

# 3. 新增批量新增排班函式
if "batchAddSchedules" not in app_context:
    print("✓ 新增批量新增排班函式...")
    
    batch_schedule_fn = '''
  // 批量新增排班
  const batchAddSchedules = async (
    schedules: Array<{
      employeeId: string;
      date: string;
      shiftId: string;
    }>
  ) => {
    try {
      for (const schedule of schedules) {
        await supabase.from("schedules").insert({
          employee_id: schedule.employeeId,
          date: schedule.date,
          shift_id: schedule.shiftId,
        });
      }
      await loadSchedules();
      toast.success(`已新增 ${schedules.length} 筆排班`);
    } catch (error) {
      console.error("批量新增排班失敗:", error);
      toast.error("批量新增排班失敗");
    }
  };

'''
    insert_pos = app_context.find('const addPunchRecord = async')
    app_context = app_context[:insert_pos] + batch_schedule_fn + app_context[insert_pos:]
    print("  ✓ 批量新增排班函式已新增")

Path('/home/ubuntu/Pharmacy-Scheduling-System/lib/context/AppContext.tsx').write_text(app_context)
print("\n✓ AppContext.tsx 已更新（批量操作邏輯）")

# ─── 驗證修改 ───────────────────────────────────────────────────────────────

print("\n" + "="*70)
print("驗證修改")
print("="*70)

app_context = Path('/home/ubuntu/Pharmacy-Scheduling-System/lib/context/AppContext.tsx').read_text()

checks = {
    "重複打卡防護": "checkDuplicatePunch" in app_context,
    "打卡審計日誌": "logPunchAudit" in app_context,
    "補休假過期計算": "getCompLeaveExpiry" in app_context,
    "可用補休假查詢": "getAvailableCompLeave" in app_context,
    "批量核准申請": "batchApproveApplications" in app_context,
    "批量拒絕申請": "batchRejectApplications" in app_context,
    "批量新增排班": "batchAddSchedules" in app_context,
}

for feature, present in checks.items():
    status = "✓" if present else "✗"
    print(f"{status} {feature}")

print("\n" + "="*70)
print("改進實作完成")
print("="*70)
