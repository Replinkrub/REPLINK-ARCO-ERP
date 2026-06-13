# GATE H PR57 — ORDER CONFIRMATION SNAPSHOT CARRYOVER — POST-MERGE HANDOFF

Status: **MERGED**

Data: 2026-06-13  
Branch final: `main`

## 1) PR integrado

| PR | Título | Commit técnico | Merge commit |
|---|---|---|---|
| #57 | Order Confirmation Snapshot Carryover | `e1389f6` | `ca9201f` |

PR: https://github.com/Replinkrub/REPLINK-ARCO-ERP/pull/57

## 2) O que o ciclo entregou

- Carryover do snapshot comercial salvo no orçamento para o pedido confirmado.
- `sourceQuoteSnapshot.items` preserva campos comerciais do item.
- Bloqueio de confirmação quando item não possui snapshot mínimo.
- Confirmação ORC→PED sem repricing e sem chamada a `resolvePriceUseCase`.
- Preservação de `saveFromQuoteOnce`/idempotência.

## 3) Campos de snapshot preservados

- `productId`
- `representedCompanyId`
- `quantity`
- `unitPrice`
- `lineTotal`
- `total`
- `priceSource`
- `priceSourceId`
- `priceTableId` quando aplicável
- `priceResolvedAt`

## 4) Regra operacional integrada

1. Add/update de item em `QUOTE_DRAFT` continua responsável por resolver preço e persistir snapshot.
2. Confirmação ORC→PED apenas copia o snapshot já salvo.
3. `convertQuoteToOrder` retorna `MISSING_ITEM_SNAPSHOT` quando algum item não possui snapshot mínimo.
4. Mudanças posteriores em tabela/override não alteram o pedido confirmado durante a confirmação.
5. Duplicidade de confirmação continua protegida por `saveFromQuoteOnce`.

## 5) Validação registrada

- `npm run typecheck` — PASS.
- `npm run test` — PASS, 179/179.
- `npm run db:migrate` com `.env.local` — PASS, 0 applied / 14 skipped.
- `npm run test:smoke:db` com `.env.local` — PASS, 13/13.
- `git diff --check` — PASS.
- Finalizer: `npx ai-workflow collect-evidence --mode=standard --task=order-confirmation-snapshot-carryover` — COMPLETED.

## 6) Fora de escopo preservado

- Frontend.
- RBAC runtime completo.
- Fiscal/NF-e/SEFAZ.
- Promoções.
- Faixas de preço.
- Margem.
- Comissão.
- Desconto avançado.
- Payment term por item.
- `erp_app_flow_map.html`.

## 7) Próximo passo recomendado

Planejar o próximo slice técnico do Gate H com autorização explícita, sem iniciar novo trabalho a partir deste handoff.
