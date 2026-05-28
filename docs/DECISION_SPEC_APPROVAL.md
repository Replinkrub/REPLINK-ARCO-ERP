# DECISION — SPEC Approval Gate (ARCO-ERP v0)

Data: 2026-05-28
Status: **Sprint 0 concluída na `main` + GO CONTROLADO para kickoff da Sprint 1 (pré-implementação)**

## Decisão canônica registrada

- A fase **planning-only / no-go implementação** foi superada por decisão executiva registrada em 2026-05-28.
- A implementação inicial da fundação de domínio foi executada na branch `feat/sprint0-bootstrap` e mergeada na `main` via PR #2.
- O gate atual autoriza **kickoff da Sprint 1 em modo controlado** (governança e preparação).
- Este gate **não autoriza automaticamente** implementação de código da Sprint 1.
- Este gate **não autoriza automaticamente** merge de futuros PRs.

## Sprint 0 — escopo entregue

- Fundação técnica inicial de domínio:
  - state machine
  - RBAC/ownership
  - reasons de cancelamento/ajuste
  - testes de domínio

## Validações do checkpoint

- `npm run typecheck`: **PASS**
- `npm run test`: **PASS (16/16)**
- PR de Sprint 0: **MERGED** (`#2`)

## Limites obrigatórios

- `main` protegida.
- Sem ampliação de escopo além da SPEC v1.
- Kickoff da Sprint 1 não implica início automático de implementação.
- Merge de futuros PRs continua dependente de aprovação explícita.

## Próximo gate obrigatório

- Autorizar explicitamente o primeiro slice técnico da Sprint 1 (escopo, riscos, validação e rollback).

## Histórico de decisão executiva

- `DECISAO_EXECUTIVA:` GO controlado para início da implementação (Sprint 0)
- `RESPONSAVEL_DECISAO:` Toni
- `DATA_DECISAO:` 2026-05-28
- `ATUALIZACAO_GATE:` Sprint 0 mergeada na `main` + kickoff Sprint 1 autorizado (pré-implementação)
- `PR_REFERENCIA:` https://github.com/Replinkrub/REPLINK-ARCO-ERP/pull/2

## Critérios usados no gate Sprint 0

1. Fluxos críticos com critérios de aceite testáveis.
2. Matriz de permissões por ação/tela consolidada.
3. Regras de integridade/concorrência definidas.
4. Contrato mínimo dos relatórios fechado.
5. Política de legado explícita (SAGRADO consulta pontual apenas).

## Observação canônica

SAGRADO-PEDIDOS permanece legado e não deve receber evolução de produto.
