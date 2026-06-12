import type {
  CustomerCommercialProfileGetInput,
  CustomerCommercialProfileRecord,
  CustomerCommercialProfileRepository,
  CustomerCommercialProfileUpsertDefaultPaymentTermInput,
  CustomerCommercialProfileUpsertDefaultPriceTableInput,
} from '../../application/ports/customerCommercialProfileRepository.js';

export interface InMemoryCustomerCommercialProfileRecord {
  tenantId: string;
  customerId: string;
  defaultPriceTableId?: string;
  defaultPaymentTermId?: string;
  creditLimit?: number;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class InMemoryCustomerCommercialProfileRepository implements CustomerCommercialProfileRepository {
  private readonly items = new Map<string, CustomerCommercialProfileRecord>();

  constructor(profiles: InMemoryCustomerCommercialProfileRecord[] = []) {
    for (const profile of profiles) this.save(profile);
  }

  save(profile: InMemoryCustomerCommercialProfileRecord): void {
    const now = new Date();
    this.items.set(key(profile.tenantId, profile.customerId), {
      ...profile,
      createdAt: profile.createdAt ? new Date(profile.createdAt) : now,
      updatedAt: profile.updatedAt ? new Date(profile.updatedAt) : now,
    });
  }

  async getByCustomer(input: CustomerCommercialProfileGetInput): Promise<CustomerCommercialProfileRecord | null> {
    const profile = this.items.get(key(input.tenantId, input.customerId));
    return profile ? cloneProfile(profile) : null;
  }

  async upsertDefaultPriceTable(input: CustomerCommercialProfileUpsertDefaultPriceTableInput): Promise<CustomerCommercialProfileRecord> {
    const now = input.now ?? new Date();
    const current = this.items.get(key(input.tenantId, input.customerId));
    const next: CustomerCommercialProfileRecord = {
      tenantId: input.tenantId,
      customerId: input.customerId,
      defaultPaymentTermId: current?.defaultPaymentTermId,
      creditLimit: current?.creditLimit,
      notes: current?.notes,
      defaultPriceTableId: input.defaultPriceTableId ?? undefined,
      createdAt: current?.createdAt ? new Date(current.createdAt) : now,
      updatedAt: now,
    };
    this.items.set(key(input.tenantId, input.customerId), cloneProfile(next));
    return cloneProfile(next);
  }

  async upsertDefaultPaymentTerm(input: CustomerCommercialProfileUpsertDefaultPaymentTermInput): Promise<CustomerCommercialProfileRecord> {
    const now = input.now ?? new Date();
    const current = this.items.get(key(input.tenantId, input.customerId));
    const next: CustomerCommercialProfileRecord = {
      tenantId: input.tenantId,
      customerId: input.customerId,
      defaultPriceTableId: current?.defaultPriceTableId,
      creditLimit: current?.creditLimit,
      notes: current?.notes,
      defaultPaymentTermId: input.defaultPaymentTermId ?? undefined,
      createdAt: current?.createdAt ? new Date(current.createdAt) : now,
      updatedAt: now,
    };
    this.items.set(key(input.tenantId, input.customerId), cloneProfile(next));
    return cloneProfile(next);
  }
}

function key(tenantId: string, customerId: string): string {
  return `${tenantId}:${customerId}`;
}

function cloneProfile(profile: CustomerCommercialProfileRecord): CustomerCommercialProfileRecord {
  return { ...profile, createdAt: new Date(profile.createdAt), updatedAt: new Date(profile.updatedAt) };
}
