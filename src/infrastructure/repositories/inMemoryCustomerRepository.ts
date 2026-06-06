import type {
  CustomerCreateInput,
  CustomerListInput,
  CustomerListResult,
  CustomerRecord,
  CustomerRepository,
  CustomerStatus,
  CustomerUpdateInput,
  CustomerVisibilityScope,
} from '../../application/ports/customerRepository.js';

export interface InMemoryCustomerRecord {
  id: string;
  tenantId: string;
  status: CustomerStatus;
  legalName?: string;
  tradeName?: string;
  documentType?: string;
  documentNumber?: string;
  segment?: string;
  notes?: string;
  ownerId?: string;
  representativeId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class InMemoryCustomerRepository implements CustomerRepository {
  private readonly items = new Map<string, CustomerRecord>();

  constructor(customers: InMemoryCustomerRecord[] = []) {
    for (const customer of customers) {
      this.save(customer);
    }
  }

  save(customer: InMemoryCustomerRecord): void {
    const now = new Date();
    this.items.set(key(customer.tenantId, customer.id), {
      id: customer.id,
      tenantId: customer.tenantId,
      legalName: customer.legalName ?? customer.id,
      tradeName: customer.tradeName,
      documentType: customer.documentType ?? 'document',
      documentNumber: customer.documentNumber ?? customer.id,
      status: customer.status,
      segment: customer.segment,
      notes: customer.notes,
      ownerId: customer.ownerId,
      representativeId: customer.representativeId,
      createdAt: customer.createdAt ? new Date(customer.createdAt) : now,
      updatedAt: customer.updatedAt ? new Date(customer.updatedAt) : now,
    });
  }

  async findStatusByTenantAndId(input: { tenantId: string; customerId: string }): Promise<CustomerStatus | null> {
    return this.items.get(key(input.tenantId, input.customerId))?.status ?? null;
  }

  async list(input: CustomerListInput): Promise<CustomerListResult> {
    const visible = [...this.items.values()]
      .filter((customer) => isVisible(customer, input))
      .filter((customer) => !input.q || customer.legalName.toLowerCase().includes(input.q.toLowerCase()) || customer.documentNumber.toLowerCase().includes(input.q.toLowerCase()))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const start = (input.page - 1) * input.pageSize;
    return {
      items: visible.slice(start, start + input.pageSize).map(cloneCustomer),
      page: input.page,
      pageSize: input.pageSize,
      total: visible.length,
    };
  }

  async getById(input: CustomerVisibilityScope & { customerId: string }): Promise<CustomerRecord | null> {
    const customer = this.items.get(key(input.tenantId, input.customerId));
    return customer && isVisible(customer, input) ? cloneCustomer(customer) : null;
  }

  async create(input: CustomerCreateInput): Promise<CustomerRecord> {
    const duplicate = [...this.items.values()].find((customer) => customer.tenantId === input.tenantId && customer.documentType === input.documentType && customer.documentNumber === input.documentNumber);
    if (duplicate) {
      const error = new Error('duplicate customer document') as Error & { code?: string };
      error.code = '23505';
      throw error;
    }
    const now = input.now ?? new Date();
    const customer: CustomerRecord = {
      id: input.id,
      tenantId: input.tenantId,
      legalName: input.legalName,
      tradeName: input.tradeName,
      documentType: input.documentType,
      documentNumber: input.documentNumber,
      status: input.status,
      segment: input.segment,
      notes: input.notes,
      ownerId: input.ownerId,
      representativeId: input.representativeId,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(key(customer.tenantId, customer.id), cloneCustomer(customer));
    return cloneCustomer(customer);
  }

  async update(input: CustomerUpdateInput): Promise<CustomerRecord | null> {
    const customer = this.items.get(key(input.tenantId, input.customerId));
    if (!customer || !isVisible(customer, input)) return null;
    const nextDocumentType = input.patch.documentType ?? customer.documentType;
    const nextDocumentNumber = input.patch.documentNumber ?? customer.documentNumber;
    const duplicate = [...this.items.values()].find((candidate) => candidate.tenantId === input.tenantId && candidate.id !== customer.id && candidate.documentType === nextDocumentType && candidate.documentNumber === nextDocumentNumber);
    if (duplicate) {
      const error = new Error('duplicate customer document') as Error & { code?: string };
      error.code = '23505';
      throw error;
    }
    const updated: CustomerRecord = {
      ...customer,
      ...input.patch,
      updatedAt: input.now ?? new Date(),
    };
    this.items.set(key(updated.tenantId, updated.id), cloneCustomer(updated));
    return cloneCustomer(updated);
  }
}

function key(tenantId: string, customerId: string): string {
  return `${tenantId}:${customerId}`;
}

function isVisible(customer: CustomerRecord, scope: CustomerVisibilityScope): boolean {
  if (customer.tenantId !== scope.tenantId) return false;
  if (scope.role === 'ADMIN') return true;
  return customer.ownerId === scope.actorId || customer.representativeId === scope.actorId;
}

function cloneCustomer(customer: CustomerRecord): CustomerRecord {
  return {
    ...customer,
    createdAt: new Date(customer.createdAt),
    updatedAt: new Date(customer.updatedAt),
  };
}
