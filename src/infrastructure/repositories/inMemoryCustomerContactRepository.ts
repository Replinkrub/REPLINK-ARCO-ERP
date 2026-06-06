import type {
  CustomerContactCreateInput,
  CustomerContactRecord,
  CustomerContactRepository,
  CustomerContactStatus,
  CustomerContactUpdateInput,
} from '../../application/ports/customerContactRepository.js';

export interface InMemoryCustomerContactRecord {
  id: string;
  tenantId: string;
  customerId: string;
  name: string;
  roleTitle?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  isPrimary?: boolean;
  status?: CustomerContactStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export class InMemoryCustomerContactRepository implements CustomerContactRepository {
  private readonly items = new Map<string, CustomerContactRecord>();

  constructor(contacts: InMemoryCustomerContactRecord[] = []) {
    for (const contact of contacts) {
      this.save(contact);
    }
  }

  save(contact: InMemoryCustomerContactRecord): void {
    const now = new Date();
    const record: CustomerContactRecord = {
      id: contact.id,
      tenantId: contact.tenantId,
      customerId: contact.customerId,
      name: contact.name,
      roleTitle: contact.roleTitle,
      phone: contact.phone,
      whatsapp: contact.whatsapp,
      email: contact.email,
      isPrimary: contact.isPrimary ?? false,
      status: contact.status ?? 'active',
      createdAt: contact.createdAt ? new Date(contact.createdAt) : now,
      updatedAt: contact.updatedAt ? new Date(contact.updatedAt) : now,
    };
    this.items.set(key(record.tenantId, record.customerId, record.id), cloneContact(record));
  }

  async listByCustomer(input: { tenantId: string; customerId: string }): Promise<CustomerContactRecord[]> {
    return [...this.items.values()]
      .filter((contact) => contact.tenantId === input.tenantId && contact.customerId === input.customerId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map(cloneContact);
  }

  async create(input: CustomerContactCreateInput): Promise<CustomerContactRecord> {
    const now = input.now ?? new Date();
    const contact: CustomerContactRecord = {
      id: input.id,
      tenantId: input.tenantId,
      customerId: input.customerId,
      name: input.name,
      roleTitle: input.roleTitle,
      phone: input.phone,
      whatsapp: input.whatsapp,
      email: input.email,
      isPrimary: input.isPrimary,
      status: input.status,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(key(contact.tenantId, contact.customerId, contact.id), cloneContact(contact));
    if (contact.isPrimary) this.unsetSiblingPrimary(contact.tenantId, contact.customerId, contact.id, now);
    return cloneContact(contact);
  }

  async getById(input: { tenantId: string; customerId: string; contactId: string }): Promise<CustomerContactRecord | null> {
    const contact = this.items.get(key(input.tenantId, input.customerId, input.contactId));
    return contact ? cloneContact(contact) : null;
  }

  async update(input: CustomerContactUpdateInput): Promise<CustomerContactRecord | null> {
    const current = this.items.get(key(input.tenantId, input.customerId, input.contactId));
    if (!current) return null;
    const now = input.now ?? new Date();
    const updated: CustomerContactRecord = {
      ...current,
      ...input.patch,
      updatedAt: now,
    };
    this.items.set(key(updated.tenantId, updated.customerId, updated.id), cloneContact(updated));
    if (updated.isPrimary) this.unsetSiblingPrimary(updated.tenantId, updated.customerId, updated.id, now);
    return cloneContact(updated);
  }

  private unsetSiblingPrimary(tenantId: string, customerId: string, primaryId: string, now: Date): void {
    for (const [itemKey, contact] of this.items.entries()) {
      if (contact.tenantId === tenantId && contact.customerId === customerId && contact.id !== primaryId && contact.isPrimary) {
        this.items.set(itemKey, { ...contact, isPrimary: false, updatedAt: now });
      }
    }
  }
}

function key(tenantId: string, customerId: string, contactId: string): string {
  return `${tenantId}:${customerId}:${contactId}`;
}

function cloneContact(contact: CustomerContactRecord): CustomerContactRecord {
  return {
    ...contact,
    createdAt: new Date(contact.createdAt),
    updatedAt: new Date(contact.updatedAt),
  };
}
