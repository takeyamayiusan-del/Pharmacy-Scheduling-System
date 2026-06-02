/**
 * 耀聖藥局智慧排班系統 - Database TypeScript Types
 *
 * Manually defined types based on the database schema in:
 * supabase/migrations/20250101000000_initial_schema.sql
 */

// ============================================================
// Enums / Union Types
// ============================================================

export type UserRole = 'boss' | 'manager' | 'employee';

export type ShiftCode = 'A' | 'B' | 'C' | 'D' | 'E' | 'X';

export type LockType = 'day' | 'week' | 'month';

export type LeavePeriod = 'full_day' | 'morning' | 'afternoon';

export type ApplicationStatus = 'pending' | 'approved' | 'rejected';

export type ShiftSwapStatus =
  | 'pending_confirm'
  | 'pending_review'
  | 'approved'
  | 'rejected';

export type AttachmentStatus = 'active' | 'expired' | 'delete_failed';

export type OvertimeCompensation = 'pay' | 'comp_leave';

export type NotificationType =
  | 'leave_submitted'
  | 'leave_reviewed'
  | 'shift_swap_requested'
  | 'shift_swap_confirmed'
  | 'shift_swap_reviewed'
  | 'overtime_submitted'
  | 'overtime_reviewed'
  | 'schedule_changed';

export type NotificationRelatedType =
  | 'leave'
  | 'shift_swap'
  | 'overtime'
  | 'schedule';

// ============================================================
// Table Row Types
// ============================================================

/**
 * public.users
 * Extends Supabase Auth users. Boss and manager use password login;
 * employees use passwordless (name-based) login.
 */
export interface User {
  id: string; // UUID — references auth.users(id)
  name: string; // VARCHAR(10), UNIQUE
  role: UserRole;
  is_active: boolean;
  created_at: string; // TIMESTAMPTZ (ISO 8601 string)
  updated_at: string; // TIMESTAMPTZ (ISO 8601 string)
}

/**
 * public.scheduling_rules
 * Stores configurable scheduling parameters (single-row table in practice).
 */
export interface SchedulingRule {
  id: string; // UUID
  monthly_leave_quota: number; // SMALLINT, default 8
  saturday_leave_quota: number; // SMALLINT, default 2
  weekday_leave_quota: number; // SMALLINT, default 2
  min_evening_staff: number; // SMALLINT, default 2
  updated_by: string | null; // UUID, references users(id)
  updated_at: string; // TIMESTAMPTZ
}

/**
 * public.schedule_entries
 * One row per employee per date. UNIQUE(user_id, date).
 */
export interface ScheduleEntry {
  id: string; // UUID
  user_id: string; // UUID, references users(id)
  date: string; // DATE (YYYY-MM-DD)
  shift_code: ShiftCode;
  is_fixed: boolean; // true for system-assigned entries (Sundays, 聖文 Tue/Wed)
  created_by: string | null; // UUID, references users(id)
  updated_by: string | null; // UUID, references users(id)
  created_at: string; // TIMESTAMPTZ
  updated_at: string; // TIMESTAMPTZ
}

/**
 * public.schedule_locks
 * Represents a locked period (day / week / month).
 */
export interface ScheduleLock {
  id: string; // UUID
  lock_type: LockType;
  lock_date: string | null; // DATE — used when lock_type = 'day'
  lock_year: number | null; // SMALLINT — used when lock_type = 'week' | 'month'
  lock_week: number | null; // SMALLINT — ISO week number, used when lock_type = 'week'
  lock_month: number | null; // SMALLINT — 1-12, used when lock_type = 'month'
  locked_by: string; // UUID, references users(id)
  created_at: string; // TIMESTAMPTZ
}

/**
 * public.leave_applications
 */
export interface LeaveApplication {
  id: string; // UUID
  user_id: string; // UUID, references users(id)
  leave_date: string; // DATE (YYYY-MM-DD)
  period: LeavePeriod;
  leave_type: string; // e.g. '事假', '病假', '特休'
  reason: string; // VARCHAR(200)
  status: ApplicationStatus;
  reject_reason: string | null; // VARCHAR(200)
  reviewed_by: string | null; // UUID, references users(id)
  reviewed_at: string | null; // TIMESTAMPTZ
  created_at: string; // TIMESTAMPTZ
  updated_at: string; // TIMESTAMPTZ
}

/**
 * public.leave_attachments
 */
export interface LeaveAttachment {
  id: string; // UUID
  application_id: string; // UUID, references leave_applications(id) ON DELETE CASCADE
  storage_path: string; // Supabase Storage path
  file_name: string;
  file_size: number; // INTEGER — bytes
  mime_type: string; // VARCHAR(50)
  status: AttachmentStatus;
  uploaded_at: string; // TIMESTAMPTZ
  deleted_at: string | null; // TIMESTAMPTZ
}

/**
 * public.shift_swap_applications
 */
export interface ShiftSwapApplication {
  id: string; // UUID
  requester_id: string; // UUID, references users(id)
  target_id: string; // UUID, references users(id)
  swap_date: string; // DATE (YYYY-MM-DD)
  status: ShiftSwapStatus;
  reject_reason: string | null; // VARCHAR(200)
  reviewed_by: string | null; // UUID, references users(id)
  reviewed_at: string | null; // TIMESTAMPTZ
  created_at: string; // TIMESTAMPTZ
  updated_at: string; // TIMESTAMPTZ
}

/**
 * public.overtime_applications
 */
export interface OvertimeApplication {
  id: string; // UUID
  user_id: string; // UUID, references users(id)
  overtime_date: string; // DATE (YYYY-MM-DD)
  start_time: string; // TIME (HH:MM:SS)
  end_time: string; // TIME (HH:MM:SS)
  reason: string; // VARCHAR(200)
  status: ApplicationStatus;
  compensation: OvertimeCompensation | null;
  reject_reason: string | null; // VARCHAR(200)
  reviewed_by: string | null; // UUID, references users(id)
  reviewed_at: string | null; // TIMESTAMPTZ
  created_at: string; // TIMESTAMPTZ
  updated_at: string; // TIMESTAMPTZ
}

/**
 * public.monthly_attendance_stats
 * UNIQUE(user_id, year, month). Calculated by Edge Function at month-end.
 */
export interface MonthlyAttendanceStat {
  id: string; // UUID
  user_id: string; // UUID, references users(id)
  year: number; // SMALLINT
  month: number; // SMALLINT (1-12)
  work_days: number; // SMALLINT
  work_hours: number; // NUMERIC(6,2)
  overtime_hours: number; // NUMERIC(6,2)
  comp_leave_hours: number; // NUMERIC(6,2)
  leave_hours: number; // NUMERIC(6,2)
  calculated_at: string; // TIMESTAMPTZ
}

/**
 * public.tardiness_records
 * UNIQUE(user_id, record_date). Only managers can insert.
 */
export interface TardinessRecord {
  id: string; // UUID
  user_id: string; // UUID, references users(id)
  record_date: string; // DATE (YYYY-MM-DD)
  minutes_late: number; // SMALLINT, 1-999
  note: string | null; // TEXT
  recorded_by: string; // UUID, references users(id)
  created_at: string; // TIMESTAMPTZ
}

/**
 * public.notifications
 */
export interface Notification {
  id: string; // UUID
  recipient_id: string; // UUID, references users(id)
  type: NotificationType;
  title: string; // VARCHAR(100)
  body: string; // TEXT
  related_id: string | null; // UUID — related application ID
  related_type: NotificationRelatedType | null;
  is_read: boolean;
  created_at: string; // TIMESTAMPTZ
}

// ============================================================
// Insert / Update Payload Types (omit auto-generated fields)
// ============================================================

export type UserInsert = Omit<User, 'created_at' | 'updated_at'>;
export type UserUpdate = Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>>;

export type SchedulingRuleInsert = Omit<SchedulingRule, 'id' | 'updated_at'>;
export type SchedulingRuleUpdate = Partial<Omit<SchedulingRule, 'id' | 'updated_at'>>;

export type ScheduleEntryInsert = Omit<ScheduleEntry, 'id' | 'created_at' | 'updated_at'>;
export type ScheduleEntryUpdate = Partial<Omit<ScheduleEntry, 'id' | 'created_at' | 'updated_at'>>;

export type ScheduleLockInsert = Omit<ScheduleLock, 'id' | 'created_at'>;

export type LeaveApplicationInsert = Omit<
  LeaveApplication,
  'id' | 'status' | 'reject_reason' | 'reviewed_by' | 'reviewed_at' | 'created_at' | 'updated_at'
>;
export type LeaveApplicationUpdate = Partial<
  Pick<LeaveApplication, 'status' | 'reject_reason' | 'reviewed_by' | 'reviewed_at'>
>;

export type LeaveAttachmentInsert = Omit<LeaveAttachment, 'id' | 'status' | 'uploaded_at' | 'deleted_at'>;

export type ShiftSwapApplicationInsert = Omit<
  ShiftSwapApplication,
  'id' | 'status' | 'reject_reason' | 'reviewed_by' | 'reviewed_at' | 'created_at' | 'updated_at'
>;
export type ShiftSwapApplicationUpdate = Partial<
  Pick<ShiftSwapApplication, 'status' | 'reject_reason' | 'reviewed_by' | 'reviewed_at'>
>;

export type OvertimeApplicationInsert = Omit<
  OvertimeApplication,
  'id' | 'status' | 'compensation' | 'reject_reason' | 'reviewed_by' | 'reviewed_at' | 'created_at' | 'updated_at'
>;
export type OvertimeApplicationUpdate = Partial<
  Pick<OvertimeApplication, 'status' | 'compensation' | 'reject_reason' | 'reviewed_by' | 'reviewed_at'>
>;

export type MonthlyAttendanceStatInsert = Omit<MonthlyAttendanceStat, 'id' | 'calculated_at'>;
export type MonthlyAttendanceStatUpdate = Partial<
  Omit<MonthlyAttendanceStat, 'id' | 'user_id' | 'year' | 'month' | 'calculated_at'>
>;

export type TardinessRecordInsert = Omit<TardinessRecord, 'id' | 'created_at'>;

export type NotificationInsert = Omit<Notification, 'id' | 'is_read' | 'created_at'>;
export type NotificationUpdate = Partial<Pick<Notification, 'is_read'>>;

// ============================================================
// Supabase Database type (for use with createClient<Database>)
// ============================================================

export interface Database {
  public: {
    Tables: {
      users: {
        Row: User;
        Insert: UserInsert;
        Update: UserUpdate;
      };
      scheduling_rules: {
        Row: SchedulingRule;
        Insert: SchedulingRuleInsert;
        Update: SchedulingRuleUpdate;
      };
      schedule_entries: {
        Row: ScheduleEntry;
        Insert: ScheduleEntryInsert;
        Update: ScheduleEntryUpdate;
      };
      schedule_locks: {
        Row: ScheduleLock;
        Insert: ScheduleLockInsert;
        Update: Partial<ScheduleLockInsert>;
      };
      leave_applications: {
        Row: LeaveApplication;
        Insert: LeaveApplicationInsert;
        Update: LeaveApplicationUpdate;
      };
      leave_attachments: {
        Row: LeaveAttachment;
        Insert: LeaveAttachmentInsert;
        Update: Partial<LeaveAttachmentInsert>;
      };
      shift_swap_applications: {
        Row: ShiftSwapApplication;
        Insert: ShiftSwapApplicationInsert;
        Update: ShiftSwapApplicationUpdate;
      };
      overtime_applications: {
        Row: OvertimeApplication;
        Insert: OvertimeApplicationInsert;
        Update: OvertimeApplicationUpdate;
      };
      monthly_attendance_stats: {
        Row: MonthlyAttendanceStat;
        Insert: MonthlyAttendanceStatInsert;
        Update: MonthlyAttendanceStatUpdate;
      };
      tardiness_records: {
        Row: TardinessRecord;
        Insert: TardinessRecordInsert;
        Update: Partial<TardinessRecordInsert>;
      };
      notifications: {
        Row: Notification;
        Insert: NotificationInsert;
        Update: NotificationUpdate;
      };
    };
    Functions: {
      is_date_locked: {
        Args: { check_date: string };
        Returns: boolean;
      };
    };
  };
}

// ============================================================
// Convenience Aliases (alternative naming conventions)
// ============================================================

/** Alias for SchedulingRule (plural form) */
export type SchedulingRules = SchedulingRule;

/** Alias for MonthlyAttendanceStat (plural form) */
export type MonthlyAttendanceStats = MonthlyAttendanceStat;
