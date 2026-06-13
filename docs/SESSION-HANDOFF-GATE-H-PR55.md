# GATE H PR55 — QUOTE ITEM SNAPSHOT FOUNDATION — POST-MERGE HANDOFF

Status: **MERGED**

Data: 2026-06-13  
Branch final: `main`

## 1) PR integrado

| PR | Título | Commit técnico | Merge commit |
|---|---|---|---|
| #55 | Quote Item Snapshot Foundation | `cadf40a` | `79aeef3` |

PR: https://github.com/Replinkrub/REPLINK-ARCO-ERP/pull/55

## 2) O que o ciclo entregou

- Snapshot comercial mínimo ao adicionar/alterar item em `QUOTE_DRAFT`.
- Uso de `resolvePriceUseCase` para resolver preço antes de persistir item.
- Persistência do snapshot no JSON de itens do orçamento.
- Recalculo de totais do orçamento após alteração de item.
- Bloqueio explícito via `PRICE_NOT_RESOLVABLE` antes de persistir item sem preço resolvível.
- Preservação do snapshot já salvo em update de quantidade, sem repricing automático.

## 3) Campos de snapshot de item

- `productId`
- `representedCompanyId`
- `quantity`
- `unitPrice`
- `lineTotal`
- `priceSource`
- `priceSourceId`
- `priceTableId` quando origem é `PRICE_TABLE_ITEM`
- `priceResolvedAt`

Payment term não foi duplicado por item neste slice.

## 4) Regra operacional integrada

1. Add/update de item ocorre somente em `QUOTE_DRAFT`.
2. Quando o item possui `productId`, o fluxo chama `resolvePriceUseCase` com:
   - actor;
   - customerId do orçamento;
   - representedCompanyId do orçamento;
   - productId;
   - `pricedAt`/onDate.
3. `PRICE_NOT_RESOLVABLE` bloqueia persistência do item e preserva totais.
4. Update de quantidade em item já salvo não recalcula preço nem muda origem do snapshot.

## 5) Validação registrada

- `npm run typecheck` — PASS.
- `npm run test` — PASS, 177/177.
- `set -a && source ./.env.local && set +a && npm run db:migrate && npm run test:smoke:db && git diff --check` — PASS.
  - Migrations: 0 applied / 14 skipped.
  - Smoke DB: 13/13.
- Finalizer: `npx ai-workflow collect-evidence --mode=standard --task=quote-item-snapshot-foundation` — COMPLETED.

## 6) Fora de escopo preservado

- ORC→PED confirmation/carryover.
- Frontend.
- Fiscal/NF-e/SEFAZ.
- Promoções.
- Faixas de preço.
- Margem.
- Comissão.
- Desconto avançado.
- Edição visual de tabela.
- `erp_app_flow_map.html`.

## 7) Próximo passo recomendado

Planejar o próximo slice técnico: **Order Confirmation Snapshot Carryover**.

Objetivo do próximo slice:

- confirmar ORC→PED copiando snapshot já salvo;
- garantir que a confirmação não recalcula preço;
- preservar `priceSource`, `priceSourceId`, `priceTableId` e `priceResolvedAt`;
- testar imutabilidade histórica do pedido confirmado.
