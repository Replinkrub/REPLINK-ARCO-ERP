# Session Handoff — Gate H PR7B

Data: 2026-06-06
Branch: `feat/gate-h-pr7b-customer-contacts-addresses-api`
Status: **mergeado em `main`**

## 1) PR integrado

- PR #44 — `Gate H PR7B — Customer Contacts + Addresses API`
- Merge commit: `abe113c`
- Commit técnico: `044a47b feat(erp): add customer contacts addresses api`

## 2) Escopo entregue

Customer Contacts + Addresses API foundation:

- `GET /v1/customers/{customerId}/contacts`;
- `POST /v1/customers/{customerId}/contacts`;
- `PATCH /v1/customers/{customerId}/contacts/{contactId}`;
- `GET /v1/customers/{customerId}/addresses`;
- `POST /v1/customers/{customerId}/addresses`;
- `PATCH /v1/customers/{customerId}/addresses/{addressId}`.

Também foram adicionados:

- ports de `CustomerContactRepository` e `CustomerAddressRepository`;
- use cases de contacts e addresses;
- repositories in-memory;
- repositories Postgres;
- wiring HTTP;
- testes application, HTTP, Postgres e smoke DB real.

## 3) Access model e scoping

Contacts e addresses herdam acesso do customer pai:

- `ADMIN`: pode acessar filhos de qualquer customer no tenant;
- `REPRESENTANTE`: pode acessar filhos apenas quando o customer pai tem `owner_id` ou `representative_id` igual ao actor.

Scoping preservado:

- list/create por `tenantId + customerId`;
- patch por `tenantId + customerId + contactId/addressId`;
- child de outro customer não deve ser mutado pelo path atual.

## 4) Primary behavior

Quando `is_primary=true`:

- siblings contacts do mesmo `tenantId/customerId` são desmarcados;
- siblings addresses do mesmo `tenantId/customerId` são desmarcados;
- não há mutação cross-tenant/customer.

Em Postgres, operações que setam `is_primary=true` usam:

- `withTransaction(...)`;
- `pg_advisory_xact_lock(hashtext(tenantId:customerId))`;
- unset siblings + insert/update dentro da mesma transação.

## 5) Schema

Sem migration nova no PR7B.

Schema audit confirmou que `005_customers_core.sql` já continha:

- `customer_contacts`;
- `customer_addresses`.

## 6) Validações registradas

- `npm run typecheck` — PASS.
- `npm run test` — PASS, 133/133.
- `set -a && source .env.local && set +a && npm run db:migrate` — PASS, 0 applied / 5 skipped.
- `set -a && source .env.local && set +a && npm run test:smoke:db` — PASS, 7/7.
- `git diff --check` — PASS.

## 7) Fora de escopo preservado

- Sem products/prices/payment terms.
- Sem frontend.
- Sem commercial profile, credit rules ou tax profile.
- Sem customer import/search avançado/delete físico/ownership transfer.
- Sem RBAC runtime completo.
- Sem `GESTOR_COMERCIAL`.
- Sem audit events de denied.
- Sem quote exigir contato/endereço.
- Sem mudança ORC→PED.
- Sem nova migration.
- `erp_app_flow_map.html` permanece fora do PR.
- Nenhum stash foi aplicado.

## 8) Nota futura não bloqueante

Avaliar hardening futuro com constraint parcial no banco para garantir estruturalmente um único `is_primary=true` por `tenantId/customerId`.

Não bloquear PR7B por isso: PR #44 já foi aprovado e mergeado.

## 9) Próximo passo recomendado

Planejar o próximo slice técnico com autorização explícita.

Não iniciar products/prices/payment terms, frontend ou RBAC/auth runtime sem plano/review próprio.
