// Pure activity analytics helpers for the Admin Dashboard.
// No imports (beyond nothing) so this file can be unit-tested directly
// with node's built-in test runner and type stripping.

export interface AdminUser {
  user_id: string;
  email: string | null;
  full_name: string | null;
  registered_at: string | null;
  last_login_at: string | null;
  last_activity_at: string | null;
  stores_count: number;
  web_access_enabled: boolean;
  access_updated_at: string | null;
  access_updated_by?: string | null;
  is_admin: boolean;
}

export interface MyAccess {
  email: string;
  is_admin: boolean;
  web_access_enabled: boolean;
  has_access_row: boolean;
}

export interface AuditEntry {
  id: string;
  target_user_id: string | null;
  target_email: string | null;
  action: 'granted' | 'revoked';
  performed_by: string | null;
  performed_by_email: string | null;
  created_at: string;
}

export type ActivityStatus = 'never_active' | 'active' | 'inactive';

const DAY_MS = 86400000; // 24 * 60 * 60 * 1000

function toTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * The most recent sign of life for a user: the later of last login and
 * last recorded activity. Null when the user has neither.
 */
export function lastSeenAt(u: AdminUser): number | null {
  const login = toTime(u.last_login_at);
  const activity = toTime(u.last_activity_at);
  if (login === null) return activity;
  if (activity === null) return login;
  return Math.max(login, activity);
}

/**
 * Classify a user:
 * - never_active: no last_login_at AND no last_activity_at (registered but
 *   never used the application at all).
 * - active: last seen within the last 30 days.
 * - inactive: was seen before, but not within the last 30 days
 *   (previously active, now dormant).
 */
export function classifyActivity(u: AdminUser, now: Date = new Date()): ActivityStatus {
  const last = lastSeenAt(u);
  if (last === null) return 'never_active';
  return now.getTime() - last <= 30 * DAY_MS ? 'active' : 'inactive';
}

/**
 * How many users were last seen within the given number of days
 * (today = 1 day window, last 7 days = 7, last 30 days = 30).
 * Never-active users never count.
 */
export function activeWithin(users: AdminUser[], days: number, now: Date = new Date()): number {
  const cutoff = now.getTime() - days * DAY_MS;
  let count = 0;
  for (const u of users) {
    const last = lastSeenAt(u);
    if (last !== null && last >= cutoff) count += 1;
  }
  return count;
}

export function countByStatus(
  users: AdminUser[],
  now: Date = new Date(),
): { active: number; inactive: number; never_active: number } {
  const out = { active: 0, inactive: 0, never_active: 0 };
  for (const u of users) out[classifyActivity(u, now)] += 1;
  return out;
}

function dayLabel(d: Date): string {
  // Local calendar day label, e.g. "2026-10-26"
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Registration trend: one bucket per calendar day for the last `days`
 * days, ending today (inclusive), oldest first. Users registered before
 * the window are ignored; users with no/invalid registration date are
 * ignored.
 */
export function registrationTrend(
  users: AdminUser[],
  days: number,
  now: Date = new Date(),
): { date: string; label: string; count: number }[] {
  const buckets: { date: string; label: string; count: number }[] = [];
  const index = new Map<string, number>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now.getTime() - i * DAY_MS);
    const label = dayLabel(d);
    index.set(label, buckets.length);
    buckets.push({ date: label, label, count: 0 });
  }
  for (const u of users) {
    const t = toTime(u.registered_at);
    if (t === null) continue;
    const idx = index.get(dayLabel(new Date(t)));
    if (idx !== undefined) buckets[idx].count += 1;
  }
  return buckets;
}

export function accessCounts(users: AdminUser[]): { enabled: number; disabled: number } {
  let enabled = 0;
  for (const u of users) if (u.web_access_enabled) enabled += 1;
  return { enabled, disabled: users.length - enabled };
}
