# ETAPA 8 — Gate Plan (Fechamento de Pedido)

Status: **Planning-only (sem implementação)**  
Data: 2026-06-01  
Referências: `ROADMAP.md` (Etapa 8), `docs/SPEC.md`, `docs/SPEC-OPS-ADDENDUM.md` (F-05..F-10), `docs/RBAC-MATRIX.md`, `docs/TEST-AND-RELEASE-GATE.md`.

---

## 1) Objetivo

Registrar plano da Etapa 8 para consolidar fechamento de pedido confirmado com regras administrativas, auditoria e bloqueios de RBAC, sem iniciar implementação neste ciclo.

---

## 2) Escopo previsto (quando autorizado)

- Regras de cancelamento de `ORDER_CONFIRMED` com política por perfil.
- Ajuste administrativo mantendo `ORDER_CONFIRMED` e trilha auditável.
- Integridade de `lifecycle_events` e `order_revisions` no fechamento operacional.
- Bloqueios para operações proibidas por estado/perfil.

---

## 3) Critérios de aceite previstos

1. Ações ADMIN e REPRESENTANTE respeitam RBAC sem ambiguidade.
2. Cancelamento/ajuste geram trilhas auditáveis consistentes.
3. Bloqueios de operações inválidas retornam erro controlado.
4. `npm run typecheck` e `npm run test` PASS.

---

## 4) Fora de escopo (nesta etapa de planejamento)

- Frontend.
- API HTTP externa completa.
- Banco real/migrations.
- Fiscal/NF-e/gateway/boleto.
- Implementação da Etapa 9.

---

## 5) Gate de início da Etapa 8

Condições mínimas para abrir implementação futura:

1. autorização explícita de início;
2. branch dedicada fora da `main`;
3. pacote de escopo aprovado (arquivos, testes, riscos);
4. baseline validado em `main` (typecheck/test);
5. confirmação de fora de escopo preservado.

---

## 6) Regra operacional

Este documento **não autoriza implementação** da Etapa 8 por si só.
