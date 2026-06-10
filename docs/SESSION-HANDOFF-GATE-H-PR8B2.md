# GATE H PR8B2 POST-MERGE HANDOFF

Status: **MERGED**

Data: 2026-06-10  
Branch final: `main`

## 1) PR integrado

- PR #48 — `Gate H PR8B2 — Price Table Items API`
- URL: https://github.com/Replinkrub/REPLINK-ARCO-ERP/pull/48
- Commit do PR: `7f64d318a146315d801948dd36b9ee24bb254892`
- Merge commit: `384679b`

## 2) O que o PR8B2 entregou

- Migration `008_price_table_items.sql` com tabela `price_table_items`.
- `PriceTableItemRepository` port.
- Use cases `list/get/create/update` para price table items.
- Repositório in-memory.
- Repositório Postgres.
- Endpoints HTTP para Price Table Items.
- Testes application, HTTP, Postgres e smoke DB.

## 3) Endpoints entregues

- `GET /v1/price-tables/{priceTableId}/items`
- `POST /v1/price-tables/{priceTableId}/items`
- `GET /v1/price-tables/{priceTableId}/items/{itemId}`
- `PATCH /v1/price-tables/{priceTableId}/items/{itemId}`

## 4) Decisões técnicas integradas

- `unit_price NUMERIC(14,4)`.
- `unit_price > 0`.
- Vigência por `valid_from`/`valid_until`.
- Overlap inclusivo `[valid_from, valid_until]`.
- Sem unique simples por tabela/produto, preservando períodos históricos não conflitantes.
- Sem EXCLUDE/range constraint neste PR.
- Representada da tabela e produto precisa bater exatamente, incluindo `NULL === NULL`.
- Item deve ficar dentro da vigência da tabela.
- ADMIN cria/edita.
- ADMIN e REPRESENTANTE listam/consultam.

## 5) Validação registrada

- `npm run typecheck` — PASS
- `npm run test` — PASS, 152/152
- `npm run db:migrate` — PASS
- `npm run test:smoke:db` — PASS, 10/10
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
2. Customer default price table link;
3. ORC/PED item snapshot planning;
4. outro slice aprovado pelo roadmap.
