# ETAPA 9 — Gate Plan (Faturamento Simples)

Status: **Planning-only (sem implementação)**  
Data: 2026-06-01  
Referências: `ROADMAP.md` (Etapa 9), `docs/SPEC.md`, `docs/SPEC-OPS-ADDENDUM.md` (F-09/F-10), `docs/RBAC-MATRIX.md`, `docs/TEST-AND-RELEASE-GATE.md`.

---

## 1) Objetivo

Registrar plano da Etapa 9 para fechar separação entre pedido e faturamento simples, com governança de escopo fiscal restrita ao MVP.

---

## 2) Escopo previsto (quando autorizado)

- Registrar faturamento simples para pedidos em `ORDER_CONFIRMED`.
- Preservar regras RBAC (ADMIN/OWNER permitido, REPRESENTANTE negado).
- Gravar `invoiced_at` e referência manual opcional sem ampliar escopo fiscal.
- Garantir trilha mínima auditável da ação de faturamento.

---

## 3) Critérios de aceite previstos

1. Faturamento simples altera status para `INVOICED` apenas em fluxo permitido.
2. Representante recebe negação controlada para faturamento.
3. Não há integração fiscal real/NF-e.
4. `npm run typecheck` e `npm run test` PASS.

---

## 4) Fora de escopo (nesta etapa de planejamento)

- Frontend.
- API HTTP externa completa.
- Banco real/migrations.
- NF-e/fiscal avançado.
- Gateway/boleto/contas a receber completo.

---

## 5) Gate de início da Etapa 9

Condições mínimas para abrir implementação futura:

1. autorização explícita de início;
2. branch dedicada fora da `main`;
3. pacote de escopo aprovado (arquivos, testes, riscos);
4. baseline validado em `main` (typecheck/test);
5. confirmação de fora de escopo preservado.

---

## 6) Regra operacional

Este documento **não autoriza implementação** da Etapa 9 por si só.
