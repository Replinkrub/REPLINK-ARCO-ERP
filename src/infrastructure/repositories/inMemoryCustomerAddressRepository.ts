import type {
  CustomerAddressCreateInput,
  CustomerAddressRecord,
  CustomerAddressRepository,
  CustomerAddressStatus,
  CustomerAddressType,
  CustomerAddressUpdateInput,
} from '../../application/ports/customerAddressRepository.js';

export interface InMemoryCustomerAddressRecord {
  id: string;
  tenantId: string;
  customerId: string;
  addressType?: CustomerAddressType;
  zipcode?: string;
  street: string;
  number?: string;
  complement?: string;
  district?: string;
  city: string;
  state: string;
  country?: string;
  isPrimary?: boolean;
  status?: CustomerAddressStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export class InMemoryCustomerAddressRepository implements CustomerAddressRepository {
  private readonly items = new Map<string, CustomerAddressRecord>();

  constructor(addresses: InMemoryCustomerAddressRecord[] = []) {
    for (const address of addresses) {
      this.save(address);
    }
  }

  save(address: InMemoryCustomerAddressRecord): void {
    const now = new Date();
    const record: CustomerAddressRecord = {
      id: address.id,
      tenantId: address.tenantId,
      customerId: address.customerId,
      addressType: address.addressType ?? 'main',
      zipcode: address.zipcode,
      street: address.street,
      number: address.number,
      complement: address.complement,
      district: address.district,
      city: address.city,
      state: address.state,
      country: address.country ?? 'BR',
      isPrimary: address.isPrimary ?? false,
      status: address.status ?? 'active',
      createdAt: address.createdAt ? new Date(address.createdAt) : now,
      updatedAt: address.updatedAt ? new Date(address.updatedAt) : now,
    };
    this.items.set(key(record.tenantId, record.customerId, record.id), cloneAddress(record));
  }

  async listByCustomer(input: { tenantId: string; customerId: string }): Promise<CustomerAddressRecord[]> {
    return [...this.items.values()]
      .filter((address) => address.tenantId === input.tenantId && address.customerId === input.customerId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map(cloneAddress);
  }

  async create(input: CustomerAddressCreateInput): Promise<CustomerAddressRecord> {
    const now = input.now ?? new Date();
    const address: CustomerAddressRecord = {
      id: input.id,
      tenantId: input.tenantId,
      customerId: input.customerId,
      addressType: input.addressType,
      zipcode: input.zipcode,
      street: input.street,
      number: input.number,
      complement: input.complement,
      district: input.district,
      city: input.city,
      state: input.state,
      country: input.country,
      isPrimary: input.isPrimary,
      status: input.status,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(key(address.tenantId, address.customerId, address.id), cloneAddress(address));
    if (address.isPrimary) this.unsetSiblingPrimary(address.tenantId, address.customerId, address.id, now);
    return cloneAddress(address);
  }

  async getById(input: { tenantId: string; customerId: string; addressId: string }): Promise<CustomerAddressRecord | null> {
    const address = this.items.get(key(input.tenantId, input.customerId, input.addressId));
    return address ? cloneAddress(address) : null;
  }

  async update(input: CustomerAddressUpdateInput): Promise<CustomerAddressRecord | null> {
    const current = this.items.get(key(input.tenantId, input.customerId, input.addressId));
    if (!current) return null;
    const now = input.now ?? new Date();
    const updated: CustomerAddressRecord = {
      ...current,
      ...input.patch,
      updatedAt: now,
    };
    this.items.set(key(updated.tenantId, updated.customerId, updated.id), cloneAddress(updated));
    if (updated.isPrimary) this.unsetSiblingPrimary(updated.tenantId, updated.customerId, updated.id, now);
    return cloneAddress(updated);
  }

  private unsetSiblingPrimary(tenantId: string, customerId: string, primaryId: string, now: Date): void {
    for (const [itemKey, address] of this.items.entries()) {
      if (address.tenantId === tenantId && address.customerId === customerId && address.id !== primaryId && address.isPrimary) {
        this.items.set(itemKey, { ...address, isPrimary: false, updatedAt: now });
      }
    }
  }
}

function key(tenantId: string, customerId: string, addressId: string): string {
  return `${tenantId}:${customerId}:${addressId}`;
}

function cloneAddress(address: CustomerAddressRecord): CustomerAddressRecord {
  return {
    ...address,
    createdAt: new Date(address.createdAt),
    updatedAt: new Date(address.updatedAt),
  };
}
