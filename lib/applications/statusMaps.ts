import type { SwapRequest } from "@/lib/context/AppContext";

/** 資料庫 shift_swap 狀態 → 前端狀態 */
export function mapSwapStatusFromDb(dbStatus: string): SwapRequest["status"] {
  switch (dbStatus) {
    case "pending_confirm":
      return "pending_confirmation";
    case "pending_review":
      return "pending_approval";
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    default:
      return "pending_confirmation";
  }
}

/** 前端狀態 → 資料庫 shift_swap 狀態 */
export function mapSwapStatusToDb(status: SwapRequest["status"]): string {
  switch (status) {
    case "pending_confirmation":
      return "pending_confirm";
    case "pending_approval":
      return "pending_review";
    default:
      return status;
  }
}

export function notificationRouteFromRelatedType(relatedType: string | null): string | undefined {
  switch (relatedType) {
    case "leave":
      return "/applications/leave";
    case "overtime":
      return "/applications/overtime";
    case "shift_swap":
      return "/applications/shift-swap";
    case "payroll":
      return "/payroll-detail";
    default:
      return undefined;
  }
}
