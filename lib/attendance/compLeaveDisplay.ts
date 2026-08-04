/** 補休時數顯示：最多小數兩位，去除多餘尾數 */
export function formatCompLeaveHours(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function roundCompLeaveHours(hours: number): number {
  return Math.round(hours * 100) / 100;
}
