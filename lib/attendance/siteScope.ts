/** 依目前店員工 ID 過濾含 employeeId 的紀錄（打卡／遲到等） */
export function filterBySiteEmployeeIds<T extends { employeeId: string }>(
  rows: T[],
  siteEmployeeIds: ReadonlySet<string>
): T[] {
  if (siteEmployeeIds.size === 0) return [];
  return rows.filter((row) => siteEmployeeIds.has(row.employeeId));
}
