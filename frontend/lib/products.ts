import type {
  Product,
  ProductCreateInput,
  ProductUpdateInput,
  StockHealth,
  StockHealthStatus,
  Supplier,
  SupplierCreateInput,
  SupplierUpdateInput,
} from "@/types/product";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

async function productRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "Unable to connect to Hsain Agent backend. Check whether the backend is running.",
    );
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);

    throw new Error(
      body?.detail ?? `Request failed with status ${response.status}.`,
    );
  }

  return response.json() as Promise<T>;
}
// ============================================================
// SUPPLIER API
// ============================================================

export function getSuppliers(params?: { q?: string; active_only?: boolean }) {
  const query = new URLSearchParams();

  if (params?.q) {
    query.set("q", params.q);
  }

  if (params?.active_only !== undefined) {
    query.set("active_only", String(params.active_only));
  }

  const suffix = query.toString();

  return productRequest<Supplier[]>(
    `/api/suppliers/${suffix ? `?${suffix}` : ""}`,
  );
}

export function createSupplier(input: SupplierCreateInput) {
  return productRequest<Supplier>("/api/suppliers/", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateSupplier(supplierId: number, input: SupplierUpdateInput) {
  return productRequest<Supplier>(`/api/suppliers/${supplierId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
// ============================================================
// STOCK HEALTH CLASSIFICATION
// ============================================================

export function getStockHealth(product: Product): StockHealth {
  const { current_stock, minimum_stock, reorder_point, maximum_stock } =
    product;

  let status: StockHealthStatus;
  let label: string;

  if (current_stock <= 0) {
    status = "out_of_stock";
    label = "Out of Stock";
  } else if (minimum_stock !== null && current_stock <= minimum_stock) {
    status = "critical";
    label = "Critical";
  } else if (reorder_point !== null && current_stock <= reorder_point) {
    status = "low_stock";
    label = "Low Stock";
  } else if (maximum_stock !== null && current_stock > maximum_stock) {
    status = "overstocked";
    label = "Overstocked";
  } else if (
    minimum_stock === null &&
    reorder_point === null &&
    maximum_stock === null
  ) {
    status = "not_configured";
    label = "Not Configured";
  } else {
    status = "healthy";
    label = "Healthy";
  }

  const stockPercentage =
    maximum_stock !== null && maximum_stock > 0
      ? Math.min(100, Math.round((current_stock / maximum_stock) * 100))
      : null;

  return {
    status,
    label,
    current_stock,
    minimum_stock,
    reorder_point,
    maximum_stock,
    stock_percentage: stockPercentage,
  };
}

// ============================================================
// LIST PRODUCTS
// ============================================================

export function getProducts(params?: {
  q?: string;
  skip?: number;
  limit?: number;
}) {
  const query = new URLSearchParams();

  if (params?.q) {
    query.set("q", params.q);
  }

  if (params?.skip !== undefined) {
    query.set("skip", String(params.skip));
  }

  if (params?.limit !== undefined) {
    query.set("limit", String(params.limit));
  }

  const suffix = query.toString();

  return productRequest<Product[]>(
    `/api/products/${suffix ? `?${suffix}` : ""}`,
  );
}

// ============================================================
// GET PRODUCT
// ============================================================

export function getProduct(productId: number) {
  return productRequest<Product>(`/api/products/${productId}`);
}

// ============================================================
// CREATE PRODUCT
// ============================================================

export function createProduct(input: ProductCreateInput) {
  return productRequest<Product>("/api/products/", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ============================================================
// UPDATE PRODUCT
// ============================================================

export function updateProduct(productId: number, input: ProductUpdateInput) {
  return productRequest<Product>(`/api/products/${productId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
