import type { QueryResultRow } from 'pg';
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
import type { SqlExecutor } from './postgresClient.js';

interface ProductRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  represented_company_id: string | null;
  sku: string;
  name: string;
  description: string | null;
  commercial_name: string | null;
  barcode: string | null;
  brand: string | null;
  category_id: string | null;
  unit_id: string | null;
  package_info: string | null;
  minimum_order_quantity: string | null;
  multiple_order_quantity: string | null;
  gross_weight: string | null;
  net_weight: string | null;
  dimensions: string | null;
  availability_status: string | null;
  status: ProductStatus;
  created_at: Date;
  updated_at: Date;
  total_count?: string;
}

export class PostgresProductRepository implements ProductRepository {
  constructor(private readonly db: SqlExecutor) {}

  async list(input: ProductListInput): Promise<ProductListResult> {
    const values: unknown[] = [input.tenantId];
    let searchSql = '';
    if (input.q) {
      values.push(`%${input.q}%`);
      searchSql = ` AND (name ILIKE $${values.length} OR sku ILIKE $${values.length})`;
    }
    values.push(input.pageSize, (input.page - 1) * input.pageSize);
    const limitIndex = values.length - 1;
    const offsetIndex = values.length;
    const result = await this.db.query<ProductRow>(
      `SELECT ${selectColumns()}, COUNT(*) OVER()::text AS total_count
       FROM products
       WHERE tenant_id = $1${searchSql}
       ORDER BY updated_at DESC, id ASC
       LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      values
    );
    return { items: result.rows.map(rowToProduct), page: input.page, pageSize: input.pageSize, total: Number(result.rows[0]?.total_count ?? 0) };
  }

  async getById(input: ProductVisibilityScope & { productId: string }): Promise<ProductRecord | null> {
    const result = await this.db.query<ProductRow>(
      `SELECT ${selectColumns()} FROM products WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [input.tenantId, input.productId]
    );
    return result.rows[0] ? rowToProduct(result.rows[0]) : null;
  }

  async create(input: ProductCreateInput): Promise<ProductRecord> {
    const now = input.now ?? new Date();
    const result = await this.db.query<ProductRow>(
      `INSERT INTO products (
        id, tenant_id, represented_company_id, sku, name, description, commercial_name, barcode, brand,
        category_id, unit_id, package_info, minimum_order_quantity, multiple_order_quantity, gross_weight,
        net_weight, dimensions, availability_status, status, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $20
      ) RETURNING ${selectColumns()}`,
      [
        input.id,
        input.tenantId,
        input.representedCompanyId ?? null,
        input.sku,
        input.name,
        input.description ?? null,
        input.commercialName ?? null,
        input.barcode ?? null,
        input.brand ?? null,
        input.categoryId ?? null,
        input.unitId ?? null,
        input.packageInfo ?? null,
        input.minimumOrderQuantity ?? null,
        input.multipleOrderQuantity ?? null,
        input.grossWeight ?? null,
        input.netWeight ?? null,
        input.dimensions ?? null,
        input.availabilityStatus ?? null,
        input.status,
        now,
      ]
    );
    return rowToProduct(result.rows[0]);
  }

  async update(input: ProductUpdateInput): Promise<ProductRecord | null> {
    const current = await this.getById({ tenantId: input.tenantId, actorId: input.actorId, role: input.role, productId: input.productId });
    if (!current) return null;
    const now = input.now ?? new Date();
    const result = await this.db.query<ProductRow>(
      `UPDATE products SET
        represented_company_id = $3,
        sku = $4,
        name = $5,
        description = $6,
        commercial_name = $7,
        barcode = $8,
        brand = $9,
        category_id = $10,
        unit_id = $11,
        package_info = $12,
        minimum_order_quantity = $13,
        multiple_order_quantity = $14,
        gross_weight = $15,
        net_weight = $16,
        dimensions = $17,
        availability_status = $18,
        status = $19,
        updated_at = $20
       WHERE tenant_id = $1 AND id = $2
       RETURNING ${selectColumns()}`,
      [
        input.tenantId,
        input.productId,
        input.patch.representedCompanyId ?? current.representedCompanyId ?? null,
        input.patch.sku ?? current.sku,
        input.patch.name ?? current.name,
        input.patch.description ?? current.description ?? null,
        input.patch.commercialName ?? current.commercialName ?? null,
        input.patch.barcode ?? current.barcode ?? null,
        input.patch.brand ?? current.brand ?? null,
        input.patch.categoryId ?? current.categoryId ?? null,
        input.patch.unitId ?? current.unitId ?? null,
        input.patch.packageInfo ?? current.packageInfo ?? null,
        input.patch.minimumOrderQuantity ?? current.minimumOrderQuantity ?? null,
        input.patch.multipleOrderQuantity ?? current.multipleOrderQuantity ?? null,
        input.patch.grossWeight ?? current.grossWeight ?? null,
        input.patch.netWeight ?? current.netWeight ?? null,
        input.patch.dimensions ?? current.dimensions ?? null,
        input.patch.availabilityStatus ?? current.availabilityStatus ?? null,
        input.patch.status ?? current.status,
        now,
      ]
    );
    return result.rows[0] ? rowToProduct(result.rows[0]) : null;
  }
}

function selectColumns(): string {
  return `id, tenant_id, represented_company_id, sku, name, description, commercial_name, barcode, brand, category_id, unit_id, package_info, minimum_order_quantity, multiple_order_quantity, gross_weight, net_weight, dimensions, availability_status, status, created_at, updated_at`;
}

function rowToProduct(row: ProductRow): ProductRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    representedCompanyId: row.represented_company_id ?? undefined,
    sku: row.sku,
    name: row.name,
    description: row.description ?? undefined,
    commercialName: row.commercial_name ?? undefined,
    barcode: row.barcode ?? undefined,
    brand: row.brand ?? undefined,
    categoryId: row.category_id ?? undefined,
    unitId: row.unit_id ?? undefined,
    packageInfo: row.package_info ?? undefined,
    minimumOrderQuantity: row.minimum_order_quantity === null ? undefined : Number(row.minimum_order_quantity),
    multipleOrderQuantity: row.multiple_order_quantity === null ? undefined : Number(row.multiple_order_quantity),
    grossWeight: row.gross_weight === null ? undefined : Number(row.gross_weight),
    netWeight: row.net_weight === null ? undefined : Number(row.net_weight),
    dimensions: row.dimensions ?? undefined,
    availabilityStatus: row.availability_status ?? undefined,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
