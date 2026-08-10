"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import { mapSwapStatusFromDb, mapSwapStatusToDb, notificationRouteFromRelatedType } from "@/lib/applications/statusMaps";
import { createClient } from "@/lib/supabase/client";
import { toAuthEmail } from "@/lib/auth/constants";
import { getPunchSlotsForRanges, calcLateMinutes, timeToMinutes, minutesDiff, todayDateStr, type PunchSlot } from "@/lib/attendance/punchSchedule";
import { resolveLateAfterLeaveApproval } from "@/lib/attendance/punchLeaveAdjust";
import {
  checkManagerLeaveAssignment,
  shouldSyncLeaveSelection,
} from "@/lib/schedule/leaveSelectionRules";
import {
  assertNoSundayInSwapDates,
  assertSundayShiftAllowed,
  getLocalDayOfWeek,
  isFixedSundayRest,
  isLocalSaturday,
  isLocalTuesday,
  isLocalWednesday,
} from "@/lib/schedule/sundayRest";
import { isEmployeeActiveOnDate, isEmployeeActiveInMonth } from "@/lib/schedule/employeeActivePeriod";
import { hasPastMonthInRange, isPastDate, isPastMonth } from "@/lib/schedule/monthAccess";
import {
  DUPLICATE_LEAVE_MESSAGE,
  DUPLICATE_OVERTIME_MESSAGE,
  hasDuplicateLeave,
  hasDuplicateOvertime,
} from "@/lib/applications/duplicateGuard";
import { resolveAnnualLeaveQuotaDays } from "@/lib/attendance/annualLeave";
import {
  defaultGeofenceLocationsForSite,
  parseGeofenceSettings,
  type GeofenceLocation,
} from "@/lib/attendance/geofence";
import {
  calculateEffectiveShift,
  enumerateDatesInRange,
} from "@/lib/schedule/effectiveShift";
import { roundCompLeaveHours } from "@/lib/attendance/compLeaveDisplay";
import {
  resolveAllowedCompensationType,
  validateOvertimeCompensation,
} from "@/lib/attendance/overtimeCompensation";
import { buildSwapShiftsAndChanges, swapSnapshotCells } from "@/lib/schedule/swapSchedule";
import {
  applyScheduleChangesToState,
  revertSnapshotOnState,
} from "@/lib/schedule/swapScheduleState";
import {
  getOriginalShiftForLeaveDay,
  resolveLeaveTimesForSchedule,
} from "@/lib/schedule/leaveSchedule";
import {
  fetchDbScheduleShifts,
  restoreScheduleSnapshot,
  upsertScheduleShift,
  type ScheduleSnapshotEntry,
} from "@/lib/schedule/scheduleSnapshot";
import {
  buildHolidayOneClickChanges,
  type HolidayOneClickMode,
  type HolidayWorkShiftChoice,
} from "@/lib/schedule/holidayOneClick";
import {
  buildJijiStoreConfigWithTemplate,
  defaultStoreConfig,
  defaultStoreConfigForSite,
  getMonthRotationDates,
  isRotationEveningDay,
  parseStoreConfig,
  resolveRotationOffLimit,
  shouldSeedJijiShiftCatalog,
  type StoreConfig,
} from "@/lib/store-config";
import {
  DEFAULT_SITE_ID,
  geofenceSettingId,
  parseSiteId,
  readActiveSiteFromStorage,
  storeConfigSettingId,
  writeActiveSiteToStorage,
  type SiteId,
} from "@/lib/sites";
import { assertWritableShiftCode, isLegacyShiftCode, resolveShiftTimeRanges } from "@/lib/shift-catalog/resolve";
import { filterBySiteEmployeeIds } from "@/lib/attendance/siteScope";

// ─── Types ───────────────────────────────────────────────────────────────────

export type Employee = {
  id: string;
  name: string;
  role: "owner" | "manager" | "staff";
  username?: string;
  password?: string;
  hireDate: string;               // 入職日期
  endDate?: string | null;        // 到期日（含當日）；空=持續在職
  /** 所屬店：zhushan=竹山、jiji=集集家禾 */
  siteId?: SiteId;
  /** 參與週期輪值晚班（DB: is_wednesday_rotation，語意已泛化） */
  isWednesdayRotation?: boolean;
  isWeekdayOffRule?: boolean;     // 平日不排休規則
};

export type ShiftType = "A" | "B" | "C" | "D" | "E" | "X";
/** 班表覆寫碼：竹山 A–E／X，集集可為目錄短碼 */
export type ScheduleShiftCode = string;
/** 竹山 A–E／X 時段；索引也允許字串以便讀取（集集目錄碼請走 resolveShiftTimeRanges） */
export type ShiftTimeConfig = Record<string, string[]>;
export type ShiftDisplayStyle = {
  label: string;
  displayText: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
};
export type ShiftDisplayConfig = Record<ShiftType, ShiftDisplayStyle>;

export { LEGACY_SHIFT_CODES, isLegacyShiftCode } from "@/lib/shift-catalog/resolve";

export type ScheduleData = {
  [date: string]: {
    [employeeId: string]: ScheduleShiftCode;
  };
};

export type FixedShift = {
  employeeId: string;
  dayOfWeek: number;
  shift: ScheduleShiftCode;
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
  shiftMode: "schedule" | ScheduleShiftCode;
  leaveHours: number;
  type: LeaveType;
  reason: string;
  rejectReason?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  scheduleSnapshot?: ScheduleSnapshotEntry[];
  attachments?: LeaveAttachmentItem[];
};

export type LeaveAttachmentItem = {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
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
  scheduleSnapshot?: ScheduleSnapshotEntry[];
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
  relatedId?: string;
  relatedType?: string;
};

export type BulletinItem = {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  content: string;
  type:
    | "announcement"
    | "cover_request"
    | "task_completed"
    | "day_off_notice"
    | "must_do_today"
    | "shift_handoff";
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
  positionGradeTotal?: number;
  fixedAllowanceTotal?: number;
  fullAttendancePay?: number;
  finalPay: number;
  note?: string;
  isPublished: boolean;
  publishedAt?: string;
  createdAt: string;
};

export type AnnualLeaveConfig = {
  id: string;
  year: number;
  seniorityMonths: number;
  days: number;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type AnnualLeaveAdjustment = {
  id: string;
  userId: string;
  year: number;
  adjustmentDays: number;
  reason?: string;
  createdBy: string;
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
  shift: ScheduleShiftCode;
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
  /** 鎖定所屬店；缺省視為竹山（相容舊資料） */
  siteId?: SiteId;
  lockedBy: string;
  lockedAt: string;
};

type WednesdayOffSelections = Record<string, string[]>;
type LeaveSelections = Record<string, string[]>;

// ─── Helper constants ─────────────────────────────────────────────────────────

/** 禮拜日固定公休（本地日曆判斷） */
export const isSunday = (dateStr: string): boolean => isFixedSundayRest(dateStr);
export const isSaturday = (dateStr: string): boolean => isLocalSaturday(dateStr);
export const isTuesday = (dateStr: string): boolean => isLocalTuesday(dateStr);
export const isWednesday = (dateStr: string): boolean => isLocalWednesday(dateStr);

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

/** @deprecated 請改用 getMonthRotationDates + storeConfig — 保留 export 相容舊測試 */
export const getMonthWednesdays = (year: number, month: number) =>
  getMonthRotationDates(year, month, [3]);

const isInMonth = (dateStr: string, year: number, month: number) => {
  const date = new Date(dateStr);
  return date.getFullYear() === year && date.getMonth() + 1 === month;
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
  updateShift: (date: string, employeeId: string, shift: ScheduleShiftCode) => Promise<void>;
  getShiftForDate: (date: string, employeeId: string) => ScheduleShiftCode;
  getBaseShiftForDate: (date: string, employeeId: string) => ScheduleShiftCode;
  /** 國定假日一鍵設為上班／休假；已排休或全日請假者維持休假。不寫入排休選擇。 */
  applyNationalHolidayOneClick: (
    date: string,
    mode: HolidayOneClickMode,
    options?: { workShiftChoice?: HolidayWorkShiftChoice }
  ) => Promise<{ updated: number; preservedLeave: number }>;
  refreshSchedule: () => Promise<void>;
  fixedShifts: FixedShift[];
  addFixedShift: (shift: FixedShift) => Promise<void>;
  updateFixedShift: (index: number, shift: FixedShift) => Promise<void>;
  deleteFixedShift: (index: number) => Promise<void>;
  shiftTimeConfig: ShiftTimeConfig;
  updateShiftTimeConfig: (shift: ShiftType, ranges: string[]) => Promise<void>;
  shiftDisplayConfig: ShiftDisplayConfig;
  updateShiftDisplayConfig: (shift: ShiftType, style: Partial<ShiftDisplayStyle>) => Promise<void>;
  wednesdayNightShifts: WednesdayNightShift[];
  setWednesdayNightShift: (date: string, employeeId: string) => void;
  getWednesdayOffDates: (employeeId: string, year: number, month: number) => string[];
  getWednesdayOffLimit: (year: number, month: number) => number;
  toggleWednesdayOff: (employeeId: string, date: string) => Promise<{ success: boolean; message?: string }>;
  isWednesdayOff: (employeeId: string, date: string) => boolean;
  /** 店家設定（班別／預設班／輪值晚班等） */
  storeConfig: StoreConfig;
  loadStoreConfig: () => Promise<void>;
  saveStoreConfig: (next: StoreConfig) => Promise<void>;
  /** 該日是否為店家設定的輪值晚班日 */
  isRotationEveningDate: (dateStr: string) => boolean;
  /** 目前檢視的店（老闆可切換；店長／員工固定所屬店） */
  activeSiteId: SiteId;
  setActiveSite: (siteId: SiteId) => Promise<void>;
  /** 是否老闆（可跨店） */
  canSwitchSite: boolean;
  getLeaveSummary: (employeeId: string, year: number, month: number) => LeaveSummary;
  toggleLeaveDate: (employeeId: string, date: string) => { success: boolean; message?: string };
  isLeaveMonthLocked: (year: number, month: number) => boolean;
  lockLeaveMonth: (year: number, month: number, lockedBy: string) => Promise<void>;
  unlockLeaveMonth: (year: number, month: number) => Promise<void>;
  leaveMonthLocks: LeaveMonthLock[];
  leaveRequests: LeaveRequest[];
  addLeaveRequest: (
    request: Omit<LeaveRequest, "id" | "createdAt" | "attachments">,
    files?: File[]
  ) => Promise<void>;
  openLeaveAttachment: (attachmentId: string) => Promise<void>;
  updateLeaveRequestStatus: (
    id: string,
    status: "approved" | "rejected" | "pending",
    rejectReason?: string
  ) => Promise<void>;
  deleteLeaveRequest: (id: string) => Promise<void>;
  compLeaveLedger: CompLeaveLedgerEntry[];
  getCompLeaveBalance: (employeeId: string) => number;
  getAnnualLeaveQuota: (employee: Employee, year?: number) => number;
  getAnnualLeaveBalance: (employeeId: string, year: number) => number;
  getAvailableCompLeave: (employeeId: string) => { balance: number; expiring: Array<Record<string, unknown>> };
  loadCompLeaveLedger: () => Promise<void>;
  grantCompLeaveHours: (employeeId: string, hours: number, note?: string) => Promise<void>;
  annualLeaveConfigs: AnnualLeaveConfig[];
  setAnnualLeaveConfigs: React.Dispatch<React.SetStateAction<AnnualLeaveConfig[]>>;
  annualLeaveAdjustments: AnnualLeaveAdjustment[];
  loadAnnualLeaveConfigs: (year: number) => Promise<void>;
  loadAnnualLeaveAdjustments: (userId: string, year: number) => Promise<void>;
  updateAnnualLeaveConfig: (id: string, days: number) => Promise<void>;
  addAnnualLeaveAdjustment: (userId: string, year: number, adjustmentDays: number, reason?: string) => Promise<void>;
  deleteAnnualLeaveAdjustment: (id: string) => Promise<void>;
  getTotalAdjustmentDays: (userId: string, year: number) => number;
  swapRequests: SwapRequest[];
  addSwapRequest: (request: Omit<SwapRequest, "id" | "createdAt">) => Promise<void>;
  updateSwapRequestStatus: (id: string, status: "pending_confirmation" | "pending_approval" | "approved" | "rejected", rejectReason?: string) => Promise<void>;
  deleteSwapRequest: (id: string) => Promise<void>;
  overtimeRequests: OvertimeRequest[];
  addOvertimeRequest: (request: Omit<OvertimeRequest, "id" | "createdAt">) => Promise<void>;
  updateOvertimeRequestStatus: (
    id: string,
    status: "approved" | "rejected" | "pending",
    rejectReason?: string
  ) => Promise<void>;
  /** 店長／老闆調整補償方式（加班費 ↔ 補休）；已核准會同步補休帳本 */
  updateOvertimeCompensation: (
    id: string,
    compensationType: "pay" | "time_off"
  ) => Promise<void>;
  deleteOvertimeRequest: (id: string) => Promise<void>;
  tardinessRecords: TardinessRecord[];
  addTardinessRecord: (record: Omit<TardinessRecord, "id" | "createdAt">) => Promise<void>;
  deleteTardinessRecord: (id: string) => Promise<void>;
  punchRecords: PunchRecord[];
  punchRecordsReady: boolean;
  refreshTodayPunchRecords: () => Promise<void>;
  addPunchRecord: (record: Omit<PunchRecord, "id" | "createdAt">) => Promise<void>;
  updatePunchRecord: (id: string, updates: PunchRecordUpdate) => Promise<void>;
  deletePunchRecord: (id: string) => Promise<void>;
  getTodayPunchRecords: (employeeId: string, date: string) => PunchRecord[];
  getPunchRecordsByDate: (employeeId: string, date: string) => PunchRecord[];
  notifications: Notification[];
  markNotificationRead: (id: string) => void;
  deleteNotification: (id: string) => Promise<void>;
  deleteAllNotifications: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  bulletinItems: BulletinItem[];
  addBulletinItem: (item: Omit<BulletinItem, "id" | "authorName" | "createdAt">) => Promise<void>;
  updateBulletinItem: (id: string, updates: Partial<BulletinItem>) => Promise<void>;
  deleteBulletinItem: (id: string) => Promise<void>;
  loadBulletinItems: () => Promise<void>;
  readBulletinItem: (bulletinId: string) => Promise<void>;
  isBulletinRead: (bulletinId: string) => boolean;
  payrollRecords: PayrollRecord[];
  setPayrollRecords: React.Dispatch<React.SetStateAction<PayrollRecord[]>>;
  publishPayrollRecord: (id: string) => Promise<void>;
  unpublishPayrollRecord: (id: string) => Promise<void>;
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
  geofenceLocations: GeofenceLocation[];
  loadGeofenceConfig: () => Promise<void>;
  saveGeofenceLocations: (locations: GeofenceLocation[]) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);

  const [currentUser, setCurrentUser] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Supabase-backed state
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([]);
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>([]);
  const [tardinessRecords, setTardinessRecords] = useState<TardinessRecord[]>([]);
  const [punchRecords, setPunchRecords] = useState<PunchRecord[]>([]);
  const [punchRecordsReady, setPunchRecordsReady] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [bulletinItems, setBulletinItems] = useState<BulletinItem[]>([]);
  const [bulletinReads, setBulletinReads] = useState<{ bulletinId: string; userId: string }[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [leaveSelections, setLeaveSelections] = useState<LeaveSelections>({});
  const [wednesdayOffSelections, setWednesdayOffSelections] = useState<WednesdayOffSelections>({});
  const [leaveMonthLocks, setLeaveMonthLocks] = useState<LeaveMonthLock[]>([]);
  const [compLeaveLedger, setCompLeaveLedger] = useState<CompLeaveLedgerEntry[]>([]);
  const [annualLeaveConfigs, setAnnualLeaveConfigs] = useState<AnnualLeaveConfig[]>([]);
  const [annualLeaveAdjustments, setAnnualLeaveAdjustments] = useState<AnnualLeaveAdjustment[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [geofenceLocations, setGeofenceLocations] = useState<GeofenceLocation[]>(() =>
    defaultGeofenceLocationsForSite(DEFAULT_SITE_ID)
  );

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
  const [shiftDisplayConfig, setShiftDisplayConfig] = useState<ShiftDisplayConfig>({
    A: { label: "全天", displayText: "A", bgColor: "#bfdbfe", textColor: "#1e3a8a", borderColor: "#60a5fa" },
    B: { label: "白班", displayText: "B", bgColor: "#a7f3d0", textColor: "#065f46", borderColor: "#34d399" },
    C: { label: "上午", displayText: "C", bgColor: "#fde68a", textColor: "#92400e", borderColor: "#f59e0b" },
    D: { label: "下午", displayText: "D", bgColor: "#ddd6fe", textColor: "#5b21b6", borderColor: "#a78bfa" },
    E: { label: "下午+晚", displayText: "E", bgColor: "#fecdd3", textColor: "#9f1239", borderColor: "#fb7185" },
    X: { label: "休假", displayText: "X", bgColor: "#e2e8f0", textColor: "#334155", borderColor: "#94a3b8" },
  });
  const [wednesdayNightShifts, setWednesdayNightShifts] = useState<WednesdayNightShift[]>([]);
  const [storeConfig, setStoreConfig] = useState<StoreConfig>(() => defaultStoreConfig());
  const [activeSiteId, setActiveSiteIdState] = useState<SiteId>(DEFAULT_SITE_ID);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const canSwitchSite = currentUser?.role === "owner";

  /** 畫面／排班只顯示目前店的員工（竹山既有資料預設都在 zhushan） */
  const employees = useMemo(
    () => allEmployees.filter((e) => parseSiteId(e.siteId) === activeSiteId),
    [allEmployees, activeSiteId]
  );

  const siteEmployeeIds = useMemo(
    () => new Set(employees.map((e) => e.id)),
    [employees]
  );

  /** 打卡／遲到依目前店員工過濾（老闆切店後不會殘留他店資料） */
  const sitePunchRecords = useMemo(
    () => filterBySiteEmployeeIds(punchRecords, siteEmployeeIds),
    [punchRecords, siteEmployeeIds]
  );
  const siteTardinessRecords = useMemo(
    () => filterBySiteEmployeeIds(tardinessRecords, siteEmployeeIds),
    [tardinessRecords, siteEmployeeIds]
  );

  // ─── Load data from Supabase ────────────────────────────────────────────────

  const loadScheduleOverrides = useCallback(async () => {
    const { data, error } = await supabase.from("schedule_entries").select("user_id, date, shift_code");
    if (error) {
      console.error("loadScheduleOverrides:", error);
      return;
    }
    const result: ScheduleData = {};
    (data ?? []).forEach((r) => {
      if (!result[r.date]) result[r.date] = {};
      result[r.date][r.user_id] = r.shift_code as ScheduleShiftCode;
    });
    setSchedule(result);
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
            shift: String(r.shift_code) as ScheduleShiftCode,
          }))
        )
      );
    }
  }, [supabase]);

  const loadShiftTimeConfig = useCallback(async () => {
    const { data } = await supabase
      .from("shift_time_config")
      .select("shift_code, time_ranges, display_label, display_text, bg_color, text_color, border_color");
    if (data && data.length > 0) {
      const config: ShiftTimeConfig = {};
      const displayConfig: Partial<ShiftDisplayConfig> = {};
      data.forEach((r) => {
        const code = r.shift_code as ShiftType;
        config[code] = r.time_ranges;
        displayConfig[code] = {
          label: r.display_label || code,
          displayText: r.display_text || code,
          bgColor: r.bg_color || "#e5e7eb",
          textColor: r.text_color || "#111827",
          borderColor: r.border_color || "#9ca3af",
        };
      });
      setShiftTimeConfig((prev) => ({ ...prev, ...config }));
      setShiftDisplayConfig((prev) => ({ ...prev, ...displayConfig }));
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
    const { data, error } = await supabase
      .from("leave_month_locks")
      .select("year, month, site_id, locked_by, locked_at");
    if (error) {
      console.error("loadLeaveMonthLocks:", error);
      return;
    }
    if (data) {
      setLeaveMonthLocks(
        data.map((r) => ({
          year: r.year,
          month: r.month,
          siteId: parseSiteId(r.site_id),
          lockedBy: r.locked_by,
          lockedAt: r.locked_at,
        }))
      );
    }
  }, [supabase]);

  const mapUserRow = (r: {
    id: string;
    username?: string | null;
    name: string;
    role: string;
    hire_date?: string | null;
    end_date?: string | null;
    is_wednesday_rotation?: boolean | null;
    is_weekday_off_rule?: boolean | null;
    site_id?: string | null;
  }): Employee => ({
    id: r.id,
    name: r.name,
    username: r.username ?? undefined,
    role: mapRole(r.role),
    hireDate: r.hire_date || "2026-04-01",
    endDate: r.end_date ?? null,
    siteId: parseSiteId(r.site_id),
    isWednesdayRotation: r.is_wednesday_rotation ?? false,
    isWeekdayOffRule: r.is_weekday_off_rule ?? false,
  });

  const loadEmployees = useCallback(async () => {
    const { data } = await supabase
      .from("users")
      .select(
        "id, username, name, role, is_active, hire_date, end_date, is_wednesday_rotation, is_weekday_off_rule, site_id"
      )
      .eq("is_active", true);
    if (data) {
      setAllEmployees(data.map((r) => mapUserRow(r)));
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

  // 年度特休設定相關函數
  const loadAnnualLeaveConfigs = useCallback(async (year: number) => {
    const { data } = await supabase
      .from("annual_leave_config")
      .select("*")
      .eq("year", year)
      .order("seniority_months", { ascending: true });
    if (data) {
      const mapped = data.map((r) => ({
        id: r.id,
        year: r.year,
        seniorityMonths: r.seniority_months,
        days: Number(r.days),
        description: r.description ?? undefined,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
      setAnnualLeaveConfigs((prev) => {
        const otherYears = prev.filter((c) => c.year !== year);
        return [...otherYears, ...mapped];
      });
    }
  }, [supabase]);

  const loadAnnualLeaveAdjustments = useCallback(async (userId: string, year: number) => {
    const { data } = await supabase
      .from("annual_leave_adjustments")
      .select("*")
      .eq("user_id", userId)
      .eq("year", year)
      .order("created_at", { ascending: false });
    if (data) {
      setAnnualLeaveAdjustments(
        data.map((r) => ({
          id: r.id,
          userId: r.user_id,
          year: r.year,
          adjustmentDays: Number(r.adjustment_days),
          reason: r.reason ?? undefined,
          createdBy: r.created_by,
          createdAt: r.created_at,
        }))
      );
    }
  }, [supabase]);

  const updateAnnualLeaveConfig = async (id: string, days: number) => {
    await supabase
      .from("annual_leave_config")
      .update({ days, updated_at: new Date().toISOString() })
      .eq("id", id);
    const config = annualLeaveConfigs.find(c => c.id === id);
    if (config) {
      setAnnualLeaveConfigs(prev => prev.map(c => c.id === id ? { ...c, days } : c));
    }
  };

  const addAnnualLeaveAdjustment = async (userId: string, year: number, adjustmentDays: number, reason?: string) => {
    if (!currentUser) return;
    const { data } = await supabase
      .from("annual_leave_adjustments")
      .insert({
        user_id: userId,
        year,
        adjustment_days: adjustmentDays,
        reason,
        created_by: currentUser.id,
      })
      .select()
      .single();
    if (data) {
      setAnnualLeaveAdjustments(prev => [...prev, {
        id: data.id,
        userId: data.user_id,
        year: data.year,
        adjustmentDays: Number(data.adjustment_days),
        reason: data.reason ?? undefined,
        createdBy: data.created_by,
        createdAt: data.created_at,
      }]);
    }
  };

  const deleteAnnualLeaveAdjustment = async (id: string) => {
    await supabase.from("annual_leave_adjustments").delete().eq("id", id);
    setAnnualLeaveAdjustments(prev => prev.filter(a => a.id !== id));
  };

  const getTotalAdjustmentDays = useCallback((userId: string, year: number) => {
    return annualLeaveAdjustments
      .filter(a => a.userId === userId && a.year === year)
      .reduce((sum, a) => sum + a.adjustmentDays, 0);
  }, [annualLeaveAdjustments]);

  const getCompLeaveBalance = useCallback(
    (employeeId: string) => {
      const now = Date.now();
      const total = compLeaveLedger
        .filter((entry) => entry.employeeId === employeeId)
        .reduce((sum, entry) => {
          if (entry.hours > 0 && entry.expiresAt && new Date(entry.expiresAt).getTime() < now) {
            return sum;
          }
          return sum + entry.hours;
        }, 0);
      return roundCompLeaveHours(total);
    },
    [compLeaveLedger]
  );

  const getAnnualLeaveQuota = useCallback(
    (employee: Employee, year?: number) => {
      const currentYear = year ?? new Date().getFullYear();
      return resolveAnnualLeaveQuotaDays(employee, currentYear, annualLeaveConfigs);
    },
    [annualLeaveConfigs]
  );

  const getAnnualLeaveBalance = useCallback((employeeId: string, year: number) => {
    const emp = employees.find(e => e.id === employeeId);
    if (!emp) return 0;
    
    const baseQuota = getAnnualLeaveQuota(emp, year);
    const adjustmentDays = getTotalAdjustmentDays(employeeId, year);
    const quota = baseQuota + adjustmentDays;
    
    const used = leaveRequests
      .filter(r => 
        r.employeeId === employeeId && 
        r.type === "特休" && 
        r.status === "approved" && 
        new Date(r.startDate).getFullYear() === year
      )
      .reduce((acc, r) => acc + r.leaveHours, 0);
      
    return Math.max(0, quota - (used / 8)); // 假設一天 8 小時，特休以天為單位
  }, [employees, leaveRequests, getAnnualLeaveQuota, getTotalAdjustmentDays]);

  const loadLeaveRequests = useCallback(async () => {
    const { data } = await supabase
      .from("leave_applications")
      .select(
        "*, users!leave_applications_user_id_fkey(name), reviewer:users!leave_applications_reviewed_by_fkey(name)"
      )
      .order("created_at", { ascending: false });
    if (!data) return;

    const ids = data.map((r) => r.id);
    const attachmentsByLeave = new Map<string, LeaveAttachmentItem[]>();
    if (ids.length > 0) {
      const { data: attachmentRows } = await supabase
        .from("leave_attachments")
        .select("id, application_id, file_name, file_size, mime_type, uploaded_at, status")
        .in("application_id", ids)
        .eq("status", "active")
        .order("uploaded_at", { ascending: true });
      for (const row of attachmentRows ?? []) {
        const list = attachmentsByLeave.get(row.application_id) ?? [];
        list.push({
          id: row.id,
          fileName: row.file_name,
          fileSize: Number(row.file_size ?? 0),
          mimeType: row.mime_type,
          uploadedAt: row.uploaded_at,
        });
        attachmentsByLeave.set(row.application_id, list);
      }
    }

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
          reviewedBy: r.reviewed_by ?? undefined,
          reviewedByName: (r.reviewer as { name?: string } | null)?.name ?? undefined,
          reviewedAt: r.reviewed_at ?? undefined,
          scheduleSnapshot: (r.schedule_snapshot as ScheduleSnapshotEntry[] | null) ?? undefined,
          createdAt: r.created_at,
          attachments: attachmentsByLeave.get(r.id) ?? [],
        };
      })
    );
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

  const loadGeofenceConfig = useCallback(async (siteId: SiteId = activeSiteId) => {
    const settingId = geofenceSettingId(siteId);
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("id", settingId)
      .maybeSingle();
    if (error) {
      console.error("loadGeofenceConfig:", error);
      setGeofenceLocations(defaultGeofenceLocationsForSite(siteId));
      return;
    }
    if (!data?.value) {
      setGeofenceLocations(defaultGeofenceLocationsForSite(siteId));
      return;
    }
    setGeofenceLocations(parseGeofenceSettings(data.value));
  }, [supabase, activeSiteId]);

  const loadStoreConfig = useCallback(async (siteId: SiteId = activeSiteId) => {
    const settingId = storeConfigSettingId(siteId);
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("id", settingId)
      .maybeSingle();
    if (error) {
      console.error("loadStoreConfig:", error);
      setStoreConfig(defaultStoreConfigForSite(siteId));
      return;
    }

    // 集集：無列，或目錄仍空 → 寫入總店範本（避免上線後只能排休）
    if (siteId === "jiji") {
      const existing = data?.value
        ? parseStoreConfig(data.value, siteId)
        : null;
      if (shouldSeedJijiShiftCatalog(existing)) {
        const seeded = buildJijiStoreConfigWithTemplate();
        const { error: upsertError } = await supabase.from("app_settings").upsert({
          id: settingId,
          value: seeded,
          updated_at: new Date().toISOString(),
        });
        if (upsertError) {
          console.error("loadStoreConfig jiji seed:", upsertError);
          setStoreConfig(seeded);
          return;
        }
        setStoreConfig(seeded);
        return;
      }
    }

    setStoreConfig(parseStoreConfig(data?.value ?? null, siteId));
  }, [supabase, activeSiteId]);

  const saveStoreConfig = async (next: StoreConfig) => {
    if (!currentUser || (currentUser.role !== "owner" && currentUser.role !== "manager")) {
      throw new Error("僅店長或老闆可調整店家設定");
    }
    const siteId = activeSiteId;
    const normalized = parseStoreConfig({ ...next, siteId }, siteId);
    const settingId = storeConfigSettingId(siteId);
    const { error } = await supabase.from("app_settings").upsert({
      id: settingId,
      value: normalized,
      updated_by: currentUser.id,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message || "儲存店家設定失敗");
    setStoreConfig(normalized);

    // 僅竹山傳統 A–E 同步到共用 shift_time_config，避免集集設定改到竹山班表圖例
    if (siteId === "zhushan" && !normalized.features.customShiftCatalog) {
      setShiftDisplayConfig((prev) => {
        const merged = { ...prev };
        for (const shift of normalized.shifts) {
          if (!merged[shift.code]) continue;
          merged[shift.code] = { ...merged[shift.code], label: shift.name };
        }
        return merged;
      });
      await Promise.all(
        normalized.shifts.map((shift) => {
          const prev = shiftDisplayConfig[shift.code];
          if (!prev) return Promise.resolve();
          return supabase.from("shift_time_config").upsert(
            {
              shift_code: shift.code,
              display_label: shift.name,
              display_text: prev.displayText,
              bg_color: prev.bgColor,
              text_color: prev.textColor,
              border_color: prev.borderColor,
            },
            { onConflict: "shift_code" }
          );
        })
      );
    }
  };

  const setActiveSite = async (siteId: SiteId) => {
    if (!currentUser || currentUser.role !== "owner") {
      throw new Error("僅老闆可切換店別");
    }
    setActiveSiteIdState(siteId);
    writeActiveSiteToStorage(siteId);
    // 先清空再載入，避免切店瞬間仍顯示上一店公告／圍籬
    setBulletinItems([]);
    setGeofenceLocations(defaultGeofenceLocationsForSite(siteId));
    await Promise.all([
      loadStoreConfig(siteId),
      loadGeofenceConfig(siteId),
      loadBulletinItems(siteId),
    ]);
  };

  const isRotationEveningDate = useCallback(
    (dateStr: string) => isRotationEveningDay(dateStr, storeConfig),
    [storeConfig]
  );

  const saveGeofenceLocations = async (locations: GeofenceLocation[]) => {
    if (!currentUser || (currentUser.role !== "owner" && currentUser.role !== "manager")) {
      throw new Error("僅店長或老闆可調整打卡圍籬");
    }
    const normalized = parseGeofenceSettings({ locations });
    if (normalized.length === 0) {
      throw new Error("至少需要保留一個打卡店點");
    }
    const payload = { locations: normalized };
    const settingId = geofenceSettingId(activeSiteId);
    const { error } = await supabase.from("app_settings").upsert({
      id: settingId,
      value: payload,
      updated_by: currentUser.id,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message || "儲存圍籬設定失敗");
    setGeofenceLocations(normalized);
  };

  const getHolidayInfo = useCallback((dateStr: string) => {
    // 優先 holidays 資料表（班表頁可同步）；後備硬編碼清單僅供空庫啟動
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
          targetDate: r.target_swap_date || r.swap_date,
          status: mapSwapStatusFromDb(r.status),
          rejectReason: r.reject_reason ?? undefined,
          scheduleSnapshot: (r.schedule_snapshot as ScheduleSnapshotEntry[] | null) ?? undefined,
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
          startTime: formatDbTime(r.start_time, "18:00"),
          endTime: formatDbTime(r.end_time, "20:00"),
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

  const mapPunchRecordRow = (r: {
    id: string;
    employee_id: string;
    employee_name: string;
    date: string;
    action: string;
    segment_index: number;
    time: string;
    shift: string;
    late_minutes: number;
    reason: string | null;
    latitude: number | null;
    longitude: number | null;
    created_at: string;
  }): PunchRecord => ({
    id: r.id,
    employeeId: r.employee_id,
    employeeName: r.employee_name,
    date: r.date,
    action: r.action as PunchRecord["action"],
    segmentIndex: r.segment_index,
    time: r.time.substring(0, 5),
    shift: r.shift as ShiftType,
    lateMinutes: r.late_minutes,
    reason: r.reason ?? undefined,
    latitude: Number(r.latitude ?? 0),
    longitude: Number(r.longitude ?? 0),
    createdAt: r.created_at,
  });

  const loadTodayPunchRecords = useCallback(async (employeeId: string, date = todayDateStr()) => {
    const { data } = await supabase
      .from("punch_records")
      .select("*")
      .eq("employee_id", employeeId)
      .eq("date", date)
      .order("time", { ascending: true });

    if (data) {
      const mapped = data.map(mapPunchRecordRow);
      setPunchRecords((prev) => {
        const rest = prev.filter((p) => !(p.employeeId === employeeId && p.date === date));
        return [...rest, ...mapped];
      });
    }
    setPunchRecordsReady(true);
  }, [supabase]);

  const refreshTodayPunchRecords = useCallback(async () => {
    if (!currentUser) return;
    await loadTodayPunchRecords(currentUser.id);
  }, [currentUser, loadTodayPunchRecords]);

  const loadPunchRecords = useCallback(async () => {
    const { data } = await supabase
      .from("punch_records")
      .select("*")
      .order("date", { ascending: false })
      .order("time", { ascending: true });
    if (data) {
      setPunchRecords(data.map(mapPunchRecordRow));
    }
    setPunchRecordsReady(true);
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
          relatedId: n.related_id ?? undefined,
          relatedType: n.related_type ?? undefined,
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
      // 店長：僅目前店；老闆：全店都通知（跨店切換仍收得到）
      const recipients = allEmployees.filter(
        (e) =>
          e.role === "owner" ||
          (e.role === "manager" && parseSiteId(e.siteId) === activeSiteId)
      );
      await Promise.all(
        recipients.map((m) =>
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
    [allEmployees, activeSiteId, insertNotification]
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
              .select(
                "id, name, role, hire_date, end_date, is_wednesday_rotation, is_weekday_off_rule, site_id"
              )
              .eq("id", session.user.id)
              .maybeSingle();
            console.log("[initAuth] userRow:", userRow);
            if (userRow && mounted) {
              const emp = mapUserRow(userRow);
              const homeSite = parseSiteId(userRow.site_id);
              const viewSite =
                emp.role === "owner"
                  ? readActiveSiteFromStorage() ?? homeSite
                  : homeSite;
              setCurrentUser(emp);
              setActiveSiteIdState(viewSite);
              await loadTodayPunchRecords(userRow.id);
              // Load remaining data in background without blocking login UI
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
              loadBulletinItems(viewSite),
              loadHolidays(),
              loadGeofenceConfig(viewSite),
              loadStoreConfig(viewSite),
              loadAnnualLeaveConfigs(new Date().getFullYear()),
              loadAnnualLeaveConfigs(new Date().getFullYear() + 1),
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
        setAllEmployees([]);
        setPunchRecords([]);
        setPunchRecordsReady(false);
        setActiveSiteIdState(DEFAULT_SITE_ID);
        return;
      }
      
      if (event === "SIGNED_IN" && session?.user) {
        // Don't await inside onAuthStateChange - fire and forget with setTimeout to avoid blocking auth flow
        setTimeout(async () => {
          if (!mounted) return;
          try {
            const { data: userRow } = await supabase
              .from("users")
              .select(
                "id, name, role, hire_date, end_date, is_wednesday_rotation, is_weekday_off_rule, site_id"
              )
              .eq("id", session.user.id)
              .maybeSingle();
            console.log("[SIGNED_IN] userRow:", userRow);
            if (userRow && mounted) {
              const emp = mapUserRow(userRow);
              const homeSite = parseSiteId(userRow.site_id);
              const viewSite =
                emp.role === "owner"
                  ? readActiveSiteFromStorage() ?? homeSite
                  : homeSite;
              setCurrentUser(emp);
              setActiveSiteIdState(viewSite);
              await loadTodayPunchRecords(userRow.id);
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
                loadBulletinItems(viewSite),
                loadHolidays(),
                loadGeofenceConfig(viewSite),
                loadStoreConfig(viewSite),
                loadAnnualLeaveConfigs(new Date().getFullYear()),
                loadAnnualLeaveConfigs(new Date().getFullYear() + 1),
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
  }, [supabase, loadEmployees, loadLeaveRequests, loadCompLeaveLedger, loadSwapRequests, loadOvertimeRequests, loadTardinessRecords, loadPunchRecords, loadTodayPunchRecords, loadNotifications, loadScheduleOverrides, loadLeaveSelections, loadFixedShifts, loadShiftTimeConfig, loadWednesdayOffSelections, loadLeaveMonthLocks, loadHolidays, loadGeofenceConfig, loadStoreConfig]);

  // ─── Auth functions ──────────────────────────────────────────────────────────

  const loginWithRole = async (
    username: string,
    password: string,
    allowedDbRoles: string[]
  ): Promise<boolean> => {
    const email = toAuthEmail(username);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.message?.toLowerCase().includes("too many") || error.status === 429) {
          throw new Error("請求過於頻繁，請等待 1 分鐘後再試");
        }
        return false;
      }

      if (!data.user) return false;

      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select(
          "id, name, role, hire_date, end_date, is_active, is_wednesday_rotation, is_weekday_off_rule, site_id"
        )
        .eq("id", data.user.id)
        .single();

      if (profileError || !profile?.is_active || !allowedDbRoles.includes(profile.role)) {
        await supabase.auth.signOut();
        return false;
      }

      const emp = mapUserRow(profile);
      const homeSite = parseSiteId(profile.site_id);
      const viewSite =
        emp.role === "owner" ? readActiveSiteFromStorage() ?? homeSite : homeSite;
      setCurrentUser(emp);
      setActiveSiteIdState(viewSite);

      return true;
    } catch (e) {
      if (e instanceof Error) throw e;
      return false;
    }
  };

  const loginEmployee = async (username: string, password: string): Promise<boolean> => {
    return loginWithRole(username, password, ["employee"]);
  };

  const loginManager = async (username: string, password: string): Promise<boolean> => {
    return loginWithRole(username, password, ["manager", "boss"]);
  };

  const logout = async () => {
    setCurrentUser(null);
    setAllEmployees([]);
    setActiveSiteIdState(DEFAULT_SITE_ID);
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      console.error("[logout] signOut error:", error);
    }
  };

  // ─── Employee management (via API Routes) ────────────────────────────────────

  const addEmployee = async (employee: Omit<Employee, "id">) => {
    const res = await fetch("/api/auth/create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: employee.username,
        password: employee.password,
        name: employee.name,
        role: employee.role,
        hire_date: employee.hireDate,
        end_date: employee.endDate || null,
        site_id: employee.siteId ?? activeSiteId,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "新增員工失敗");
    }
    await loadEmployees();
  };

  const updateEmployee = async (id: string, updates: Partial<Employee>) => {
    const res = await fetch("/api/auth/update-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: id,
        name: updates.name,
        role: updates.role,
        username: updates.username,
        password: updates.password,
        isWednesdayRotation: updates.isWednesdayRotation,
        isWeekdayOffRule: updates.isWeekdayOffRule,
        hire_date: updates.hireDate,
        end_date: updates.endDate === undefined ? undefined : updates.endDate || null,
        site_id: updates.siteId,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "更新員工失敗");
    }
    await loadEmployees();
    // Update currentUser if it's the same user
    if (currentUser?.id === id) {
      setCurrentUser((prev) => prev ? { ...prev, ...updates } : prev);
    }
  };

  const deleteEmployee = async (id: string) => {
    const res = await fetch("/api/auth/delete-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "刪除員工失敗");
    }
    await loadEmployees();
  };

  // ─── Schedule (localStorage) ─────────────────────────────────────────────────

  /** 基準上班班別（忽略排休勾選；禮拜日仍為 X） */
  const getWorkShiftIgnoringLeave = (date: string, employeeId: string): ScheduleShiftCode => {
    if (isSunday(date)) return "X";

    const emp = employees.find((e) => e.id === employeeId);
    if (emp && !isEmployeeActiveOnDate(emp, date)) return "X";

    const isRotationParticipant = emp?.isWednesdayRotation ?? false;
    const dayOfWeek = getLocalDayOfWeek(date);
    const fixedShift = fixedShifts.find(
      (s) => s.employeeId === employeeId && s.dayOfWeek === dayOfWeek
    );

    // 禮拜六：優先套用固定班（含休假 X）；未設定才用店家預設
    if (isSaturday(date)) {
      return fixedShift?.shift ?? storeConfig.defaultSaturdayShift;
    }

    if (isRotationEveningDay(date, storeConfig) && isRotationParticipant) {
      const rotationEmployees = employees.filter(
        (e) => e.isWednesdayRotation && isEmployeeActiveOnDate(e, date)
      );
      const onDuty = storeConfig.rotationEvening.onDutyShift;
      const offDuty = storeConfig.rotationEvening.offDutyShift;
      if (rotationEmployees.length === 0) return offDuty;
      if (rotationEmployees.length === 1) {
        return employeeId === rotationEmployees[0].id ? onDuty : offDuty;
      }
      const offEmployees = rotationEmployees.filter((e) =>
        (wednesdayOffSelections[e.id] ?? []).includes(date)
      );
      const onDutyEmployees = rotationEmployees.filter(
        (e) => !(wednesdayOffSelections[e.id] ?? []).includes(date)
      );
      if (
        offEmployees.length === rotationEmployees.length ||
        onDutyEmployees.length === rotationEmployees.length
      ) {
        return offDuty;
      }
      const isOnDuty = onDutyEmployees.some((e) => e.id === employeeId);
      return isOnDuty ? onDuty : offDuty;
    }

    return fixedShift?.shift ?? storeConfig.defaultWeekdayShift;
  };

  const getBaseShiftForDate = (date: string, employeeId: string): ScheduleShiftCode => {
    if (isSunday(date)) return "X";

    const emp = employees.find((e) => e.id === employeeId);
    if (emp && !isEmployeeActiveOnDate(emp, date)) return "X";

    // 排休勾選（含週六）優先於預設／固定班
    if ((leaveSelections[employeeId] ?? []).includes(date)) return "X";

    return getWorkShiftIgnoringLeave(date, employeeId);
  };

  const getShiftForDate = (date: string, employeeId: string): ScheduleShiftCode => {
    // 禮拜日固定公休：覆寫（含錯誤換班）不可蓋過
    if (isSunday(date)) return "X";
    // 入職日前／到期日後一律休假（X），舊覆寫不可蓋過
    const emp = employees.find((e) => e.id === employeeId);
    if (emp && !isEmployeeActiveOnDate(emp, date)) return "X";
    // 固定班表設「禮拜六休假」優先於舊覆寫（否則會一直顯示預設 C）
    if (isSaturday(date)) {
      const dayOfWeek = getLocalDayOfWeek(date);
      const fixedSat = fixedShifts.find(
        (s) => s.employeeId === employeeId && s.dayOfWeek === dayOfWeek
      );
      if (fixedSat?.shift === "X") return "X";
    }
    const override = schedule[date]?.[employeeId];
    if (override) return override;
    return getBaseShiftForDate(date, employeeId);
  };

  const updateShift = async (date: string, employeeId: string, shift: ScheduleShiftCode) => {
    const sundayCheck = assertSundayShiftAllowed(date, shift);
    if (!sundayCheck.ok) {
      throw new Error(sundayCheck.message);
    }

    const codeCheck = assertWritableShiftCode(shift, storeConfig);
    if (!codeCheck.ok) {
      throw new Error(codeCheck.message);
    }

    const empForActive = employees.find((e) => e.id === employeeId);
    if (empForActive && !isEmployeeActiveOnDate(empForActive, date)) {
      throw new Error("該日尚未到職或已過到期日，僅能顯示休假");
    }

    if (isPastDate(date)) {
      throw new Error("已過去的月份無法修改班表");
    }

    const y = new Date(date).getFullYear();
    const m = new Date(date).getMonth() + 1;
    const monthLocked = isLeaveMonthLocked(y, m);
    const canOverrideLocked = currentUser?.role === "owner" || currentUser?.role === "manager";
    if (monthLocked && !canOverrideLocked) {
      throw new Error("本月份班表已鎖定，僅店長/老闆可修改");
    }

    const isManagerEdit =
      currentUser?.role === "owner" || currentUser?.role === "manager";
    const emp = employees.find((e) => e.id === employeeId);
    const alreadySelected = (leaveSelections[employeeId] ?? []).includes(date);
    const syncAction = shouldSyncLeaveSelection(date, shift);

    if (isManagerEdit && syncAction === "add" && !alreadySelected) {
      const ruleCheck = checkManagerLeaveAssignment(
        emp,
        emp?.name ?? "員工",
        date,
        leaveSelections
      );
      if (ruleCheck.shouldWarn && ruleCheck.message) {
        if (!window.confirm(ruleCheck.message)) return;
      }
    }

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

    if (isManagerEdit) {
      const syncLeaveSelection = async (action: "add" | "remove") => {
        const res = await fetch("/api/schedule/sync-leave-selection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employeeId, date, action }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          throw new Error(data.error || "同步排休選擇失敗，請稍後再試");
        }
      };

      if (syncAction === "add" && !alreadySelected) {
        await syncLeaveSelection("add");
        setLeaveSelections((prev) => ({
          ...prev,
          [employeeId]: [...(prev[employeeId] ?? []), date],
        }));
      } else if (syncAction === "remove" && alreadySelected) {
        await syncLeaveSelection("remove");
        setLeaveSelections((prev) => ({
          ...prev,
          [employeeId]: (prev[employeeId] ?? []).filter((d) => d !== date),
        }));
      }
    }

    // Optimistic update
    setSchedule((prev) => ({ ...prev, [date]: { ...prev[date], [employeeId]: shift } }));
    await supabase.from("schedule_entries").upsert(
      { user_id: employeeId, date, shift_code: shift, updated_by: currentUser?.id },
      { onConflict: "user_id,date" }
    );
  };

  const applyNationalHolidayOneClick = async (
    date: string,
    mode: HolidayOneClickMode,
    options?: { workShiftChoice?: HolidayWorkShiftChoice }
  ): Promise<{ updated: number; preservedLeave: number }> => {
    if (!currentUser || (currentUser.role !== "owner" && currentUser.role !== "manager")) {
      throw new Error("僅店長或老闆可一鍵設定國定假日班表");
    }
    if (isPastDate(date)) {
      throw new Error("已過去的日期無法修改班表");
    }
    if (isSunday(date)) {
      throw new Error("禮拜日為固定公休，無法一鍵設定");
    }
    if (!getHolidayInfo(date).isHoliday) {
      throw new Error("僅能對國定假日使用一鍵設定");
    }

    const targets = employees.filter(
      (e) => e.role !== "owner" && isEmployeeActiveOnDate(e, date)
    );
    const hasApprovedFullDayLeave = (employeeId: string) =>
      leaveRequests.some(
        (r) =>
          r.employeeId === employeeId &&
          r.status === "approved" &&
          r.period === "full_day" &&
          date >= r.startDate &&
          date <= r.endDate
      );

    const changes = buildHolidayOneClickChanges({
      date,
      mode,
      employeeIds: targets.map((e) => e.id),
      getCurrentShift: (employeeId) => getShiftForDate(date, employeeId),
      getWorkShift: (employeeId) => getWorkShiftIgnoringLeave(date, employeeId),
      hasLeaveSelection: (employeeId) => (leaveSelections[employeeId] ?? []).includes(date),
      hasApprovedFullDayLeave,
      workShiftChoice: mode === "work" ? options?.workShiftChoice ?? "auto" : undefined,
      fallbackWorkShift: storeConfig.defaultWeekdayShift || "B",
    });

    if (mode === "work" && options?.workShiftChoice && options.workShiftChoice !== "auto") {
      const codeCheck = assertWritableShiftCode(options.workShiftChoice, storeConfig);
      if (!codeCheck.ok) {
        throw new Error(codeCheck.message);
      }
    }

    const preservedLeave = targets.filter((e) => {
      const keepLeave =
        (leaveSelections[e.id] ?? []).includes(date) || hasApprovedFullDayLeave(e.id);
      return mode === "work" && keepLeave;
    }).length;

    if (changes.length > 0) {
      setSchedule((prev) => {
        const nextDay = { ...prev[date] };
        for (const change of changes) {
          nextDay[change.employeeId] = change.to;
        }
        return { ...prev, [date]: nextDay };
      });

      for (const change of changes) {
        await upsertScheduleShift(supabase, change.employeeId, date, change.to, currentUser.id);
      }
    }

    return { updated: changes.length, preservedLeave };
  };

  // ─── Fixed shifts ────────────────────────────────────────────────────────────

  /** 固定禮拜六休假時，清掉未來週六班表覆寫，否則畫面仍顯示舊的 C */
  const clearFutureSaturdayOverrides = async (employeeId: string) => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const { data, error } = await supabase
      .from("schedule_entries")
      .select("date")
      .eq("user_id", employeeId)
      .gte("date", todayStr);
    if (error || !data) return;
    const saturdayDates = data
      .map((r) => String(r.date).slice(0, 10))
      .filter((d) => isSaturday(d));
    for (const date of saturdayDates) {
      await supabase
        .from("schedule_entries")
        .delete()
        .eq("user_id", employeeId)
        .eq("date", date);
    }
    if (saturdayDates.length > 0) {
      await loadScheduleOverrides();
    }
  };

  const addFixedShift = async (shift: FixedShift) => {
    const codeCheck = assertWritableShiftCode(shift.shift, storeConfig);
    if (!codeCheck.ok) {
      throw new Error(codeCheck.message);
    }
    const { error } = await supabase.from("fixed_shifts").upsert(
      { user_id: shift.employeeId, day_of_week: shift.dayOfWeek, shift_code: shift.shift },
      { onConflict: "user_id,day_of_week" }
    );
    if (error) throw new Error(error.message || "新增固定班失敗");
    if (shift.dayOfWeek === 6 && shift.shift === "X") {
      await clearFutureSaturdayOverrides(shift.employeeId);
    }
    await loadFixedShifts();
  };

  const updateFixedShift = async (index: number, shift: FixedShift) => {
    const old = fixedShifts[index];
    if (!old) return;
    const codeCheck = assertWritableShiftCode(shift.shift, storeConfig);
    if (!codeCheck.ok) {
      throw new Error(codeCheck.message);
    }
    // Delete old and insert new (in case user_id or day_of_week changed)
    await supabase
      .from("fixed_shifts")
      .delete()
      .eq("user_id", old.employeeId)
      .eq("day_of_week", old.dayOfWeek);
    const { error } = await supabase.from("fixed_shifts").upsert(
      { user_id: shift.employeeId, day_of_week: shift.dayOfWeek, shift_code: shift.shift },
      { onConflict: "user_id,day_of_week" }
    );
    if (error) throw new Error(error.message || "更新固定班失敗");
    if (shift.dayOfWeek === 6 && shift.shift === "X") {
      await clearFutureSaturdayOverrides(shift.employeeId);
    }
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
    // A–E 時段為竹山共用表；集集請用店家設定的進階班別目錄，避免改壞竹山圖例
    if (activeSiteId !== "zhushan") {
      throw new Error(
        "班別時段為竹山共用設定。請切回竹山店再調整，或至集集「店家設定」編輯進階班別目錄。"
      );
    }
    if (!isLegacyShiftCode(shift)) {
      throw new Error("時段設定僅支援 A–E／X");
    }
    setShiftTimeConfig((prev) => ({ ...prev, [shift]: ranges }));
    await supabase.from("shift_time_config").upsert(
      { shift_code: shift, time_ranges: ranges },
      { onConflict: "shift_code" }
    );
  };

  const updateShiftDisplayConfig = async (shift: ShiftType, style: Partial<ShiftDisplayStyle>) => {
    if (activeSiteId !== "zhushan") {
      throw new Error(
        "班別顯示為竹山共用設定。請切回竹山店再調整，或至集集「店家設定」編輯進階班別目錄。"
      );
    }
    if (!isLegacyShiftCode(shift)) {
      throw new Error("顯示設定僅支援 A–E／X");
    }
    const next = { ...shiftDisplayConfig[shift], ...style };
    setShiftDisplayConfig((prev) => ({ ...prev, [shift]: next }));
    await supabase.from("shift_time_config").upsert(
      {
        shift_code: shift,
        display_label: next.label,
        display_text: next.displayText,
        bg_color: next.bgColor,
        text_color: next.textColor,
        border_color: next.borderColor,
      },
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

  const getWednesdayOffLimit = (year: number, month: number) =>
    resolveRotationOffLimit(year, month, storeConfig);

  const isWednesdayOff = (employeeId: string, date: string) =>
    (wednesdayOffSelections[employeeId] ?? []).includes(date);

  const toggleWednesdayOff = async (employeeId: string, date: string) => {
    const emp = employees.find((e) => e.id === employeeId);
    if (!storeConfig.features.rotationEvening)
      return { success: false, message: "本店未開放週期輪班功能" };
    if (!emp?.isWednesdayRotation)
      return { success: false, message: "此員工未設定輪值晚班規則" };
    if (!isRotationEveningDay(date, storeConfig)) {
      const days = storeConfig.rotationEvening.weekdays
        .map((d) => `禮拜${["日", "一", "二", "三", "四", "五", "六"][d]}`)
        .join("、");
      return { success: false, message: `只能設定${days}的晚班排休` };
    }

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
        console.error("刪除輪值晚班排休記錄失敗:", error);
        return { success: false, message: "刪除失敗，請重試" };
      }
      // 等待成功後才更新本地狀態，確保打卡頁面能取得最新資料
      setWednesdayOffSelections((prev) => ({
        ...prev,
        [employeeId]: (prev[employeeId] ?? []).filter((d) => d !== date),
      }));
      return { success: true };
    }

    const offLimit = getWednesdayOffLimit(year, month);
    if (selectedDates.length >= offLimit)
      return {
        success: false,
        message: `本月最多只能選擇 ${offLimit} 個輪值日不輪晚班`,
      };

    // 先寫入資料庫，等待完成後再更新本地狀態
    const { error } = await supabase
      .from("wednesday_off_selections")
      .insert({ user_id: employeeId, date });
    if (error) {
      console.error("新增輪值晚班排休記錄失敗:", error);
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
    const selectedSaturdayDates = selectedDates.filter((d) => isSaturday(d));
    const weekdayDates = selectedDates.filter((d) => !isSaturday(d) && !isSunday(d));

    const emp = employees.find((e) => e.id === employeeId);
    const isWeekdayOffRule = emp?.isWeekdayOffRule ?? false;

    return {
      selectedDates,
      saturdayUsed: selectedSaturdayDates.length,
      saturdayLimit: 2,
      weekdayUsed: isWeekdayOffRule ? 0 : weekdayDates.length,
      weekdayLimit: isWeekdayOffRule ? 0 : 2,
      optionalSaturdayUsed: false,
      optionalSaturdayAvailable: false,
    };
  };

  const toggleLeaveDate = (employeeId: string, date: string) => {
    const dateObject = new Date(date);
    const year = dateObject.getFullYear();
    const month = dateObject.getMonth() + 1;

    if (isPastMonth(year, month) || isPastDate(date)) {
      return { success: false, message: "已過去的月份無法變更排休選擇" };
    }

    if (leaveMonthLocks.some((l) => l.year === year && l.month === month)) {
      return { success: false, message: "本月份班表已鎖定，無法變更排休選擇（請假／換班／加班仍可申請）" };
    }

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
    leaveMonthLocks.some(
      (l) =>
        l.year === year &&
        l.month === month &&
        parseSiteId(l.siteId) === activeSiteId
    );

  const snapshotMonthSchedule = async (year: number, month: number, actorId?: string) => {
    const activeEmployees = employees.filter(
      (e) => e.role !== "owner" && isEmployeeActiveInMonth(e, year, month)
    );
    if (activeEmployees.length === 0) return;
    const daysInMonth = new Date(year, month, 0).getDate();
    const rows: Array<{ user_id: string; date: string; shift_code: ScheduleShiftCode; updated_by?: string }> = [];

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      for (const emp of activeEmployees) {
        rows.push({
          user_id: emp.id,
          date,
          shift_code: getShiftForDate(date, emp.id),
          updated_by: actorId ?? currentUser?.id,
        });
      }
    }

    const chunkSize = 200;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error: upsertError } = await supabase
        .from("schedule_entries")
        .upsert(chunk, { onConflict: "user_id,date" });
      if (upsertError) {
        throw new Error(`班表快照失敗：${upsertError.message}`);
      }
    }
    await loadScheduleOverrides();
  };

  const lockLeaveMonth = async (year: number, month: number, lockedBy: string) => {
    if (isLeaveMonthLocked(year, month)) return;
    await snapshotMonthSchedule(year, month, lockedBy);

    const res = await fetch("/api/schedule/lock-month", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month, action: "lock", site_id: activeSiteId }),
    });
    const payload = (await res.json()) as {
      error?: string;
      lock?: {
        year: number;
        month: number;
        site_id?: string;
        locked_by: string;
        locked_at: string;
      };
      alreadyLocked?: boolean;
    };
    if (!res.ok) {
      throw new Error(payload.error ?? "鎖定失敗");
    }
    if (payload.lock) {
      setLeaveMonthLocks((prev) => [
        ...prev,
        {
          year: payload.lock!.year,
          month: payload.lock!.month,
          siteId: parseSiteId(payload.lock!.site_id, activeSiteId),
          lockedBy: payload.lock!.locked_by,
          lockedAt: payload.lock!.locked_at,
        },
      ]);
    } else if (!payload.alreadyLocked) {
      await loadLeaveMonthLocks();
    }
  };

  const unlockLeaveMonth = async (year: number, month: number) => {
    const res = await fetch("/api/schedule/lock-month", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month, action: "unlock", site_id: activeSiteId }),
    });
    const payload = (await res.json()) as { error?: string };
    if (!res.ok) {
      throw new Error(payload.error ?? "解除鎖定失敗");
    }
    setLeaveMonthLocks((prev) =>
      prev.filter(
        (l) =>
          !(
            l.year === year &&
            l.month === month &&
            parseSiteId(l.siteId) === activeSiteId
          )
      )
    );
  };

  // ─── Leave requests (Supabase) ───────────────────────────────────────────────

  const overtimeHoursBetween = (startTime: string, endTime: string) => {
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    return Math.round((((eh * 60 + em) - (sh * 60 + sm)) / 60) * 100) / 100;
  };

  const buildLeaveScheduleSnapshot = async (
    employeeId: string,
    startDate: string,
    endDate: string
  ): Promise<ScheduleSnapshotEntry[]> => {
    const dates = enumerateDatesInRange(startDate, endDate);
    const dbMap = await fetchDbScheduleShifts(supabase, [employeeId], dates);
    return dates.map((date) => {
      const key = `${employeeId}:${date}`;
      const hadDbEntry = dbMap.has(key);
      const shift = hadDbEntry ? dbMap.get(key)! : getBaseShiftForDate(date, employeeId);
      return { userId: employeeId, date, shift, hadDbEntry };
    });
  };

  const applyApprovedLeaveToSchedule = async (request: LeaveRequest) => {
    const dates = enumerateDatesInRange(request.startDate, request.endDate);
    const { startTime, endTime } = resolveLeaveTimesForSchedule(request);

    for (const date of dates) {
      const originalShift = getOriginalShiftForLeaveDay({
        employeeId: request.employeeId,
        date,
        shiftMode: request.shiftMode,
        scheduleSnapshot: request.scheduleSnapshot,
        getBaseShiftForDate,
      });
      if (originalShift === "X") continue;

      if (request.period === "full_day") {
        await upsertScheduleShift(supabase, request.employeeId, date, "X", currentUser?.id);
        continue;
      }

      const { shift } = calculateEffectiveShift(originalShift, startTime, endTime);
      await upsertScheduleShift(
        supabase,
        request.employeeId,
        date,
        shift ?? "X",
        currentUser?.id
      );
    }
    await loadScheduleOverrides();
  };

  /** 請假核准後清除／重算該時段遲到，避免已請假仍被記遲到 */
  const clearTardinessForApprovedLeave = async (request: LeaveRequest) => {
    const dates = enumerateDatesInRange(request.startDate, request.endDate);
    const { startTime, endTime } = resolveLeaveTimesForSchedule(request);

    const { data: punchRows } = await supabase
      .from("punch_records")
      .select("*")
      .eq("employee_id", request.employeeId)
      .in("date", dates)
      .eq("action", "work_in")
      .gt("late_minutes", 0);

    const punchesFromDb = (punchRows ?? []).map(mapPunchRecordRow);

    for (const date of dates) {
      const originalShift = getOriginalShiftForLeaveDay({
        employeeId: request.employeeId,
        date,
        shiftMode: request.shiftMode,
        scheduleSnapshot: request.scheduleSnapshot,
        getBaseShiftForDate,
      });

      const punches = punchesFromDb.filter((p) => p.date === date);

      for (const p of punches) {
        const decision = resolveLateAfterLeaveApproval({
          period: request.period,
          leaveStartTime: startTime,
          leaveEndTime: endTime,
          punchShift: p.shift,
          segmentIndex: p.segmentIndex,
          punchTime: p.time,
          originalShift,
          shiftTimeConfig,
          storeConfig,
        });

        if (decision.clear) {
          const lateMinutesBeforeClear = p.lateMinutes;
          await updatePunchRecord(p.id, { lateMinutes: 0, reason: null });
          const matchingTardiness = tardinessRecords.filter(
            (t) =>
              t.employeeId === p.employeeId &&
              t.date === p.date &&
              (t.minutes === lateMinutesBeforeClear || request.period === "full_day")
          );
          for (const t of matchingTardiness) {
            await deleteTardinessRecord(t.id);
          }
          continue;
        }

        if (decision.lateMinutes !== p.lateMinutes) {
          const lateMinutesBefore = p.lateMinutes;
          await updatePunchRecord(p.id, {
            lateMinutes: decision.lateMinutes,
            reason: decision.lateMinutes > 0 ? "遲到" : null,
          });
          const matchingTardiness = tardinessRecords.filter(
            (t) =>
              t.employeeId === p.employeeId &&
              t.date === p.date &&
              t.minutes === lateMinutesBefore
          );
          for (const t of matchingTardiness) {
            await deleteTardinessRecord(t.id);
          }
          if (decision.lateMinutes > 0) {
            await addTardinessRecord({
              employeeId: p.employeeId,
              employeeName: p.employeeName,
              date: p.date,
              minutes: decision.lateMinutes,
              notes: "請假核准後依剩餘班別重算遲到",
            });
          }
        }
      }

      if (request.period === "full_day") {
        const tardinessToRemove = tardinessRecords.filter(
          (t) => t.employeeId === request.employeeId && t.date === date
        );
        for (const t of tardinessToRemove) {
          await deleteTardinessRecord(t.id);
        }
      }
    }

    await loadPunchRecords();
    await loadTardinessRecords();
  };

  /** 請假取消核准時，依打卡紀錄恢復遲到（與加班邏輯一致） */
  const restoreTardinessAfterLeaveCancelled = async (request: LeaveRequest) => {
    const dates = enumerateDatesInRange(request.startDate, request.endDate);
    for (const date of dates) {
      const punchesToRestore = punchRecords.filter(
        (p) =>
          p.employeeId === request.employeeId &&
          p.date === date &&
          p.action === "work_in"
      );
      for (const p of punchesToRestore) {
        if (p.lateMinutes !== 0 || p.reason !== null) continue;
        // 若班別已是休假，不恢復遲到
        if (p.shift === "X") continue;
        const slot = getPunchSlotsForRanges(
          resolveShiftTimeRanges(p.shift, storeConfig, shiftTimeConfig)
        ).find(
          (s: PunchSlot) => s.action === "work_in" && s.segmentIndex === p.segmentIndex
        );
        if (!slot) continue;
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
  };

  const revertApprovedLeaveFromSchedule = async (request: LeaveRequest) => {
    if (request.scheduleSnapshot?.length) {
      await restoreScheduleSnapshot(supabase, request.scheduleSnapshot, currentUser?.id);
    } else {
      const dates = enumerateDatesInRange(request.startDate, request.endDate);
      for (const date of dates) {
        const { data: row } = await supabase
          .from("schedule_entries")
          .select("shift_code")
          .eq("user_id", request.employeeId)
          .eq("date", date)
          .maybeSingle();
        if (!row) continue;

        const baseShift = getOriginalShiftForLeaveDay({
          employeeId: request.employeeId,
          date,
          shiftMode: request.shiftMode,
          getBaseShiftForDate,
        });
        if (baseShift === row.shift_code) {
          continue;
        }
        await supabase
          .from("schedule_entries")
          .delete()
          .eq("user_id", request.employeeId)
          .eq("date", date);
      }
    }
    await loadScheduleOverrides();
  };

  const restoreCompLeaveForLeaveApplication = async (
    employeeId: string,
    leaveId: string,
    note: string
  ) => {
    const { data: entries, error } = await supabase
      .from("comp_leave_ledger")
      .select("hours")
      .eq("source_id", leaveId);

    if (error) throw error;
    if (!entries?.length) return;

    const netHours = entries.reduce((sum, entry) => sum + Number(entry.hours), 0);
    if (netHours >= 0) return;

    const { error: insertError } = await supabase.from("comp_leave_ledger").insert({
      user_id: employeeId,
      hours: -netHours,
      source_type: "reversal",
      source_id: leaveId,
      note,
    });
    if (insertError) throw insertError;
  };

  const addLeaveRequest = async (
    request: Omit<LeaveRequest, "id" | "createdAt" | "attachments">,
    files: File[] = []
  ) => {
    const isManagerActor =
      currentUser?.role === "owner" || currentUser?.role === "manager";
    // 員工不可申請過去月份；店長／老闆可手動補登（月底結薪）
    if (hasPastMonthInRange(request.startDate, request.endDate) && !isManagerActor) {
      throw new Error("已過去的月份無法再提出請假申請");
    }

    const { data: existingLeaves, error: existingLeaveError } = await supabase
      .from("leave_applications")
      .select("id, leave_date, end_date, start_time, end_time, period, status")
      .eq("user_id", request.employeeId)
      .in("status", ["pending", "approved"]);

    if (existingLeaveError) {
      throw existingLeaveError;
    }

    if (
      hasDuplicateLeave(
        {
          startDate: request.startDate,
          endDate: request.endDate,
          startTime: request.startTime,
          endTime: request.endTime,
        },
        existingLeaves ?? []
      )
    ) {
      throw new Error(DUPLICATE_LEAVE_MESSAGE);
    }

    const dbPeriod =
      request.period === "morning"
        ? "morning"
        : request.period === "afternoon"
          ? "afternoon"
          : "full_day";

    const { data: inserted, error: insertError } = await supabase
      .from("leave_applications")
      .insert({
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
      })
      .select("id")
      .single();

    if (insertError || !inserted?.id) {
      throw new Error(insertError?.message || "請假申請寫入失敗");
    }

    for (const file of files) {
      const form = new FormData();
      form.append("applicationId", inserted.id);
      form.append("file", file);
      const res = await fetch("/api/applications/leave/attachments", {
        method: "POST",
        body: form,
      });
      const result = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(result?.error || `附件「${file.name}」上傳失敗`);
      }
    }

    await notifyManagers({
      type: "leave_submitted",
      title: isManagerActor && request.employeeId !== currentUser?.id ? "店長代登請假" : "新請假申請",
      body: `${request.employeeName} 提交請假（${request.startDate}～${request.endDate}）${
        files.length > 0 ? `，含 ${files.length} 個附件` : ""
      }，請審核。`,
      relatedType: "leave",
    });

    await loadLeaveRequests();
  };

  const openLeaveAttachment = async (attachmentId: string) => {
    const res = await fetch(`/api/applications/leave/attachments?id=${encodeURIComponent(attachmentId)}`);
    const result = await res.json().catch(() => null);
    if (!res.ok || !result?.url) {
      throw new Error(result?.error || "無法開啟附件");
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  };

  const updateLeaveRequestStatus = async (
    id: string,
    status: "approved" | "rejected" | "pending",
    rejectReason?: string
  ) => {
    const request = leaveRequests.find((item) => item.id === id);
    const prevStatus = request?.status;
    const isManagerActor =
      currentUser?.role === "owner" || currentUser?.role === "manager";

    // 員工不可改過去月份；店長／老闆仍可審核，以便月底結薪
    if (
      request &&
      status !== prevStatus &&
      hasPastMonthInRange(request.startDate, request.endDate) &&
      !isManagerActor
    ) {
      throw new Error("已過去的月份無法變更請假申請");
    }

    // 補休假允許先請後補：餘額可為負，之後加班轉補休再加回
    // （核准時寫入負數帳本，不在此阻擋）

    if (status === "approved" && request?.type === "特休") {
      const emp = employees.find((e) => e.id === request.employeeId);
      if (emp) {
        const year = new Date(request.startDate).getFullYear();
        const quotaDays = getAnnualLeaveQuota(emp, year) + getTotalAdjustmentDays(request.employeeId, year);
        const usedHours = leaveRequests
          .filter(
            (r) =>
              r.id !== id &&
              r.employeeId === request.employeeId &&
              r.type === "特休" &&
              r.status === "approved" &&
              new Date(r.startDate).getFullYear() === year
          )
          .reduce((sum, r) => sum + r.leaveHours, 0);
        const needHours = request.leaveHours;
        if (usedHours + needHours > quotaDays * 8) {
          const remainDays = Math.max(0, quotaDays - usedHours / 8);
          throw new Error(
            `特休餘額不足（剩餘約 ${remainDays.toFixed(1)} 天，本次需要 ${(needHours / 8).toFixed(1)} 天）`
          );
        }
      }
    }

    let leaveSnapshot: ScheduleSnapshotEntry[] | undefined;
    if (request && status === "approved" && prevStatus !== "approved") {
      leaveSnapshot = await buildLeaveScheduleSnapshot(
        request.employeeId,
        request.startDate,
        request.endDate
      );
    }

    await supabase
      .from("leave_applications")
      .update({
        status,
        reviewed_by: currentUser?.id,
        reviewed_at: new Date().toISOString(),
        ...(rejectReason ? { reject_reason: rejectReason } : {}),
        ...(leaveSnapshot ? { schedule_snapshot: leaveSnapshot } : {}),
      })
      .eq("id", id);

    if (request) {
      if (status === "approved" && prevStatus !== "approved") {
        const requestWithSnapshot = leaveSnapshot
          ? { ...request, scheduleSnapshot: leaveSnapshot }
          : request;
        await applyApprovedLeaveToSchedule(requestWithSnapshot);
        await clearTardinessForApprovedLeave(requestWithSnapshot);
      }
      if (prevStatus === "approved" && status !== "approved") {
        await revertApprovedLeaveFromSchedule(request);
        await restoreTardinessAfterLeaveCancelled(request);
      }
      if (status === "approved" && prevStatus !== "approved" && request.type === "補休假") {
        const balanceBefore = getCompLeaveBalance(request.employeeId);
        const isAdvance = balanceBefore < request.leaveHours;
        await supabase.from("comp_leave_ledger").insert({
          user_id: request.employeeId,
          hours: -request.leaveHours,
          source_type: "leave_debit",
          source_id: id,
          note: isAdvance
            ? `先請補休（借支） ${request.startDate}～${request.endDate}`
            : `請假使用補休 ${request.startDate}～${request.endDate}`,
        });
      }
      if (
        prevStatus === "approved" &&
        status !== "approved" &&
        request.type === "補休假"
      ) {
        await restoreCompLeaveForLeaveApplication(
          request.employeeId,
          id,
          "請假審核取消，補休時數退回"
        );
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
    const { data: row, error: loadError } = await supabase
      .from("leave_applications")
      .select(
        "*, users!leave_applications_user_id_fkey(name), reviewer:users!leave_applications_reviewed_by_fkey(name)"
      )
      .eq("id", id)
      .single();

    if (loadError || !row) {
      throw new Error("未找到請假申請");
    }

    const startTime = formatDbTime(
      row.start_time,
      row.period === "morning" ? "08:30" : row.period === "afternoon" ? "13:30" : "08:30"
    );
    const endTime = formatDbTime(
      row.end_time,
      row.period === "full_day" ? "18:00" : row.period === "morning" ? "12:00" : "18:00"
    );
    let period: LeavePeriodMode = "full_day";
    if (row.period === "morning") period = "morning";
    else if (row.period === "afternoon") period = "afternoon";
    else if (startTime && endTime) {
      if (startTime === "08:30" && endTime === "12:00") period = "morning";
      else if (startTime === "13:30" && endTime === "18:00") period = "afternoon";
      else if (startTime === "08:30" && (endTime === "18:00" || endTime === "21:00")) period = "full_day";
      else period = "custom";
    }
    const shiftRaw = row.shift_mode as string | null;
    const shiftMode: LeaveRequest["shiftMode"] =
      shiftRaw && shiftRaw !== "schedule" ? (shiftRaw as ShiftType) : "schedule";

    const request: LeaveRequest = {
      id: row.id,
      employeeId: row.user_id,
      employeeName: (row.users as { name?: string } | null)?.name ?? "",
      startDate: row.leave_date,
      endDate: row.end_date ?? row.leave_date,
      startTime,
      endTime,
      period,
      shiftMode,
      leaveHours: Number(row.leave_hours ?? 0),
      type: row.leave_type as LeaveType,
      reason: row.reason,
      rejectReason: row.reject_reason ?? undefined,
      status: row.status as LeaveRequest["status"],
      scheduleSnapshot: (row.schedule_snapshot as ScheduleSnapshotEntry[] | null) ?? undefined,
      createdAt: row.created_at,
    };

    if (request.status === "approved") {
      await revertApprovedLeaveFromSchedule(request);
    }

    if (request.type === "補休假") {
      await restoreCompLeaveForLeaveApplication(
        request.employeeId,
        request.id,
        "請假刪除，補休時數退回"
      );
    }

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
    await loadScheduleOverrides();
    await loadCompLeaveLedger();
  };

  const addSwapRequest = async (request: Omit<SwapRequest, "id" | "createdAt">) => {
    const sundayCheck = assertNoSundayInSwapDates(
      request.requesterDate,
      request.targetDate
    );
    if (!sundayCheck.ok) {
      throw new Error(sundayCheck.message);
    }

    const touchesPastMonth =
      isPastDate(request.requesterDate) || isPastDate(request.targetDate);
    if (touchesPastMonth) {
      throw new Error("已過去的月份無法再提出換班申請");
    }

    const isSelfSwap = request.requesterId === request.targetEmployeeId;
    await supabase
      .from("shift_swap_applications")
      .insert({
        requester_id: request.requesterId,
        target_id: request.targetEmployeeId,
        swap_date: request.requesterDate,
        target_swap_date: request.targetDate,
        status: isSelfSwap ? "pending_review" : "pending_confirm",
      });

    // 不再發送通知公告（由管理員主動查看審核）

    await loadSwapRequests();
  };

  /** 還原已核准換班寫入的 schedule_entries，讓班表回到換班前狀態 */
  const revertApprovedSwap = async (request: SwapRequest) => {
    const res = await fetch("/api/schedule/apply-swap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        swapId: request.id,
        action: "revert",
        snapshot: request.scheduleSnapshot,
      }),
    });
    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      snapshot?: ScheduleSnapshotEntry[];
    };
    if (!res.ok) {
      throw new Error(payload.error ?? "還原換班班表失敗");
    }
    if (payload.snapshot?.length) {
      setSchedule((prev) => revertSnapshotOnState(prev, payload.snapshot!));
    }
    await loadScheduleOverrides();
  };

  const buildSwapScheduleSnapshot = async (
    request: SwapRequest,
    isSelfSwap: boolean
  ): Promise<ScheduleSnapshotEntry[]> => {
    const cells = swapSnapshotCells(request, isSelfSwap);
    const userIds = Array.from(new Set(cells.map((c) => c.userId)));
    const dates = Array.from(new Set(cells.map((c) => c.date)));
    const dbMap = await fetchDbScheduleShifts(supabase, userIds, dates);
    return cells.map(({ userId, date }) => {
      const key = `${userId}:${date}`;
      const hadDbEntry = dbMap.has(key);
      const shift = hadDbEntry ? dbMap.get(key)! : getShiftForDate(date, userId);
      return { userId, date, shift, hadDbEntry };
    });
  };

  const updateSwapRequestStatus = async (
    id: string,
    status: "pending_confirmation" | "pending_approval" | "approved" | "rejected",
    rejectReason?: string
  ) => {
    const request = swapRequests.find((item) => item.id === id);
    const prevStatus = request?.status;
    const dbStatus = mapSwapStatusToDb(status);
    const isManagerActor =
      currentUser?.role === "owner" || currentUser?.role === "manager";

    if (
      request &&
      status !== prevStatus &&
      (isPastDate(request.requesterDate) || isPastDate(request.targetDate)) &&
      !isManagerActor
    ) {
      throw new Error("已過去的月份無法變更換班申請");
    }

    // 取消審核／駁回已核准：先還原班表到換班前
    if (request && prevStatus === "approved" && status !== "approved") {
      await revertApprovedSwap(request);
      await loadScheduleOverrides();
    }

    // 核准：寫入互換後班表，並立刻重載讓班表頁即時更新
    if (request && status === "approved" && prevStatus !== "approved") {
      const isSelfSwap = request.requesterId === request.targetEmployeeId;
      const snapshot = await buildSwapScheduleSnapshot(request, isSelfSwap);
      const { changes } = buildSwapShiftsAndChanges(request, snapshot);

      const res = await fetch("/api/schedule/apply-swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          swapId: id,
          action: "approve",
          snapshot,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        changes?: typeof changes;
      };
      if (!res.ok) {
        throw new Error(payload.error ?? "核准換班寫入班表失敗");
      }
      setSchedule((prev) => applyScheduleChangesToState(prev, payload.changes ?? changes));
      await loadScheduleOverrides();
    }

    const { error: statusError } = await supabase
      .from("shift_swap_applications")
      .update({
        status: dbStatus,
        reviewed_by: currentUser?.id,
        reviewed_at: new Date().toISOString(),
        ...(rejectReason ? { reject_reason: rejectReason } : {}),
      })
      .eq("id", id);

    if (statusError) {
      // 狀態更新失敗時，班表可能已改；盡力重載避免畫面與 DB 不一致
      await loadScheduleOverrides();
      throw new Error(`換班狀態更新失敗：${statusError.message}`);
    }

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
    const request = swapRequests.find((item) => item.id === id);

    // 僅已核准且已寫入班表的申請需要還原到換班前
    if (request?.status === "approved") {
      await revertApprovedSwap(request);
      await loadScheduleOverrides();
    }

    const { error } = await supabase
      .from("shift_swap_applications")
      .delete()
      .eq("id", id);

    if (error) throw error;

    await loadSwapRequests();
    await loadScheduleOverrides();
  };

  // ─── Overtime requests (Supabase) ────────────────────────────────────────────

  const addOvertimeRequest = async (request: Omit<OvertimeRequest, "id" | "createdAt">) => {
    const isManagerActor =
      currentUser?.role === "owner" || currentUser?.role === "manager";
    // 員工不可申請過去月份；店長／老闆可手動補登（月底結薪）
    if (isPastDate(request.date) && !isManagerActor) {
      throw new Error("已過去的月份無法再提出加班申請");
    }

    const compensationError = validateOvertimeCompensation(
      request.startTime,
      request.endTime,
      request.compensationType
    );
    if (compensationError) {
      throw new Error(compensationError);
    }
    const compensationType = resolveAllowedCompensationType(
      request.startTime,
      request.endTime,
      request.compensationType
    );

    const { data: existingRequests, error: existingError } = await supabase
      .from("overtime_applications")
      .select("id, overtime_date, start_time, end_time, status")
      .eq("user_id", request.employeeId)
      .eq("overtime_date", request.date)
      .in("status", ["pending", "approved"]);

    if (existingError) {
      throw existingError;
    }

    if (
      hasDuplicateOvertime(
        {
          date: request.date,
          startTime: request.startTime,
          endTime: request.endTime,
        },
        existingRequests ?? []
      )
    ) {
      throw new Error(DUPLICATE_OVERTIME_MESSAGE);
    }

    await supabase.from("overtime_applications").insert({
      user_id: request.employeeId,
      overtime_date: request.date,
      start_time: request.startTime,
      end_time: request.endTime,
      reason: request.reason,
      compensation: compensationType === "time_off" ? "comp_leave" : "pay",
      status: "pending",
    });
    await notifyManagers({
      type: "overtime_submitted",
      title: isManagerActor && request.employeeId !== currentUser?.id ? "店長代登加班" : "新加班申請",
      body: `${request.employeeName} 提交加班（${request.date}），請審核。`,
      relatedType: "overtime",
    });

    await loadOvertimeRequests();
  };

  const updateOvertimeRequestStatus = async (
    id: string,
    status: "approved" | "rejected" | "pending",
    rejectReason?: string
  ) => {
    const request = overtimeRequests.find((item) => item.id === id);
    const prevStatus = request?.status;
    const isManagerActor =
      currentUser?.role === "owner" || currentUser?.role === "manager";

    // 員工不可改過去月份；店長／老闆仍可審核，以便月底結薪
    if (request && status !== prevStatus && isPastDate(request.date) && !isManagerActor) {
      throw new Error("已過去的月份無法變更加班申請");
    }

    if (isManagerActor) {
      const res = await fetch("/api/applications/overtime/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, rejectReason }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || "加班審核失敗");
      }
    } else {
      const { error } = await supabase
        .from("overtime_applications")
        .update({
          status,
          reviewed_by: currentUser?.id,
          reviewed_at: new Date().toISOString(),
          ...(rejectReason ? { reject_reason: rejectReason } : {}),
        })
        .eq("id", id);
      if (error) throw error;
    }

    if (request) {
      const hours = overtimeHoursBetween(request.startTime, request.endTime);
      if (
        !isManagerActor &&
        status === "approved" &&
        prevStatus !== "approved" &&
        request.compensationType === "time_off"
      ) {
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 6);
        const { error } = await supabase.from("comp_leave_ledger").insert({
          user_id: request.employeeId,
          hours,
          source_type: "overtime_credit",
          source_id: id,
          expires_at: expiresAt.toISOString(),
          note: `加班轉補休 ${request.date}`,
        });
        if (error) throw error;
      }
      if (
        !isManagerActor &&
        prevStatus === "approved" &&
        status !== "approved" &&
        request.compensationType === "time_off"
      ) {
        const { error } = await supabase.from("comp_leave_ledger").insert({
          user_id: request.employeeId,
          hours: -hours,
          source_type: "reversal",
          source_id: id,
          note: "加班補休核准取消，扣回時數",
        });
        if (error) throw error;
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
            const slot = getPunchSlotsForRanges(
              resolveShiftTimeRanges(p.shift, storeConfig, shiftTimeConfig)
            ).find(
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

  const updateOvertimeCompensation = async (
    id: string,
    compensationType: "pay" | "time_off"
  ) => {
    const isManagerActor =
      currentUser?.role === "owner" || currentUser?.role === "manager";
    if (!isManagerActor) {
      throw new Error("僅店長或老闆可調整加班補償方式");
    }

    const res = await fetch("/api/applications/overtime/compensation", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, compensationType }),
    });
    const payload = (await res.json()) as { error?: string };
    if (!res.ok) {
      throw new Error(payload.error || "調整補償方式失敗");
    }

    await loadOvertimeRequests();
    await loadCompLeaveLedger();
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

  const grantCompLeaveHours = async (employeeId: string, hours: number, note?: string) => {
    if (!currentUser) throw new Error("請先登入");
    if (currentUser.role !== "owner" && currentUser.role !== "manager") {
      throw new Error("僅店長或老闆可調整補休時數");
    }
    if (!Number.isFinite(hours) || hours === 0) {
      throw new Error("請輸入有效的時數");
    }

    const employee = employees.find((e) => e.id === employeeId);
    if (!employee) throw new Error("找不到員工");

    const roundedHours = Math.round(hours * 100) / 100;
    if (roundedHours < 0) {
      const balance = getCompLeaveBalance(employeeId);
      if (balance + roundedHours < 0) {
        throw new Error(`補休餘額不足（目前 ${balance} 小時）`);
      }
    }

    const expiresAt =
      roundedHours > 0
        ? (() => {
            const d = new Date();
            d.setMonth(d.getMonth() + 6);
            return d.toISOString();
          })()
        : null;

    const managerLabel = currentUser.role === "owner" ? "老闆" : "店長";
    const defaultNote =
      roundedHours > 0
        ? `${managerLabel}核發補休 ${roundedHours} 小時`
        : `${managerLabel}扣回補休 ${Math.abs(roundedHours)} 小時`;

    const { error } = await supabase.from("comp_leave_ledger").insert({
      user_id: employeeId,
      hours: roundedHours,
      source_type: "adjustment",
      note: note?.trim() || defaultNote,
      expires_at: expiresAt,
    });
    if (error) throw new Error(error.message || "調整補休失敗");

    await loadCompLeaveLedger();

    await insertNotification({
      recipientId: employeeId,
      type: "info",
      title: roundedHours > 0 ? "補休時數已核發" : "補休時數已調整",
      body: `${currentUser.name} ${roundedHours > 0 ? "核發" : "扣回"} ${Math.abs(roundedHours)} 小時補休。${note?.trim() ? `備註：${note.trim()}` : ""}`,
      relatedType: "overtime",
    });
  };

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
    const hasLocalDuplicate = punchRecords.some(
      (p) =>
        p.employeeId === record.employeeId &&
        p.date === record.date &&
        p.action === record.action &&
        p.segmentIndex === record.segmentIndex
    );
    if (hasLocalDuplicate) {
      throw new Error("此時段已打卡，請勿重複打卡");
    }

    const isManagerActor =
      currentUser?.role === "owner" || currentUser?.role === "manager";
    const isForOtherEmployee =
      !!currentUser && record.employeeId !== currentUser.id;

    if (isManagerActor && isForOtherEmployee) {
      const res = await fetch("/api/attendance/punch-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ record }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || "新增打卡紀錄失敗");
      }
      await loadPunchRecords();
      return;
    }

    const { data: existing } = await supabase
      .from("punch_records")
      .select("id")
      .eq("employee_id", record.employeeId)
      .eq("date", record.date)
      .eq("action", record.action)
      .eq("segment_index", record.segmentIndex)
      .maybeSingle();

    if (existing) {
      await loadTodayPunchRecords(record.employeeId, record.date);
      throw new Error("此時段已打卡，請勿重複打卡");
    }

    const { error } = await supabase.from("punch_records").insert({
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
    if (error) throw error;
    await loadTodayPunchRecords(record.employeeId, record.date);
  };

  const updatePunchRecord = async (id: string, updates: PunchRecordUpdate) => {
    const isManagerActor =
      currentUser?.role === "owner" || currentUser?.role === "manager";
    const target = punchRecords.find((p) => p.id === id);
    const isForOtherEmployee =
      !!currentUser && !!target && target.employeeId !== currentUser.id;

    if (isManagerActor && isForOtherEmployee) {
      const res = await fetch("/api/attendance/punch-records", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, updates }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || "更新打卡紀錄失敗");
      }
      await loadPunchRecords();
      return;
    }

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
    const isManagerActor =
      currentUser?.role === "owner" || currentUser?.role === "manager";
    const target = punchRecords.find((p) => p.id === id);
    const isForOtherEmployee =
      !!currentUser && !!target && target.employeeId !== currentUser.id;

    if (isManagerActor && isForOtherEmployee) {
      const res = await fetch("/api/attendance/punch-records", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || "刪除打卡紀錄失敗");
      }
      await loadPunchRecords();
      return;
    }

    const { error } = await supabase.from("punch_records").delete().eq("id", id);
    if (error) throw error;
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

  const loadBulletinItems = useCallback(async (siteId: SiteId = activeSiteId): Promise<void> => {
    const [boardResponse, readsResponse] = await Promise.all([
      supabase
        .from("bulletin_board")
        .select("*, users(name)")
        .eq("site_id", siteId)
        .order("created_at", { ascending: false }),
      supabase
        .from("bulletin_reads")
        .select("bulletin_id, user_id"),
    ]);

    if (boardResponse.error) {
      console.error("[loadBulletinItems] bulletin_board error:", boardResponse.error);
    }

    const boardData = Array.isArray(boardResponse.data) ? boardResponse.data : [];
    const readsData = Array.isArray(readsResponse.data) ? readsResponse.data : [];

    setBulletinReads(readsData.map((r: { bulletin_id: string; user_id: string }) => ({
      bulletinId: r.bulletin_id,
      userId: r.user_id,
    })));

    const normalizeType = (rawType: string): BulletinItem["type"] => {
      if (rawType === "shift_swap_request") return "cover_request";
      const allowed: BulletinItem["type"][] = [
        "announcement",
        "cover_request",
        "task_completed",
        "day_off_notice",
        "must_do_today",
        "shift_handoff",
      ];
      return allowed.includes(rawType as BulletinItem["type"])
        ? (rawType as BulletinItem["type"])
        : "announcement";
    };

    const boardItems = boardData.map((r) => ({
      id: r.id,
      authorId: r.author_id,
      authorName: (r.users as { name?: string } | null)?.name ?? "未知",
      title: r.title,
      content: r.content,
      type: normalizeType(r.type),
      status: r.status as BulletinItem["status"],
      relatedId: r.related_id,
      isUrgent: r.is_urgent ?? false,
      isPinned: r.is_pinned ?? false,
      targetType: (r.target_type ?? "all") as "all" | "specific",
      targetIds: r.target_ids ?? [],
      createdAt: r.created_at,
    }));

    setBulletinItems(
      boardItems.sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
    );
  }, [supabase, activeSiteId]);

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
      site_id: activeSiteId,
    });
    await loadBulletinItems(activeSiteId);
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
      const newRecords = data.map((r) => ({
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
        positionGradeTotal: Number(r.position_grade_total ?? 0),
        fixedAllowanceTotal: Number(r.fixed_allowance_total ?? 0),
        fullAttendancePay: Number(r.full_attendance_pay ?? 0),
        finalPay: Number(r.final_pay),
        note: r.note,
        isPublished: r.is_published,
        publishedAt: r.published_at,
        createdAt: r.created_at,
      }));
      
      // 合併新舊資料，避免覆蓋已存在的記錄
      setPayrollRecords((prev) => {
        const merged = [...prev];
        newRecords.forEach((newRec) => {
          const index = merged.findIndex((r) => r.id === newRec.id);
          if (index >= 0) {
            merged[index] = newRec;
          } else {
            merged.push(newRec);
          }
        });
        return merged;
      });
    }
  }, [supabase]);

  const publishPayrollRecord = async (id: string): Promise<void> => {
    const now = new Date().toISOString();
    await supabase.from("payroll_records").update({
      is_published: true,
      published_at: now
    }).eq("id", id);

    // 優先用本機快取；若剛 upsert 尚未進 state，改從 DB 讀取以免漏通知
    let record = payrollRecords.find((r) => r.id === id);
    if (!record) {
      const { data } = await supabase.from("payroll_records").select("*").eq("id", id).maybeSingle();
      if (data) {
        record = {
          id: String(data.id),
          userId: String(data.user_id),
          year: Number(data.year),
          month: Number(data.month),
          baseSalary: Number(data.base_salary),
          laborInsurance: Number(data.labor_insurance),
          healthInsurance: Number(data.health_insurance),
          pensionDeduction: Number(data.pension_deduction),
          leaveDeduction: Number(data.leave_deduction),
          overtimePay: Number(data.overtime_pay),
          tardinessDeduction: Number(data.tardiness_deduction),
          bonusTotal: Number(data.bonus_total),
          positionGradeTotal: Number(data.position_grade_total ?? 0),
          fixedAllowanceTotal: Number(data.fixed_allowance_total ?? 0),
          fullAttendancePay: Number(data.full_attendance_pay ?? 0),
          finalPay: Number(data.final_pay),
          note: data.note ? String(data.note) : undefined,
          isPublished: true,
          publishedAt: now,
          createdAt: String(data.created_at),
        };
      }
    }

    if (record) {
      await insertNotification({
        recipientId: record.userId,
        type: "success",
        title: "薪資單已發布",
        body: `您的 ${record.year} 年 ${record.month} 月薪資單已發布，請前往「薪資查詢」查看。`,
        relatedId: record.id,
        relatedType: "payroll",
      });
      await loadPayrollRecords(record.year, record.month);
    }
  };

  const unpublishPayrollRecord = async (id: string): Promise<void> => {
    await supabase.from("payroll_records").update({
      is_published: false,
      published_at: null
    }).eq("id", id);
    
    // 找出該筆記錄的員工資訊
    const record = payrollRecords.find(r => r.id === id);
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

  const deleteNotification = async (id: string) => {
    const { error } = await supabase.from("notifications").delete().eq("id", id);
    if (error) throw error;
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const deleteAllNotifications = async () => {
    if (!currentUser?.id) return;
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("recipient_id", currentUser.id);
    if (error) throw error;
    setNotifications([]);
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
        getBaseShiftForDate,
        applyNationalHolidayOneClick,
        refreshSchedule: loadScheduleOverrides,
        fixedShifts,
        addFixedShift,
        updateFixedShift,
        deleteFixedShift,
        shiftTimeConfig,
        updateShiftTimeConfig,
        shiftDisplayConfig,
        updateShiftDisplayConfig,
        wednesdayNightShifts,
        setWednesdayNightShift,
        getWednesdayOffDates,
        getWednesdayOffLimit,
        toggleWednesdayOff,
        isWednesdayOff,
        storeConfig,
        loadStoreConfig,
        saveStoreConfig,
        isRotationEveningDate,
        activeSiteId,
        setActiveSite,
        canSwitchSite,
        getLeaveSummary,
        toggleLeaveDate,
        isLeaveMonthLocked,
        lockLeaveMonth,
        unlockLeaveMonth,
        leaveMonthLocks,
        leaveRequests,
        addLeaveRequest,
        openLeaveAttachment,
        updateLeaveRequestStatus,
        deleteLeaveRequest,
        compLeaveLedger,
        getCompLeaveBalance,
        getAnnualLeaveQuota,
        getAnnualLeaveBalance,
        getAvailableCompLeave,
        loadCompLeaveLedger,
        grantCompLeaveHours,
        annualLeaveConfigs,
        setAnnualLeaveConfigs,
        annualLeaveAdjustments,
        loadAnnualLeaveConfigs,
        loadAnnualLeaveAdjustments,
        updateAnnualLeaveConfig,
        addAnnualLeaveAdjustment,
        deleteAnnualLeaveAdjustment,
        getTotalAdjustmentDays,
        swapRequests,
        addSwapRequest,
        updateSwapRequestStatus,
        deleteSwapRequest,
        overtimeRequests,
        addOvertimeRequest,
        updateOvertimeRequestStatus,
        updateOvertimeCompensation,
        deleteOvertimeRequest,
        tardinessRecords: siteTardinessRecords,
        addTardinessRecord,
        deleteTardinessRecord,
        punchRecords: sitePunchRecords,
        punchRecordsReady,
        refreshTodayPunchRecords,
        addPunchRecord,
        updatePunchRecord,
        deletePunchRecord,
        getTodayPunchRecords,
        getPunchRecordsByDate,
        notifications,
        markNotificationRead,
        deleteNotification,
        deleteAllNotifications,
        refreshNotifications,
        bulletinItems,
        addBulletinItem,
        updateBulletinItem,
        deleteBulletinItem,
        loadBulletinItems,
        readBulletinItem,
        isBulletinRead,
        payrollRecords,
        setPayrollRecords,
        publishPayrollRecord,
        unpublishPayrollRecord,
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
        geofenceLocations,
        loadGeofenceConfig,
        saveGeofenceLocations,
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
