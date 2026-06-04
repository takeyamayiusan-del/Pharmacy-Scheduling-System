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

// localStorage helpers
const LS = {
  get: <T,>(key: string, fallback: T): T => {
    if (typeof window === "undefined") return fallback;
    try {
      const v = localStorage.getItem(key);
      return v ? (JSON.parse(v) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set: (key: string, value: unknown) => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
};

// ─── Default configs (persisted to localStorage) ──────────────────────────────

const DEFAULT_SHIFT_TIME_CONFIG: ShiftTimeConfig = {
  A: ["08:30-12:00", "13:30-17:00", "19:00-21:00"],
  B: ["08:30-12:00", "13:30-18:00"],
  C: ["08:30-12:00"],
  D: ["13:30-18:00"],
  E: ["13:30-17:00", "19:00-21:00"],
  X: ["休假"],
};

const DEFAULT_FIXED_SHIFTS: FixedShift[] = normalizeFixedShifts([
  { employeeId: "shengwen", dayOfWeek: 1, shift: "A" },
  { employeeId: "shengwen", dayOfWeek: 2, shift: "D" },
  { employeeId: "shengwen", dayOfWeek: 5, shift: "A" },
  { employeeId: "yihsiao", dayOfWeek: 5, shift: "A" },
  { employeeId: "zhenting", dayOfWeek: 1, shift: "A" },
  { employeeId: "zhenting", dayOfWeek: 4, shift: "A" },
  { employeeId: "guixiang", dayOfWeek: 2, shift: "A" },
  { employeeId: "guixiang", dayOfWeek: 4, shift: "A" },
]);

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
  updateShift: (date: string, employeeId: string, shift: ShiftType) => void;
  getShiftForDate: (date: string, employeeId: string) => ShiftType;
  fixedShifts: FixedShift[];
  addFixedShift: (shift: FixedShift) => void;
  updateFixedShift: (index: number, shift: FixedShift) => void;
  deleteFixedShift: (index: number) => void;
  shiftTimeConfig: ShiftTimeConfig;
  updateShiftTimeConfig: (shift: ShiftType, ranges: string[]) => void;
  wednesdayNightShifts: WednesdayNightShift[];
  setWednesdayNightShift: (date: string, employeeId: string) => void;
  getWednesdayOffDates: (employeeId: string, year: number, month: number) => string[];
  toggleWednesdayOff: (employeeId: string, date: string) => { success: boolean; message?: string };
  isWednesdayOff: (employeeId: string, date: string) => boolean;
  getLeaveSummary: (employeeId: string, year: number, month: number) => LeaveSummary;
  toggleLeaveDate: (employeeId: string, date: string) => { success: boolean; message?: string };
  isLeaveMonthLocked: (year: number, month: number) => boolean;
  lockLeaveMonth: (year: number, month: number, lockedBy: string) => void;
  unlockLeaveMonth: (year: number, month: number) => void;
  leaveMonthLocks: LeaveMonthLock[];
  leaveRequests: LeaveRequest[];
  addLeaveRequest: (request: Omit<LeaveRequest, "id" | "createdAt">) => Promise<void>;
  updateLeaveRequestStatus: (id: string, status: "approved" | "rejected") => Promise<void>;
  swapRequests: SwapRequest[];
  addSwapRequest: (request: Omit<SwapRequest, "id" | "createdAt">) => Promise<void>;
  updateSwapRequestStatus: (id: string, status: "pending_confirmation" | "pending_approval" | "approved" | "rejected") => Promise<void>;
  overtimeRequests: OvertimeRequest[];
  addOvertimeRequest: (request: Omit<OvertimeRequest, "id" | "createdAt">) => Promise<void>;
  updateOvertimeRequestStatus: (id: string, status: "approved" | "rejected") => Promise<void>;
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
  const [wednesdayOffSelections, setWednesdayOffSelections] = useState<WednesdayOffSelections>({ yihsiao: [], zhenting: [] });
  const [leaveMonthLocks, setLeaveMonthLocks] = useState<LeaveMonthLock[]>([]);

  // localStorage-backed state (configs that don't need multi-user sync)
  const [schedule, setSchedule] = useState<ScheduleData>(() => LS.get("schedule", {}));
  const [fixedShifts, setFixedShifts] = useState<FixedShift[]>(() =>
    normalizeFixedShifts(LS.get("fixedShifts", DEFAULT_FIXED_SHIFTS))
  );
  const [shiftTimeConfig, setShiftTimeConfig] = useState<ShiftTimeConfig>(() =>
    LS.get("shiftTimeConfig", DEFAULT_SHIFT_TIME_CONFIG)
  );
  const [wednesdayNightShifts, setWednesdayNightShifts] = useState<WednesdayNightShift[]>(() =>
    LS.get("wednesdayNightShifts", [])
  );

  // Persist localStorage-backed state
  useEffect(() => { LS.set("schedule", schedule); }, [schedule]);
  useEffect(() => { LS.set("fixedShifts", fixedShifts); }, [fixedShifts]);
  useEffect(() => { LS.set("shiftTimeConfig", shiftTimeConfig); }, [shiftTimeConfig]);
  useEffect(() => { LS.set("wednesdayNightShifts", wednesdayNightShifts); }, [wednesdayNightShifts]);

  // ─── Load data from Supabase ────────────────────────────────────────────────

  const loadEmployees = useCallback(async () => {
    const { data } = await supabase.from("users").select("id, name, role, is_active").eq("is_active", true);
    if (data) {
      setEmployees(
        data.map((u) => ({
          id: u.id,
          name: u.name,
          role: mapRole(u.role),
        }))
      );
    }
  }, [supabase]);

  const loadLeaveRequests = useCallback(async () => {
    const { data } = await supabase
      .from("leave_applications")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) {
      setLeaveRequests(
        data.map((r) => ({
          id: r.id,
          employeeId: r.user_id,
          employeeName: "",
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
      .select("*")
      .order("created_at", { ascending: false });
    if (data) {
      setSwapRequests(
        data.map((r) => ({
          id: r.id,
          requesterId: r.requester_id,
          requesterName: "",
          targetEmployeeId: r.target_id,
          targetEmployeeName: "",
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
      .select("*")
      .order("created_at", { ascending: false });
    if (data) {
      setOvertimeRequests(
        data.map((r) => ({
          id: r.id,
          employeeId: r.user_id,
          employeeName: "",
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
            await Promise.allSettled([
              loadEmployees(),
              loadLeaveRequests(),
              loadSwapRequests(),
              loadOvertimeRequests(),
              loadTardinessRecords(),
              loadPunchRecords(),
              loadNotifications(userRow.id),
            ]);
          }
        }
      } catch (e) {
        console.error("[initAuth] error:", e);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      if (event === "SIGNED_OUT" || !session) {
        setCurrentUser(null);
        setEmployees([]);
        setIsLoading(false);
        return;
      }
      if (event === "SIGNED_IN" && session?.user) {
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
            await Promise.allSettled([
              loadEmployees(),
              loadLeaveRequests(),
              loadSwapRequests(),
              loadOvertimeRequests(),
              loadTardinessRecords(),
              loadPunchRecords(),
              loadNotifications(userRow.id),
            ]);
          } else if (mounted) {
            console.warn("[SIGNED_IN] no user row found for", session.user.id);
          }
        } catch (e) {
          console.error("[SIGNED_IN] error:", e);
        } finally {
          if (mounted) setIsLoading(false);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, loadEmployees, loadLeaveRequests, loadSwapRequests, loadOvertimeRequests, loadTardinessRecords, loadPunchRecords, loadNotifications]);

  // ─── Auth functions ──────────────────────────────────────────────────────────

  const loginEmployee = async (username: string, password: string): Promise<boolean> => {
    const email = `${username.trim().toLowerCase()}@yaosheng.app`;
    console.log("[login] attempting:", email);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      console.log("[login] result:", data?.user?.id, "error:", error?.message);
      if (error) console.error("[login] error:", error.message, error.status);
      return !error;
    } catch (e) {
      console.error("[login] exception:", e);
      return false;
    }
  };

  const loginManager = async (username: string, password: string): Promise<boolean> => {
    const email = `${username.trim().toLowerCase()}@yaosheng.app`;
    console.log("[login] attempting:", email);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      console.log("[login] result:", data?.user?.id, "error:", error?.message);
      if (error) console.error("[login] error:", error.message, error.status);
      return !error;
    } catch (e) {
      console.error("[login] exception:", e);
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
    if (isSaturday(date) && !(leaveSelections[employeeId] ?? []).includes(date)) return "C";
    if (employeeId === "shengwen" && isWednesday(date)) return "X";
    if ((leaveSelections[employeeId] ?? []).includes(date)) return "X";

    const dayOfWeek = new Date(date).getDay();
    const isWednesdayNightEmployee = employeeId === "yihsiao" || employeeId === "zhenting";
    const fixedShift =
      isWednesday(date) && isWednesdayNightEmployee
        ? undefined
        : fixedShifts.find((s) => s.employeeId === employeeId && s.dayOfWeek === dayOfWeek);

    let shift: ShiftType = fixedShift?.shift ?? "B";

    if (isWednesday(date) && isWednesdayNightEmployee) {
      const yihsiaoOff = isWednesdayOff("yihsiao", date);
      const zhentingOff = isWednesdayOff("zhenting", date);
      if (yihsiaoOff === zhentingOff) {
        shift = "B";
      } else {
        const onDutyId = yihsiaoOff ? "zhenting" : "yihsiao";
        shift = employeeId === onDutyId ? "A" : "B";
      }
    }

    return shift;
  };

  const updateShift = (date: string, employeeId: string, shift: ShiftType) => {
    setSchedule((prev) => ({ ...prev, [date]: { ...prev[date], [employeeId]: shift } }));
  };

  // ─── Fixed shifts ────────────────────────────────────────────────────────────

  const addFixedShift = (shift: FixedShift) => {
    setFixedShifts((prev) => normalizeFixedShifts([...prev, shift]));
  };

  const updateFixedShift = (index: number, shift: FixedShift) => {
    setFixedShifts((prev) => {
      const next = [...prev];
      next[index] = shift;
      return normalizeFixedShifts(next);
    });
  };

  const deleteFixedShift = (index: number) => {
    setFixedShifts((prev) => prev.filter((_, i) => i !== index));
  };

  // ─── Shift time config ───────────────────────────────────────────────────────

  const updateShiftTimeConfig = (shift: ShiftType, ranges: string[]) => {
    setShiftTimeConfig((prev) => ({ ...prev, [shift]: ranges }));
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
    if (!["yihsiao", "zhenting"].includes(employeeId))
      return { success: false, message: "只有宜孝與貞葶可以設定禮拜三晚班排休" };
    if (!isWednesday(date))
      return { success: false, message: "只能設定禮拜三的晚班排休" };

    const year = new Date(date).getFullYear();
    const month = new Date(date).getMonth() + 1;
    const selectedDates = getWednesdayOffDates(employeeId, year, month);
    const selected = selectedDates.includes(date);

    if (selected) {
      setWednesdayOffSelections((prev) => ({
        ...prev,
        [employeeId]: (prev[employeeId] ?? []).filter((d) => d !== date),
      }));
      return { success: true };
    }

    if (selectedDates.length >= 2)
      return { success: false, message: "每月最多只能選擇 2 個禮拜三不輪晚班" };

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
    const isShengwen = employeeId === "shengwen";

    return {
      selectedDates,
      saturdayUsed: isShengwen ? selectedSaturdayDates.length : saturdayCoreDates.length,
      saturdayLimit: 2,
      weekdayUsed: isShengwen ? 0 : weekdayDates.length,
      weekdayLimit: isShengwen ? 0 : 2,
      optionalSaturdayUsed: Boolean(optionalSaturday && selectedDates.includes(optionalSaturday) && !isShengwen),
      optionalSaturdayAvailable: !isShengwen && saturdayDates.length >= 5,
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
    const isShengwen = employeeId === "shengwen";

    if (isSelected) {
      setLeaveSelections((prev) => ({
        ...prev,
        [employeeId]: (prev[employeeId] ?? []).filter((d) => d !== date),
      }));
      return { success: true };
    }

    if (isSunday(date)) return { success: false, message: "禮拜日固定公休，不需要另外選擇" };
    if (isShengwen && !isSaturday(date)) return { success: false, message: "聖文只能選擇兩個禮拜六排休" };

    if (isSaturday(date)) {
      if (isShengwen && summary.saturdayUsed >= summary.saturdayLimit)
        return { success: false, message: "聖文的禮拜六排休已達 2 天上限" };

      const saturdayDates = getMonthSaturdays(year, month);
      const optionalSaturday = saturdayDates[4];
      if (date === optionalSaturday) {
        setLeaveSelections((prev) => ({
          ...prev,
          [employeeId]: [...(prev[employeeId] ?? []), date],
        }));
        return { success: true };
      }

      if (summary.saturdayUsed >= summary.saturdayLimit)
        return { success: false, message: "禮拜六排休已達 2 天上限" };
    } else if (summary.weekdayUsed >= summary.weekdayLimit) {
      return { success: false, message: "平日排休已達 2 天上限" };
    }

    setLeaveSelections((prev) => ({
      ...prev,
      [employeeId]: [...(prev[employeeId] ?? []), date],
    }));
    return { success: true };
  };

  const isLeaveMonthLocked = (year: number, month: number) =>
    leaveMonthLocks.some((l) => l.year === year && l.month === month);

  const lockLeaveMonth = (year: number, month: number, lockedBy: string) => {
    setLeaveMonthLocks((prev) => {
      if (prev.some((l) => l.year === year && l.month === month)) return prev;
      return [...prev, { year, month, lockedBy, lockedAt: new Date().toISOString() }];
    });
  };

  const unlockLeaveMonth = (year: number, month: number) => {
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

  const updateLeaveRequestStatus = async (id: string, status: "approved" | "rejected") => {
    await supabase
      .from("leave_applications")
      .update({ status, reviewed_by: currentUser?.id, reviewed_at: new Date().toISOString() })
      .eq("id", id);
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
    status: "pending_confirmation" | "pending_approval" | "approved" | "rejected"
  ) => {
    const dbStatus =
      status === "pending_confirmation" ? "pending_confirm" :
      status === "pending_approval" ? "pending_review" : status;
    await supabase
      .from("shift_swap_applications")
      .update({ status: dbStatus, reviewed_by: currentUser?.id, reviewed_at: new Date().toISOString() })
      .eq("id", id);
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

  const updateOvertimeRequestStatus = async (id: string, status: "approved" | "rejected") => {
    await supabase
      .from("overtime_applications")
      .update({ status, reviewed_by: currentUser?.id, reviewed_at: new Date().toISOString() })
      .eq("id", id);
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
        swapRequests,
        addSwapRequest,
        updateSwapRequestStatus,
        overtimeRequests,
        addOvertimeRequest,
        updateOvertimeRequestStatus,
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
