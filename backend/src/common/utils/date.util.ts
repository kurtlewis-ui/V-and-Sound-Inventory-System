/**
 * Philippine timezone (Asia/Manila, UTC+8) utilities.
 *
 * The business operates in the Philippines, so all day-boundary logic
 * (daily sale counter resets, "today's" branch summary, etc.) must use
 * Philippine midnight — not the server's local timezone or UTC midnight.
 */

const PH_TIMEZONE = 'Asia/Manila';

/**
 * Returns the start of "today" (midnight 00:00:00.000) in Philippine time,
 * expressed as a UTC Date object suitable for Prisma/Postgres queries.
 *
 * Example: If it's 2026-08-11 01:30 AM in the Philippines (which is
 * 2026-08-10 17:30 UTC), this returns 2026-08-10T16:00:00.000Z — i.e.
 * midnight Aug 11 Philippine time expressed in UTC.
 */
export function startOfTodayPH(): Date {
  // Get the current date string in Philippine timezone (YYYY-MM-DD)
  const now = new Date();
  const phDateStr = now.toLocaleDateString('en-CA', { timeZone: PH_TIMEZONE });
  // phDateStr is "YYYY-MM-DD" in Philippine local date

  // Parse that date at midnight Philippine time.
  // Asia/Manila is always UTC+8 (no DST), so midnight PH = that date at 16:00 UTC the day before,
  // or more precisely: we construct an ISO string and subtract 8 hours.
  const [year, month, day] = phDateStr.split('-').map(Number);
  // Midnight in PH = the date at 00:00 PH = date at (00:00 - 8h) UTC = previous day 16:00 UTC
  const midnightPH = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  // midnightPH is currently "YYYY-MM-DDT00:00:00Z" but we need it to represent
  // midnight PH in UTC, which is 8 hours earlier.
  midnightPH.setUTCHours(midnightPH.getUTCHours() - 8);

  return midnightPH;
}

/**
 * Returns the Philippine local date as a Date object with time set to 00:00:00 UTC.
 * This is used for the DailySaleCounter's `date` column (which is a @db.Date type,
 * so only the date portion matters — Prisma/Postgres ignores the time).
 */
export function todayDatePH(): Date {
  const now = new Date();
  const phDateStr = now.toLocaleDateString('en-CA', { timeZone: PH_TIMEZONE });
  const [year, month, day] = phDateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
