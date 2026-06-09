export type ProductStatus = 'active' | 'inactive';

export interface ProductRecord {
  id: string;
  tenantId: string;
  representedCompanyId?: string;
  sku: string;
  name: string;
  description?: string;
  commercialName?: string;
  barcode?: string;
  brand?: string;
  categoryId?: string;
  unitId?: string;
  packageInfo?: string;
  minimumOrderQuantity?: number;
  multipleOrderQuantity?: number;
  grossWeight?: number;
  netWeight?: number;
  dimensions?: string;
  availabilityStatus?: string;
  status: ProductStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductVisibilityScope {
  tenantId: string;
  actorId: string;
  role: 'ADMIN' | 'REPRESENTANTE';
}

export interface ProductListInput extends ProductVisibilityScope {
  page: number;
  pageSize: number;
  q?: string;
}

export interface ProductListResult {
  items: ProductRecord[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ProductCreateInput {
  id: string;
  tenantId: string;
  representedCompanyId?: string;
  sku: string;
  name: string;
  description?: string;
  commercialName?: string;
  barcode?: string;
  brand?: string;
  categoryId?: string;
  unitId?: string;
  packageInfo?: string;
  minimumOrderQuantity?: number;
  multipleOrderQuantity?: number;
  grossWeight?: number;
  netWeight?: number;
  dimensions?: string;
  availabilityStatus?: string;
  status: ProductStatus;
  now?: Date;
}

export interface ProductUpdateInput extends ProductVisibilityScope {
  productId: string;
  patch: Partial<Omit<ProductRecord, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>;
  now?: Date;
}

export interface ProductRepository {
  list(input: ProductListInput): Promise<ProductListResult>;
  getById(input: ProductVisibilityScope & { productId: string }): Promise<ProductRecord | null>;
  create(input: ProductCreateInput): Promise<ProductRecord>;
  update(input: ProductUpdateInput): Promise<ProductRecord | null>;
}
