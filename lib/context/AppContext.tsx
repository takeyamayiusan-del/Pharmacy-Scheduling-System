"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

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

export const EMPLOYEES: Employee[] = [
  { id: "owner", name: "老闆", role: "owner" },
  { id: "yishan", name: "佾珊", role: "manager", username: "joy", password: "joy123" },
  { id: "yihsiao", name: "宜孝", role: "staff", username: "yihsiao", password: "yihsiao123" },
  { id: "zhenting", name: "貞葶", role: "staff", username: "zhenting", password: "zhenting123" },
  { id: "shengwen", name: "聖文", role: "staff", username: "shengwen", password: "shengwen123" },
  { id: "guixiang", name: "桂香", role: "staff", username: "guixiang", password: "guixiang123" },
];

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
  { date: "2026-10-31", name: "光復節" },
  { date: "2026-11-12", name: "國父誕辰" },
  { date: "2026-12-25", name: "聖誕節" },
];

export const isSunday = (dateStr: string): boolean => new Date(dateStr).getDay() === 0;
export const isSaturday = (dateStr: string): boolean => new Date(dateStr).getDay() === 6;
export const isTuesday = (dateStr: string): boolean => new Date(dateStr).getDay() === 2;
export const isWednesday = (dateStr: string): boolean => new Date(dateStr).getDay() === 3;

export const getHolidayInfo = (dateStr: string): { isHoliday: boolean; name?: string } => {
  const holiday = TAIWAN_HOLIDAYS_2026.find((item) => item.date === dateStr);
  return { isHoliday: Boolean(holiday), name: holiday?.name };
};

export const countSaturdaysInMonth = (year: number, month: number): number => {
  let count = 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (isSaturday(dateStr)) {
      count += 1;
    }
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
    if (isSaturday(dateStr)) {
      dates.push(dateStr);
    }
  }
  return dates;
};

const normalizeFixedShifts = (shifts: FixedShift[]) => {
  const unique = new Map<string, FixedShift>();
  shifts.forEach((shift) => {
    unique.set(`${shift.employeeId}-${shift.dayOfWeek}`, shift);
  });
  return Array.from(unique.values()).sort((left, right) => {
    if (left.employeeId === right.employeeId) {
      return left.dayOfWeek - right.dayOfWeek;
    }
    return left.employeeId.localeCompare(right.employeeId);
  });
};

const initialLeaveRequests: LeaveRequest[] = [];

const initialSwapRequests: SwapRequest[] = [];

const initialOvertimeRequests: OvertimeRequest[] = [];

const initialNotifications: Notification[] = [];

const initialTardinessRecords: TardinessRecord[] = [];

const initialPunchRecords: PunchRecord[] = [];

const initialFixedShifts: FixedShift[] = normalizeFixedShifts([
  { employeeId: "shengwen", dayOfWeek: 1, shift: "A" },
  { employeeId: "shengwen", dayOfWeek: 2, shift: "D" },
  { employeeId: "shengwen", dayOfWeek: 5, shift: "A" },
  { employeeId: "yihsiao", dayOfWeek: 5, shift: "A" },
  { employeeId: "zhenting", dayOfWeek: 1, shift: "A" },
  { employeeId: "zhenting", dayOfWeek: 4, shift: "A" },
  { employeeId: "guixiang", dayOfWeek: 2, shift: "A" },
  { employeeId: "guixiang", dayOfWeek: 4, shift: "A" },
]);

const initialShiftTimeConfig: ShiftTimeConfig = {
  A: ["08:30-12:00", "13:30-17:00", "19:00-21:00"],
  B: ["08:30-12:00", "13:30-18:00"],
  C: ["08:30-12:00"],
  D: ["13:30-18:00"],
  E: ["13:30-17:00", "19:00-21:00"],
  X: ["休假"],
};

const generateInitialWednesdayNightShifts = (): WednesdayNightShift[] => {
  // 預設不先指派，讓頁面呈現「尚未決定誰晚班」
  return [];
};

interface AppContextType {
  currentUser: Employee | null;
  loginEmployee: (username: string, password: string) => boolean;
  loginManager: (username: string, password: string) => boolean;
  logout: () => void;
  employees: Employee[];
  addEmployee: (employee: Omit<Employee, "id">) => void;
  updateEmployee: (id: string, employee: Partial<Employee>) => void;
  deleteEmployee: (id: string) => void;
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
  addLeaveRequest: (request: Omit<LeaveRequest, "id" | "createdAt">) => void;
  updateLeaveRequestStatus: (id: string, status: "approved" | "rejected") => void;
  swapRequests: SwapRequest[];
  addSwapRequest: (request: Omit<SwapRequest, "id" | "createdAt">) => void;
  updateSwapRequestStatus: (id: string, status: "pending_confirmation" | "pending_approval" | "approved" | "rejected") => void;
  overtimeRequests: OvertimeRequest[];
  addOvertimeRequest: (request: Omit<OvertimeRequest, "id" | "createdAt">) => void;
  updateOvertimeRequestStatus: (id: string, status: "approved" | "rejected") => void;
  tardinessRecords: TardinessRecord[];
  addTardinessRecord: (record: Omit<TardinessRecord, "id" | "createdAt">) => void;
  deleteTardinessRecord: (id: string) => void;
  punchRecords: PunchRecord[];
  addPunchRecord: (record: Omit<PunchRecord, "id" | "createdAt">) => void;
  updatePunchRecord: (id: string, updates: Partial<Pick<PunchRecord, "time" | "action" | "segmentIndex">>) => void;
  deletePunchRecord: (id: string) => void;
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

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<Employee | null>(null);
  const [employees, setEmployees] = useState<Employee[]>(EMPLOYEES);
  const [schedule, setSchedule] = useState<ScheduleData>({});
  const [fixedShifts, setFixedShifts] = useState<FixedShift[]>(initialFixedShifts);
  const [shiftTimeConfig, setShiftTimeConfig] = useState<ShiftTimeConfig>(initialShiftTimeConfig);
  const [wednesdayNightShifts, setWednesdayNightShifts] = useState<WednesdayNightShift[]>(
    generateInitialWednesdayNightShifts()
  );
  const [leaveSelections, setLeaveSelections] = useState<LeaveSelections>({});
  const [leaveMonthLocks, setLeaveMonthLocks] = useState<LeaveMonthLock[]>([]);
  const [wednesdayOffSelections, setWednesdayOffSelections] = useState<WednesdayOffSelections>({
    yihsiao: [],
    zhenting: [],
  });
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>(initialLeaveRequests);
  const [swapRequests, setSwapRequests] = useState<SwapRequest[]>(initialSwapRequests);
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>(initialOvertimeRequests);
  const [tardinessRecords, setTardinessRecords] = useState<TardinessRecord[]>(initialTardinessRecords);
  const [punchRecords, setPunchRecords] = useState<PunchRecord[]>(initialPunchRecords);
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [isLoading] = useState(false);

  const loginEmployee = (username: string, password: string): boolean => {
    const employee = employees.find(
      (item) =>
        item.role === "staff" &&
        item.username?.trim().toLowerCase() === username.trim().toLowerCase() &&
        item.password === password
    );
    if (employee) {
      setCurrentUser(employee);
      return true;
    }
    return false;
  };

  const loginManager = (username: string, password: string): boolean => {
    if (username === "boss" && password === "boss123") {
      setCurrentUser(EMPLOYEES[0]);
      return true;
    }
    if (username === "joy" && password === "joy123") {
      const manager = employees.find((item) => item.id === "yishan") ?? EMPLOYEES[1];
      setCurrentUser(manager);
      return true;
    }
    return false;
  };

  const logout = () => {
    setCurrentUser(null);
  };

  const addEmployee = (employee: Omit<Employee, "id">) => {
    setEmployees((prev) => [...prev, { ...employee, id: Date.now().toString() }]);
  };

  const updateEmployee = (id: string, updates: Partial<Employee>) => {
    setEmployees((prev) => prev.map((employee) => (employee.id === id ? { ...employee, ...updates } : employee)));
    setCurrentUser((prev) => (prev?.id === id ? { ...prev, ...updates } as Employee : prev));
  };

  const deleteEmployee = (id: string) => {
    setEmployees((prev) => prev.filter((employee) => employee.id !== id));
    setFixedShifts((prev) => prev.filter((shift) => shift.employeeId !== id));
    setLeaveSelections((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setWednesdayOffSelections((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSchedule((prev) => {
      const next: ScheduleData = {};
      Object.entries(prev).forEach(([date, daySchedule]) => {
        const { [id]: removedShift, ...rest } = daySchedule;
        void removedShift;
        next[date] = rest;
      });
      return next;
    });
  };

  const getLeaveSummary = (employeeId: string, year: number, month: number): LeaveSummary => {
    const selectedDates = (leaveSelections[employeeId] ?? []).filter((date) => isInMonth(date, year, month));
    const saturdayDates = getMonthSaturdays(year, month);
    const optionalSaturday = saturdayDates[4];
    const selectedSaturdayDates = selectedDates.filter((date) => isSaturday(date));
    const saturdayCoreDates = selectedSaturdayDates.filter((date) => date !== optionalSaturday);
    const weekdayDates = selectedDates.filter((date) => !isSaturday(date) && !isSunday(date));
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
    if (leaveMonthLocks.some((lock) => lock.year === year && lock.month === month)) {
      return { success: false, message: "本月份排休已鎖定，僅可選擇後續月份" };
    }
    const summary = getLeaveSummary(employeeId, year, month);
    const isSelected = summary.selectedDates.includes(date);
    const isShengwen = employeeId === "shengwen";

    if (isSelected) {
      setLeaveSelections((prev) => ({
        ...prev,
        [employeeId]: (prev[employeeId] ?? []).filter((item) => item !== date),
      }));
      return { success: true };
    }

    if (isSunday(date)) {
      return { success: false, message: "禮拜日固定公休，不需要另外選擇" };
    }

    if (isShengwen && !isSaturday(date)) {
      return { success: false, message: "聖文只能選擇兩個禮拜六排休" };
    }

    if (isSaturday(date)) {
      if (isShengwen && summary.saturdayUsed >= summary.saturdayLimit) {
        return { success: false, message: "聖文的禮拜六排休已達 2 天上限" };
      }

      const saturdayDates = getMonthSaturdays(year, month);
      const optionalSaturday = saturdayDates[4];
      if (date === optionalSaturday) {
        setLeaveSelections((prev) => ({
          ...prev,
          [employeeId]: [...(prev[employeeId] ?? []), date],
        }));
        return { success: true };
      }

      if (summary.saturdayUsed >= summary.saturdayLimit) {
        return { success: false, message: "禮拜六排休已達 2 天上限" };
      }
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
    leaveMonthLocks.some((lock) => lock.year === year && lock.month === month);

  const lockLeaveMonth = (year: number, month: number, lockedBy: string) => {
    setLeaveMonthLocks((prev) => {
      if (prev.some((lock) => lock.year === year && lock.month === month)) return prev;
      return [
        ...prev,
        {
          year,
          month,
          lockedBy,
          lockedAt: new Date().toISOString(),
        },
      ];
    });
  };

  const unlockLeaveMonth = (year: number, month: number) => {
    setLeaveMonthLocks((prev) => prev.filter((lock) => !(lock.year === year && lock.month === month)));
  };

  const getWednesdayOffDates = (employeeId: string, year: number, month: number) =>
    (wednesdayOffSelections[employeeId] ?? []).filter((date) => isInMonth(date, year, month));

  const isWednesdayOff = (employeeId: string, date: string) => (wednesdayOffSelections[employeeId] ?? []).includes(date);

  const toggleWednesdayOff = (employeeId: string, date: string) => {
    if (!["yihsiao", "zhenting"].includes(employeeId)) {
      return { success: false, message: "只有宜孝與貞葶可以設定禮拜三晚班排休" };
    }
    if (!isWednesday(date)) {
      return { success: false, message: "只能設定禮拜三的晚班排休" };
    }

    const year = new Date(date).getFullYear();
    const month = new Date(date).getMonth() + 1;
    const selectedDates = getWednesdayOffDates(employeeId, year, month);
    const selected = selectedDates.includes(date);

    if (selected) {
      setWednesdayOffSelections((prev) => ({
        ...prev,
        [employeeId]: (prev[employeeId] ?? []).filter((item) => item !== date),
      }));
      return { success: true };
    }

    if (selectedDates.length >= 2) {
      return { success: false, message: "每月最多只能選擇 2 個禮拜三不輪晚班" };
    }

    setWednesdayOffSelections((prev) => ({
      ...prev,
      [employeeId]: [...(prev[employeeId] ?? []), date],
    }));
    return { success: true };
  };

  const getShiftForDate = (date: string, employeeId: string): ShiftType => {
    const override = schedule[date]?.[employeeId];
    if (override) {
      return override;
    }

    if (isSunday(date)) {
      return "X";
    }

    if (isSaturday(date) && !(leaveSelections[employeeId] ?? []).includes(date)) {
      return "C";
    }

    if (employeeId === "shengwen" && isWednesday(date)) {
      return "X";
    }

    if ((leaveSelections[employeeId] ?? []).includes(date)) {
      return "X";
    }

    const dayOfWeek = new Date(date).getDay();
    const isWednesdayNightEmployee = employeeId === "yihsiao" || employeeId === "zhenting";
    const fixedShift =
      isWednesday(date) && isWednesdayNightEmployee
        ? undefined
        : fixedShifts.find((shift) => shift.employeeId === employeeId && shift.dayOfWeek === dayOfWeek);

    let shift: ShiftType = fixedShift?.shift ?? "B";

    if (isWednesday(date) && isWednesdayNightEmployee) {
      const yihsiaoOff = isWednesdayOff("yihsiao", date);
      const zhentingOff = isWednesdayOff("zhenting", date);

      // 禮三晚班規則：
      // - 兩人都沒選不輪晚班：本日晚班未決，兩人都維持 B
      // - 兩人都選不輪晚班：衝突狀態，兩人都維持 B（等待換班）
      // - 僅一人選不輪晚班：另一人連晚班為 A
      if (yihsiaoOff === zhentingOff) {
        shift = "B";
      } else {
        const onDutyEmployeeId = yihsiaoOff ? "zhenting" : "yihsiao";
        shift = employeeId === onDutyEmployeeId ? "A" : "B";
      }
    }

    return shift;
  };

  const updateShift = (date: string, employeeId: string, shift: ShiftType) => {
    setSchedule((prev) => ({
      ...prev,
      [date]: {
        ...prev[date],
        [employeeId]: shift,
      },
    }));
  };

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
    setFixedShifts((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  };

  const updateShiftTimeConfig = (shift: ShiftType, ranges: string[]) => {
    setShiftTimeConfig((prev) => ({
      ...prev,
      [shift]: ranges,
    }));
  };

  const setWednesdayNightShift = (date: string, employeeId: string) => {
    setWednesdayNightShifts((prev) => {
      const index = prev.findIndex((item) => item.date === date);
      if (index >= 0) {
        const next = [...prev];
        next[index] = { date, employeeId };
        return next;
      }
      return [...prev, { date, employeeId }];
    });
  };

  const addLeaveRequest = (request: Omit<LeaveRequest, "id" | "createdAt">) => {
    setLeaveRequests((prev) => [
      {
        ...request,
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);

    const manager = employees.find((employee) => employee.role === "manager");
    if (manager) {
      setNotifications((prev) => [
        {
          id: Date.now().toString(),
          userId: manager.id,
          title: "新的請假申請",
          message: `${request.employeeName} 申請 ${request.startDate}～${request.endDate} ${request.type}`,
          type: "info",
          read: false,
          createdAt: new Date().toISOString(),
          route: "/applications/leave",
        },
        ...prev,
      ]);
    }
  };

  const updateLeaveRequestStatus = (id: string, status: "approved" | "rejected") => {
    const request = leaveRequests.find((item) => item.id === id);
    setLeaveRequests((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
    if (request) {
      setNotifications((prev) => [
        {
          id: Date.now().toString(),
          userId: request.employeeId,
          title: status === "approved" ? "請假已核准" : "請假已駁回",
          message: `您的 ${request.startDate}～${request.endDate} 請假申請${status === "approved" ? "已核准" : "已駁回"}`,
          type: status === "approved" ? "success" : "warning",
          read: false,
          createdAt: new Date().toISOString(),
          route: "/applications/leave",
        },
        ...prev,
      ]);
    }
  };

  const addSwapRequest = (request: Omit<SwapRequest, "id" | "createdAt">) => {
    const isSelfSwap = request.requesterId === request.targetEmployeeId;
    const initialStatus: SwapRequest["status"] = isSelfSwap ? "pending_approval" : "pending_confirmation";
    setSwapRequests((prev) => [
      {
        ...request,
        status: initialStatus,
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    if (isSelfSwap) {
      const manager = employees.find((employee) => employee.role === "manager");
      if (manager) {
        setNotifications((prev) => [
          {
            id: Date.now().toString(),
            userId: manager.id,
            title: "收到換班審核",
            message: `${request.requesterName} 申請自行換班：${request.requesterDate} ↔ ${request.targetDate}`,
            type: "info",
            read: false,
            createdAt: new Date().toISOString(),
            route: "/applications/shift-swap",
          },
          ...prev,
        ]);
      }
      return;
    }
    setNotifications((prev) => [
      {
        id: Date.now().toString(),
        userId: request.targetEmployeeId,
        title: "收到換班申請",
        message: `${request.requesterName} 想跟您換班：${request.requesterDate} ↔ ${request.targetDate}`,
        type: "info",
        read: false,
        createdAt: new Date().toISOString(),
        route: "/applications/shift-swap",
      },
      ...prev,
    ]);
  };

  const updateSwapRequestStatus = (
    id: string,
    status: "pending_confirmation" | "pending_approval" | "approved" | "rejected"
  ) => {
    const request = swapRequests.find((item) => item.id === id);
    setSwapRequests((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
    if (!request) {
      return;
    }
    if (status === "pending_approval") {
      setNotifications((prev) => [
        {
          id: Date.now().toString(),
          userId: "yishan",
          title: "收到換班審核",
          message: `${request.requesterName} 與 ${request.targetEmployeeName} 換班待審核：${request.requesterDate} ↔ ${request.targetDate}`,
          type: "info",
          read: false,
          createdAt: new Date().toISOString(),
          route: "/applications/shift-swap",
        },
        ...prev,
      ]);
      return;
    }
    if (status === "approved" || status === "rejected") {
      if (status === "approved" && request) {
        const requesterShiftOnRequesterDate = getShiftForDate(request.requesterDate, request.requesterId);
        const targetShiftOnTargetDate = getShiftForDate(request.targetDate, request.targetEmployeeId);

        const isWednesdayPairSwap =
          request.requesterDate === request.targetDate &&
          new Date(request.requesterDate).getDay() === 3 &&
          [request.requesterId, request.targetEmployeeId].includes("yihsiao") &&
          [request.requesterId, request.targetEmployeeId].includes("zhenting");

        if (isWednesdayPairSwap) {
          setWednesdayOffSelections((prev) => ({
            ...prev,
            [request.requesterId]: Array.from(
              new Set([...(prev[request.requesterId] ?? []), request.requesterDate])
            ),
            [request.targetEmployeeId]: (prev[request.targetEmployeeId] ?? []).filter(
              (item) => item !== request.requesterDate
            ),
          }));
        } else {
          setSchedule((prev) => ({
            ...prev,
            [request.requesterDate]: {
              ...prev[request.requesterDate],
              [request.requesterId]: targetShiftOnTargetDate,
            },
            [request.targetDate]: {
              ...prev[request.targetDate],
              [request.targetEmployeeId]: requesterShiftOnRequesterDate,
            },
          }));
        }
      }

      setNotifications((prev) => [
        {
          id: Date.now().toString(),
          userId: request.requesterId,
          title: status === "approved" ? "換班已核准" : "換班已駁回",
          message: `您的換班申請${status === "approved" ? "已核准" : "已駁回"}：${request.requesterDate} ↔ ${request.targetDate}`,
          type: status === "approved" ? "success" : "warning",
          read: false,
          createdAt: new Date().toISOString(),
          route: "/applications/shift-swap",
        },
        ...prev,
      ]);
    }
  };

  const addOvertimeRequest = (request: Omit<OvertimeRequest, "id" | "createdAt">) => {
    setOvertimeRequests((prev) => [
      {
        ...request,
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    const manager = employees.find((employee) => employee.role === "manager");
    if (manager) {
      setNotifications((prev) => [
        {
          id: Date.now().toString(),
          userId: manager.id,
          title: "新的加班申請",
          message: `${request.employeeName} 申請 ${request.date} 加班`,
          type: "info",
          read: false,
          createdAt: new Date().toISOString(),
          route: "/applications/overtime",
        },
        ...prev,
      ]);
    }
  };

  const updateOvertimeRequestStatus = (id: string, status: "approved" | "rejected") => {
    const request = overtimeRequests.find((item) => item.id === id);
    setOvertimeRequests((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
    if (request) {
      setNotifications((prev) => [
        {
          id: Date.now().toString(),
          userId: request.employeeId,
          title: status === "approved" ? "加班已核准" : "加班已駁回",
          message: `您的 ${request.date} 加班申請${status === "approved" ? "已核准" : "已駁回"}`,
          type: status === "approved" ? "success" : "warning",
          read: false,
          createdAt: new Date().toISOString(),
          route: "/applications/overtime",
        },
        ...prev,
      ]);
    }
  };

  const addTardinessRecord = (record: Omit<TardinessRecord, "id" | "createdAt">) => {
    setTardinessRecords((prev) => [
      ...prev,
      {
        ...record,
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  const deleteTardinessRecord = (id: string) => {
    setTardinessRecords((prev) => prev.filter((record) => record.id !== id));
  };

  const addPunchRecord = (record: Omit<PunchRecord, "id" | "createdAt">) => {
    setPunchRecords((prev) => [
      {
        ...record,
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
  };

  const getTodayPunchRecords = (employeeId: string, date: string) =>
    punchRecords
      .filter((item) => item.employeeId === employeeId && item.date === date)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const getPunchRecordsByDate = (employeeId: string, date: string) =>
    punchRecords
      .filter((item) => item.employeeId === employeeId && item.date === date)
      .sort((a, b) => a.time.localeCompare(b.time));

  const updatePunchRecord = (id: string, updates: Partial<Pick<PunchRecord, "time" | "action" | "segmentIndex">>) => {
    setPunchRecords((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const deletePunchRecord = (id: string) => {
    setPunchRecords((prev) => prev.filter((item) => item.id !== id));
  };

  const markNotificationRead = (id: string) => {
    setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
  };

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
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
