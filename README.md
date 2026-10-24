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

## Verify
```bash
npx tsc --noEmit
npm run build
```
