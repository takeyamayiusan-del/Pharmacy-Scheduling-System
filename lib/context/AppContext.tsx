"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

// ─── Types ───────────────────────────────────────────────────────────────────

export type Employee = {
  id: string;
  name: string;
  role: "owner" | "manager" | "staff";
  username?: string;
  password?: string;
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

export type LeaveRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  type: "事假" | "病假" | "特休" | "其他";
  reason: string;
  status: "pending" | "approved" | "rejected";
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

export type TardinessRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  minutes: number;
  notes: string;
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
  if (dbRole === "boss") return "owner";
  if (dbRole === "manager") return "manager";
  return "staff";
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
  toggleWednesdayOff: (employeeId: string, date: string) => { success: boolean; message?: string };
  isWednesdayOff: (employeeId: string, date: string) => boolean;
  getLeaveSummary: (employeeId: string, year: number, month: number) => LeaveSummary;
  toggleLeaveDate: (employeeId: string, date: string) => { success: boolean; message?: string };
  isLeaveMonthLocked: (year: number, month: number) => boolean;
  lockLeaveMonth: (year: number, month: number, lockedBy: string) => Promise<void>;
  unlockLeaveMonth: (year: number, month: number) => Promise<void>;
  leaveMonthLocks: LeaveMonthLock[];
  leaveRequests: LeaveRequest[];
  addLeaveRequest: (request: Omit<LeaveRequest, "id" | "createdAt">) => Promise<void>;
  updateLeaveRequestStatus: (id: string, status: "approved" | "rejected", rejectReason?: string) => Promise<void>;
  deleteLeaveRequest: (id: string) => Promise<void>;
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
  updatePunchRecord: (id: string, updates: Partial<Pick<PunchRecord, "time" | "action" | "segmentIndex">>) => Promise<void>;
  deletePunchRecord: (id: string) => Promise<void>;
  getTodayPunchRecords: (employeeId: string, date: string) => PunchRecord[];
  getPunchRecordsByDate: (employeeId: string, date: string) => PunchRecord[];
  notifications: Notification[];
  markNotificationRead: (id: string) => void;
  isLoading: boolean;
  isSunday: (dateStr: string) => boolean;
  isSaturday: (dateStr: string) => boolean;
  isTuesday: (dateStr: string) => boolean;
  isWednesday: (dateStr: string) => boolean;
  getHolidayInfo: (dateStr: string) => { isHoliday: boolean; name?: string };
  countSaturdaysInMonth: (year: number, month: number) => number;
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
  const [leaveSelections, setLeaveSelections] = useState<LeaveSelections>({});
  const [wednesdayOffSelections, setWednesdayOffSelections] = useState<WednesdayOffSelections>({});
  const [leaveMonthLocks, setLeaveMonthLocks] = useState<LeaveMonthLock[]>([]);

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
      .select("id, name, role, is_active, is_wednesday_rotation, is_weekday_off_rule")
      .eq("is_active", true);
    if (data) {
      setEmployees(
        data.map((u) => ({
          id: u.id,
          name: u.name,
          role: mapRole(u.role),
          isWednesdayRotation: u.is_wednesday_rotation ?? false,
          isWeekdayOffRule: u.is_weekday_off_rule ?? false,
        }))
      );
    }
  }, [supabase]);

  const loadLeaveRequests = useCallback(async () => {
    const { data } = await supabase
      .from("leave_applications")
      .select("*, users!leave_applications_user_id_fkey(name)")
      .order("created_at", { ascending: false });
    if (data) {
      setLeaveRequests(
        data.map((r) => ({
          id: r.id,
          employeeId: r.user_id,
          employeeName: (r.users as { name?: string } | null)?.name ?? "",
          startDate: r.leave_date,
          endDate: r.leave_date,
          startTime: r.period === "morning" ? "08:30" : "13:30",
          endTime: r.period === "full_day" ? "21:00" : r.period === "morning" ? "12:00" : "18:00",
          type: r.leave_type as LeaveRequest["type"],
          reason: r.reason,
          status: r.status as LeaveRequest["status"],
          createdAt: r.created_at,
        }))
      );
    }
  }, [supabase]);

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
          status: r.status as SwapRequest["status"],
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
          compensationType: (r.compensation ?? "pay") as OvertimeRequest["compensationType"],
          status: r.status as OvertimeRequest["status"],
          createdAt: r.created_at,
        }))
      );
    }
  }, [supabase]);

  const loadTardinessRecords = useCallback(async () => {
    const { data } = await supabase
      .from("tardiness_records")
      .select("*")
      .order("record_date", { ascending: false });
    if (data) {
      setTardinessRecords(
        data.map((r) => ({
          id: r.id,
          employeeId: r.user_id,
          employeeName: "",
          date: r.record_date,
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
        }))
      );
    }
  }, [supabase]);

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
            .select("id, name, role")
            .eq("id", session.user.id)
            .maybeSingle();
          console.log("[initAuth] userRow:", userRow);
          if (userRow && mounted) {
            const emp: Employee = { id: userRow.id, name: userRow.name, role: mapRole(userRow.role) };
            setCurrentUser(emp);
            // Load data in background without awaiting
            Promise.allSettled([
              loadEmployees(),
              loadLeaveRequests(),
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
              .select("id, name, role")
              .eq("id", session.user.id)
              .maybeSingle();
            console.log("[SIGNED_IN] userRow:", userRow);
            if (userRow && mounted) {
              const emp: Employee = { id: userRow.id, name: userRow.name, role: mapRole(userRow.role) };
              setCurrentUser(emp);
              // Load data in background without awaiting
              Promise.allSettled([
                loadEmployees(),
                loadLeaveRequests(),
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
  }, [supabase, loadEmployees, loadLeaveRequests, loadSwapRequests, loadOvertimeRequests, loadTardinessRecords, loadPunchRecords, loadNotifications, loadScheduleOverrides, loadLeaveSelections, loadFixedShifts, loadShiftTimeConfig, loadWednesdayOffSelections, loadLeaveMonthLocks]);

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

  const toggleWednesdayOff = (employeeId: string, date: string) => {
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
      // Optimistic update
      setWednesdayOffSelections((prev) => ({
        ...prev,
        [employeeId]: (prev[employeeId] ?? []).filter((d) => d !== date),
      }));
      supabase
        .from("wednesday_off_selections")
        .delete()
        .eq("user_id", employeeId)
        .eq("date", date)
        .then();
      return { success: true };
    }

    if (selectedDates.length >= 2)
      return { success: false, message: "每月最多只能選擇 2 個禮拜三不輪晚班" };

    // Optimistic update
    setWednesdayOffSelections((prev) => ({
      ...prev,
      [employeeId]: [...(prev[employeeId] ?? []), date],
    }));
    supabase
      .from("wednesday_off_selections")
      .insert({ user_id: employeeId, date })
      .then();
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

  const addLeaveRequest = async (request: Omit<LeaveRequest, "id" | "createdAt">) => {
    await supabase.from("leave_applications").insert({
      user_id: request.employeeId,
      leave_date: request.startDate,
      period: "full_day",
      leave_type: request.type,
      reason: request.reason,
      status: "pending",
    });
    await loadLeaveRequests();
  };

  const updateLeaveRequestStatus = async (id: string, status: "approved" | "rejected", rejectReason?: string) => {
    await supabase
      .from("leave_applications")
      .update({
        status,
        reviewed_by: currentUser?.id,
        reviewed_at: new Date().toISOString(),
        ...(rejectReason ? { reject_reason: rejectReason } : {}),
      })
      .eq("id", id);
    await loadLeaveRequests();
  };

  const deleteLeaveRequest = async (id: string) => {
    await supabase.from("leave_applications").delete().eq("id", id);
    await loadLeaveRequests();
  };

  // ─── Swap requests (Supabase) ────────────────────────────────────────────────

  const addSwapRequest = async (request: Omit<SwapRequest, "id" | "createdAt">) => {
    const isSelfSwap = request.requesterId === request.targetEmployeeId;
    await supabase.from("shift_swap_applications").insert({
      requester_id: request.requesterId,
      target_id: request.targetEmployeeId,
      swap_date: request.requesterDate,
      status: isSelfSwap ? "pending_review" : "pending_confirm",
    });
    await loadSwapRequests();
  };

  const updateSwapRequestStatus = async (
    id: string,
    status: "pending_confirmation" | "pending_approval" | "approved" | "rejected",
    rejectReason?: string
  ) => {
    const dbStatus =
      status === "pending_confirmation" ? "pending_confirm" :
      status === "pending_approval" ? "pending_review" : status;
    await supabase
      .from("shift_swap_applications")
      .update({
        status: dbStatus,
        reviewed_by: currentUser?.id,
        reviewed_at: new Date().toISOString(),
        ...(rejectReason ? { reject_reason: rejectReason } : {}),
      })
      .eq("id", id);
    await loadSwapRequests();
  };

  const deleteSwapRequest = async (id: string) => {
    await supabase.from("shift_swap_applications").delete().eq("id", id);
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
      status: "pending",
    });
    await loadOvertimeRequests();
  };

  const updateOvertimeRequestStatus = async (id: string, status: "approved" | "rejected", rejectReason?: string) => {
    await supabase
      .from("overtime_applications")
      .update({
        status,
        reviewed_by: currentUser?.id,
        reviewed_at: new Date().toISOString(),
        ...(rejectReason ? { reject_reason: rejectReason } : {}),
      })
      .eq("id", id);
    await loadOvertimeRequests();
  };

  const deleteOvertimeRequest = async (id: string) => {
    await supabase.from("overtime_applications").delete().eq("id", id);
    await loadOvertimeRequests();
  };

  // ─── Tardiness records (Supabase) ─────────────────────────────────────────────

  const addTardinessRecord = async (record: Omit<TardinessRecord, "id" | "createdAt">) => {
    await supabase.from("tardiness_records").insert({
      user_id: record.employeeId,
      record_date: record.date,
      minutes_late: record.minutes,
      note: record.notes,
      recorded_by: currentUser?.id ?? record.employeeId,
    });
    await loadTardinessRecords();
  };

  const deleteTardinessRecord = async (id: string) => {
    await supabase.from("tardiness_records").delete().eq("id", id);
    await loadTardinessRecords();
  };

  // ─── Punch records (Supabase) ─────────────────────────────────────────────────

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

  const updatePunchRecord = async (id: string, updates: Partial<Pick<PunchRecord, "time" | "action" | "segmentIndex">>) => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.time !== undefined) dbUpdates.time = updates.time;
    if (updates.action !== undefined) dbUpdates.action = updates.action;
    if (updates.segmentIndex !== undefined) dbUpdates.segment_index = updates.segmentIndex;
    await supabase.from("punch_records").update(dbUpdates).eq("id", id);
    await loadPunchRecords();
  };

  const deletePunchRecord = async (id: string) => {
    await supabase.from("punch_records").delete().eq("id", id);
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
        isLoading,
        isSunday,
        isSaturday,
        isTuesday,
        isWednesday,
        getHolidayInfo,
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
