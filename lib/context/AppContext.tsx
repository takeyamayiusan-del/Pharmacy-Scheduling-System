"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

// 員工類型定義
export type Employee = {
  id: string;
  name: string;
  role: "owner" | "manager" | "staff";
};

// 班別類型定義
export type ShiftType = "A" | "B" | "C" | "D" | "E" | "X";

// 班表資料
export type ScheduleData = {
  [date: string]: {
    [employeeId: string]: ShiftType;
  };
};

// 固定班表設定 - 禮拜幾固定上什麼班
export type FixedShift = {
  employeeId: string;
  dayOfWeek: number; // 0:日, 1:一, ... 6:六
  shift: ShiftType;
};

// 禮拜三晚班輪流表
export type WednesdayNightShift = {
  date: string;
  employeeId: string; // "yihsiao" 或 "zhenting"
};

// 請假申請
export type LeaveRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  period: "全天" | "上午" | "下午";
  type: "事假" | "病假" | "特休" | "其他";
  reason: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

// 換班申請
export type SwapRequest = {
  id: string;
  requesterId: string;
  requesterName: string;
  targetEmployeeId: string;
  targetEmployeeName: string;
  date: string;
  status: "pending_confirmation" | "pending_approval" | "approved" | "rejected";
  createdAt: string;
};

// 加班申請
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

// 通知
export type Notification = {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  read: boolean;
  createdAt: string;
};

// 遲到記錄
export type TardinessRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  minutes: number;
  notes: string;
  createdAt: string;
};

// 員工名單
export const EMPLOYEES: Employee[] = [
  { id: "owner", name: "老闆", role: "owner" },
  { id: "yishan", name: "佾珊", role: "manager" },
  { id: "yihsiao", name: "宜孝", role: "staff" },
  { id: "zhenting", name: "貞葶", role: "staff" },
  { id: "shengwen", name: "聖文", role: "staff" },
  { id: "guixiang", name: "桂香", role: "staff" },
];

// 台灣國定假日（2026年版）
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

// 檢查是否是假日（禮拜日）
export const isSunday = (dateStr: string): boolean => {
  const date = new Date(dateStr);
  return date.getDay() === 0;
};

// 檢查是否是國定假日
export const getHolidayInfo = (dateStr: string): { isHoliday: boolean; name?: string } => {
  const holiday = TAIWAN_HOLIDAYS_2026.find(h => h.date === dateStr);
  return { isHoliday: !!holiday, name: holiday?.name };
};

// 檢查是否是禮拜六
export const isSaturday = (dateStr: string): boolean => {
  const date = new Date(dateStr);
  return date.getDay() === 6;
};

// 檢查是否是禮拜二
export const isTuesday = (dateStr: string): boolean => {
  const date = new Date(dateStr);
  return date.getDay() === 2;
};

// 檢查是否是禮拜三
export const isWednesday = (dateStr: string): boolean => {
  const date = new Date(dateStr);
  return date.getDay() === 3;
};

// 計算某個月有幾個禮拜六
export const countSaturdaysInMonth = (year: number, month: number): number => {
  let count = 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (isSaturday(dateStr)) count++;
  }
  return count;
};

// 產生初始班表
const generateInitialSchedule = (year: number, month: number, fixedShifts: FixedShift[]): ScheduleData => {
  const schedule: ScheduleData = {};
  const daysInMonth = new Date(year, month, 0).getDate();
  
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const date = new Date(dateStr);
    const dayOfWeek = date.getDay();
    schedule[dateStr] = {};
    
    EMPLOYEES.forEach((emp) => {
      if (emp.role === "owner") return;
      
      // 禮拜日強制休假
      if (isSunday(dateStr)) {
        schedule[dateStr][emp.id] = "X";
        return;
      }
      
      // 檢查是否有固定班表
      const fixedShift = fixedShifts.find(f => f.employeeId === emp.id && f.dayOfWeek === dayOfWeek);
      if (fixedShift) {
        schedule[dateStr][emp.id] = fixedShift.shift;
        return;
      }
      
      // 聖文的特殊規則
      if (emp.id === "shengwen") {
        if (isWednesday(dateStr)) {
          schedule[dateStr][emp.id] = "X";
        } else {
          schedule[dateStr][emp.id] = day === 1 || day === 2 || day === 5 ? "A" : "B";
        }
        return;
      }
      
      // 其他員工預設B班
      schedule[dateStr][emp.id] = "B";
    });
  }
  
  return schedule;
};

// 模擬初始資料
const initialSchedule = generateInitialSchedule(2026, 6, []);
const initialLeaveRequests: LeaveRequest[] = [
  {
    id: "1",
    employeeId: "yihsiao",
    employeeName: "宜孝",
    date: "2026-06-05",
    period: "全天",
    type: "事假",
    reason: "身體不舒服需要休息",
    status: "pending",
    createdAt: new Date().toISOString(),
  },
  {
    id: "2",
    employeeId: "yishan",
    employeeName: "佾珊",
    date: "2026-06-03",
    period: "上午",
    type: "特休",
    reason: "出國旅遊",
    status: "approved",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

const initialSwapRequests: SwapRequest[] = [
  {
    id: "1",
    requesterId: "yihsiao",
    requesterName: "宜孝",
    targetEmployeeId: "zhenting",
    targetEmployeeName: "貞葶",
    date: "2026-06-10",
    status: "pending_confirmation",
    createdAt: new Date().toISOString(),
  }
];

const initialOvertimeRequests: OvertimeRequest[] = [
  {
    id: "1",
    employeeId: "shengwen",
    employeeName: "聖文",
    date: "2026-06-15",
    startTime: "18:00",
    endTime: "21:00",
    reason: "盤點",
    compensationType: "pay",
    status: "pending",
    createdAt: new Date().toISOString(),
  }
];

const initialNotifications: Notification[] = [
  {
    id: "1",
    userId: "yishan",
    title: "新的請假申請",
    message: "宜孝申請 2026-06-05 事假",
    type: "info",
    read: false,
    createdAt: new Date().toISOString(),
  },
];

const initialTardinessRecords: TardinessRecord[] = [
  {
    id: "1",
    employeeId: "shengwen",
    employeeName: "聖文",
    date: "2026-06-02",
    minutes: 15,
    notes: "因下雨遲到",
    createdAt: new Date().toISOString(),
  }
];

// 初始固定班表設定
const initialFixedShifts: FixedShift[] = [
  // 舊有固定班表：
  // 宜孝5號固定A班 → 移到禮拜五
  { employeeId: "yihsiao", dayOfWeek: 5, shift: "A" },
  // 貞葶14號固定A班 → 移到禮拜一
  { employeeId: "zhenting", dayOfWeek: 1, shift: "A" },
  // 桂香2,4號固定A班 → 移到禮拜二,四
  { employeeId: "guixiang", dayOfWeek: 2, shift: "A" },
  { employeeId: "guixiang", dayOfWeek: 4, shift: "A" },
];

// 初始禮拜三輪流晚班
const generateInitialWednesdayNightShifts = (year: number, month: number): WednesdayNightShift[] => {
  const shifts: WednesdayNightShift[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  let turn = "yihsiao"; // 先從宜孝開始
  
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (isWednesday(dateStr)) {
      shifts.push({ date: dateStr, employeeId: turn });
      turn = turn === "yihsiao" ? "zhenting" : "yihsiao";
    }
  }
  return shifts;
};

const initialWednesdayNightShifts = generateInitialWednesdayNightShifts(2026, 6);

interface AppContextType {
  currentUser: Employee | null;
  loginEmployee: (employeeId: string) => void;
  loginManager: (username: string, password: string) => boolean;
  logout: () => void;
  
  employees: Employee[];
  addEmployee: (employee: Omit<Employee, "id">) => void;
  updateEmployee: (id: string, employee: Partial<Employee>) => void;
  deleteEmployee: (id: string) => void;
  
  schedule: ScheduleData;
  updateShift: (date: string, employeeId: string, shift: ShiftType) => void;
  
  // 固定班表
  fixedShifts: FixedShift[];
  addFixedShift: (shift: Omit<FixedShift, "id">) => void;
  updateFixedShift: (index: number, shift: FixedShift) => void;
  deleteFixedShift: (index: number) => void;
  
  // 禮拜三輪流晚班
  wednesdayNightShifts: WednesdayNightShift[];
  setWednesdayNightShift: (date: string, employeeId: string) => void;
  
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
  const [schedule, setSchedule] = useState<ScheduleData>(initialSchedule);
  const [fixedShifts, setFixedShifts] = useState<FixedShift[]>(initialFixedShifts);
  const [wednesdayNightShifts, setWednesdayNightShifts] = useState<WednesdayNightShift[]>(initialWednesdayNightShifts);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>(initialLeaveRequests);
  const [swapRequests, setSwapRequests] = useState<SwapRequest[]>(initialSwapRequests);
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>(initialOvertimeRequests);
  const [tardinessRecords, setTardinessRecords] = useState<TardinessRecord[]>(initialTardinessRecords);
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [isLoading] = useState(false);

  // 員工登入（選擇姓名）
  const loginEmployee = (employeeId: string) => {
    const employee = employees.find((e) => e.id === employeeId);
    if (employee) {
      setCurrentUser(employee);
    }
  };

  // 管理者登入（帳號密碼）
  const loginManager = (username: string, password: string): boolean => {
    if (username === "admin" && password === "admin123") {
      setCurrentUser(EMPLOYEES[0]); // 老闆
      return true;
    }
    if (username === "manager" && password === "admin123") {
      setCurrentUser(EMPLOYEES[1]); // 佾珊(店長)
      return true;
    }
    return false;
  };

  // 登出
  const logout = () => {
    setCurrentUser(null);
  };

  // 新增員工
  const addEmployee = (employee: Omit<Employee, "id">) => {
    setEmployees((prev) => [
      ...prev,
      { ...employee, id: Date.now().toString() }
    ]);
  };

  // 更新員工
  const updateEmployee = (id: string, updates: Partial<Employee>) => {
    setEmployees((prev) =>
      prev.map((emp) => (emp.id === id ? { ...emp, ...updates } : emp))
    );
  };

  // 刪除員工
  const deleteEmployee = (id: string) => {
    setEmployees((prev) => prev.filter((emp) => emp.id !== id));
  };

  // 更新班表
  const updateShift = (date: string, employeeId: string, shift: ShiftType) => {
    setSchedule((prev) => ({
      ...prev,
      [date]: {
        ...prev[date],
        [employeeId]: shift,
      },
    }));
  };

  // 新增固定班表
  const addFixedShift = (shift: Omit<FixedShift, "id">) => {
    setFixedShifts((prev) => [...prev, shift]);
    // 重新產生班表
    setSchedule(generateInitialSchedule(2026, 6, [...fixedShifts, shift]));
  };

  // 更新固定班表
  const updateFixedShift = (index: number, shift: FixedShift) => {
    const newFixedShifts = [...fixedShifts];
    newFixedShifts[index] = shift;
    setFixedShifts(newFixedShifts);
    setSchedule(generateInitialSchedule(2026, 6, newFixedShifts));
  };

  // 刪除固定班表
  const deleteFixedShift = (index: number) => {
    const newFixedShifts = fixedShifts.filter((_, i) => i !== index);
    setFixedShifts(newFixedShifts);
    setSchedule(generateInitialSchedule(2026, 6, newFixedShifts));
  };

  // 設定禮拜三輪流晚班
  const setWednesdayNightShift = (date: string, employeeId: string) => {
    setWednesdayNightShifts((prev) => {
      const existingIndex = prev.findIndex(s => s.date === date);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = { date, employeeId };
        return updated;
      }
      return [...prev, { date, employeeId }];
    });
  };

  // 新增請假申請
  const addLeaveRequest = (request: Omit<LeaveRequest, "id" | "createdAt">) => {
    setLeaveRequests((prev) => [
      {
        ...request,
        id: Date.now().toString(),
        createdAt: new Date().toISOString()
      },
      ...prev,
    ]);
    
    const manager = EMPLOYEES.find((e) => e.role === "manager");
    if (manager) {
      setNotifications((prev) => [
        {
          id: Date.now().toString(),
          userId: manager.id,
          title: "新的請假申請",
          message: `${request.employeeName} 申請 ${request.date} ${request.type}`,
          type: "info",
          read: false,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    }
  };

  // 更新請假申請狀態
  const updateLeaveRequestStatus = (id: string, status: "approved" | "rejected") => {
    setLeaveRequests((prev) =>
      prev.map((req) => (req.id === id ? { ...req, status } : req))
    );
    
    const request = leaveRequests.find((r) => r.id === id);
    if (request) {
      setNotifications((prev) => [
        {
          id: Date.now().toString(),
          userId: request.employeeId,
          title: status === "approved" ? "請假已核准" : "請假已駁回",
          message: `您的 ${request.date} 請假申請${status === "approved" ? "已核准" : "已駁回"}`,
          type: status === "approved" ? "success" : "warning",
          read: false,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    }
  };

  // 新增換班申請
  const addSwapRequest = (request: Omit<SwapRequest, "id" | "createdAt">) => {
    setSwapRequests((prev) => [
      {
        ...request,
        id: Date.now().toString(),
        createdAt: new Date().toISOString()
      },
      ...prev,
    ]);
    
    // 通知對方
    setNotifications((prev) => [
      {
        id: Date.now().toString(),
        userId: request.targetEmployeeId,
        title: "收到換班申請",
        message: `${request.requesterName} 想跟您換班，日期：${request.date}`,
        type: "info",
        read: false,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
  };

  // 更新換班申請狀態
  const updateSwapRequestStatus = (id: string, status: "pending_confirmation" | "pending_approval" | "approved" | "rejected") => {
    setSwapRequests((prev) =>
      prev.map((req) => (req.id === id ? { ...req, status } : req))
    );
    
    const request = swapRequests.find((r) => r.id === id);
    if (request) {
      let newNotification = null;
      
      if (status === "pending_approval") {
        newNotification = {
          id: Date.now().toString(),
          userId: "yishan",
          title: "收到換班審核",
          message: `${request.requesterName} 與 ${request.targetEmployeeName} 換班待審核，日期：${request.date}`,
          type: "info",
          read: false,
          createdAt: new Date().toISOString(),
        };
      } else if (status === "approved" || status === "rejected") {
        newNotification = {
          id: Date.now().toString(),
          userId: request.requesterId,
          title: status === "approved" ? "換班已核准" : "換班已駁回",
          message: `您的換班申請${status === "approved" ? "已核准" : "已駁回"}，日期：${request.date}`,
          type: status === "approved" ? "success" : "warning",
          read: false,
          createdAt: new Date().toISOString(),
        };
      }
      
      if (newNotification) {
        setNotifications((prev) => [newNotification, ...prev]);
      }
    }
  };

  // 新增加班申請
  const addOvertimeRequest = (request: Omit<OvertimeRequest, "id" | "createdAt">) => {
    setOvertimeRequests((prev) => [
      {
        ...request,
        id: Date.now().toString(),
        createdAt: new Date().toISOString()
      },
      ...prev,
    ]);
    
    const manager = EMPLOYEES.find((e) => e.role === "manager");
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
        },
        ...prev,
      ]);
    }
  };

  // 更新加班申請狀態
  const updateOvertimeRequestStatus = (id: string, status: "approved" | "rejected") => {
    setOvertimeRequests((prev) =>
      prev.map((req) => (req.id === id ? { ...req, status } : req))
    );
    
    const request = overtimeRequests.find((r) => r.id === id);
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
        },
        ...prev,
      ]);
    }
  };

  // 新增遲到記錄
  const addTardinessRecord = (record: Omit<TardinessRecord, "id" | "createdAt">) => {
    setTardinessRecords((prev) => [
      ...prev,
      {
        ...record,
        id: Date.now().toString(),
        createdAt: new Date().toISOString()
      }
    ]);
  };

  // 刪除遲到記錄
  const deleteTardinessRecord = (id: string) => {
    setTardinessRecords((prev) => prev.filter(r => r.id !== id));
  };

  // 標記通知已讀
  const markNotificationRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
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
        fixedShifts,
        addFixedShift,
        updateFixedShift,
        deleteFixedShift,
        wednesdayNightShifts,
        setWednesdayNightShift,
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
