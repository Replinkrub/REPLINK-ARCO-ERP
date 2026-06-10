# GATE H CUSTOMER DEFAULT PRICE TABLE LINK — POST-MERGE HANDOFF

Status: **MERGED**

Data: 2026-06-11  
Branch final: `main`

## 1) PR integrado

- PR #49 — `Gate H — Customer Default Price Table Link`
- URL: https://github.com/Replinkrub/REPLINK-ARCO-ERP/pull/49
- Commit do PR: `25e35e1`
- Merge commit: `1f81d0a`

## 2) O que o slice entregou

- Migration `009_customer_default_price_table.sql` com FK tenant-safe e índice para `default_price_table_id`.
- `CustomerCommercialProfileRepository` port.
- Use cases `getCustomerCommercialProfileUseCase` e `updateCustomerCommercialProfileUseCase`.
- Repositório in-memory.
- Repositório Postgres.
- Endpoints HTTP dedicados para commercial profile.
- Testes application, HTTP, Postgres e smoke DB.

## 3) Endpoints entregues

- `GET /v1/customers/{customerId}/commercial-profile`
- `PATCH /v1/customers/{customerId}/commercial-profile`

## 4) Decisões técnicas integradas

- `default_price_table_id` vive em `customer_commercial_profiles`.
- Migration 009 adiciona FK tenant-safe e índice.
- FK: `(tenant_id, default_price_table_id) -> price_tables(tenant_id, id)`.
- Migration não limpa dados inválidos automaticamente.
- Endpoint dedicado; não reabre `PATCH /v1/customers`.
- Customer deve existir/estar visível no tenant.
- Price table deve existir no mesmo tenant.
- Price table deve estar active.
- Apenas tabela global permitida: `represented_company_id IS NULL`.
- Tabela com representada bloqueada porque customer/profile não modelam represented company ainda.
- `default_price_table_id = null` limpa o vínculo.
- ADMIN pode alterar.
- ADMIN e REPRESENTANTE podem consultar.
- Segue autorização mínima atual, não RBAC runtime completo.

## 5) Validação registrada

- `npm run typecheck` — PASS
- `npm run test` — PASS, 157/157
- `npm run db:migrate` — PASS
- `npm run test:smoke:db` — PASS, 11/11
- `git diff --check` — PASS

## 6) Fora de escopo preservado

- Aplicação automática de preço em ORC/PED.
- Override.
- `customer_commercial_profiles.default_price_table_id`.
- Payment terms.
- Frontend.
- RBAC runtime completo.
- Estoque.
- Fiscal/NF-e/SEFAZ.
- Comissões.
- Margem/desconto avançado.
- Price tiers/faixas.
- Promoção/campanha.
- `commercial_status`.
- `erp_app_flow_map.html`.

## 7) Próximo passo recomendado

Escolher e planejar o próximo slice com autorização explícita, sem iniciar implementação automática.

Opções naturais para decisão:

1. Payment Terms Foundation;
2. Customer default price table link por representada;
3. ORC/PED item snapshot planning;
4. Outro slice aprovado pelo roadmap.