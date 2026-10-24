// Hand-maintained types mirroring supabase/migrations/*.sql.
// Regenerate with: supabase gen types typescript --linked > src/types/database.types.ts
export type Role = 'owner' | 'manager' | 'cashier';
export type PaymentMethod = 'cash' | 'card_manual' | 'other';
export type SaleStatus = 'completed' | 'refunded' | 'partially_refunded' | 'voided';

export interface Profile { id: string; full_name: string; phone: string | null; avatar_url: string | null; created_at: string; updated_at: string; }
export interface Store { id: string; name: string; address: string | null; phone: string | null; email: string | null; created_by: string; created_at: string; updated_at: string; }
export interface StoreMember { store_id: string; user_id: string; role: Role; created_at: string; }
export interface StoreSettings { store_id: string; currency: string; tax_rate: number; tax_inclusive: boolean; receipt_header: string | null; receipt_footer: string; default_low_stock_threshold: number; allow_negative_stock: boolean; max_discount_percent: number; cashier_max_discount_percent: number; updated_at: string; }
export interface Category { id: string; store_id: string; name: string; created_at: string; updated_at: string; }
export interface Product { id: string; store_id: string; category_id: string | null; name: string; sku: string | null; barcode: string | null; description: string | null; cost_price: number; selling_price: number; stock_quantity: number; low_stock_threshold: number; image_url: string | null; is_active: boolean; created_at: string; updated_at: string; }
export interface Sale { id: string; store_id: string; receipt_number: string; cashier_id: string; status: SaleStatus; subtotal: number; discount_amount: number; tax_amount: number; total: number; idempotency_key: string; created_at: string; updated_at: string; }
export interface SaleItem { id: string; sale_id: string; product_id: string | null; product_name: string; unit_price: number; quantity: number; line_total: number; refunded_quantity: number; }
export interface Payment { id: string; sale_id: string; method: PaymentMethod; status: string; amount: number; amount_received: number | null; change_due: number | null; external_reference: string | null; created_at: string; }
export interface InventoryMovement { id: string; store_id: string; product_id: string; type: string; quantity_change: number; stock_after: number; reason: string | null; reference_id: string | null; created_by: string | null; created_at: string; }

type Row<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] };
export interface Database {
  public: {
    Tables: {
      profiles: Row<Profile>; stores: Row<Store>; store_members: Row<StoreMember>;
      store_settings: Row<StoreSettings>; categories: Row<Category>; products: Row<Product>;
      sales: Row<Sale>; sale_items: Row<SaleItem>; payments: Row<Payment>;
      inventory_movements: Row<InventoryMovement>; refunds: Row<Record<string, unknown>>; refund_items: Row<Record<string, unknown>>;
    };
    Views: Record<string, never>;
    Functions: {
      complete_checkout: { Args: Record<string, unknown>; Returns: Record<string, unknown> };
      process_refund: { Args: Record<string, unknown>; Returns: Record<string, unknown> };
      adjust_stock: { Args: Record<string, unknown>; Returns: number };
      create_store: { Args: Record<string, unknown>; Returns: string };
      get_dashboard_stats: { Args: Record<string, unknown>; Returns: Record<string, unknown> };
    };
    Enums: { member_role: Role; payment_method: PaymentMethod; sale_status: SaleStatus };
    CompositeTypes: Record<string, never>;
  };
}
