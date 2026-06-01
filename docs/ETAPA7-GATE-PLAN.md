# ETAPA 7 — Gate Plan (Comunicação do Documento)

Status: **Planning-only (sem implementação)**  
Data: 2026-06-01  
Referências: `ROADMAP.md` (Etapa 7), `docs/SPEC.md`, `docs/SPEC-OPS-ADDENDUM.md` (F-11), `docs/API-CONTRACTS.yaml`, `docs/TEST-AND-RELEASE-GATE.md`.

---

## 1) Objetivo

Registrar o plano de execução da Etapa 7 para separar comunicação de estado comercial, sem iniciar implementação técnica neste ciclo.

---

## 2) Escopo previsto (quando autorizado)

- Registrar ações de comunicação (`SEND_WHATSAPP`, `SEND_EMAIL`, `GENERATE_PDF`, `PRINT`, `COPY_LINK`, `SHARE`) como `output_events`.
- Garantir que comunicação **não altera** `commercial_status`.
- Manter rastreabilidade auditável de ator, canal e timestamp.

---

## 3) Critérios de aceite previstos

1. Após qualquer ação de comunicação, `commercial_status` permanece inalterado.
2. `output_events` persistem trilha mínima auditável.
3. Cobertura de testes inclui cenário positivo e negação crítica.
4. `npm run typecheck` e `npm run test` PASS.

---

## 4) Fora de escopo (nesta etapa de planejamento)

- Implementação de frontend.
- API HTTP externa completa.
- Integrações reais de mensageria/gateway.
- Automações de campanha.
- Qualquer mudança de Etapa 8/9.

---

## 5) Gate de início da Etapa 7

Condições mínimas para abrir implementação futura:

1. autorização explícita de início;
2. branch dedicada fora da `main`;
3. pacote de escopo aprovado (arquivos, testes e riscos);
4. validação prévia do baseline em `main` (typecheck/test);
5. confirmação de fora de escopo preservado.

---

## 6) Regra operacional

Este documento **não autoriza implementação** da Etapa 7 por si só.
