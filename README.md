# ARCO-ERP (v0)

Status atual: **GO CONTROLADO (Sprint 0) em branch isolada `feat/sprint0-bootstrap`**.

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

## Sprint 0 — escopo já implementado (na branch `feat/sprint0-bootstrap`)

- Fundação técnica inicial de domínio:
  - state machine
  - RBAC/ownership
  - reasons de cancelamento/ajuste
  - testes de domínio

## Validações atuais

- `npm run typecheck`: **PASS**
- `npm run test`: **PASS (16/16)**

## Limites obrigatórios

- `main` protegida.
- PR **não** autorizado automaticamente.
- Merge **não** autorizado.
- Sprint 1 **não** autorizada.

## Próximo gate obrigatório

- Revisão final da Sprint 0 + autorização explícita para abrir PR.

## Rastreabilidade

- Issue de kickoff: `https://github.com/Replinkrub/REPLINK-ARCO-ERP/issues/1`
- Branch de implementação inicial: `feat/sprint0-bootstrap`
