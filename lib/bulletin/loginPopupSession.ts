/** 登入彈窗「稍後再說」：寫入 sessionStorage，換頁／重掛元件不會再閃一次 */

const STORAGE_KEY = "login_popup_session_skip";

let memorySkip = new Set<string>();

export function readLoginPopupSessionSkip(): Set<string> {
  const merged = new Set(memorySkip);
  if (typeof window === "undefined") return merged;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) {
      for (const id of arr) merged.add(String(id));
    }
  } catch {
    // ignore
  }
  memorySkip = merged;
  return new Set(merged);
}

export function writeLoginPopupSessionSkip(ids: Set<string>): void {
  memorySkip = new Set(ids);
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore quota / private mode
  }
}

export function addLoginPopupSessionSkip(id: string, prev: Set<string>): Set<string> {
  const next = new Set(prev);
  next.add(id);
  writeLoginPopupSessionSkip(next);
  return next;
}
