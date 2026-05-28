# ARCO-ERP (v0)

Status atual: **Sprint 0 concluída na `main` + Sprint 1 em kickoff controlado (pré-implementação)**.

Este repositório inicia o ARCO-ERP do zero, com baseline canônica na SPEC.

## Regras do v0

- A fase **planning-only / no-go implementação** foi superada por decisão executiva registrada.
- SAGRADO-PEDIDOS é legado e serve apenas para consulta pontual histórica.
- Qualquer mudança de escopo deve ser registrada em decisão formal.

## Documento canônico

- `docs/SPEC.md`

## Gate atual

- `docs/SPEC_REVIEW.md`
- `docs/DECISION_SPEC_APPROVAL.md`
- `docs/TEST-AND-RELEASE-GATE.md`

## Sprint 0 — escopo implementado (já mergeado na `main`)

- Fundação técnica inicial de domínio:
  - state machine
  - RBAC/ownership
  - reasons de cancelamento/ajuste
  - testes de domínio

## Validações atuais

- `npm run typecheck`: **PASS**
- `npm run test`: **PASS (16/16)**

## Sprint 1 — kickoff autorizado (somente gate)

- Kickoff da Sprint 1 autorizado em modo controlado.
- Esta fase **não inicia implementação automaticamente**.
- Implementação da Sprint 1 depende de comando/gate explícito subsequente.

## Limites obrigatórios

- `main` protegida.
- Sem ampliação de escopo além da SPEC v1.
- Sem merge automático de PR.

## Próximo gate obrigatório

- Autorizar explicitamente o primeiro slice técnico da Sprint 1 (com escopo e critérios de aceite fechados).

## Rastreabilidade

- Issue de kickoff: `https://github.com/Replinkrub/REPLINK-ARCO-ERP/issues/1`
- Branch de implementação inicial (Sprint 0): `feat/sprint0-bootstrap`
- PR Sprint 0 mergeado: `https://github.com/Replinkrub/REPLINK-ARCO-ERP/pull/2`
