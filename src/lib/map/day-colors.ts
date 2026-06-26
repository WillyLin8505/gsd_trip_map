/**
 * Per-day color palette for map polylines and markers.
 *
 * Order matches UI-SPEC section 4:
 *   Day 1 → blue-600
 *   Day 2 → green-600
 *   Day 3 → amber-600
 *   Day 4 → purple-600
 *   Day 5 → red-600
 *   Day 6+ → cycles back to blue-600
 */
export const DAY_COLORS = [
  '#2563EB', // blue-600  — Day 1
  '#16A34A', // green-600 — Day 2
  '#D97706', // amber-600 — Day 3
  '#9333EA', // purple-600 — Day 4
  '#DC2626', // red-600   — Day 5
] as const satisfies readonly [string, string, string, string, string];

export type DayColor = (typeof DAY_COLORS)[number];

/**
 * Returns the color for a given day index (0-based).
 *
 * Wraps around via modulo so day 6 (index 5) returns DAY_COLORS[0] (blue).
 *
 * @param dayIndex - 0-based day index (day 1 = index 0)
 */
export function getDayColor(dayIndex: number): string {
  return DAY_COLORS[((dayIndex % DAY_COLORS.length) + DAY_COLORS.length) % DAY_COLORS.length];
}
