"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { adminService, isSetupMissingError } from '@/services';
import type { AdminUser, AuditEntry, MyAccess } from '@/lib/activity';
import { classifyActivity, activeWithin, countByStatus, registrationTrend, accessCounts } from '@/lib/activity';

type Phase = 'loading' | 'setup' | 'unauthorized' | 'ready';

function fmt(v: string | null | undefined): string {
  if (!v) return 'Never';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? 'Never' : d.toLocaleString();
}
function statusLabel(u: AdminUser, now: Date): { text: string; cls: string } {
  const s = classifyActivity(u, now);
  if (s === 'active') return { text: 'Active', cls: 'badge success' };
  if (s === 'inactive') return { text: 'Inactive', cls: 'badge warn' };
  return { text: 'Never active', cls: 'badge grey' };
}
function withinDays(iso: string | null, days: number, now: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return now.getTime() - t <= days * 86400000;
}

export default function AdminPage() {
  const r = useRouter();
  const [phase, setPhase] = useState<Phase>('loading');
  const [me, setMe] = useState<MyAccess | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [err, setErr] = useState('');
  const [busyAll, setBusyAll] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string>('');
  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [accessFilter, setAccessFilter] = useState('all');
  const [registeredFilter, setRegisteredFilter] = useState('all');
  // Grant by email
  const [grantEmail, setGrantEmail] = useState('');
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantMsg, setGrantMsg] = useState('');
  const [grantErr, setGrantErr] = useState('');

  const loadData = useCallback(async () => {
    setBusyAll(true); setErr('');
    try {
      const [u, a] = await Promise.all([adminService.listUsers(), adminService.auditLog(50)]);
      setUsers(Array.isArray(u) ? u : []); setAudit(Array.isArray(a) ? a : []);
    } catch (x: any) {
      if (isSetupMissingError(x)) { setPhase('setup'); }
      else setErr(x.message || 'Failed to load users');
    }
    setBusyAll(false);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { r.replace('/login'); return; }
      try {
        const access = await adminService.getMyAccess();
        setMe(access);
        if (!access.is_admin) { setPhase('unauthorized'); return; }
        setPhase('ready');
        await loadData();
      } catch (x: any) {
        if (isSetupMissingError(x)) setPhase('setup');
        else { setErr(x.message || 'Failed to check admin access'); setPhase('unauthorized'); }
      }
    })();
  }, [r, loadData]);

  const now = useMemo(() => new Date(), [users]);
  const byStatus = useMemo(() => countByStatus(users, now), [users, now]);
  const access = useMemo(() => accessCounts(users), [users]);
  const trend = useMemo(() => registrationTrend(users, 30, now), [users, now]);
  const trendMax = Math.max(1, ...trend.map((b) => b.count));
  const engagementTotal = Math.max(1, users.length);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (q && !`${u.email || ''} ${u.full_name || ''}`.toLowerCase().includes(q)) return false;
      if (statusFilter !== 'all' && classifyActivity(u, now) !== statusFilter) return false;
      if (accessFilter === 'enabled' && !u.web_access_enabled) return false;
      if (accessFilter === 'disabled' && u.web_access_enabled) return false;
      if (registeredFilter === 'today' && !withinDays(u.registered_at, 1, now)) return false;
      if (registeredFilter === '7d' && !withinDays(u.registered_at, 7, now)) return false;
      if (registeredFilter === '30d' && !withinDays(u.registered_at, 30, now)) return false;
      if (registeredFilter === 'older' && (withinDays(u.registered_at, 30, now) || !u.registered_at)) return false;
      return true;
    });
  }, [users, search, statusFilter, accessFilter, registeredFilter, now]);

  const toggleAccess = async (u: AdminUser, enabled: boolean) => {
    if (u.is_admin) return;
    if (!enabled && !window.confirm(`Revoke web access for ${u.email}? They will no longer be able to use the web portal. Their mobile app access is not affected.`)) return;
    setBusyUserId(u.user_id); setErr('');
    try { await adminService.setAccess(u.user_id, enabled); await loadData(); }
    catch (x: any) { setErr(x.message || 'Failed to update access'); }
    setBusyUserId('');
  };

  const grantByEmail = async (enabled: boolean) => {
    const email = grantEmail.trim();
    if (!email) { setGrantErr('Enter a registered email address.'); return; }
    if (!enabled && !window.confirm(`Revoke web access for ${email}? Their mobile app access is not affected.`)) return;
    setGrantBusy(true); setGrantMsg(''); setGrantErr('');
    try {
      await adminService.setAccessByEmail(email, enabled);
      setGrantMsg(enabled ? `Web access enabled for ${email}.` : `Web access revoked for ${email}.`);
      await loadData();
    } catch (x: any) { setGrantErr(x.message || 'Failed to update access'); }
    setGrantBusy(false);
  };

  if (phase === 'loading') return <div className="authWrap card center">Loading Admin Dashboard…</div>;

  if (phase === 'setup') return (
    <div style={{ maxWidth: 760, margin: '40px auto', padding: '0 16px' }}>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Setup required</h1>
        <p>The Admin Dashboard backend has not been installed in Supabase yet, so there is no real user data to show. No fake data is displayed.</p>
        <p><strong>To activate it (one time):</strong></p>
        <ol>
          <li>Open your Supabase project (<em>pos-pro</em>) in the Supabase Dashboard.</li>
          <li>Go to <strong>SQL Editor</strong> and create a new query.</li>
          <li>Paste the entire contents of <code>supabase/ADMIN_SETUP.sql</code> from the <em>counterly-web</em> project and click <strong>Run</strong>.</li>
          <li>Come back here and refresh. If no platform admin existed yet, the earliest-registered user becomes the first admin automatically.</li>
        </ol>
        <p className="muted">This SQL only adds new tables and functions for web access control. It does not change the mobile app, its data, or its login in any way.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => window.location.reload()}>Refresh</button>
          <Link href="/" className="btn secondary" style={{ display: 'inline-block' }}>Back to portal</Link>
        </div>
      </div>
    </div>
  );

  if (phase === 'unauthorized') return (
    <div style={{ maxWidth: 640, margin: '40px auto', padding: '0 16px' }}>
      <div className="card center">
        <h1 style={{ marginTop: 0 }}>Not authorized</h1>
        <p className="muted">The Admin Dashboard is only available to platform administrators. Your account{me?.email ? <> (<strong>{me.email}</strong>)</> : null} is not a platform admin.</p>
        {err && <div className="error">{err}</div>}
        <Link href="/" className="btn" style={{ display: 'inline-block' }}>Back to portal</Link>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
      <div className="topbar">
        <div>
          <h1 style={{ margin: 0 }}>Admin Dashboard</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>User analytics &amp; web module access{me?.email ? <> · Signed in as {me.email}</> : null}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/" className="btn secondary" style={{ display: 'inline-block' }}>Back to portal</Link>
          <button className="btn" onClick={loadData} disabled={busyAll}>{busyAll ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </div>

      {err && <div className="error">{err}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Grant or revoke web access by email</h3>
        <p className="muted" style={{ marginTop: 0 }}>Enter a registered user&apos;s email address. This only affects the web portal — mobile app access is never changed.</p>
        {grantMsg && <div className="success">{grantMsg}</div>}
        {grantErr && <div className="error">{grantErr}</div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <input className="input" style={{ flex: '1 1 280px', margin: 0 }} type="email" placeholder="user@example.com" value={grantEmail} onChange={(e) => setGrantEmail(e.target.value)} />
          <button className="btn" disabled={grantBusy} onClick={() => grantByEmail(true)}>{grantBusy ? 'Working…' : 'Enable Access'}</button>
          <button className="btn danger" disabled={grantBusy} onClick={() => grantByEmail(false)}>Revoke Access</button>
        </div>
      </div>

      <div className="stats" style={{ marginBottom: 16 }}>
        <div className="card center"><div className="statNum">{users.length}</div><div className="muted">Total Registered Users</div></div>
        <div className="card center"><div className="statNum">{activeWithin(users, 1, now)}</div><div className="muted">Active Today</div></div>
        <div className="card center"><div className="statNum">{activeWithin(users, 7, now)}</div><div className="muted">Active — Last 7 Days</div></div>
        <div className="card center"><div className="statNum">{activeWithin(users, 30, now)}</div><div className="muted">Active — Last 30 Days</div></div>
        <div className="card center"><div className="statNum">{byStatus.inactive}</div><div className="muted">Inactive (&gt;30 days)</div></div>
        <div className="card center"><div className="statNum">{byStatus.never_active}</div><div className="muted">Never Active</div></div>
        <div className="card center"><div className="statNum">{access.enabled}</div><div className="muted">Web Access Enabled</div></div>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>How status is defined: <strong>Never active</strong> = registered but no login and no activity ever. <strong>Inactive</strong> = was active before, but last login/activity was more than 30 days ago. <strong>Active</strong> = last login or activity within the last 30 days. Last activity is the latest of profile activity and the user&apos;s most recent sale.</p>

      <div className="adminGrid">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Registration trend — last 30 days</h3>
          <div className="barChart" role="img" aria-label="Registrations per day for the last 30 days">
            {trend.map((b) => (
              <div key={b.date} className="barCol" title={`${b.date}: ${b.count} registration(s)`}>
                <div className="barVal">{b.count > 0 ? b.count : ''}</div>
                <div className="bar" style={{ height: `${Math.max(b.count > 0 ? 6 : 2, (b.count / trendMax) * 100)}%` }} />
                <div className="barLabel">{b.date.slice(8)}/{b.date.slice(5, 7)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Engagement — active vs inactive</h3>
          <div className="stackBar">
            <div className="stackSeg successSeg" style={{ width: `${(byStatus.active / engagementTotal) * 100}%` }} />
            <div className="stackSeg warnSeg" style={{ width: `${(byStatus.inactive / engagementTotal) * 100}%` }} />
            <div className="stackSeg greySeg" style={{ width: `${(byStatus.never_active / engagementTotal) * 100}%` }} />
          </div>
          <ul className="legend">
            <li><span className="dot successSeg" /> Active — {byStatus.active}</li>
            <li><span className="dot warnSeg" /> Inactive — {byStatus.inactive}</li>
            <li><span className="dot greySeg" /> Never active — {byStatus.never_active}</li>
            <li><span className="dot" style={{ background: 'var(--primary)' }} /> Web access enabled — {access.enabled} of {users.length}</li>
          </ul>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Registered users</h3>
        <div className="filterRow">
          <input className="input" style={{ margin: 0, flex: '1 1 220px' }} type="search" placeholder="Search by email or name…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input" style={{ margin: 0, flex: '1 1 160px' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Activity: All</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="never_active">Never active</option>
          </select>
          <select className="input" style={{ margin: 0, flex: '1 1 160px' }} value={accessFilter} onChange={(e) => setAccessFilter(e.target.value)}>
            <option value="all">Web access: All</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option>
          </select>
          <select className="input" style={{ margin: 0, flex: '1 1 180px' }} value={registeredFilter} onChange={(e) => setRegisteredFilter(e.target.value)}>
            <option value="all">Registered: All</option><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="older">Older than 30 days</option>
          </select>
        </div>
        <p className="muted">Showing {filtered.length} of {users.length} users</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>Email</th><th>Name</th><th>Registered</th><th>Last Login</th><th>Last Activity</th><th>Status</th><th>Stores</th><th>Web Access</th><th>Action</th></tr></thead>
            <tbody>
              {filtered.map((u) => {
                const s = statusLabel(u, now);
                return (
                  <tr key={u.user_id}>
                    <td>{u.email || '—'}{u.is_admin ? <> <span className="badge">Admin</span></> : null}</td>
                    <td>{u.full_name || '—'}</td>
                    <td>{fmt(u.registered_at)}</td>
                    <td>{fmt(u.last_login_at)}</td>
                    <td>{fmt(u.last_activity_at)}</td>
                    <td><span className={s.cls}>{s.text}</span></td>
                    <td>{u.stores_count}</td>
                    <td>{u.web_access_enabled ? <span className="badge success">Enabled</span> : <span className="badge grey">Disabled</span>}</td>
                    <td>
                      {u.is_admin ? <button className="btn secondary small" disabled title="Platform admins always have web access">Admin</button>
                        : u.web_access_enabled
                          ? <button className="btn danger small" disabled={busyUserId === u.user_id} onClick={() => toggleAccess(u, false)}>{busyUserId === u.user_id ? 'Working…' : 'Disable Access'}</button>
                          : <button className="btn small" disabled={busyUserId === u.user_id} onClick={() => toggleAccess(u, true)}>{busyUserId === u.user_id ? 'Working…' : 'Enable Access'}</button>}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={9} className="muted center">No users match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Web access audit log</h3>
        <p className="muted" style={{ marginTop: 0 }}>Every grant and revoke performed by an admin, latest first.</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>Time</th><th>Admin</th><th>User</th><th>Action</th></tr></thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td>{fmt(a.created_at)}</td>
                  <td>{a.performed_by_email || a.performed_by || '—'}</td>
                  <td>{a.target_email || '—'}</td>
                  <td>{a.action === 'granted' ? <span className="badge success">Granted</span> : <span className="badge danger">Revoked</span>}</td>
                </tr>
              ))}
              {audit.length === 0 && <tr><td colSpan={4} className="muted center">No access changes recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
