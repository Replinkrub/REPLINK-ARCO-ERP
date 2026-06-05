CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE CHECK (code IN ('ADMIN', 'REPRESENTANTE', 'GESTOR_COMERCIAL')),
  status TEXT NOT NULL CHECK (status IN ('active', 'reserved', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_memberships (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_memberships_tenant_user_unique UNIQUE (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_code TEXT NOT NULL REFERENCES roles(code),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_membership_fk FOREIGN KEY (tenant_id, user_id) REFERENCES tenant_memberships(tenant_id, user_id),
  CONSTRAINT user_roles_tenant_user_role_unique UNIQUE (tenant_id, user_id, role_code)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  actor_id TEXT,
  actor_role TEXT CHECK (actor_role IS NULL OR actor_role IN ('ADMIN', 'REPRESENTANTE', 'GESTOR_COMERCIAL')),
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('allowed', 'denied', 'failed')),
  reason_code TEXT,
  reason_note TEXT,
  event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_user ON tenant_memberships (tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_tenant_user ON user_roles (tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_tenant_role ON user_roles (tenant_id, role_code);
CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_event_at ON audit_events (tenant_id, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_actor_event_at ON audit_events (tenant_id, actor_id, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_entity ON audit_events (tenant_id, entity_type, entity_id);

INSERT INTO roles (id, code, status) VALUES
  ('role-admin', 'ADMIN', 'active'),
  ('role-representante', 'REPRESENTANTE', 'active'),
  ('role-gestor-comercial', 'GESTOR_COMERCIAL', 'reserved')
ON CONFLICT (code) DO NOTHING;
