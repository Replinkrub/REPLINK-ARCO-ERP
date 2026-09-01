# GATE H PR59 — PAYMENT TERMS SNAPSHOT CARRYOVER — POST-MERGE HANDOFF

Status: **MERGED**

Data: 2026-06-13  
Branch final: `main`

## 1) PR integrado

| PR | Título | Commit técnico | Merge commit |
|---|---|---|---|
| #59 | Payment Terms Snapshot Carryover | `43828a0` | `0f0b39a` |

PR: https://github.com/Replinkrub/REPLINK-ARCO-ERP/pull/59

## 2) O que o ciclo entregou

- Snapshot de condição de pagamento no orçamento.
- Geração de `paymentSchedule` por parcelas/vencimentos.
- Carryover para pedido confirmado sem recalcular vencimentos.
- `sourceQuoteSnapshot` preserva `paymentTermSnapshot` e `paymentSchedule`.
- Bloqueio de confirmação quando há `paymentTermId` sem snapshot/vencimentos mínimos.
- Migration `015_commercial_document_payment_snapshot.sql`.

## 3) Campos de pagamento preservados

- `paymentTermId`
- `paymentTermSnapshot.id`
- `paymentTermSnapshot.name`
- `paymentTermSnapshot.description` quando houver
- `paymentTermSnapshot.installmentsCount`
- `paymentTermSnapshot.firstDueDays`
- `paymentTermSnapshot.intervalDays`
- `paymentTermSnapshot.snapshottedAt`
- `paymentSchedule[].installmentNumber`
- `paymentSchedule[].dueDate`
- `paymentSchedule[].amount`

## 4) Regra operacional integrada

1. A condição de pagamento é snapshotada em `QUOTE_DRAFT` via `updateQuote`.
2. A confirmação ORC→PED copia o snapshot e os vencimentos já salvos.
3. `convertQuoteToOrder` retorna `MISSING_PAYMENT_SNAPSHOT` quando há `paymentTermId` sem snapshot/schedule mínimos.
4. Alterações futuras na condição de pagamento não recalculam pedido confirmado durante a confirmação.
5. `saveFromQuoteOnce` continua protegendo idempotência da confirmação.

## 5) Validação registrada

- `npm run typecheck` — PASS.
- `npm run test` — PASS, 181/181.
- `npm run db:migrate` com `.env.local` — PASS, 1 applied / 14 skipped.
- `npm run test:smoke:db` com `.env.local` — PASS, 13/13.
- `git diff --check` — PASS.
- Finalizer: `npx ai-workflow collect-evidence --mode=standard --task=payment-terms-snapshot-carryover` — COMPLETED.

## 6) Fora de escopo preservado

- Frontend.
- RBAC runtime completo.
- Fiscal/NF-e/SEFAZ.
- Boleto automático.
- Gateway de pagamento.
- Crédito automático.
- Conciliação.
- Promoções, faixas de preço, margem, comissão ou desconto avançado.
- `erp_app_flow_map.html`.

## 7) Encerramento

Ciclo encerrado. Próximo trabalho técnico exige novo plano/autorização explícita.
