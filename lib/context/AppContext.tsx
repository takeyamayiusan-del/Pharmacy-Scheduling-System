"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import { mapSwapStatusFromDb, mapSwapStatusToDb, notificationRouteFromRelatedType } from "@/lib/applications/statusMaps";
import { createClient } from "@/lib/supabase/client";
import { getPunchSlotsForShift, calcLateMinutes, timeToMinutes, minutesDiff, type PunchSlot } from "@/lib/attendance/punchSchedule";

// ─── Types ───────────────────────────────────────────────────────────────────

export type Employee = {
  id: string;
  name: string;
  role: "owner" | "manager" | "staff";
  username?: string;
  password?: string;
  hireDate: string;               // 入職日期
  isWednesdayRotation?: boolean;  // 禮拜三晚班輪值
  isWeekdayOffRule?: boolean;     // 平日不排班規則
};

export type ShiftType = "A" | "B" | "C" | "D" | "E" | "X";
export type ShiftTimeConfig = Record<ShiftType, string[]>;

export type ScheduleData = {
  [date: string]: {
    [employeeId: string]: ShiftType;
  };
};

export type FixedShift = {
  employeeId: string;
  dayOfWeek: number;
  shift: ShiftType;
};

export type WednesdayNightShift = {
  date: string;
  employeeId: string;
};

export type LeaveType =
  | "事假"
  | "病假"
  | "特休"
  | "喪假"
  | "補休假"
  | "其他";

export type LeavePeriodMode = "full_day" | "morning" | "afternoon" | "custom";

export type LeaveRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  period: LeavePeriodMode;
  shiftMode: "schedule" | ShiftType;
  leaveHours: number;
  type: LeaveType;
  reason: string;
  rejectReason?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

export type CompLeaveLedgerEntry = {
  id: string;
  employeeId: string;
  hours: number;
  sourceType: string;
  sourceId?: string;
  expiresAt?: string;
  note?: string;
  createdAt: string;
};

export type SwapRequest = {
  id: string;
  requesterId: string;
  requesterName: string;
  targetEmployeeId: string;
  targetEmployeeName: string;
  requesterDate: string;
  targetDate: string;
  status: "pending_confirmation" | "pending_approval" | "approved" | "rejected";
  rejectReason?: string;
  createdAt: string;
};

export type OvertimeRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
  compensationType: "pay" | "time_off";
  rejectReason?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

export type Notification = {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  read: boolean;
  createdAt: string;
  route?: string;
};

export type BulletinItem = {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  content: string;
  type: "announcement" | "shift_swap_request" | "shift_handoff";
  status: "active" | "archived" | "completed";
  relatedId?: string;
  isUrgent: boolean;
  isPinned: boolean;
  targetType: "all" | "specific";
  targetIds: string[];
  createdAt: string;
};

export type PayrollRecord = {
  id: string;
  userId: string;
  year: number;
  month: number;
  baseSalary: number;
  laborInsurance: number;
  healthInsurance: number;
  pensionDeduction: number;
  leaveDeduction: number;
  overtimePay: number;
  tardinessDeduction: number;
  bonusTotal: number;
  finalPay: number;
  note?: string;
  isPublished: boolean;
  publishedAt?: string;
  createdAt: string;
};

export type TardinessRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  minutes: number;
  notes: string;
  createdAt: string;
};

export type Holiday = {
  id: string;
  date: string;
  name: string;
  year: number;
  createdAt: string;
};

export type PunchRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  action: "work_in" | "work_out";
  segmentIndex: number;
  time: string;
  shift: ShiftType;
  lateMinutes: number;
  reason?: string;
  latitude: number;
  longitude: number;
  createdAt: string;
};

type PunchRecordUpdate = Partial<
  Pick<PunchRecord, "time" | "action" | "segmentIndex" | "lateMinutes">
> & {
  reason?: string | null;
};

export type LeaveSummary = {
  selectedDates: string[];
  saturdayUsed: number;
  saturdayLimit: number;
  weekdayUsed: number;
  weekdayLimit: number;
  optionalSaturdayUsed: boolean;
  optionalSaturdayAvailable: boolean;
};

export type LeaveMonthLock = {
  year: number;
  month: number;
  lockedBy: string;
  lockedAt: string;
};

type WednesdayOffSelections = Record<string, string[]>;
type LeaveSelections = Record<string, string[]>;

// ─── Helper constants ─────────────────────────────────────────────────────────

export const isSunday = (dateStr: string): boolean => new Date(dateStr).getDay() === 0;
export const isSaturday = (dateStr: string): boolean => new Date(dateStr).getDay() === 6;
export const isTuesday = (dateStr: string): boolean => new Date(dateStr).getDay() === 2;
export const isWednesday = (dateStr: string): boolean => new Date(dateStr).getDay() === 3;

export const TAIWAN_HOLIDAYS_2026: { date: string; name: string }[] = [
  { date: "2026-01-01", name: "元旦" },
  { date: "2026-01-28", name: "農曆春節" },
  { date: "2026-01-29", name: "農曆春節" },
  { date: "2026-01-30", name: "農曆春節" },
  { date: "2026-01-31", name: "農曆春節" },
  { date: "2026-02-01", name: "農曆春節" },
  { date: "2026-02-28", name: "二二八" },
  { date: "2026-04-04", name: "兒童節" },
  { date: "2026-04-05", name: "清明節" },
  { date: "2026-05-01", name: "勞動節" },
  { date: "2026-06-19", name: "端午節" },
  { date: "2026-09-28", name: "中秋節" },
  { date: "2026-10-10", name: "國慶日" },
];

export const getHolidayInfo = (dateStr: string): { isHoliday: boolean; name?: string } => {
  const holiday = TAIWAN_HOLIDAYS_2026.find((item) => item.date === dateStr);
  return { isHoliday: Boolean(holiday), name: holiday?.name };
};

export const countSaturdaysInMonth = (year: number, month: number): number => {
  let count = 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (isSaturday(dateStr)) count += 1;
  }
  return count;
};

const isInMonth = (dateStr: string, year: number, month: number) => {
  const date = new Date(dateStr);
  return date.getFullYear() === year && date.getMonth() + 1 === month;
};

const getMonthSaturdays = (year: number, month: number) => {
  const dates: string[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (isSaturday(dateStr)) dates.push(dateStr);
  }
  return dates;
};

const normalizeFixedShifts = (shifts: FixedShift[]) => {
  const unique = new Map<string, FixedShift>();
  shifts.forEach((shift) => {
    unique.set(`${shift.employeeId}-${shift.dayOfWeek}`, shift);
  });
  return Array.from(unique.values()).sort((a, b) => {
    if (a.employeeId === b.employeeId) return a.dayOfWeek - b.dayOfWeek;
    return a.employeeId.localeCompare(b.employeeId);
  });
};

// Map Supabase role to AppContext role
const mapRole = (dbRole: string): "owner" | "manager" | "staff" => {
  if (dbRole === "boss" || dbRole === "owner") return "owner";
  if (dbRole === "manager") return "manager";
  return "staff";
};

const mapSwapStatusToBulletinStatus = (swapStatus: string): BulletinItem["status"] => {
  if (swapStatus === "approved") return "completed";
  if (swapStatus === "rejected") return "archived";
  return "active";
};

// ─── Context type ─────────────────────────────────────────────────────────────

interface AppContextType {
  currentUser: Employee | null;
  loginEmployee: (username: string, password: string) => Promise<boolean>;
  loginManager: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  employees: Employee[];
  addEmployee: (employee: Omit<Employee, "id">) => Promise<void>;
  updateEmployee: (id: string, employee: Partial<Employee>) => Promise<void>;
  deleteEmployee: (id: string) => Promise<void>;
  schedule: ScheduleData;
  updateShift: (date: string, employeeId: string, shift: ShiftType) => Promise<void>;
  getShiftForDate: (date: string, employeeId: string) => ShiftType;
  fixedShifts: FixedShift[];
  addFixedShift: (shift: FixedShift) => Promise<void>;
  updateFixedShift: (index: number, shift: FixedShift) => Promise<void>;
  deleteFixedShift: (index: number) => Promise<void>;
  shiftTimeConfig: ShiftTimeConfig;
  updateShiftTimeConfig: (shift: ShiftType, ranges: string[]) => Promise<void>;
  wednesdayNightShifts: WednesdayNightShift[];
  setWednesdayNightShift: (date: string, employeeId: string) => void;
  getWednesdayOffDates: (employeeId: string, year: number, month: number) => string[];
  toggleWednesdayOff: (employeeId: string, date: string) => Promise<{ success: boolean; message?: string }>;
  isWednesdayOff: (employeeId: string, date: string) => boolean;
  getLeaveSummary: (employeeId: string, year: number, month: number) => LeaveSummary;
  toggleLeaveDate: (employeeId: string, date: string) => { success: boolean; message?: string };
  isLeaveMonthLocked: (year: number, month: number) => boolean;
  lockLeaveMonth: (year: number, month: number, lockedBy: string) => Promise<void>;
  unlockLeaveMonth: (year: number, month: number) => Promise<void>;
  leaveMonthLocks: LeaveMonthLock[];
  leaveRequests: LeaveRequest[];
  addLeaveRequest: (request: Omit<LeaveRequest, "id" | "createdAt">) => Promise<void>;
  updateLeaveRequestStatus: (
    id: string,
    status: "approved" | "rejected" | "pending",
    rejectReason?: string
  ) => Promise<void>;
  deleteLeaveRequest: (id: string) => Promise<void>;
  compLeaveLedger: CompLeaveLedgerEntry[];
  getCompLeaveBalance: (employeeId: string) => number;
  getAnnualLeaveQuota: (employee: Employee) => number;
  getAnnualLeaveBalance: (employeeId: string, year: number) => number;
  getAvailableCompLeave: (employeeId: string) => { balance: number; expiring: Array<Record<string, unknown>> };
  loadCompLeaveLedger: () => Promise<void>;
  swapRequests: SwapRequest[];
  addSwapRequest: (request: Omit<SwapRequest, "id" | "createdAt">) => Promise<void>;
  updateSwapRequestStatus: (id: string, status: "pending_confirmation" | "pending_approval" | "approved" | "rejected", rejectReason?: string) => Promise<void>;
  deleteSwapRequest: (id: string) => Promise<void>;
  overtimeRequests: OvertimeRequest[];
  addOvertimeRequest: (request: Omit<OvertimeRequest, "id" | "createdAt">) => Promise<void>;
  updateOvertimeRequestStatus: (id: string, status: "approved" | "rejected", rejectReason?: string) => Promise<void>;
  deleteOvertimeRequest: (id: string) => Promise<void>;
  tardinessRecords: TardinessRecord[];
  addTardinessRecord: (record: Omit<TardinessRecord, "id" | "createdAt">) => Promise<void>;
  deleteTardinessRecord: (id: string) => Promise<void>;
  punchRecords: PunchRecord[];
  addPunchRecord: (record: Omit<PunchRecord, "id" | "createdAt">) => Promise<void>;
  updatePunchRecord: (id: string, updates: PunchRecordUpdate) => Promise<void>;
  deletePunchRecord: (id: string) => Promise<void>;
  getTodayPunchRecords: (employeeId: string, date: string) => PunchRecord[];
  getPunchRecordsByDate: (employeeId: string, date: string) => PunchRecord[];
  notifications: Notification[];
  markNotificationRead: (id: string) => void;
  refreshNotifications: () => Promise<void>;
  bulletinItems: BulletinItem[];
  addBulletinItem: (item: Omit<BulletinItem, "id" | "authorName" | "createdAt">) => Promise<void>;
  updateBulletinItem: (id: string, updates: Partial<BulletinItem>) => Promise<void>;
  deleteBulletinItem: (id: string) => Promise<void>;
  loadBulletinItems: () => Promise<void>;
  readBulletinItem: (bulletinId: string) => Promise<void>;
  isBulletinRead: (bulletinId: string) => boolean;
  payrollRecords: PayrollRecord[];
  publishPayrollRecord: (id: string) => Promise<void>;
  loadPayrollRecords: (year: number, month: number) => Promise<void>;
  isLoading: boolean;
  isSunday: (dateStr: string) => boolean;
  isSaturday: (dateStr: string) => boolean;
  isTuesday: (dateStr: string) => boolean;
  isWednesday: (dateStr: string) => boolean;
  getHolidayInfo: (dateStr: string) => { isHoliday: boolean; name?: string };
  countSaturdaysInMonth: (year: number, month: number) => number;
  holidays: Holiday[];
  loadHolidays: () => Promise<void>;
  refreshHolidayCalendar: (year: number) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);

  const [currentUser, setCurrentUser] = useState<Employee | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Supabase-backed state
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([]);
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>([]);
  const [tardinessRecords, setTardinessRecords] = useState<TardinessRecord[]>([]);
  const [punchRecords, setPunchRecords] = useState<PunchRecord[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [bulletinItems, setBulletinItems] = useState<BulletinItem[]>([]);
  const [bulletinReads, setBulletinReads] = useState<{ bulletinId: string; userId: string }[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [leaveSelections, setLeaveSelections] = useState<LeaveSelections>({});
  const [wednesdayOffSelections, setWednesdayOffSelections] = useState<WednesdayOffSelections>({});
  const [leaveMonthLocks, setLeaveMonthLocks] = useState<LeaveMonthLock[]>([]);
  const [compLeaveLedger, setCompLeaveLedger] = useState<CompLeaveLedgerEntry[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  // Supabase-backed state (previously in localStorage)
  const [schedule, setSchedule] = useState<ScheduleData>({});
  const [fixedShifts, setFixedShifts] = useState<FixedShift[]>([]);
  const [shiftTimeConfig, setShiftTimeConfig] = useState<ShiftTimeConfig>({
    A: ["08:30-12:00", "13:30-17:00", "19:00-21:00"],
    B: ["08:30-12:00", "13:30-18:00"],
    C: ["08:30-12:00"],
    D: ["13:30-18:00"],
    E: ["13:30-17:00", "19:00-21:00"],
    X: ["休假"],
  });
  const [wednesdayNightShifts, setWednesdayNightShifts] = useState<WednesdayNightShift[]>([]);

  // ─── Load data from Supabase ────────────────────────────────────────────────

  const loadScheduleOverrides = useCallback(async () => {
    const { data } = await supabase.from("schedule_overrides").select("user_id, date, shift_code");
    if (data) {
      const result: ScheduleData = {};
      data.forEach((r) => {
        if (!result[r.date]) result[r.date] = {};
        result[r.date][r.user_id] = r.shift_code as ShiftType;
      });
      setSchedule(result);
    }
  }, [supabase]);

  const loadLeaveSelections = useCallback(async () => {
    const { data } = await supabase.from("leave_selections").select("user_id, date");
    if (data) {
      const result: LeaveSelections = {};
      data.forEach((r) => {
        if (!result[r.user_id]) result[r.user_id] = [];
        result[r.user_id].push(r.date);
      });
      setLeaveSelections(result);
    }
  }, [supabase]);

  const loadFixedShifts = useCallback(async () => {
    const { data } = await supabase.from("fixed_shifts").select("user_id, day_of_week, shift_code");
    if (data) {
      setFixedShifts(
        normalizeFixedShifts(
          data.map((r) => ({
            employeeId: r.user_id,
            dayOfWeek: r.day_of_week,
            shift: r.shift_code as ShiftType,
          }))
        )
      );
    }
  }, [supabase]);

  const loadShiftTimeConfig = useCallback(async () => {
    const { data } = await supabase.from("shift_time_config").select("shift_code, time_ranges");
    if (data && data.length > 0) {
      const config: Partial<ShiftTimeConfig> = {};
      data.forEach((r) => {
        config[r.shift_code as ShiftType] = r.time_ranges;
      });
      setShiftTimeConfig((prev) => ({ ...prev, ...config }));
    }
  }, [supabase]);

  const loadWednesdayOffSelections = useCallback(async () => {
    const { data } = await supabase.from("wednesday_off_selections").select("user_id, date");
    if (data) {
      const result: WednesdayOffSelections = {};
      data.forEach((r) => {
        if (!result[r.user_id]) result[r.user_id] = [];
        result[r.user_id].push(r.date);
      });
      setWednesdayOffSelections(result);
    }
  }, [supabase]);

  const loadLeaveMonthLocks = useCallback(async () => {
    const { data } = await supabase
      .from("leave_month_locks")
      .select("year, month, locked_by, created_at");
    if (data) {
      setLeaveMonthLocks(
        data.map((r) => ({
          year: r.year,
          month: r.month,
          lockedBy: r.locked_by,
          lockedAt: r.created_at,
        }))
      );
    }
  }, [supabase]);

  const loadEmployees = useCallback(async () => {
    const { data } = await supabase
      .from("users")
      .select("id, name, role, is_active, hire_date, is_wednesday_rotation, is_weekday_off_rule")
      .eq("is_active", true);
      if (data) {
        setEmployees(
          data.map((r) => ({
            id: r.id,
            name: r.name,
            role: mapRole(r.role),
            hireDate: r.hire_date || '2026-04-01',
            isWednesdayRotation: r.is_wednesday_rotation,
            isWeekdayOffRule: r.is_weekday_off_rule,
          }))
        );
      }
  }, [supabase]);

  const formatDbTime = (value: string | null | undefined, fallback: string) => {
    if (!value) return fallback;
    return value.length >= 5 ? value.slice(0, 5) : fallback;
  };

  const loadCompLeaveLedger = useCallback(async () => {
    const { data } = await supabase
      .from("comp_leave_ledger")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) {
      setCompLeaveLedger(
        data.map((r) => ({
          id: r.id,
          employeeId: r.user_id,
          hours: Number(r.hours),
          sourceType: r.source_type,
          sourceId: r.source_id ?? undefined,
          expiresAt: r.expires_at ?? undefined,
          note: r.note ?? undefined,
          createdAt: r.created_at,
        }))
      );
    }
  }, [supabase]);

  const getCompLeaveBalance = useCallback(
    (employeeId: string) => {
      const now = Date.now();
      return compLeaveLedger
        .filter((entry) => entry.employeeId === employeeId)
        .reduce((sum, entry) => {
          if (entry.hours > 0 && entry.expiresAt && new Date(entry.expiresAt).getTime() < now) {
            return sum;
          }
          return sum + entry.hours;
        }, 0);
    },
    [compLeaveLedger]
  );

  const getAnnualLeaveQuota = useCallback((employee: Employee) => {
    const hireDate = new Date(employee.hireDate);
    
    // 邏輯說明：
    // 1. 滿半年（入職日 + 6個月）給 3 天
    // 2. 滿一年（入職日 + 12個月）給 7 天
    // 3. 滿兩年及以上一樣維持 7 天
    // 4. 每年重置（週年制重置），不累積
    
    // 計算該查詢年份中的週年紀念日
    const sixMonthsAnniversary = new Date(hireDate);
    sixMonthsAnniversary.setMonth(sixMonthsAnniversary.getMonth() + 6);
    
    const oneYearAnniversary = new Date(hireDate);
    oneYearAnniversary.setFullYear(oneYearAnniversary.getFullYear() + 1);

    const now = new Date();
    // 如果查詢的是過去年份，邏輯較複雜，通常以當前狀態為主
    // 如果查詢的是當前或未來年份：
    
    // 判斷當前時間點相對於入職週年的狀態
    if (now < sixMonthsAnniversary) {
      return 0; // 未滿半年
    } else if (now < oneYearAnniversary) {
      return 3; // 滿半年未滿一年
    } else {
      return 7; // 滿一年以上（包含滿兩年）
    }
  }, []);

  const getAnnualLeaveBalance = useCallback((employeeId: string, year: number) => {
    const emp = employees.find(e => e.id === employeeId);
    if (!emp) return 0;
    
    const quota = getAnnualLeaveQuota(emp);
    const used = leaveRequests
      .filter(r => 
        r.employeeId === employeeId && 
        r.type === "特休" && 
        r.status === "approved" && 
        new Date(r.startDate).getFullYear() === year
      )
      .reduce((acc, r) => acc + r.leaveHours, 0);
      
    return Math.max(0, quota - (used / 8)); // 假設一天 8 小時，特休以天為單位
  }, [employees, leaveRequests, getAnnualLeaveQuota]);

  const loadLeaveRequests = useCallback(async () => {
    const { data } = await supabase
      .from("leave_applications")
      .select("*, users!leave_applications_user_id_fkey(name)")
      .order("created_at", { ascending: false });
    if (data) {
      setLeaveRequests(
        data.map((r) => {
          const startTime = formatDbTime(
            r.start_time,
            r.period === "morning" ? "08:30" : r.period === "afternoon" ? "13:30" : "08:30"
          );
          const endTime = formatDbTime(
            r.end_time,
            r.period === "full_day" ? "18:00" : r.period === "morning" ? "12:00" : "18:00"
          );
          let period: LeavePeriodMode = "full_day";
          if (r.period === "morning") period = "morning";
          else if (r.period === "afternoon") period = "afternoon";
          else if (startTime && endTime) {
            if (startTime === "08:30" && endTime === "12:00") period = "morning";
            else if (startTime === "13:30" && endTime === "18:00") period = "afternoon";
            else if (startTime === "08:30" && (endTime === "18:00" || endTime === "21:00")) period = "full_day";
            else period = "custom";
          }
          const shiftRaw = r.shift_mode as string | null;
          const shiftMode: LeaveRequest["shiftMode"] =
            shiftRaw && shiftRaw !== "schedule" ? (shiftRaw as ShiftType) : "schedule";

          return {
            id: r.id,
            employeeId: r.user_id,
            employeeName: (r.users as { name?: string } | null)?.name ?? "",
            startDate: r.leave_date,
            endDate: r.end_date ?? r.leave_date,
            startTime,
            endTime,
            period,
            shiftMode,
            leaveHours: Number(r.leave_hours ?? 0),
            type: r.leave_type as LeaveType,
            reason: r.reason,
            rejectReason: r.reject_reason ?? undefined,
            status: r.status as LeaveRequest["status"],
            createdAt: r.created_at,
          };
        })
      );
    }
  }, [supabase]);

  const loadHolidays = useCallback(async () => {
    const { data } = await supabase
      .from("holidays")
      .select("id, holiday_date, name, year, created_at")
      .order("holiday_date", { ascending: true });

    if (data) {
      setHolidays(
        data.map((item) => ({
          id: item.id,
          date: item.holiday_date,
          name: item.name,
          year: item.year,
          createdAt: item.created_at,
        }))
      );
    }
  }, [supabase]);

  const refreshHolidayCalendar = useCallback(async (year: number) => {
    const response = await fetch(`/api/holidays/update?year=${year}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(result?.error || "更新假期失敗");
    }
    await loadHolidays();
  }, [loadHolidays]);

  const getHolidayInfo = useCallback((dateStr: string) => {
    const holiday = holidays.find((item) => item.date === dateStr) ||
      TAIWAN_HOLIDAYS_2026.find((item) => item.date === dateStr);
    const name = holiday?.name ?? "國定\n假日";
    return { isHoliday: Boolean(holiday), name: name === "國定假日" ? "國定\n假日" : name };
  }, [holidays]);

  const loadSwapRequests = useCallback(async () => {
    const { data } = await supabase
      .from("shift_swap_applications")
      .select("*, requester:users!shift_swap_applications_requester_id_fkey(name), target:users!shift_swap_applications_target_id_fkey(name)")
      .order("created_at", { ascending: false });
    if (data) {
      setSwapRequests(
        data.map((r) => ({
          id: r.id,
          requesterId: r.requester_id,
          requesterName: (r.requester as { name?: string } | null)?.name ?? "",
          targetEmployeeId: r.target_id,
          targetEmployeeName: (r.target as { name?: string } | null)?.name ?? "",
          requesterDate: r.swap_date,
          targetDate: r.swap_date,
          status: mapSwapStatusFromDb(r.status),
          rejectReason: r.reject_reason ?? undefined,
          createdAt: r.created_at,
        }))
      );
    }
  }, [supabase]);

  const loadOvertimeRequests = useCallback(async () => {
    const { data } = await supabase
      .from("overtime_applications")
      .select("*, users!overtime_applications_user_id_fkey(name)")
      .order("created_at", { ascending: false });
    if (data) {
      setOvertimeRequests(
        data.map((r) => ({
          id: r.id,
          employeeId: r.user_id,
          employeeName: (r.users as { name?: string } | null)?.name ?? "",
          date: r.overtime_date,
          startTime: r.start_time,
          endTime: r.end_time,
          reason: r.reason,
          compensationType:
            r.compensation === "comp_leave" || r.compensation === "time_off" ? "time_off" : "pay",
          rejectReason: r.reject_reason ?? undefined,
          status: r.status as OvertimeRequest["status"],
          createdAt: r.created_at,
        }))
      );
    }
  }, [supabase]);

  const normalizeDateString = (value: string | Date | null | undefined) => {
    if (!value) return "";
    const raw = typeof value === "string" ? value : value.toISOString();
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : "";
  };

  const loadTardinessRecords = useCallback(async () => {
    const { data } = await supabase
      .from("tardiness_records")
      .select("*, users(name)")
      .order("record_date", { ascending: false });
    if (data) {
      setTardinessRecords(
        data.map((r) => ({
          id: r.id,
          employeeId: r.user_id,
          employeeName: (r.users as { name?: string } | null)?.name ?? "",
          date: normalizeDateString(r.record_date),
          minutes: r.minutes_late,
          notes: r.note ?? "",
          createdAt: r.created_at,
        }))
      );
    }
  }, [supabase]);

  const loadPunchRecords = useCallback(async () => {
    const { data } = await supabase
      .from("punch_records")
      .select("*")
      .order("date", { ascending: false })
      .order("time", { ascending: true });
    if (data) {
      setPunchRecords(
        data.map((r) => ({
          id: r.id,
          employeeId: r.employee_id,
          employeeName: r.employee_name,
          date: r.date,
          action: r.action as PunchRecord["action"],
          segmentIndex: r.segment_index,
          time: r.time.substring(0, 5), // HH:MM
          shift: r.shift as ShiftType,
          lateMinutes: r.late_minutes,
          reason: r.reason ?? undefined,
          latitude: Number(r.latitude ?? 0),
          longitude: Number(r.longitude ?? 0),
          createdAt: r.created_at,
        }))
      );
    }
  }, [supabase]);

  const loadNotifications = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) {
      setNotifications(
        data.map((n) => ({
          id: n.id,
          userId: n.recipient_id,
          title: n.title,
          message: n.body,
          type: "info" as Notification["type"],
          read: n.is_read,
          createdAt: n.created_at,
          route: notificationRouteFromRelatedType(n.related_type ?? null),
        }))
      );
    }
  }, [supabase]);

  const insertNotification = useCallback(
    async (params: {
      recipientId: string;
      type: string;
      title: string;
      body: string;
      relatedId?: string;
      relatedType?: string;
    }) => {
      await supabase.from("notifications").insert({
        recipient_id: params.recipientId,
        type: params.type,
        title: params.title,
        body: params.body,
        related_id: params.relatedId ?? null,
        related_type: params.relatedType ?? null,
        is_read: false,
      });
    },
    [supabase]
  );

  const notifyManagers = useCallback(
    async (params: {
      type: string;
      title: string;
      body: string;
      relatedId?: string;
      relatedType?: string;
    }) => {
      const managers = employees.filter((e) => e.role === "owner" || e.role === "manager");
      await Promise.all(
        managers.map((m) =>
          insertNotification({
            recipientId: m.id,
            type: params.type,
            title: params.title,
            body: params.body,
            relatedId: params.relatedId,
            relatedType: params.relatedType,
          })
        )
      );
    },
    [employees, insertNotification]
  );

  // ─── Auth state ──────────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          // No session - just stop loading immediately
          if (mounted) setIsLoading(false);
          return;
        }
        if (mounted) {
            const { data: userRow } = await supabase
              .from("users")
              .select("id, name, role, hire_date")
              .eq("id", session.user.id)
              .maybeSingle();
            console.log("[initAuth] userRow:", userRow);
            if (userRow && mounted) {
              const emp: Employee = { 
                id: userRow.id, 
                name: userRow.name, 
                role: mapRole(userRow.role),
                hireDate: userRow.hire_date || "2026-04-01"
              };
            setCurrentUser(emp);
            // Load data in background without awaiting
            Promise.allSettled([
              loadEmployees(),
              loadLeaveRequests(),
              loadCompLeaveLedger(),
              loadSwapRequests(),
              loadOvertimeRequests(),
              loadTardinessRecords(),
              loadPunchRecords(),
              loadNotifications(userRow.id),
              loadScheduleOverrides(),
              loadLeaveSelections(),
              loadFixedShifts(),
              loadShiftTimeConfig(),
              loadWednesdayOffSelections(),
              loadLeaveMonthLocks(),
              loadBulletinItems(),
              loadHolidays(),
            ]).catch((e) => console.error("[initAuth] background load error:", e));
          }
        }
      } catch (e) {
        console.error("[initAuth] error:", e);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      
      console.log("[onAuthStateChange] event:", event, "session exists:", !!session);
      
      if (event === "SIGNED_OUT" || !session) {
        setCurrentUser(null);
        setEmployees([]);
        return;
      }
      
      if (event === "SIGNED_IN" && session?.user) {
        // Don't await inside onAuthStateChange - fire and forget with setTimeout to avoid blocking auth flow
        setTimeout(async () => {
          if (!mounted) return;
          try {
            const { data: userRow } = await supabase
              .from("users")
              .select("id, name, role, hire_date")
              .eq("id", session.user.id)
              .maybeSingle();
            console.log("[SIGNED_IN] userRow:", userRow);
            if (userRow && mounted) {
              const emp: Employee = { 
                id: userRow.id, 
                name: userRow.name, 
                role: mapRole(userRow.role),
                hireDate: userRow.hire_date || "2026-04-01"
              };
              setCurrentUser(emp);
              // Load data in background without awaiting
              Promise.allSettled([
                loadEmployees(),
                loadLeaveRequests(),
                loadCompLeaveLedger(),
                loadSwapRequests(),
                loadOvertimeRequests(),
                loadTardinessRecords(),
                loadPunchRecords(),
                loadNotifications(userRow.id),
                loadScheduleOverrides(),
                loadLeaveSelections(),
                loadFixedShifts(),
                loadShiftTimeConfig(),
                loadWednesdayOffSelections(),
                loadLeaveMonthLocks(),
                loadBulletinItems(),
                loadHolidays(),
              ]).catch((e) => console.error("[SIGNED_IN] background load error:", e));
            } else if (mounted) {
              console.warn("[SIGNED_IN] no user row found for", session.user.id);
            }
          } catch (e) {
            console.error("[SIGNED_IN] error:", e);
          }
        }, 100);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, loadEmployees, loadLeaveRequests, loadCompLeaveLedger, loadSwapRequests, loadOvertimeRequests, loadTardinessRecords, loadPunchRecords, loadNotifications, loadScheduleOverrides, loadLeaveSelections, loadFixedShifts, loadShiftTimeConfig, loadWednesdayOffSelections, loadLeaveMonthLocks, loadHolidays]);

  // ─── Auth functions ──────────────────────────────────────────────────────────

  const loginEmployee = async (username: string, password: string): Promise<boolean> => {
    const email = `${username.trim().toLowerCase()}@yaosheng.app`;
    console.log("[login] attempting:", email);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      console.log("[login] result:", data?.user?.id, "error:", error?.message);
      if (error) {
        console.error("[login] error:", error.message, error.status);
        // rate limit 錯誤特別處理
        if (error.message?.toLowerCase().includes("too many") || error.status === 429) {
          throw new Error("請求過於頻繁，請等待 1 分鐘後再試");
        }
      }
      return !error;
    } catch (e) {
      console.error("[login] exception:", e);
      if (e instanceof Error) throw e;
      return false;
    }
  };

  const loginManager = async (username: string, password: string): Promise<boolean> => {
    const email = `${username.trim().toLowerCase()}@yaosheng.app`;
    console.log("[login] attempting:", email);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      console.log("[login] result:", data?.user?.id, "error:", error?.message);
      if (error) {
        console.error("[login] error:", error.message, error.status);
        // rate limit 錯誤特別處理
        if (error.message?.toLowerCase().includes("too many") || error.status === 429) {
          throw new Error("請求過於頻繁，請等待 1 分鐘後再試");
        }
      }
      return !error;
    } catch (e) {
      console.error("[login] exception:", e);
      if (e instanceof Error) throw e;
      return false;
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  // ─── Employee management (via API Routes) ────────────────────────────────────

  const addEmployee = async (employee: Omit<Employee, "id">) => {
    await fetch("/api/auth/create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: employee.username,
        password: employee.password,
        name: employee.name,
        role: employee.role,
        hire_date: employee.hireDate,
      }),
    });
    await loadEmployees();
  };

  const updateEmployee = async (id: string, updates: Partial<Employee>) => {
    await fetch("/api/auth/update-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: id,
        name: updates.name,
        role: updates.role,
        password: updates.password,
        isWednesdayRotation: updates.isWednesdayRotation,
        isWeekdayOffRule: updates.isWeekdayOffRule,
        hire_date: updates.hireDate,
      }),
    });
    await loadEmployees();
    // Update currentUser if it's the same user
    if (currentUser?.id === id) {
      setCurrentUser((prev) => prev ? { ...prev, ...updates } : prev);
    }
  };

  const deleteEmployee = async (id: string) => {
    await fetch("/api/auth/delete-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id }),
    });
    await loadEmployees();
  };

  // ─── Schedule (localStorage) ─────────────────────────────────────────────────

  const getShiftForDate = (date: string, employeeId: string): ShiftType => {
    const override = schedule[date]?.[employeeId];
    if (override) return override;
    if (isSunday(date)) return "X";

    const emp = employees.find((e) => e.id === employeeId);
    const isWednesdayRotation = emp?.isWednesdayRotation ?? false;
    // 注意：isWeekdayOffRule 只影響「排休選擇」，不影響班表邏輯
    // 平日不排休規則 = 平日正常上班，不能選平日排休（只能選週六）

    // 週六：有排休選 X，否則 C
    if (isSaturday(date)) {
      return (leaveSelections[employeeId] ?? []).includes(date) ? "X" : "C";
    }

    // 排休日
    if ((leaveSelections[employeeId] ?? []).includes(date)) return "X";

    const dayOfWeek = new Date(date).getDay();

    // 禮拜三晚班輪值邏輯（動態）
    if (isWednesday(date) && isWednesdayRotation) {
      // 找出所有參與禮三輪值的員工
      const rotationEmployees = employees.filter((e) => e.isWednesdayRotation);
      if (rotationEmployees.length === 0) return "B";
      if (rotationEmployees.length === 1) {
        // 只有一個輪值員工，固定 A 班
        return employeeId === rotationEmployees[0].id ? "A" : "B";
      }
      // 多個輪值員工：依 wednesdayOffSelections 決定誰輪值
      const offEmployees = rotationEmployees.filter((e) =>
        (wednesdayOffSelections[e.id] ?? []).includes(date)
      );
      const onDutyEmployees = rotationEmployees.filter((e) =>
        !(wednesdayOffSelections[e.id] ?? []).includes(date)
      );
      // 如果所有人都休或都值，預設 B 班
      if (offEmployees.length === rotationEmployees.length || onDutyEmployees.length === rotationEmployees.length) {
        return "B";
      }
      // 有人休有人值 → 值班員工 A，其他 B
      const isOnDuty = onDutyEmployees.some((e) => e.id === employeeId);
      return isOnDuty ? "A" : "B";
    }

    // 一般固定班表
    const fixedShift = fixedShifts.find(
      (s) => s.employeeId === employeeId && s.dayOfWeek === dayOfWeek
    );
    return fixedShift?.shift ?? "B";
  };

  const updateShift = async (date: string, employeeId: string, shift: ShiftType) => {
    // 檢查是否有已核准的請假
    const approvedLeave = leaveRequests.find(
      (r) =>
        r.employeeId === employeeId &&
        r.status === "approved" &&
        date >= r.startDate &&
        date <= r.endDate
    );

    if (approvedLeave && shift !== "X") {
      const confirmMsg = `員工 ${approvedLeave.employeeName} 在 ${date} 已有核准的請假（${approvedLeave.type}），確定要安排班表嗎？`;
      if (!window.confirm(confirmMsg)) return;
    }

    // Optimistic update
    setSchedule((prev) => ({ ...prev, [date]: { ...prev[date], [employeeId]: shift } }));
    await supabase.from("schedule_overrides").upsert(
      { user_id: employeeId, date, shift_code: shift, updated_by: currentUser?.id },
      { onConflict: "user_id,date" }
    );
  };

  // ─── Fixed shifts ────────────────────────────────────────────────────────────

  const addFixedShift = async (shift: FixedShift) => {
    await supabase.from("fixed_shifts").upsert(
      { user_id: shift.employeeId, day_of_week: shift.dayOfWeek, shift_code: shift.shift },
      { onConflict: "user_id,day_of_week" }
    );
    await loadFixedShifts();
  };

  const updateFixedShift = async (index: number, shift: FixedShift) => {
    const old = fixedShifts[index];
    if (!old) return;
    // Delete old and insert new (in case user_id or day_of_week changed)
    await supabase
      .from("fixed_shifts")
      .delete()
      .eq("user_id", old.employeeId)
      .eq("day_of_week", old.dayOfWeek);
    await supabase.from("fixed_shifts").upsert(
      { user_id: shift.employeeId, day_of_week: shift.dayOfWeek, shift_code: shift.shift },
      { onConflict: "user_id,day_of_week" }
    );
    await loadFixedShifts();
  };

  const deleteFixedShift = async (index: number) => {
    const shift = fixedShifts[index];
    if (!shift) return;
    await supabase
      .from("fixed_shifts")
      .delete()
      .eq("user_id", shift.employeeId)
      .eq("day_of_week", shift.dayOfWeek);
    await loadFixedShifts();
  };

  // ─── Shift time config ───────────────────────────────────────────────────────

  const updateShiftTimeConfig = async (shift: ShiftType, ranges: string[]) => {
    setShiftTimeConfig((prev) => ({ ...prev, [shift]: ranges }));
    await supabase.from("shift_time_config").upsert(
      { shift_code: shift, time_ranges: ranges },
      { onConflict: "shift_code" }
    );
  };

  // ─── Wednesday night shifts ──────────────────────────────────────────────────

  const setWednesdayNightShift = (date: string, employeeId: string) => {
    setWednesdayNightShifts((prev) => {
      const idx = prev.findIndex((i) => i.date === date);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { date, employeeId };
        return next;
      }
      return [...prev, { date, employeeId }];
    });
  };

  const getWednesdayOffDates = (employeeId: string, year: number, month: number) =>
    (wednesdayOffSelections[employeeId] ?? []).filter((d) => isInMonth(d, year, month));

  const isWednesdayOff = (employeeId: string, date: string) =>
    (wednesdayOffSelections[employeeId] ?? []).includes(date);

  const toggleWednesdayOff = async (employeeId: string, date: string) => {
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp?.isWednesdayRotation)
      return { success: false, message: "此員工未設定禮拜三晚班輪值規則" };
    if (!isWednesday(date))
      return { success: false, message: "只能設定禮拜三的晚班排休" };

    const year = new Date(date).getFullYear();
    const month = new Date(date).getMonth() + 1;
    const selectedDates = getWednesdayOffDates(employeeId, year, month);
    const selected = selectedDates.includes(date);

    if (selected) {
      // 先刪除資料庫記錄，等待完成後再更新本地狀態
      const { error } = await supabase
        .from("wednesday_off_selections")
        .delete()
        .eq("user_id", employeeId)
        .eq("date", date);
      if (error) {
        console.error("刪除禮拜三排休記錄失敗:", error);
        return { success: false, message: "刪除失敗，請重試" };
      }
      // 等待成功後才更新本地狀態，確保打卡頁面能取得最新資料
      setWednesdayOffSelections((prev) => ({
        ...prev,
        [employeeId]: (prev[employeeId] ?? []).filter((d) => d !== date),
      }));
      return { success: true };
    }

    if (selectedDates.length >= 2)
      return { success: false, message: "每月最多只能選擇 2 個禮拜三不輪晚班" };

    // 先寫入資料庫，等待完成後再更新本地狀態
    const { error } = await supabase
      .from("wednesday_off_selections")
      .insert({ user_id: employeeId, date });
    if (error) {
      console.error("新增禮拜三排休記錄失敗:", error);
      return { success: false, message: "新增失敗，請重試" };
    }
    // 等待成功後才更新本地狀態
    setWednesdayOffSelections((prev) => ({
      ...prev,
      [employeeId]: [...(prev[employeeId] ?? []), date],
    }));
    return { success: true };
  };

  // ─── Leave selections ────────────────────────────────────────────────────────

  const getLeaveSummary = (employeeId: string, year: number, month: number): LeaveSummary => {
    const selectedDates = (leaveSelections[employeeId] ?? []).filter((d) => isInMonth(d, year, month));
    const saturdayDates = getMonthSaturdays(year, month);
    const optionalSaturday = saturdayDates[4];
    const selectedSaturdayDates = selectedDates.filter((d) => isSaturday(d));
    const saturdayCoreDates = selectedSaturdayDates.filter((d) => d !== optionalSaturday);
    const weekdayDates = selectedDates.filter((d) => !isSaturday(d) && !isSunday(d));

    const emp = employees.find((e) => e.id === employeeId);
    const isWeekdayOffRule = emp?.isWeekdayOffRule ?? false;

    return {
      selectedDates,
      saturdayUsed: isWeekdayOffRule ? selectedSaturdayDates.length : saturdayCoreDates.length,
      saturdayLimit: 2,
      weekdayUsed: isWeekdayOffRule ? 0 : weekdayDates.length,
      weekdayLimit: isWeekdayOffRule ? 0 : 2,
      optionalSaturdayUsed: Boolean(optionalSaturday && selectedDates.includes(optionalSaturday) && !isWeekdayOffRule),
      optionalSaturdayAvailable: !isWeekdayOffRule && saturdayDates.length >= 5,
    };
  };

  const toggleLeaveDate = (employeeId: string, date: string) => {
    const dateObject = new Date(date);
    const year = dateObject.getFullYear();
    const month = dateObject.getMonth() + 1;
    if (leaveMonthLocks.some((l) => l.year === year && l.month === month))
      return { success: false, message: "本月份排休已鎖定，僅可選擇後續月份" };

    const summary = getLeaveSummary(employeeId, year, month);
    const isSelected = summary.selectedDates.includes(date);

    const emp = employees.find((e) => e.id === employeeId);
    const isWeekdayOffRule = emp?.isWeekdayOffRule ?? false;

    if (isSelected) {
      // Optimistic update
      setLeaveSelections((prev) => ({
        ...prev,
        [employeeId]: (prev[employeeId] ?? []).filter((d) => d !== date),
      }));
      supabase
        .from("leave_selections")
        .delete()
        .eq("user_id", employeeId)
        .eq("date", date)
        .then();
      return { success: true };
    }

    if (isSunday(date)) return { success: false, message: "禮拜日固定公休，不需要另外選擇" };
    if (isWeekdayOffRule && !isSaturday(date)) return { success: false, message: "此員工套用平日不排休規則，排休只能選擇週六" };

    if (isSaturday(date)) {
      if (isWeekdayOffRule && summary.saturdayUsed >= summary.saturdayLimit)
        return { success: false, message: "禮拜六排休已達 2 天上限" };

      const saturdayDates = getMonthSaturdays(year, month);
      const optionalSaturday = saturdayDates[4];
      if (date === optionalSaturday && !isWeekdayOffRule) {
        setLeaveSelections((prev) => ({
          ...prev,
          [employeeId]: [...(prev[employeeId] ?? []), date],
        }));
        supabase.from("leave_selections").insert({ user_id: employeeId, date }).then();
        return { success: true };
      }

      if (summary.saturdayUsed >= summary.saturdayLimit)
        return { success: false, message: "禮拜六排休已達 2 天上限" };
    } else if (summary.weekdayUsed >= summary.weekdayLimit) {
      return { success: false, message: "平日排休已達 2 天上限" };
    }

    // Optimistic update
    setLeaveSelections((prev) => ({
      ...prev,
      [employeeId]: [...(prev[employeeId] ?? []), date],
    }));
    supabase.from("leave_selections").insert({ user_id: employeeId, date }).then();
    return { success: true };
  };

  const isLeaveMonthLocked = (year: number, month: number) =>
    leaveMonthLocks.some((l) => l.year === year && l.month === month);

  const lockLeaveMonth = async (year: number, month: number, lockedBy: string) => {
    if (leaveMonthLocks.some((l) => l.year === year && l.month === month)) return;
    const { data } = await supabase
      .from("leave_month_locks")
      .insert({ year, month, locked_by: lockedBy })
      .select()
      .single();
    if (data) {
      setLeaveMonthLocks((prev) => [
        ...prev,
        { year: data.year, month: data.month, lockedBy: data.locked_by, lockedAt: data.created_at },
      ]);
    }
  };

  const unlockLeaveMonth = async (year: number, month: number) => {
    await supabase
      .from("leave_month_locks")
      .delete()
      .eq("year", year)
      .eq("month", month);
    setLeaveMonthLocks((prev) => prev.filter((l) => !(l.year === year && l.month === month)));
  };

  // ─── Leave requests (Supabase) ───────────────────────────────────────────────

  const overtimeHoursBetween = (startTime: string, endTime: string) => {
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    return Math.round((((eh * 60 + em) - (sh * 60 + sm)) / 60) * 100) / 100;
  };

  const addLeaveRequest = async (request: Omit<LeaveRequest, "id" | "createdAt">) => {
    const dbPeriod =
      request.period === "morning"
        ? "morning"
        : request.period === "afternoon"
          ? "afternoon"
          : "full_day";

    await supabase.from("leave_applications").insert({
      user_id: request.employeeId,
      leave_date: request.startDate,
      end_date: request.endDate,
      start_time: request.startTime,
      end_time: request.endTime,
      leave_hours: request.leaveHours,
      shift_mode: request.shiftMode,
      period: dbPeriod,
      leave_type: request.type,
      reason: request.reason,
      status: "pending",
    });
    await notifyManagers({
      type: "leave_submitted",
      title: "新請假申請",
      body: `${request.employeeName} 提交請假（${request.startDate}～${request.endDate}），請審核。`,
      relatedType: "leave",
    });

    await loadLeaveRequests();
  };

  const updateLeaveRequestStatus = async (
    id: string,
    status: "approved" | "rejected" | "pending",
    rejectReason?: string
  ) => {
    const request = leaveRequests.find((item) => item.id === id);
    const prevStatus = request?.status;

    if (status === "approved" && request?.type === "補休假") {
      const balance = getCompLeaveBalance(request.employeeId);
      if (balance < request.leaveHours) {
        throw new Error(`補休餘額不足（可用 ${balance} 小時，需要 ${request.leaveHours} 小時）`);
      }
    }

    await supabase
      .from("leave_applications")
      .update({
        status,
        reviewed_by: currentUser?.id,
        reviewed_at: new Date().toISOString(),
        ...(rejectReason ? { reject_reason: rejectReason } : {}),
      })
      .eq("id", id);

    if (request) {
      if (status === "approved" && prevStatus !== "approved" && request.type === "補休假") {
        await supabase.from("comp_leave_ledger").insert({
          user_id: request.employeeId,
          hours: -request.leaveHours,
          source_type: "leave_debit",
          source_id: id,
          note: `請假使用補休 ${request.startDate}～${request.endDate}`,
        });
      }
      if (
        prevStatus === "approved" &&
        status !== "approved" &&
        request.type === "補休假"
      ) {
        await supabase.from("comp_leave_ledger").insert({
          user_id: request.employeeId,
          hours: request.leaveHours,
          source_type: "reversal",
          source_id: id,
          note: "請假審核取消，補休時數退回",
        });
      }
    }

    if (request && (status === "approved" || status === "rejected")) {
      const statusText = status === "approved" ? "已核准" : "已駁回";
      let body = `您的請假申請（${request.startDate}${
        request.endDate !== request.startDate ? `～${request.endDate}` : ""
      }）${statusText}。`;
      if (status === "rejected" && rejectReason?.trim()) {
        body += ` 駁回原因：${rejectReason.trim()}`;
      }
      await insertNotification({
        recipientId: request.employeeId,
        type: "leave_reviewed",
        title: `請假申請${statusText}`,
        body,
        relatedId: id,
        relatedType: "leave",
      });
    }

    await loadLeaveRequests();
    await loadCompLeaveLedger();
    if (currentUser?.id) await loadNotifications(currentUser.id);
  };

  const deleteLeaveRequest = async (id: string) => {
    const { data, error } = await supabase
      .from("leave_applications")
      .delete()
      .eq("id", id)
      .select("id");

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error("未找到請假申請或刪除失敗");
    }

    await loadLeaveRequests();
  };

  // ─── Swap requests (Supabase) ────────────────────────────────────────────────

  const addSwapRequest = async (request: Omit<SwapRequest, "id" | "createdAt">) => {
    const isSelfSwap = request.requesterId === request.targetEmployeeId;
    const { data } = await supabase
      .from("shift_swap_applications")
      .insert({
        requester_id: request.requesterId,
        target_id: request.targetEmployeeId,
        swap_date: request.requesterDate,
        status: isSelfSwap ? "pending_review" : "pending_confirm",
      })
      .select("id")
      .single();

    if (!isSelfSwap) {
      await insertNotification({
        recipientId: request.targetEmployeeId,
        type: "shift_swap_requested",
        title: "換班邀請",
        body: `${request.requesterName} 邀請您換班：${request.requesterDate} ↔ ${request.targetDate}，請確認。`,
        relatedId: data?.id,
        relatedType: "shift_swap",
      });
    } else {
      await notifyManagers({
        type: "shift_swap_confirmed",
        title: "換班申請待審核",
        body: `${request.requesterName} 申請自行換班（${request.requesterDate} ↔ ${request.targetDate}），請審核。`,
        relatedId: data?.id,
        relatedType: "shift_swap",
      });
    }

    await loadSwapRequests();
    if (currentUser?.id) await loadNotifications(currentUser.id);
  };

  const updateSwapRequestStatus = async (
    id: string,
    status: "pending_confirmation" | "pending_approval" | "approved" | "rejected",
    rejectReason?: string
  ) => {
    const request = swapRequests.find((item) => item.id === id);
    const prevStatus = request?.status;
    const dbStatus = mapSwapStatusToDb(status);

    await supabase
      .from("shift_swap_applications")
      .update({
        status: dbStatus,
        reviewed_by: currentUser?.id,
        reviewed_at: new Date().toISOString(),
        ...(rejectReason ? { reject_reason: rejectReason } : {}),
      })
      .eq("id", id);

    if (request) {
      if (
        status === "pending_approval" &&
        prevStatus === "pending_confirmation"
      ) {
        await insertNotification({
          recipientId: request.requesterId,
          type: "shift_swap_confirmed",
          title: "對方已確認換班",
          body: `${request.targetEmployeeName} 已同意換班，等待店長審核。`,
          relatedId: id,
          relatedType: "shift_swap",
        });
        await notifyManagers({
          type: "shift_swap_confirmed",
          title: "換班申請待審核",
          body: `${request.requesterName} 與 ${request.targetEmployeeName} 的換班（${request.requesterDate}）待審核。`,
          relatedId: id,
          relatedType: "shift_swap",
        });
      }

      if (status === "rejected" && prevStatus === "pending_confirmation") {
        await insertNotification({
          recipientId: request.requesterId,
          type: "shift_swap_reviewed",
          title: "換班申請已拒絕",
          body: `${request.targetEmployeeName} 拒絕了您的換班邀請。${
            rejectReason?.trim() ? ` 原因：${rejectReason.trim()}` : ""
          }`,
          relatedId: id,
          relatedType: "shift_swap",
        });
      }

      if (status === "approved" || (status === "rejected" && prevStatus === "pending_approval")) {
        const statusText = status === "approved" ? "已核准" : "已駁回";
        let body = `換班申請（${request.requesterDate} ↔ ${request.targetDate}）${statusText}。`;
        if (status === "rejected" && rejectReason?.trim()) {
          body += ` 原因：${rejectReason.trim()}`;
        }
        await insertNotification({
          recipientId: request.requesterId,
          type: "shift_swap_reviewed",
          title: `換班申請${statusText}`,
          body,
          relatedId: id,
          relatedType: "shift_swap",
        });
        if (request.requesterId !== request.targetEmployeeId) {
          await insertNotification({
            recipientId: request.targetEmployeeId,
            type: "shift_swap_reviewed",
            title: `換班申請${statusText}`,
            body,
            relatedId: id,
            relatedType: "shift_swap",
          });
        }
      }
    }

    await loadSwapRequests();
    if (currentUser?.id) await loadNotifications(currentUser.id);
  };

  const deleteSwapRequest = async (id: string) => {
    const { data, error } = await supabase
      .from("shift_swap_applications")
      .delete()
      .eq("id", id)
      .select("id");

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error("未找到換班申請或刪除失敗");
    }

    await loadSwapRequests();
  };

  // ─── Overtime requests (Supabase) ────────────────────────────────────────────

  const addOvertimeRequest = async (request: Omit<OvertimeRequest, "id" | "createdAt">) => {
    await supabase.from("overtime_applications").insert({
      user_id: request.employeeId,
      overtime_date: request.date,
      start_time: request.startTime,
      end_time: request.endTime,
      reason: request.reason,
      compensation: request.compensationType === "time_off" ? "comp_leave" : "pay",
      status: "pending",
    });
    await notifyManagers({
      type: "overtime_submitted",
      title: "新加班申請",
      body: `${request.employeeName} 提交加班（${request.date}），請審核。`,
      relatedType: "overtime",
    });

    await loadOvertimeRequests();
  };

  const updateOvertimeRequestStatus = async (id: string, status: "approved" | "rejected", rejectReason?: string) => {
    const request = overtimeRequests.find((item) => item.id === id);
    const prevStatus = request?.status;

    await supabase
      .from("overtime_applications")
      .update({
        status,
        reviewed_by: currentUser?.id,
        reviewed_at: new Date().toISOString(),
        ...(rejectReason ? { reject_reason: rejectReason } : {}),
      })
      .eq("id", id);

    if (request) {
      const hours = overtimeHoursBetween(request.startTime, request.endTime);
      if (status === "approved" && prevStatus !== "approved" && request.compensationType === "time_off") {
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 6);
        await supabase.from("comp_leave_ledger").insert({
          user_id: request.employeeId,
          hours,
          source_type: "overtime_credit",
          source_id: id,
          expires_at: expiresAt.toISOString(),
          note: `加班轉補休 ${request.date}`,
        });
      }
      if (prevStatus === "approved" && status !== "approved" && request.compensationType === "time_off") {
        await supabase.from("comp_leave_ledger").insert({
          user_id: request.employeeId,
          hours: -hours,
          source_type: "reversal",
          source_id: id,
          note: "加班補休核准取消，扣回時數",
        });
      }

      // 加班核准時，移除當日遲到記錄
      if (status === "approved" && prevStatus !== "approved") {
        const tardinessToRemove = tardinessRecords.filter(
          (t) => t.employeeId === request.employeeId && t.date === request.date
        );
        for (const t of tardinessToRemove) {
          await deleteTardinessRecord(t.id);
        }
        
        // 同時清除打卡紀錄中該日期的遲到標記
        const punchesToUpdate = punchRecords.filter(
          (p) => p.employeeId === request.employeeId && p.date === request.date && p.lateMinutes > 0
        );
        for (const p of punchesToUpdate) {
          await updatePunchRecord(p.id, { lateMinutes: 0, reason: null });
        }
      }

      // 加班取消核准時，恢復遲到記錄
      if (prevStatus === "approved" && status !== "approved") {
        const punchesToRestore = punchRecords.filter(
          (p) => p.employeeId === request.employeeId && p.date === request.date && p.action === "work_in"
        );
        for (const p of punchesToRestore) {
          if (p.lateMinutes === 0 && p.reason === null) {
            // 重新計算遲到分鐘
            const slot = getPunchSlotsForShift(p.shift, shiftTimeConfig).find(
              (s: PunchSlot) => s.action === "work_in" && s.segmentIndex === p.segmentIndex
            );
            if (slot) {
              const actual = timeToMinutes(p.time);
              const scheduled = timeToMinutes(slot.scheduledTime);
              const diff = minutesDiff(actual, scheduled);
              const lateMinutes = diff >= 30 ? diff : calcLateMinutes(actual, scheduled);
              if (lateMinutes > 0) {
                const reason = diff >= 30 ? "遲到超過30分鐘" : "遲到";
                await updatePunchRecord(p.id, { lateMinutes, reason });
                await addTardinessRecord({
                  employeeId: p.employeeId,
                  employeeName: p.employeeName,
                  date: p.date,
                  minutes: lateMinutes,
                  notes: reason,
                });
              }
            }
          }
        }
      }
    }

    if (request && (status === "approved" || status === "rejected")) {
      const statusText = status === "approved" ? "已核准" : "已駁回";
      let body = `您的加班申請（${request.date}）${statusText}。`;
      if (status === "rejected" && rejectReason?.trim()) {
        body += ` 駁回原因：${rejectReason.trim()}`;
      }
      await insertNotification({
        recipientId: request.employeeId,
        type: "overtime_reviewed",
        title: `加班申請${statusText}`,
        body,
        relatedId: id,
        relatedType: "overtime",
      });
    }

    await loadOvertimeRequests();
    await loadCompLeaveLedger();
    if (currentUser?.id) await loadNotifications(currentUser.id);
  };

  const deleteOvertimeRequest = async (id: string) => {
    const { data, error } = await supabase
      .from("overtime_applications")
      .delete()
      .eq("id", id)
      .select("id");

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error("未找到加班申請或刪除失敗");
    }

    await loadOvertimeRequests();
  };

  // ─── Tardiness records (Supabase) ─────────────────────────────────────────────

  const addTardinessRecord = async (record: Omit<TardinessRecord, "id" | "createdAt">) => {
    const normalizedDate = normalizeDateString(record.date);
    const { data, error } = await supabase.from("tardiness_records").upsert(
      {
        user_id: record.employeeId,
        record_date: normalizedDate,
        minutes_late: record.minutes,
        note: record.notes,
        recorded_by: currentUser?.id ?? record.employeeId,
      },
      { onConflict: "user_id,record_date" }
    ).select("id");

    if (error) {
      throw new Error(error.message || "新增遲到記錄失敗");
    }
    if (!data || data.length === 0) {
      throw new Error("新增遲到記錄失敗");
    }

    const returnedId = data[0].id;
    const employeeName =
      employees.find((emp) => emp.id === record.employeeId)?.name ?? "";
    const newRecord: TardinessRecord = {
      id: returnedId,
      employeeId: record.employeeId,
      employeeName,
      date: normalizedDate,
      minutes: record.minutes,
      notes: record.notes,
      createdAt: new Date().toISOString(),
    };

    setTardinessRecords((prev) => {
      const alreadyExists = prev.some(
        (r) => r.employeeId === record.employeeId && r.date === normalizedDate
      );
      if (alreadyExists) {
        return prev.map((r) =>
          r.employeeId === record.employeeId && r.date === normalizedDate
            ? { ...r, minutes: record.minutes, notes: record.notes, createdAt: newRecord.createdAt }
            : r
        );
      }
      return [newRecord, ...prev];
    });

    await loadTardinessRecords();
  };

  const deleteTardinessRecord = async (id: string) => {
    setTardinessRecords((prev) => prev.filter((r) => r.id !== id));
    
    const { data, error } = await supabase
      .from("tardiness_records")
      .delete()
      .eq("id", id)
      .select("id");

    if (error || !data || data.length === 0) {
      const response = await fetch("/api/attendance/tardiness", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        await loadTardinessRecords();
        throw new Error(result.error || error?.message || "刪除遲到記錄失敗");
      }
    }
  };

  // ─── Punch records (Supabase) ─────────────────────────────────────────────────


  // 記錄打卡修改審計日誌（用於未來的審計功能）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const logPunchAudit = async (
    punchId: string,
    action: "create" | "update" | "delete",
    oldData: Record<string, unknown> | null,
    newData: Record<string, unknown> | null,
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


  // 計算補休假過期日期（6 個月後）
  const getCompLeaveExpiry = useCallback((createdDate: string): { daysLeft: number; isExpired: boolean } => {
    const created = new Date(createdDate);
    const expiry = new Date(created);
    expiry.setMonth(expiry.getMonth() + 6);
    
    const now = new Date();
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    return {
      daysLeft: Math.max(0, daysLeft),
      isExpired: daysLeft < 0,
    };
  }, []);


  // 取得可用補休假（已過期的自動排除）
  const getAvailableCompLeave = useCallback((employeeId: string): { balance: number; expiring: Array<CompLeaveLedgerEntry & { daysLeft: number; isExpired: boolean }> } => {
    const balance = getCompLeaveBalance(employeeId);
    
    // 找出即將過期的補休假（30 天內提醒）
    const expiring = compLeaveLedger
      .filter((entry) => entry.employeeId === employeeId && entry.hours > 0)
      .map((entry) => ({
        ...entry,
        ...getCompLeaveExpiry(entry.createdAt),
      }))
      .filter((entry) => entry.daysLeft > 0 && entry.daysLeft <= 30)
      .sort((a, b) => a.daysLeft - b.daysLeft);
    
    return { balance, expiring };
  }, [compLeaveLedger, getCompLeaveBalance, getCompLeaveExpiry]);

  // 自動檢查補休過期並發送通知
  useEffect(() => {
    if (!currentUser || isLoading) return;

    const checkExpiringCompLeave = async () => {
      const { expiring } = getAvailableCompLeave(currentUser.id);
      
      for (const entry of expiring) {
        const daysLeft = entry.daysLeft;
        // 在剩下 30 天、7 天、1 天時提醒
        if (daysLeft === 30 || daysLeft === 7 || daysLeft === 1) {
          const notificationId = `comp-leave-expiry-${entry.id}-${daysLeft}`;
          // 檢查是否已經發送過此提醒（簡單透過 localStorage 或狀態，這裡示範邏輯）
          const hasNotified = localStorage.getItem(notificationId);
          if (!hasNotified) {
            await insertNotification({
              recipientId: currentUser.id,
              type: "warning",
              title: "補休即將過期提醒",
              body: `您有一筆 ${entry.hours} 小時的補休將在 ${daysLeft} 天後過期，請盡快使用。`,
              relatedId: entry.id,
              relatedType: "overtime",
            });
            localStorage.setItem(notificationId, "true");
          }
        }
      }
    };

    checkExpiringCompLeave();
  }, [currentUser, isLoading, getAvailableCompLeave, insertNotification]);


  // 批量核准申請
  


  // 批量拒絕申請
  


  // 批量新增排班
  

const addPunchRecord = async (record: Omit<PunchRecord, "id" | "createdAt">) => {
    await supabase.from("punch_records").insert({
      employee_id: record.employeeId,
      employee_name: record.employeeName,
      date: record.date,
      action: record.action,
      segment_index: record.segmentIndex,
      time: record.time,
      shift: record.shift,
      late_minutes: record.lateMinutes,
      reason: record.reason ?? null,
      latitude: record.latitude,
      longitude: record.longitude,
    });
    await loadPunchRecords();
  };

  const updatePunchRecord = async (id: string, updates: PunchRecordUpdate) => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.time !== undefined) dbUpdates.time = updates.time;
    if (updates.action !== undefined) dbUpdates.action = updates.action;
    if (updates.segmentIndex !== undefined) dbUpdates.segment_index = updates.segmentIndex;
    if (updates.lateMinutes !== undefined) dbUpdates.late_minutes = updates.lateMinutes;
    if (updates.reason !== undefined) dbUpdates.reason = updates.reason;
    const { error } = await supabase.from("punch_records").update(dbUpdates).eq("id", id);
    if (error) throw error;
    await loadPunchRecords();
  };

  const deletePunchRecord = async (id: string) => {
    await supabase.from("punch_records").delete().eq("id", id);
    // 記錄審計日誌
    const deletedRecord = punchRecords.find((p) => p.id === id);
    if (deletedRecord) {
      // 記錄審計日誌（使用當前使用者 ID）
      // await logPunchAudit(id, "delete", deletedRecord, null, currentUser?.id || "");
    }

    await loadPunchRecords();
  };

  const getTodayPunchRecords = (employeeId: string, date: string) =>
    punchRecords
      .filter((p) => p.employeeId === employeeId && p.date === date)
      .sort((a, b) => a.time.localeCompare(b.time));

  const getPunchRecordsByDate = (employeeId: string, date: string) =>
    punchRecords
      .filter((p) => p.employeeId === employeeId && p.date === date)
      .sort((a, b) => a.time.localeCompare(b.time));

  // ─── Notifications ────────────────────────────────────────────────────────────

  const loadBulletinItems = useCallback(async (): Promise<void> => {
    const [boardResponse, swapResponse, readsResponse] = await Promise.all([
      supabase
        .from("bulletin_board")
        .select("*, users(name)")
        .order("created_at", { ascending: false }),
      supabase
        .from("shift_swap_applications")
        .select(
          "*, requester:users!shift_swap_applications_requester_id_fkey(name), target:users!shift_swap_applications_target_id_fkey(name)"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("bulletin_reads")
        .select("bulletin_id, user_id"),
    ]);

    if (boardResponse.error) {
      console.error("[loadBulletinItems] bulletin_board error:", boardResponse.error);
    }
    if (swapResponse.error) {
      console.error("[loadBulletinItems] shift_swap_applications error:", swapResponse.error);
    }

    const boardData = Array.isArray(boardResponse.data) ? boardResponse.data : [];
    const swapData = Array.isArray(swapResponse.data) ? swapResponse.data : [];
    const readsData = Array.isArray(readsResponse.data) ? readsResponse.data : [];

    // Set bulletin reads
    setBulletinReads(readsData.map((r: { bulletin_id: string; user_id: string }) => ({
      bulletinId: r.bulletin_id,
      userId: r.user_id,
    })));

    const boardItems = boardData.map((r) => ({
      id: r.id,
      authorId: r.author_id,
      authorName: (r.users as { name?: string } | null)?.name ?? "未知",
      title: r.title,
      content: r.content,
      type: r.type as BulletinItem["type"],
      status: r.status as BulletinItem["status"],
      relatedId: r.related_id,
      isUrgent: r.is_urgent ?? false,
      isPinned: r.is_pinned ?? false,
      targetType: (r.target_type ?? "all") as "all" | "specific",
      targetIds: r.target_ids ?? [],
      createdAt: r.created_at,
    }));

    const swapItems = swapData.map((r) => ({
      id: `swap-${r.id}`,
      authorId: r.requester_id,
      authorName: (r.requester as { name?: string } | null)?.name ?? "未知",
      title: `${(r.requester as { name?: string } | null)?.name ?? "員工"} 申請 ${r.swap_date} 換班`,
      content: `希望與 ${(r.target as { name?: string } | null)?.name ?? "同事"} 互換班次，換班日期：${r.swap_date}`,
      type: "shift_swap_request" as BulletinItem["type"],
      status: mapSwapStatusToBulletinStatus(r.status),
      relatedId: r.id,
      isUrgent: false,
      isPinned: false,
      targetType: "all" as const,
      targetIds: [],
      createdAt: r.created_at,
    }));

    // Sort: pinned first, then by createdAt
    setBulletinItems(
      [...boardItems, ...swapItems].sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
    );
  }, [supabase]);

  const addBulletinItem = async (item: Omit<BulletinItem, "id" | "authorName" | "createdAt">): Promise<void> => {
    await supabase.from("bulletin_board").insert({
      author_id: item.authorId,
      title: item.title,
      content: item.content,
      type: item.type,
      status: item.status,
      related_id: item.relatedId,
      is_urgent: item.isUrgent,
      is_pinned: item.isPinned ?? false,
      target_type: item.targetType ?? "all",
      target_ids: item.targetIds ?? [],
    });
    await loadBulletinItems();
  };

  const updateBulletinItem = async (id: string, updates: Partial<BulletinItem>): Promise<void> => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.content !== undefined) dbUpdates.content = updates.content;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.isUrgent !== undefined) dbUpdates.is_urgent = updates.isUrgent;
    if (updates.isPinned !== undefined) dbUpdates.is_pinned = updates.isPinned;
    if (updates.targetType !== undefined) dbUpdates.target_type = updates.targetType;
    if (updates.targetIds !== undefined) dbUpdates.target_ids = updates.targetIds;
    await supabase.from("bulletin_board").update(dbUpdates).eq("id", id);
    await loadBulletinItems();
  };

  const deleteBulletinItem = async (id: string): Promise<void> => {
    await supabase.from("bulletin_board").delete().eq("id", id);
    await loadBulletinItems();
  };

  // 已讀公告
  const readBulletinItem = async (bulletinId: string): Promise<void> => {
    if (!currentUser) return;
    const existing = bulletinReads.find(
      (r) => r.bulletinId === bulletinId && r.userId === currentUser.id
    );
    if (existing) return; // Already read
    
    await supabase.from("bulletin_reads").insert({
      bulletin_id: bulletinId,
      user_id: currentUser.id,
    });
    setBulletinReads((prev) => [...prev, { bulletinId, userId: currentUser.id }]);
  };

  const isBulletinRead = (bulletinId: string): boolean => {
    if (!currentUser) return true;
    return bulletinReads.some(
      (r) => r.bulletinId === bulletinId && r.userId === currentUser.id
    );
  };

  const loadPayrollRecords = useCallback(async (year: number, month: number): Promise<void> => {
    const { data } = await supabase
      .from("payroll_records")
      .select("*")
      .eq("year", year)
      .eq("month", month);
    if (data) {
      setPayrollRecords(
        data.map((r) => ({
          id: r.id,
          userId: r.user_id,
          year: r.year,
          month: r.month,
          baseSalary: Number(r.base_salary),
          laborInsurance: Number(r.labor_insurance),
          healthInsurance: Number(r.health_insurance),
          pensionDeduction: Number(r.pension_deduction),
          leaveDeduction: Number(r.leave_deduction),
          overtimePay: Number(r.overtime_pay),
          tardinessDeduction: Number(r.tardiness_deduction),
          bonusTotal: Number(r.bonus_total),
          finalPay: Number(r.final_pay),
          note: r.note,
          isPublished: r.is_published,
          publishedAt: r.published_at,
          createdAt: r.created_at,
        }))
      );
    }
  }, [supabase]);

  const publishPayrollRecord = async (id: string): Promise<void> => {
    const now = new Date().toISOString();
    await supabase.from("payroll_records").update({
      is_published: true,
      published_at: now
    }).eq("id", id);
    
    // 找出該筆記錄的員工資訊
    const record = payrollRecords.find(r => r.id === id);
    if (record) {
      await insertNotification({
        recipientId: record.userId,
        type: "success",
        title: "薪資單已發布",
        body: `您的 ${record.year} 年 ${record.month} 月薪資單已發布，請前往首頁查看。`,
        relatedId: record.id,
        relatedType: "payroll"
      });
    }
    
    // 重新加載資料（假設我們還在當前選擇的年月）
    if (record) await loadPayrollRecords(record.year, record.month);
  };

  const refreshNotifications = useCallback(async () => {
    if (currentUser?.id) {
      await loadNotifications(currentUser.id);
    }
  }, [currentUser?.id, loadNotifications]);

  const markNotificationRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  // ─── Context value ────────────────────────────────────────────────────────────

  return (
    <AppContext.Provider
      value={{
        currentUser,
        loginEmployee,
        loginManager,
        logout,
        employees,
        addEmployee,
        updateEmployee,
        deleteEmployee,
        schedule,
        updateShift,
        getShiftForDate,
        fixedShifts,
        addFixedShift,
        updateFixedShift,
        deleteFixedShift,
        shiftTimeConfig,
        updateShiftTimeConfig,
        wednesdayNightShifts,
        setWednesdayNightShift,
        getWednesdayOffDates,
        toggleWednesdayOff,
        isWednesdayOff,
        getLeaveSummary,
        toggleLeaveDate,
        isLeaveMonthLocked,
        lockLeaveMonth,
        unlockLeaveMonth,
        leaveMonthLocks,
        leaveRequests,
        addLeaveRequest,
        updateLeaveRequestStatus,
        deleteLeaveRequest,
        compLeaveLedger,
        getCompLeaveBalance,
        getAnnualLeaveQuota,
        getAnnualLeaveBalance,
        getAvailableCompLeave,
        loadCompLeaveLedger,
        swapRequests,
        addSwapRequest,
        updateSwapRequestStatus,
        deleteSwapRequest,
        overtimeRequests,
        addOvertimeRequest,
        updateOvertimeRequestStatus,
        deleteOvertimeRequest,
        tardinessRecords,
        addTardinessRecord,
        deleteTardinessRecord,
        punchRecords,
        addPunchRecord,
        updatePunchRecord,
        deletePunchRecord,
        getTodayPunchRecords,
        getPunchRecordsByDate,
        notifications,
        markNotificationRead,
        refreshNotifications,
        bulletinItems,
        addBulletinItem,
        updateBulletinItem,
        deleteBulletinItem,
        loadBulletinItems,
        readBulletinItem,
        isBulletinRead,
        payrollRecords,
        publishPayrollRecord,
        loadPayrollRecords,
        isLoading,
        isSunday,
        isSaturday,
        isTuesday,
        isWednesday,
        getHolidayInfo,
        holidays,
        loadHolidays,
        refreshHolidayCalendar,
        countSaturdaysInMonth,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
