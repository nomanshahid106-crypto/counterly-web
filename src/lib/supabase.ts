import { createClient } from '@supabase/supabase-js';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) console.warn('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY — copy .env.example to .env.local');
export const supabase = createClient(url ?? 'https://placeholder.supabase.co', anonKey ?? 'placeholder', {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
});
export function friendlyError(error: unknown): string {
  const msg = (error as { message?: string })?.message ?? 'Something went wrong';
  if (/Insufficient stock/i.test(msg)) return msg;
  if (/Discount exceeds/i.test(msg)) return 'That discount exceeds your authorized limit.';
  if (/Not a member/i.test(msg)) return 'You do not have access to this store.';
  if (/Invalid login credentials/i.test(msg)) return 'Incorrect email or password.';
  return msg;
}
export function formatMoney(n: number, currency='PKR'){ return `${currency} ${Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2})}`; }
