import { supabase, friendlyError } from '@/lib/supabase';
import type { Category, PaymentMethod, Product, StoreSettings } from '@/types/database.types';

// Accepts any Supabase response shape ({data, error}); callers cast to domain types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function unwrap<T = any>(p: PromiseLike<any>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(friendlyError(error));
  return data as T;
}

export const authService = {
  signIn: (email: string, password: string) => unwrap(supabase.auth.signInWithPassword({ email, password })),
  signUp: (email: string, password: string, fullName: string) =>
    unwrap(supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } })),
  signOut: () => supabase.auth.signOut(),
  resetPassword: (email: string) => unwrap(supabase.auth.resetPasswordForEmail(email, { redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined })),
  updatePassword: (password: string) => unwrap(supabase.auth.updateUser({ password })),
  myStores: () => unwrap(supabase.from('store_members').select('*, stores(*)').order('created_at')),
  createStore: (input: { name: string; address?: string; phone?: string; email?: string }) =>
    unwrap(supabase.rpc('create_store', { p_name: input.name, p_address: input.address ?? null, p_phone: input.phone ?? null, p_email: input.email ?? null })),
  updateProfile: (id: string, patch: { full_name?: string; phone?: string }) => unwrap(supabase.from('profiles').update(patch).eq('id', id)),
  myProfile: (id: string) => unwrap(supabase.from('profiles').select('*').eq('id', id).single()),
};

export const productService = {
  list: async (storeId: string, opts: { search?: string; categoryId?: string | null; stock?: 'all' | 'low' | 'out'; activeOnly?: boolean } = {}) => {
    let q = supabase.from('products').select('*').eq('store_id', storeId).order('name');
    if (opts.activeOnly !== false) q = q.eq('is_active', true);
    if (opts.categoryId) q = q.eq('category_id', opts.categoryId);
    if (opts.search) q = q.or(`name.ilike.%${opts.search}%,sku.ilike.%${opts.search}%,barcode.ilike.%${opts.search}%`);
    const rows = await unwrap(q) as unknown as Product[];
    if (opts.stock === 'low') return rows.filter((r) => r.stock_quantity > 0 && r.stock_quantity <= r.low_stock_threshold);
    if (opts.stock === 'out') return rows.filter((r) => r.stock_quantity <= 0);
    return rows;
  },
  get: (id: string) => unwrap(supabase.from('products').select('*').eq('id', id).single()),
  create: (row: Partial<Product>) => unwrap(supabase.from('products').insert(row as Product).select().single()),
  update: (id: string, row: Partial<Product>) => unwrap(supabase.from('products').update(row).eq('id', id).select().single()),
  archive: (id: string) => unwrap(supabase.from('products').update({ is_active: false }).eq('id', id)),
  findByBarcode: (storeId: string, barcode: string) => unwrap(supabase.from('products').select('*').eq('store_id', storeId).eq('barcode', barcode).eq('is_active', true).maybeSingle()),
  uploadImage: async (storeId: string, productId: string, uri: string) => {
    const res = await fetch(uri); const blob = await res.blob();
    const path = `${storeId}/${productId}.jpg`;
    const { error } = await supabase.storage.from('product-images').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
    if (error) throw new Error(friendlyError(error));
    return path;
  },
};

export const categoryService = {
  list: (storeId: string) => unwrap(supabase.from('categories').select('*').eq('store_id', storeId).order('name')) as Promise<Category[]>,
  create: (storeId: string, name: string) => unwrap(supabase.from('categories').insert({ store_id: storeId, name }).select().single()),
  update: (id: string, name: string) => unwrap(supabase.from('categories').update({ name }).eq('id', id)),
  /** Safe delete: refuses while products reference the category (also enforced by FK ON DELETE SET NULL choice — we chose explicit check). */
  remove: async (id: string) => {
    const { count } = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('category_id', id);
    if (count && count > 0) throw new Error(`Category still has ${count} product(s). Move or archive them first, or keep the category.`);
    return unwrap(supabase.from('categories').delete().eq('id', id));
  },
};

export interface CheckoutInput {
  storeId: string; idempotencyKey: string;
  items: { product_id: string; quantity: number }[];
  discountAmount: number; paymentMethod: PaymentMethod;
  amountReceived?: number | null; externalReference?: string | null;
}
export const salesService = {
  /** ONE rpc call = one DB transaction. Never split this into client-side inserts. */
  checkout: (input: CheckoutInput) => unwrap(supabase.rpc('complete_checkout', {
    p_store_id: input.storeId, p_idempotency_key: input.idempotencyKey, p_items: input.items,
    p_discount_amount: input.discountAmount, p_payment_method: input.paymentMethod,
    p_amount_received: input.amountReceived ?? null, p_external_reference: input.externalReference ?? null,
  })),
  list: async (storeId: string, filters: { search?: string; from?: string; to?: string; cashierId?: string; method?: string; status?: string } = {}) => {
    let q = supabase.from('sales').select('*, payments(*), sale_items(product_name, quantity)').eq('store_id', storeId).order('created_at', { ascending: false }).limit(200);
    if (filters.search) q = q.ilike('receipt_number', `%${filters.search}%`);
    if (filters.from) q = q.gte('created_at', filters.from);
    if (filters.to) q = q.lte('created_at', filters.to);
    if (filters.cashierId) q = q.eq('cashier_id', filters.cashierId);
    if (filters.status) q = q.eq('status', filters.status as never);
    const rows = await unwrap(q) as unknown as Record<string, unknown>[];
    return filters.method ? rows.filter((r) => JSON.stringify(r.payments ?? '').includes(filters.method!)) : rows;
  },
  detail: async (saleId: string) => {
    const sale = await unwrap(supabase.from('sales').select('*, payments(*), sale_items(*)').eq('id', saleId).single());
    return sale as unknown as Record<string, unknown> & { sale_items: unknown[]; payments: unknown[] };
  },
  refund: (saleId: string, items: { sale_item_id: string; quantity: number }[], reason?: string) =>
    unwrap(supabase.rpc('process_refund', { p_sale_id: saleId, p_items: items, p_reason: reason ?? null })),
  bestSellers: async (storeId: string, days = 30) => {
    const since = new Date(Date.now() - days * 864e5).toISOString();
    const sales = await unwrap(supabase.from('sales').select('id').eq('store_id', storeId).gte('created_at', since)) as unknown as { id: string }[];
    if (!sales.length) return [] as { name: string; qty: number }[];
    const items = await unwrap(supabase.from('sale_items').select('product_name, quantity').in('sale_id', sales.map((s) => s.id))) as unknown as { product_name: string; quantity: number }[];
    const agg = new Map<string, number>();
    items.forEach((i) => agg.set(i.product_name, (agg.get(i.product_name) ?? 0) + i.quantity));
    return [...agg.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 5);
  },
};

export const inventoryService = {
  adjust: (productId: string, change: number, reason: string, type: 'stock_in' | 'adjustment' | 'initial' = 'adjustment') =>
    unwrap(supabase.rpc('adjust_stock', { p_product_id: productId, p_change: change, p_reason: reason, p_type: type })),
  movements: (storeId: string, productId?: string) => {
    let q = supabase.from('inventory_movements').select('*, products(name)').eq('store_id', storeId).order('created_at', { ascending: false }).limit(200);
    if (productId) q = q.eq('product_id', productId);
    return unwrap(q);
  },
};

export const dashboardService = {
  stats: (storeId: string) => unwrap(supabase.rpc('get_dashboard_stats', { p_store_id: storeId })),
  recentSales: (storeId: string, limit = 8) => unwrap(supabase.from('sales').select('*').eq('store_id', storeId).order('created_at', { ascending: false }).limit(limit)),
};

export const settingsService = {
  get: (storeId: string) => unwrap(supabase.from('store_settings').select('*').eq('store_id', storeId).single()) as Promise<StoreSettings>,
  update: (storeId: string, patch: Partial<StoreSettings>) => unwrap(supabase.from('store_settings').update(patch).eq('store_id', storeId)),
  updateStore: (storeId: string, patch: { name?: string; address?: string; phone?: string; email?: string }) => unwrap(supabase.from('stores').update(patch).eq('id', storeId)),
  getStore: (storeId: string) => unwrap(supabase.from('stores').select('*').eq('id', storeId).single()),
};
export const newIdempotencyKey = () => `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
