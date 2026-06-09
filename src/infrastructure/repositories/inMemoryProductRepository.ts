import type {
  ProductCreateInput,
  ProductListInput,
  ProductListResult,
  ProductRecord,
  ProductRepository,
  ProductStatus,
  ProductUpdateInput,
  ProductVisibilityScope,
} from '../../application/ports/productRepository.js';

export interface InMemoryProductRecord {
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
  status?: ProductStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export class InMemoryProductRepository implements ProductRepository {
  private readonly items = new Map<string, ProductRecord>();

  constructor(products: InMemoryProductRecord[] = []) {
    for (const product of products) this.save(product);
  }

  save(product: InMemoryProductRecord): void {
    const now = new Date();
    this.items.set(key(product.tenantId, product.id), {
      ...product,
      status: product.status ?? 'active',
      createdAt: product.createdAt ? new Date(product.createdAt) : now,
      updatedAt: product.updatedAt ? new Date(product.updatedAt) : now,
    });
  }

  async list(input: ProductListInput): Promise<ProductListResult> {
    const visible = [...this.items.values()]
      .filter((product) => isVisible(product, input))
      .filter((product) => !input.q || product.name.toLowerCase().includes(input.q.toLowerCase()) || product.sku.toLowerCase().includes(input.q.toLowerCase()))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const start = (input.page - 1) * input.pageSize;
    return { items: visible.slice(start, start + input.pageSize).map(cloneProduct), page: input.page, pageSize: input.pageSize, total: visible.length };
  }

  async getById(input: ProductVisibilityScope & { productId: string }): Promise<ProductRecord | null> {
    const product = this.items.get(key(input.tenantId, input.productId));
    return product && isVisible(product, input) ? cloneProduct(product) : null;
  }

  async create(input: ProductCreateInput): Promise<ProductRecord> {
    if (this.hasDuplicateSku(input.tenantId, input.sku, input.representedCompanyId)) throw uniqueViolation();
    const now = input.now ?? new Date();
    const product: ProductRecord = { ...input, createdAt: now, updatedAt: now };
    this.items.set(key(product.tenantId, product.id), cloneProduct(product));
    return cloneProduct(product);
  }

  async update(input: ProductUpdateInput): Promise<ProductRecord | null> {
    const current = this.items.get(key(input.tenantId, input.productId));
    if (!current || !isVisible(current, input)) return null;
    const next = { ...current, ...input.patch, updatedAt: input.now ?? new Date() };
    if (this.hasDuplicateSku(next.tenantId, next.sku, next.representedCompanyId, current.id)) throw uniqueViolation();
    this.items.set(key(next.tenantId, next.id), cloneProduct(next));
    return cloneProduct(next);
  }

  private hasDuplicateSku(tenantId: string, sku: string, representedCompanyId?: string, ignoreId?: string): boolean {
    return [...this.items.values()].some((product) => product.tenantId === tenantId
      && product.id !== ignoreId
      && product.sku === sku
      && product.representedCompanyId === representedCompanyId);
  }
}

function key(tenantId: string, productId: string): string {
  return `${tenantId}:${productId}`;
}

function isVisible(product: ProductRecord, scope: ProductVisibilityScope): boolean {
  return product.tenantId === scope.tenantId;
}

function cloneProduct(product: ProductRecord): ProductRecord {
  return { ...product, createdAt: new Date(product.createdAt), updatedAt: new Date(product.updatedAt) };
}

function uniqueViolation(): Error & { code?: string } {
  const error = new Error('duplicate product sku') as Error & { code?: string };
  error.code = '23505';
  return error;
}
