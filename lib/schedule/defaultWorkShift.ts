/** 沒有固定班時，平日用個人基準班，週六用店家週六預設。 */

export function resolveDefaultWorkShift(options: {
  isSunday: boolean;
  isSaturday: boolean;
  fixedShift?: string | null;
  baselineShift?: string | null;
  defaultSaturdayShift: string;
  defaultWeekdayShift: string;
}): string {
  if (options.isSunday) return "X";
  const fixed = options.fixedShift?.trim();
  if (options.isSaturday) {
    return fixed || options.defaultSaturdayShift;
  }
  const baseline = options.baselineShift?.trim();
  return fixed || baseline || options.defaultWeekdayShift;
}
