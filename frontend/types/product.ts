export type Supplier = {
  id: number;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  is_active: boolean;
  created_at: string;
};

export type Product = {
  id: number;
  name: string;
  sku: string | null;
  current_stock: number;

  minimum_stock: number | null;
  reorder_point: number | null;
  maximum_stock: number | null;

  lead_time_days: number | null;
  safety_buffer_days: number | null;
  preferred_supplier_id: number | null;
  preferred_supplier: Supplier | null;
  created_at?: string;
};

export type ProductCreateInput = {
  name: string;
  sku: string | null;

  minimum_stock?: number | null;
  reorder_point?: number | null;
  maximum_stock?: number | null;

  lead_time_days?: number | null;
  safety_buffer_days?: number | null;
  preferred_supplier_id?: number | null;
};

export type ProductUpdateInput = Partial<ProductCreateInput>;

export type StockHealthStatus =
  | "out_of_stock"
  | "critical"
  | "low_stock"
  | "healthy"
  | "overstocked"
  | "not_configured";

export type StockHealth = {
  status: StockHealthStatus;
  label: string;
  current_stock: number;
  minimum_stock: number | null;
  reorder_point: number | null;
  maximum_stock: number | null;
  stock_percentage: number | null;
};

export type SupplierCreateInput = {
  name: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

export type SupplierUpdateInput = Partial<
  SupplierCreateInput & { is_active: boolean }
>;
