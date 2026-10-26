# Counterly — Web Portal

Web portal for the Counterly POS mobile app. **One backend, two frontends:** this app reuses the exact same Supabase project (`pos-pro`) as the mobile app — same users, stores, roles (owner / manager / cashier), products, sales and stock. A sale on web appears in mobile and vice versa.

## Stack
Next.js 15.5 / React 19 / TypeScript (strict, App Router), `@supabase/supabase-js` (browser client, anon key only — never `service_role`), plain CSS with Counterly tokens (primary `#0A9BD8`, navy `#0A2540`, bg `#F6F9FC`).

## Setup
```bash
cp .env.example .env.local   # fill in the values (same URL + anon key as mobile .env, renamed)
npm install
npm run dev                  # http://localhost:3000
```

Env vars (browser-safe, anon/publishable only):
- `NEXT_PUBLIC_SUPABASE_URL` — from mobile `EXPO_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from mobile `EXPO_PUBLIC_SUPABASE_ANON_KEY`

`.env.local` is gitignored and must never be committed.

## Supabase redirect URL (required for password reset)
In Supabase Dashboard → Authentication → URL Configuration, add:
- `http://localhost:3000/reset-password` (dev)
- `https://<your-production-domain>/reset-password` (once deployed)

The mobile app uses `pospro://reset-password`; the web portal uses `/reset-password` on its own origin (set dynamically in the services layer).

## Screens
- `/` redirects to `/dashboard` (signed in + store), `/create-store` (signed in, no store), or `/login`
- `/login`, `/register`, `/forgot-password`, `/reset-password`, `/create-store`
- Protected shell: sidebar + topbar + store switcher, role shown; cashiers cannot refund or adjust stock
- `/dashboard` — `get_dashboard_stats` RPC, best sellers (30d), recent sales
- `/pos` — product grid, search, category chips, barcode/SKU quick entry (USB scanner = keyboard wedge), stock-capped cart, discount, cash / card_manual / other, amount received + change, `complete_checkout` RPC with idempotency key, link to receipt
- `/products` — list with search/category/stock filters, create/edit, archive
- `/categories` — CRUD, safe remove blocked while products reference it
- `/inventory` — low/out filters, `adjust_stock` RPC with mandatory reason (owner/manager), movements table
- `/sales` — search/date/status/method filters + CSV export; `/sales/[id]` detail + refund (`process_refund` RPC, owner/manager); `/sales/[id]/receipt` printable (`window.print`)
- `/settings` — store profile, `store_settings` (currency, tax, thresholds, discount limits, receipt header/footer), profile + password

## Services
`src/services/index.ts` mirrors the mobile app's services exactly (same queries, RPC names and params): auth, products, categories, sales, inventory, dashboard, settings.

## Admin Dashboard & Web Module Access

A platform **Admin Dashboard** (`/admin`) for user analytics, plus per-user
**web module access control**: admins can grant or revoke access to *this web
portal only* for individual registered users.

### Setup (one time)

Run the one-paste SQL once in the Supabase Dashboard → **SQL Editor**:

- File: [`supabase/ADMIN_SETUP.sql`](supabase/ADMIN_SETUP.sql)
  (the same content also lives as a migration at
  `supabase/migrations/20261026000000_admin_web_access.sql`)

Until that SQL has been run, the code **fails open**: the login check is
skipped and `/admin` shows a "Setup required" card instead of fake data, so
existing web users are never locked out by the rollout itself.

### What the SQL installs

- `profiles` gains two additive columns: `email`, `last_activity_at`.
- `public.platform_admins` — platform admins. RLS enabled, **no policies**.
- `public.user_module_access` — per-user `web_access_enabled` (default
  **false**), `access_updated_at`, `access_updated_by`. RLS: a user can
  select only their own row; there are **no insert/update/delete policies**,
  so users can never change their own (or anyone's) access via the API.
- `public.web_access_audit_log` — every grant/revoke, with the admin who
  performed it. RLS enabled, no policies.
- SECURITY DEFINER RPCs (no `service_role` key is used anywhere):
  `is_platform_admin()`, `get_my_access()`, `touch_my_activity()`,
  `admin_list_users()`, `admin_set_web_access(user_id, enabled)`,
  `admin_set_web_access_by_email(email, enabled)`, `admin_audit_log(limit)`.
  The `admin_*` functions raise `Not authorized` for non-admins.
- `handle_new_user()` is replaced (same original behaviour) to also store
  the email and create the default-off access row on signup.
- Existing users are backfilled (profile emails + access rows).

### First-admin bootstrap

If `platform_admins` is **empty** when the SQL runs, the **earliest
registered user** (oldest `auth.users.created_at`) is inserted as the first
platform admin and granted web access. It only happens when no admin exists,
so re-running the SQL never adds admins by itself.

To add another admin later, run in the SQL Editor:

```sql
insert into public.platform_admins(user_id, email)
select id, email from auth.users
where lower(email) = lower('other-admin@example.com')
on conflict (user_id) do nothing;
```

Platform admins always pass the web access check.

### Enforcement model

- **Login:** after a successful Supabase sign-in the portal calls
  `get_my_access()`. Credentials valid but web access not granted (and not
  an admin) → the session is signed out and the user is sent to
  `/access-denied`, which shows: *"You need to get access from admin."*
- **Existing sessions:** the protected layout re-checks `get_my_access()`
  when access state loads, every 60 seconds, and on window focus. A revoked
  user is signed out and redirected to `/access-denied`, so a revocation
  takes effect within ~60 seconds instead of at next login.
- **Backend, not just UI:** all admin data and changes go through the
  admin-only SECURITY DEFINER RPCs and RLS above; hiding UI elements is
  never the enforcement mechanism.
- **Admin Dashboard:** `/admin` (summary cards for total / active today /
  7d / 30d / inactive / never-active / web-access-enabled users, a 30-day
  registration trend bar chart, an active-vs-inactive engagement bar,
  search + activity/access/registration filters, a users table with
  Enable/Disable Access actions, grant/revoke **by email**, and the audit
  log). Activity status: *never active* = no login and no activity ever;
  *inactive* = last login/activity more than 30 days ago; *active* = within
  30 days. Last activity is the latest of profile activity
  (`touch_my_activity`, called by the web portal) and the user's latest sale.

### Mobile independence (critical)

Nothing in this feature is read or enforced by the mobile app. The SQL does
not change any existing table's RLS, any existing RPC, or Supabase Auth
behaviour; web access is checked **only** by this web portal. Disabling a
user's web access never disables, suspends, or restricts their mobile app
access — they can keep registering, logging in, and selling on mobile
exactly as before.

### Tests

```bash
npm test   # node --test "tests/**/*.test.ts" — unit tests for src/lib/activity.ts
```

## Verify
```bash
npm test
npx tsc --noEmit
npm run build
```
