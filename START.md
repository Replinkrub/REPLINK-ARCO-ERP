# ARCO-ERP — START

## Estado atual

- Projeto: ARCO-ERP
- Estado: **Gates A–F documentais mergeados; Gate H integrado até Customer Represented Commercial Profile**
- Sprint 0: concluída
- Sprint 1: concluída
- Sprint 2: concluída
- Sprint 3 (Slices 1–5): concluída e mergeada
- P0+P1 (persistência real + API HTTP mínima): concluído e mergeado (PR #25)
- P1.5 (Supabase runtime readiness / DB smoke): ✅ **concluído e mergeado** (PR #28)
- `main` em: `2fb945a` (merge PR #52 — Customer Represented Commercial Profile)
- Frente documental V1 operacional: ✅ **Gates A–F fechados**
- Gate F — Migration Plan + Test Strategy: ✅ **PASS**
- Commit Gate F: `406e043 docs(erp): define migration plan and test strategy`
- Gate G inicial — ORC→PED canônico + migration runner controlado: ✅ **mergeado**
- Gate G PR5A — represented companies foundation: ✅ **mergeado**
- Gate G PR5B — represented company enforcement/config: ✅ **mergeado**
- Gate G PR6 — customers foundation: ✅ **mergeado**
- Gate H PR7A — Customer API Core: ✅ **mergeado**
- Gate H PR7B — Customer Contacts + Addresses API: ✅ **mergeado**
- Gate H PR8A — Products Foundation API: ✅ **mergeado**
- Gate H PR8B1 — Price Tables Core API: ✅ **mergeado**
- Gate H PR8B2 — Price Table Items API: ✅ **mergeado**
- Gate H — Customer Default Price Table Link: ✅ **mergeado**
- PR documental A–F: #30 — merge commit `0962558`
- PR Gate G inicial: #31 — merge commit `6d7cd19`
- PR Gate G PR5A: #37 — merge commit `ccb1c82`
- PR Gate G PR5B: #39 — merge commit `3224458`
- PR Gate G PR6: #41 — merge commit `47f5130`
- PR Gate H PR7A: #43 — merge commit `6366729`
- PR Gate H PR7B: #44 — merge commit `abe113c`
- PR Gate H PR8A: #46 — merge commit `f0fbbf2`
- PR Gate H PR8B1: #47 — merge commit `7ebe395`
- PR Gate H PR8B2: #48 — merge commit `384679b`
- PR Gate H Customer Default Price Table Link: #49 — merge commit `1f81d0a`
- PR Payment Terms Foundation: #50 — merge commit `d956fc5`
- PR Customer Default Payment Terms Link: #51 — merge commit `7fc788d`
- PR Customer Represented Commercial Profile: #52 — merge commit `2fb945a`
- Typecheck: ✅ PASS
- Tests: ✅ PASS — 168/168 (16 test files)
- Smoke DB real contra Supabase dev: ✅ PASS — 13/13
- Próximo ponto: **escolher e planejar próximo slice técnico com autorização explícita**
- Regra: não iniciar ORC/PED item snapshot, frontend, RBAC runtime, override CRUD/API/motor de preço sem plano/review/autorização.
- Foundation de `customer_product_price_overrides` existe apenas como base de dados/modelo — ainda não há CRUD, API, motor de preço ou ORC/PED snapshot para overrides.

## Checkpoint da sessão (2026-06-12 pós-PR #52 merge)

### PR #52 — Customer Represented Commercial Profile integrado

- PR #52 — `Customer Represented Commercial Profile`
- PR: https://github.com/Replinkrub/REPLINK-ARCO-ERP/pull/52
- Merge commit: `2fb945a`
- Branch: `feat/customer-represented-commercial-profile`
- Commit técnico: `d0c444b`

### Estado técnico PR #52 — Customer Represented Commercial Profile

- Migration `012_customer_represented_commercial_profile.sql`: `customer_represented_commercial_profiles(tenant_id, id, customer_id, represented_company_id, default_price_table_id, default_payment_term_id)`. FK composta tenant-safe com `represented_company_id`, `default_price_table_id`, `default_payment_term_id`.
- Partial unique `(tenant_id, customer_id, represented_company_id)`.
- `default_price_table_id` com `represented_company_id IS NULL` (apenas tabela global permitida).
- Migration `013_customer_represented_commercial_profile_guards.sql`: triggers de guarda para evitar representada-mismatch entre perfil, tabela de preço e condição de pagamento.
- Port + use cases + in-memory + Postgres repos (incluindo `representedCompanyRepository`).
- Endpoints: `GET/PATCH /v1/customers/{customerId}/represented-commercial-profiles/{profileId}`.
- Autorização mínima atual: ADMIN cria/edita; ADMIN e REPRESENTANTE consultam.
- Foundation de `customer_product_price_overrides` existe como base de dados/modelo — ainda não há CRUD, API, motor de preço ou ORC/PED snapshot para overrides.

### Slices anteriores também concluídos neste ciclo

**Payment Terms Foundation** (PR #50, merge `d956fc5`):

- Migration `010_payment_terms.sql`: `payment_terms(tenant_id, id, name, description, due_days, discount_percentage, discount_days, installment_count, installment_interval_days, is_active)`.
- Port + use cases + in-memory + Postgres repos.
- Endpoints: `GET/POST/PATCH /v1/payment-terms` + `GET /v1/payment-terms/:paymentTermId`.
- Erros: `PAYMENT_TERM_NOT_FOUND`.
- Tests: 163/163 à época.

**Customer Default Payment Terms Link** (PR #51, merge `7fc788d`):

- Migration `011_customer_default_payment_term.sql`: `customer_commercial_profiles.default_payment_term_id` com FK tenant-safe e índice.
- `GET/PATCH /v1/customers/{customerId}/commercial-profile` estendido com `defaultPaymentTermId`.
- Port + use cases + in-memory + Postgres repos.
- `defaultPaymentTermId = null` limpa vínculo.

### Validações registradas PR #52

| Validação | Resultado |
|---|---|
| `npm run typecheck` | ✅ PASS |
| `npm run test` | ✅ PASS — 168/168 |
| `npm run db:migrate` | ✅ PASS (010–013 applied) |
| `npm run test:smoke:db` | ✅ PASS — 13/13 |
| `git diff --check` | ✅ PASS |
| QA review (Sage) | ✅ PASS |

### Fora de escopo mantido

- Aplicação automática de preço em ORC/PED não iniciada.
- CRUD/API/motor de preço para `customer_product_price_overrides` não iniciado — existe apenas como base de dados/modelo.
- ORC/PED snapshot não iniciado.
- Sem frontend.
- Sem RBAC runtime completo.
- Sem estoque, fiscal/NF-e/SEFAZ.
- Sem comissões, margem/desconto avançado, price tiers/faixas, promoção/campanha.
- Sem `commercial_status`.
- `erp_app_flow_map.html`: continua untracked e fora dos PRs.

### Próximo ponto

Escolher e planejar próximo slice com autorização explícita: ORC/PED item snapshot com price table + payment terms, override CRUD/API, frontend ou RBAC runtime.

## Checkpoint da sessão (2026-06-10 pós-PR8B2 merge)

### PR8B2 integrado

- PR #48 — `Gate H PR8B2 — Price Table Items API`
- PR: https://github.com/Replinkrub/REPLINK-ARCO-ERP/pull/48
- Merge commit: `384679b`
- Branch: `feat/gate-h-pr8b2-price-table-items`
- Commit técnico: `7f64d318a146315d801948dd36b9ee24bb254892`
- Handoff: `docs/SESSION-HANDOFF-GATE-H-PR8B2.md`

### Estado técnico PR8B2 — Price Table Items

- Migration `008_price_table_items.sql`: `price_table_items(tenant_id, price_table_id, product_id, unit_price, valid_from, valid_until, status)`.
- `unit_price NUMERIC(14,4)` e `unit_price > 0`.
- Vigência por `valid_from`/`valid_until`.
- Overlap inclusivo `[valid_from, valid_until]` bloqueado por aplicação/repository.
- Sem unique simples por tabela/produto; sem EXCLUDE/range constraint.
- Representada da tabela e produto precisa bater exatamente, incluindo `NULL === NULL`.
- Port + use cases + in-memory + Postgres repos.
- Endpoints: `GET/POST /v1/price-tables/{priceTableId}/items` + `GET/PATCH /v1/price-tables/{priceTableId}/items/{itemId}`.
- Autorização mínima atual: ADMIN cria/edita; ADMIN e REPRESENTANTE listam/consultam.

### Validações registradas PR8B2

| Validação | Resultado |
|---|---|
| `npm run typecheck` | ✅ PASS |
| `npm run test` | ✅ PASS — 152/152 |
| `npm run db:migrate` | ✅ PASS |
| `npm run test:smoke:db` | ✅ PASS — 10/10 |
| `git diff --check` | ✅ PASS |

### Fora de escopo mantido

- Aplicação automática de preço em ORC/PED não iniciada.
- Override de preço não iniciado.
- `customer_commercial_profiles.default_price_table_id` não tocado.
- Sem payment terms.
- Sem frontend.
- Sem RBAC runtime completo.
- Sem estoque, fiscal/NF-e/SEFAZ.
- Sem comissões, margem/desconto avançado, price tiers/faixas, promoção/campanha.
- Sem `commercial_status`.
- `erp_app_flow_map.html`: continua untracked e fora dos PRs.

### Próximo ponto

Escolher e planejar próximo slice com autorização explícita: Payment Terms Foundation, Customer default price table link por representada, ORC/PED item snapshot planning ou outro slice aprovado pelo roadmap.

## Checkpoint da sessão (2026-06-11 pós-PR #49 merge)

### PR #49 — Customer Default Price Table Link integrado

- PR #49 — `Gate H — Customer Default Price Table Link`
- PR: https://github.com/Replinkrub/REPLINK-ARCO-ERP/pull/49
- Merge commit: `1f81d0a`
- Branch: `feat/gate-h-customer-default-price-table-link`
- Commit técnico: `25e35e1`
- Handoff: `docs/SESSION-HANDOFF-GATE-H-CUSTOMER-DEFAULT-PRICE-TABLE.md`

### Estado técnico PR #49 — Customer Default Price Table Link

- Migration `009_customer_default_price_table.sql`: `customer_commercial_profiles.default_price_table_id` com FK tenant-safe e índice.
- `default_price_table_id = null` limpa vínculo.
- Apenas tabela global permitida: `represented_company_id IS NULL`.
- Port + use cases + in-memory + Postgres repos.
- Endpoints: `GET/PATCH /v1/customers/{customerId}/commercial-profile`.
- Autorização mínima atual: ADMIN cria/edita; ADMIN e REPRESENTANTE listam/consultam.

### Validações registradas PR #49

| Validação | Resultado |
|---|---|
| `npm run typecheck` | ✅ PASS |
| `npm run test` | ✅ PASS — 157/157 |
| `npm run db:migrate` | ✅ PASS |
| `npm run test:smoke:db` | ✅ PASS — 11/11 |
| `git diff --check` | ✅ PASS |

### Fora de escopo mantido

- Aplicação automática de preço em ORC/PED não iniciada.
- Override de preço não iniciado.
- Payment terms não iniciado.
- Sem frontend.
- Sem RBAC runtime completo.
- Sem estoque, fiscal/NF-e/SEFAZ.
- Sem comissões, margem/desconto avançado, price tiers/faixas, promoção/campanha.
- Sem `commercial_status`.
- `erp_app_flow_map.html`: continua untracked e fora dos PRs.

### Próximo ponto

Escolher e planejar próximo slice com autorização explícita: Payment Terms Foundation, Customer default price table link por representada, ORC/PED item snapshot planning ou outro slice aprovado pelo roadmap.

## Checkpoint da sessão (2026-06-10 pós-PR8B1 merge)

### PR8A + PR8B1 integrados

- PR #46 — `Gate H PR8A — Products Foundation API`
- Merge commit: `f0fbbf2`
- Branch: `feat/gate-h-pr8a-products-foundation`
- Commit técnico: `6363bba feat(erp): add products foundation api`
- PR #47 — `Gate H PR8B1 — Price Tables Core API`
- Merge commit: `7ebe395`
- Branch: `feat/gate-h-pr8b1-price-tables-core`
- Commit técnico: `44d01e0 feat(erp): add price tables core api`
- PR #47 revisado por Toni — APPROVED_WITH_NOTES (sem bloqueios)
- Handoff: `docs/SESSION-HANDOFF-GATE-H-PR8B1.md`

### Estado técnico PR8A — Products Foundation

- Migration `006_products_foundation.sql`: `products(tenant_id, id, name, description, unit, sku, ncm, cest, origin, status)`.
- Partial unique `(tenant_id, sku)` quando `sku IS NOT NULL`.
- `origin` como `integer NOT NULL DEFAULT 0`.
- Port + use cases + in-memory + Postgres repos.
- Endpoints: `GET/POST/PATCH /v1/products` + `GET /v1/products/:productId`.
- Erros: `PRODUCT_NOT_FOUND`, `PRODUCT_WITH_SKU_ALREADY_EXISTS`.

### Estado técnico PR8B1 — Price Tables Core

- Migration `007_price_tables_core.sql`: `price_tables(tenant_id, id, represented_company_id, name, currency, valid_from, valid_until, status)`.
- `represented_company_id` nullable com FK tenant-safe.
- `currency` default `'BRL'`.
- Partial unique `(tenant_id, represented_company_id, name)` / `(tenant_id, name)`.
- Port + use cases + in-memory + Postgres repos.
- Endpoints: `GET/POST/PATCH /v1/price-tables` + `GET /v1/price-tables/:priceTableId`.
- Overlap check de vigência no use case.
- Erros: `PRICE_TABLE_NOT_FOUND`, `DUPLICATE_PRICE_TABLE`.

### Validações registradas PR8A + PR8B1

| Validação | PR8A | PR8B1 |
|---|---|---|
| `npm run typecheck` | ✅ PASS | ✅ PASS |
| `npm run test` | ✅ PASS — 140/140 | ✅ PASS — 145/145 |
| `npm run db:migrate` | ✅ PASS — `006` applied | ✅ PASS — `007` applied |
| `npm run test:smoke:db` | ✅ PASS — 8/8 | ✅ PASS — 9/9 |
| `git diff --check` | ✅ PASS | ✅ PASS |

### Fora de escopo mantido

- PR8B2 (price table items) não iniciado.
- Conflito de vigência por produto não implementado.
- Aplicação de preço em ORC/PED não implementada.
- Sem payment terms, desconto/margem/override, comissões.
- Sem estoque, fiscal/NF-e/SEFAZ.
- Sem RBAC runtime completo, `GESTOR_COMERCIAL`, audit denied real.
- Sem frontend.
- `erp_app_flow_map.html`: continua untracked e fora dos PRs.

### Próximo ponto

Planejar PR8B2 (price table items) ou próximo slice técnico com autorização explícita. Não iniciar PR8B2, payment terms, frontend ou RBAC/auth runtime sem autorização.

## Checkpoint da sessão (2026-06-06 pós-PR7B merge)

### PR7B integrado

- PR #44 — `Gate H PR7B — Customer Contacts + Addresses API`
- Merge commit: `abe113c`
- Branch: `feat/gate-h-pr7b-customer-contacts-addresses-api`
- Commit técnico: `044a47b feat(erp): add customer contacts addresses api`
- Handoff: `docs/SESSION-HANDOFF-GATE-H-PR7B.md`

### Estado técnico PR7B

- Customer Contacts + Addresses API foundation integrada em `/v1/customers/{customerId}`.
- Rotas entregues:
  - `GET /v1/customers/{customerId}/contacts`;
  - `POST /v1/customers/{customerId}/contacts`;
  - `PATCH /v1/customers/{customerId}/contacts/{contactId}`;
  - `GET /v1/customers/{customerId}/addresses`;
  - `POST /v1/customers/{customerId}/addresses`;
  - `PATCH /v1/customers/{customerId}/addresses/{addressId}`.
- Contacts/addresses herdam acesso do customer pai.
- Child scoping preservado por `tenantId + customerId + contactId/addressId`.
- `is_primary=true` em Postgres usa `withTransaction(...)` + `pg_advisory_xact_lock(hashtext(tenantId:customerId))` para manter unset siblings + insert/update atômicos.
- Sem migration nova; schema já existia em `005_customers_core.sql`.

### Validações registradas PR7B

| Validação | Resultado |
|---|---|
| `npm run typecheck` | ✅ PASS |
| `npm run test` | ✅ PASS — 133/133 |
| `npm run db:migrate` | ✅ PASS — 0 applied / 5 skipped |
| `npm run test:smoke:db` | ✅ PASS — 7/7 |
| `git diff --check` | ✅ PASS |

### Fora de escopo mantido

- Sem products/prices/payment terms.
- Sem frontend.
- Sem commercial profile/credit rules/tax profile.
- Sem customer import/search avançado/delete físico/ownership transfer.
- Sem RBAC runtime completo, `GESTOR_COMERCIAL` ou audit events de denied.
- Sem mudança em quote para exigir contato/endereço.
- Sem mudança ORC→PED.
- `erp_app_flow_map.html`: continua untracked e fora do PR.

### Nota futura não bloqueante

- Avaliar hardening com constraint parcial no banco para garantir estruturalmente um único `is_primary=true` por `tenantId/customerId`.

### Próximo ponto

Planejar próximo slice técnico com autorização explícita. Não iniciar products/prices/payment terms, frontend ou RBAC/auth runtime sem plano/review próprio.

## Checkpoint da sessão (2026-06-06 pós-PR6 merge)

### PR6 integrado

- PR #41 — `Gate G PR6: Customers Foundation`
- Merge commit: `47f5130`
- Branch: `feat/gate-g-pr6-customers-foundation`
- Commit técnico: `5e81b6e feat(erp): add customers foundation`
- Commit documental de revisão: `eb07529 docs(erp): clarify customers foundation quote validation`
- Handoff: `docs/SESSION-HANDOFF-GATE-G-POST-PR6.md`

### Estado técnico PR6

- Migration `005_customers_core.sql` adiciona fundação relacional de clientes.
- Entidades criadas: `customers`, `customer_contacts`, `customer_addresses`, `customer_commercial_profiles`.
- FKs tenant-safe aplicadas para contatos, endereços e perfil comercial.
- `CustomerRepository` mínimo criado com adapters in-memory e Postgres.
- `createQuoteUseCase` exige cliente ativo no mesmo tenant antes de criar ORC.
- `updateQuote` valida troca de `customerId`.
- `CUSTOMER_NOT_AVAILABLE` mapeia HTTP `422`.

### Validações registradas PR6

| Validação | Resultado |
|---|---|
| `npm run typecheck` | ✅ PASS |
| `npm run test` | ✅ PASS — 118/118 |
| `npm run db:migrate` | ✅ PASS — 0 applied / 5 skipped |
| 2ª execução `npm run db:migrate` | ✅ PASS — 0 applied / 5 skipped |
| `npm run test:smoke:db` | ✅ PASS — 5/5 |
| `git diff --check` | ✅ PASS |

### Fora de escopo mantido

- Sem PR7 iniciado.
- Sem CRUD/API pública de clientes.
- Sem frontend.
- Sem products/prices/payment terms.
- Sem RBAC/auth runtime.
- Sem FK hard de `commercial_documents.customer_id` para `customers`.
- `erp_app_flow_map.html`: continua untracked e fora do PR.

### Próximo ponto

Planejar o próximo slice técnico com autorização explícita. Não iniciar PR7 sem plano/review próprio.

## Checkpoint da sessão (2026-06-05 pós-PR5B)

### PR5B integrado

- PR #39 — `Gate G: add represented company enforcement config`
- Merge commit: `3224458`
- Commit técnico: `b479fdf feat(erp): add represented company enforcement config`

### Estado técnico pós-PR5B

- `APP_REQUIRES_REPRESENTED_COMPANY` documentado em `.env.example`.
- Enforcement ativo somente com valor exato `"true"`.
- Enforcement fica em `createQuoteUseCase`.
- API passa `requiresRepresentedCompany` para o use case.
- `representedCompanyId` é normalizado com `trim`.
- Valor vazio/espaço vira ausente.
- `REQUIRED_REPRESENTED_COMPANY` mapeia HTTP `422`.
- Representada continua opcional quando enforcement está desabilitado.

### Validações registradas

| Validação | Resultado |
|---|---|
| `npm run typecheck` | ✅ PASS |
| `npm run test` | ✅ PASS — 112/112 |
| `git diff --check` | ✅ PASS |
| `npm run db:migrate` | ✅ PASS — 0 applied / 4 skipped |
| `npm run test:smoke:db` | ✅ PASS — 4/4 |

### Fora de escopo mantido

- Nenhuma migration `005` criada.
- Migrations `001`, `002`, `003` e `004` preservadas.
- Sem DB enforcement / `NOT NULL` / trigger / check constraint.
- Sem products/prices/payment terms.
- Sem frontend.
- Sem RBAC/auth runtime.
- `erp_app_flow_map.html`: continua untracked e fora dos PRs.

### Handoff oficial

Ler `docs/SESSION-HANDOFF-GATE-G-POST-PR5B.md` antes de planejar o próximo slice.

## Checkpoint da sessão (2026-06-05)

### PRs Gate G integrados até PR5A

| PR | Entrega | Status |
|---|---|---|
| #32 | Gate G initial handoff | ✅ mergeado |
| #33 | security tenant roles audit foundation | ✅ mergeado |
| #34 | represented companies decision | ✅ mergeado |
| #35 | environment tenant runtime | ✅ mergeado |
| #36 | commercial documents tenant FK/integrity | ✅ mergeado |
| #37 | represented companies foundation | ✅ mergeado em `ccb1c82` |

### Estado técnico pós-PR5A

- Migration `004` integrada.
- Migrations `001`, `002` e `003` preservadas.
- Nenhuma migration `005` criada.
- Foundation de `represented_companies` criada.
- `commercial_documents.represented_company_id` nullable.
- FK composta tenant-safe.
- API aceita `representedCompanyId` opcional.
- PED herda `representedCompanyId` do ORC quando presente.
- Fluxo Sagrado/null preservado.

### Fora de escopo mantido

- Sem enforcement.
- Sem `APP_REQUIRES_REPRESENTED_COMPANY`.
- Sem products/prices/payment terms.
- Sem frontend.
- Sem RBAC/auth runtime.
- Sem PR5B iniciado.
- `erp_app_flow_map.html`: continua untracked e fora dos PRs.

### Handoff oficial

Ler `docs/SESSION-HANDOFF-GATE-G-POST-PR5A.md` antes de planejar PR5B.

## Checkpoint da sessão (2026-06-04)

### PRs mergeados neste ciclo

| PR | Título | Merge commit |
|---|---|---|
| #30 | `Gate A-F: document canonical ERP foundation and Gate G handoff` | `0962558` |
| #31 | `Gate G: backend/data foundation for quote-to-order and migrations` | `6d7cd19` |

### Gate G inicial entregue

- ORC→PED canônico alinhado:
  - orçamento permanece `document_type=quote`;
  - pedido nasce como novo `document_type=order`;
  - pedido referencia orçamento por `source_quote_id`;
  - dupla confirmação não cria dois pedidos.
- Migration runner corrigido:
  - cria `schema_migrations`;
  - registra filename + checksum SHA-256;
  - pula migration já aplicada com mesmo checksum;
  - bloqueia checksum divergente;
  - usa advisory lock para evitar concorrência entre runners.

### Validações finais registradas

| Validação | Resultado |
|---|---|
| `npm run typecheck` | ✅ PASS |
| `npm run test` | ✅ PASS — 94/94 |
| `npm run db:migrate` | ✅ PASS — `001` skipped |
| 2ª execução `npm run db:migrate` | ✅ PASS — `001` skipped |
| `npm run test:smoke:db` | ✅ PASS |
| `git diff --check` | ✅ PASS |

### Fora de escopo mantido

- `erp_app_flow_map.html`: continua untracked e fora dos PRs.
- Nenhuma migration `002+` criada.
- `001_init_commercial_documents.sql` intacta.
- Frontend não iniciado.
- RBAC não implementado.
- `GESTOR_COMERCIAL` não ativado como produto.

### Próximo passo recomendado

Preparar escopo técnico do **Gate G PR 3 — security/tenant/roles/audit base**, usando `docs/MIGRATION-PLAN-OPS.md`, `docs/RBAC-MATRIX.md`, `docs/AUDIT-MODEL-OPS.md` e `docs/TEST-STRATEGY-OPS.md`.

## Checkpoint da sessão (2026-06-03)

### Gates documentais fechados nesta frente

| Gate | Status | Artefatos principais |
|---|---|---|
| Gate A — Screen Flow Canon + SPEC Consolidation | ✅ PASS | `docs/SCREEN-FLOW-MAP.md`, `docs/DECISION-FLOW-CANON.md`, `docs/SPEC.md` |
| Gate B — Data Model Decision | ✅ PASS | `docs/DATA-MODEL-OPS.md`, `docs/DECISION-DATA-MODEL-OPS.md` |
| Gate C — RBAC + Audit Model | ✅ PASS | `docs/RBAC-MATRIX.md`, `docs/AUDIT-MODEL-OPS.md` |
| Gate D — API Contract Alignment | ✅ PASS | `docs/API-CONTRACTS.yaml`, `docs/API-CONTRACTS-OPS.md` |
| Gate E — Frontend Contract + Shell Plan | ✅ PASS | `docs/FRONTEND-CONTRACT-OPS.md`, `docs/FRONTEND-SHELL-PLAN.md` |
| Gate F — Migration Plan + Test Strategy | ✅ PASS | `docs/MIGRATION-PLAN-OPS.md`, `docs/TEST-STRATEGY-OPS.md` |

### Gate F fechado

- Commit: `406e043 docs(erp): define migration plan and test strategy`
- Handoff oficial da sessão: `docs/SESSION-HANDOFF-GATE-F.md`
- Registro histórico: naquele checkpoint, Gate G era o próximo ponto e ainda não havia sido iniciado.

### Fora de escopo mantido

- `erp_app_flow_map.html`: continua untracked e **não deve ser incluído** em commits de Gate F/G.
- Nenhuma migration real foi criada no Gate F.
- Banco, API contracts, backend, frontend e código de produto não foram alterados no Gate F.

## Primeiro comando da próxima sessão

```bash
git status -sb
```

Depois ler:

1. `START.md` (este arquivo)
2. `ROADMAP.md`
3. `docs/SESSION-HANDOFF-GATE-G-POST-PR5B.md`
4. `docs/SESSION-HANDOFF-GATE-G-POST-PR5A.md`
5. `docs/SESSION-HANDOFF-GATE-G-INITIAL.md`
6. `docs/SESSION-HANDOFF-GATE-F.md`
7. `docs/MIGRATION-PLAN-OPS.md`
8. `docs/TEST-STRATEGY-OPS.md`
9. `docs/DATA-MODEL-OPS.md`
10. `docs/RBAC-MATRIX.md`
11. `docs/AUDIT-MODEL-OPS.md`
12. `docs/API-CONTRACTS.yaml`
13. `docs/API-CONTRACTS-OPS.md`

## Gate seguinte

Gate F — Migration Plan + Test Strategy: **✅ PASS e mergeado**.

Gate G inicial — ORC→PED + migration runner: **✅ mergeado em `6d7cd19`**.

Gate G PR5A — represented companies foundation: **✅ mergeado em `ccb1c82`**.

Gate G PR5B — represented company enforcement/config: **✅ mergeado em `3224458`**.

Gate G PR6 — customers foundation: **✅ mergeado em `47f5130`**.

Gate H PR7A — Customer API Core: **✅ mergeado em `6366729`**.

Gate H PR7B — Customer Contacts + Addresses API: **✅ mergeado em `abe113c`**.

Gate H PR8A — Products Foundation API: **✅ mergeado em `f0fbbf2`**.

Gate H PR8B1 — Price Tables Core API: **✅ mergeado em `7ebe395`**.

Gate H PR8B2 — Price Table Items API: **✅ mergeado em `384679b`**.

Gate H — Customer Default Price Table Link (PR #49): **✅ mergeado em `1f81d0a`**.

Payment Terms Foundation (PR #50): **✅ mergeado em `d956fc5`**.

Customer Default Payment Terms Link (PR #51): **✅ mergeado em `7fc788d`**.

Customer Represented Commercial Profile (PR #52): **✅ mergeado em `2fb945a`**.

Próximo ponto: **escolher e planejar próximo slice técnico com autorização explícita**.

Regra: não iniciar ORC/PED item snapshot, frontend, RBAC runtime, override CRUD/API/motor de preço sem plano/review/autorização.

Foundation de `customer_product_price_overrides` existe apenas como base de dados/modelo — ainda não há CRUD, API, motor de preço ou ORC/PED snapshot para overrides.

## Checkpoint da sessão (2026-06-01)

### PRs mergeados neste ciclo

| PR | Título | Merge commit |
|---|---|---|
| #28 | `feat(p1.5): supabase runtime readiness with real db smoke and upsert fix` | `4b0d322` |

### Escopo técnico entregue no P1.5

- **README.md**: bootstrap migrado de Postgres local → Supabase
- **.gitignore**: `.env.local` e `.env.*.local` adicionados (proteção de credenciais)
- **.env.example**: template DATABASE_URL para Supabase dev (sem segredo)
- **docs/TEST-AND-RELEASE-GATE.md**: gate P1.5 atualizado com evidências PASS
- **postgresOrderRepository.ts**: expansão do `ON CONFLICT DO UPDATE SET` — agora sobrescreve `document_type`, `source_quote_id`, `source_quote_snapshot` e demais campos de conversão na confirmação quote→order
- **tests/postgresRepositories.spec.ts**: teste unitário validando upsert sobrescreve campos da quote ao salvar order
- **tests/smokeDb.spec.ts**: numberSequence dinâmico + asserts de `document_type` mudando de `'quote'` para `'order'` após confirmação

### Bug corrigido (crítico)

**Problema**: `PostgresOrderRepository.save` usava `ON CONFLICT (id) DO UPDATE SET` parcial — não sobrescrevia `document_type`, `source_quote_id` e campos de conversão. Ao confirmar uma quote (mesmo id), o registro permanecia como `document_type='quote'` no banco.

**Correção**: upsert expandido para incluir todos os campos de conversão (`document_type`, `tenant_id`, `customer_id`, `owner_id`, `representative_id`, `status`, `items`, `totals`, `created_at`, `updated_at`, `confirmed_at`, `invoiced_at`, `invoice_manual_reference`, `source_quote_id`, `source_quote_number`, `source_quote_revision`, `converted_at`, `source_quote_snapshot`, `canceled_at`, `cancel_reason`, `cancel_note`).

### Evidências de validação pós-merge em `main`

| Validação | Resultado |
|---|---|
| `npm run typecheck` | ✅ PASS |
| `npm run test` (89/89) | ✅ PASS |
| `npm run test:smoke:db` (Supabase dev real) | ✅ PASS (635ms) |

### Fora de escopo mantido

- `erp_app_flow_map.html`: untracked, fora de commits
- `.env.local`: não versionado, DATABASE_URL nunca exposta
- P2 Frontend/UX: não iniciado (apenas planning registrado em `docs/NEXT-PHASE-GATE-PLAN.md`)

### Ambiente

- **Base de dados**: Supabase dev (PostgreSQL via Session pooler)
- **Role**: `arco_app`
- **DATABASE_URL**: definida apenas localmente em `.env.local` (nunca versionada)
- **Migration**: `001_init_commercial_documents.sql` aplicada
- **Runtime**: `pg` client com `sslmode=require`

## Primeiro comando da próxima sessão P1.5 histórica

```bash
git checkout main
git pull --ff-only origin main
git status -sb
npm run typecheck
npm run test
```

Depois ler:

1. `START.md` (este arquivo)
2. `docs/SPEC.md`
3. `docs/SPEC_REVIEW.md`
4. `docs/SPEC-OPS-ADDENDUM.md`
5. `docs/RBAC-MATRIX.md`
6. `docs/TEST-AND-RELEASE-GATE.md` (seção P1.5)
7. `docs/NEXT-PHASE-GATE-PLAN.md` (P2 planning)
8. `docs/DECISION_SPEC_APPROVAL.md`
9. `src/domain`
10. `tests`

## Gate seguinte histórico P1.5

P1.5 Supabase Runtime Readiness: **✅ PASS e mergeado**.
Próximo passo: **P2 Frontend/UX inicial (planning-only)** — não implementar sem autorização explícita.

### Para rodar validações do gate P1.5

```bash
# Configurar ambiente (primeira vez)
cp .env.example .env.local
# Editar .env.local com DATABASE_URL real do Supabase dev

# Carregar env
set -a; source .env.local; set +a

# Aplicar migration
npm run db:migrate

# Rodar smoke DB real
npm run test:smoke:db
```
