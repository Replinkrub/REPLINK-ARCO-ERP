import type {
  CustomerRepresentedCommercialProfileGetInput,
  CustomerRepresentedCommercialProfileRecord,
  CustomerRepresentedCommercialProfileRepository,
  CustomerRepresentedCommercialProfileUpsertInput,
} from '../../application/ports/customerRepresentedCommercialProfileRepository.js';

export interface InMemoryCustomerRepresentedCommercialProfileRecord {
  tenantId: string;
  customerId: string;
  representedCompanyId: string;
  defaultPriceTableId?: string;
  defaultPaymentTermId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class InMemoryCustomerRepresentedCommercialProfileRepository implements CustomerRepresentedCommercialProfileRepository {
  private readonly items = new Map<string, CustomerRepresentedCommercialProfileRecord>();

  constructor(profiles: InMemoryCustomerRepresentedCommercialProfileRecord[] = []) {
    for (const profile of profiles) this.save(profile);
  }

  save(profile: InMemoryCustomerRepresentedCommercialProfileRecord): void {
    const now = new Date();
    this.items.set(key(profile.tenantId, profile.customerId, profile.representedCompanyId), {
      ...profile,
      createdAt: profile.createdAt ? new Date(profile.createdAt) : now,
      updatedAt: profile.updatedAt ? new Date(profile.updatedAt) : now,
    });
  }

  async getByCustomerAndRepresented(input: CustomerRepresentedCommercialProfileGetInput): Promise<CustomerRepresentedCommercialProfileRecord | null> {
    const profile = this.items.get(key(input.tenantId, input.customerId, input.representedCompanyId));
    return profile ? cloneProfile(profile) : null;
  }

  async upsertDefaults(input: CustomerRepresentedCommercialProfileUpsertInput): Promise<CustomerRepresentedCommercialProfileRecord> {
    const now = input.now ?? new Date();
    const current = this.items.get(key(input.tenantId, input.customerId, input.representedCompanyId));
    const next: CustomerRepresentedCommercialProfileRecord = {
      tenantId: input.tenantId,
      customerId: input.customerId,
      representedCompanyId: input.representedCompanyId,
      defaultPriceTableId: input.defaultPriceTableId === undefined ? current?.defaultPriceTableId : input.defaultPriceTableId ?? undefined,
      defaultPaymentTermId: input.defaultPaymentTermId === undefined ? current?.defaultPaymentTermId : input.defaultPaymentTermId ?? undefined,
      createdAt: current?.createdAt ? new Date(current.createdAt) : now,
      updatedAt: now,
    };
    this.items.set(key(input.tenantId, input.customerId, input.representedCompanyId), cloneProfile(next));
    return cloneProfile(next);
  }
}

function key(tenantId: string, customerId: string, representedCompanyId: string): string {
  return `${tenantId}:${customerId}:${representedCompanyId}`;
}

function cloneProfile(profile: CustomerRepresentedCommercialProfileRecord): CustomerRepresentedCommercialProfileRecord {
  return { ...profile, createdAt: new Date(profile.createdAt), updatedAt: new Date(profile.updatedAt) };
}
