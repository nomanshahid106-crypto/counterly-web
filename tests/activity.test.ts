import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyActivity,
  activeWithin,
  countByStatus,
  registrationTrend,
  accessCounts,
  lastSeenAt,
} from '../src/lib/activity.ts';
import type { AdminUser } from '../src/lib/activity.ts';

const NOW = new Date('2026-10-26T12:00:00.000Z');
const DAY = 86400000;
const iso = (msAgo: number) => new Date(NOW.getTime() - msAgo).toISOString();

function user(partial: Partial<AdminUser>): AdminUser {
  return {
    user_id: 'u1',
    email: 'user@example.com',
    full_name: 'Test User',
    registered_at: iso(90 * DAY),
    last_login_at: null,
    last_activity_at: null,
    stores_count: 0,
    web_access_enabled: false,
    access_updated_at: null,
    is_admin: false,
    ...partial,
  };
}

test('never_active: no login and no activity', () => {
  const u = user({});
  assert.equal(classifyActivity(u, NOW), 'never_active');
  assert.equal(lastSeenAt(u), null);
});

test('active: last login 2 days ago', () => {
  const u = user({ last_login_at: iso(2 * DAY) });
  assert.equal(classifyActivity(u, NOW), 'active');
});

test('active: only activity (no login) 1 hour ago, within 30 days boundary', () => {
  const u = user({ last_activity_at: iso(60 * 60 * 1000) });
  assert.equal(classifyActivity(u, NOW), 'active');
});

test('active: exactly 30 days ago is still active', () => {
  // lastSeen == now - 30d exactly -> now - last == 30d (<= 30d)
  const u = user({ last_login_at: iso(30 * DAY) });
  assert.equal(classifyActivity(u, NOW), 'active');
});

test('inactive: last seen 31 days ago (previously active, now dormant)', () => {
  const u = user({ last_login_at: iso(31 * DAY), last_activity_at: iso(45 * DAY) });
  assert.equal(classifyActivity(u, NOW), 'inactive');
});

test('lastSeenAt picks the later of login and activity', () => {
  const u = user({ last_login_at: iso(10 * DAY), last_activity_at: iso(3 * DAY) });
  assert.equal(lastSeenAt(u), new Date(iso(3 * DAY)).getTime());
  assert.equal(classifyActivity(u, NOW), 'active');
});

test('invalid date strings are treated as never seen', () => {
  const u = user({ last_login_at: 'not-a-date', last_activity_at: '' });
  assert.equal(classifyActivity(u, NOW), 'never_active');
});

test('activeWithin windows: today / 7 days / 30 days', () => {
  const users = [
    user({ user_id: 'a', last_login_at: iso(2 * 60 * 60 * 1000) }), // 2h ago
    user({ user_id: 'b', last_activity_at: iso(3 * DAY) }), // 3d ago
    user({ user_id: 'c', last_login_at: iso(20 * DAY) }), // 20d ago
    user({ user_id: 'd', last_login_at: iso(60 * DAY) }), // 60d ago
    user({ user_id: 'e' }), // never
  ];
  assert.equal(activeWithin(users, 1, NOW), 1);
  assert.equal(activeWithin(users, 7, NOW), 2);
  assert.equal(activeWithin(users, 30, NOW), 3);
});

test('countByStatus tallies all three classes', () => {
  const users = [
    user({ user_id: 'a', last_login_at: iso(1 * DAY) }),
    user({ user_id: 'b', last_login_at: iso(90 * DAY) }),
    user({ user_id: 'c' }),
    user({ user_id: 'd', last_activity_at: iso(5 * DAY) }),
  ];
  assert.deepEqual(countByStatus(users, NOW), { active: 2, inactive: 1, never_active: 1 });
});

test('registrationTrend buckets per day, oldest first, window-limited', () => {
  const users = [
    user({ user_id: 'a', registered_at: iso(0) }), // today
    user({ user_id: 'b', registered_at: iso(1 * DAY) }), // yesterday
    user({ user_id: 'c', registered_at: iso(1 * DAY) }),
    user({ user_id: 'd', registered_at: iso(10 * DAY) }), // outside 7d window
    user({ user_id: 'e', registered_at: null }), // ignored
  ];
  const trend = registrationTrend(users, 7, NOW);
  assert.equal(trend.length, 7);
  // Last bucket is today, second-to-last is yesterday
  assert.equal(trend[6].count, 1);
  assert.equal(trend[5].count, 2);
  assert.equal(trend.reduce((s, b) => s + b.count, 0), 3);
  assert.equal(trend[6].date, '2026-10-26');
  assert.equal(trend[0].date, '2026-10-20');
});

test('registrationTrend with 30 days returns 30 buckets', () => {
  assert.equal(registrationTrend([], 30, NOW).length, 30);
});

test('accessCounts counts enabled vs disabled', () => {
  const users = [
    user({ user_id: 'a', web_access_enabled: true }),
    user({ user_id: 'b', web_access_enabled: false }),
    user({ user_id: 'c', web_access_enabled: true }),
  ];
  assert.deepEqual(accessCounts(users), { enabled: 2, disabled: 1 });
  assert.deepEqual(accessCounts([]), { enabled: 0, disabled: 0 });
});
