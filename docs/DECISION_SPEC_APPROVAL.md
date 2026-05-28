# DECISION — SPEC Approval Gate (ARCO-ERP v0)

Data: 2026-05-28
Status: **GO CONTROLADO (Sprint 0) em branch isolada `feat/sprint0-bootstrap`**

## Decisão canônica registrada

- A fase **planning-only / no-go implementação** foi superada por decisão executiva registrada em 2026-05-28.
- A implementação inicial da fundação de domínio foi autorizada **somente** na branch `feat/sprint0-bootstrap`.
- Esse status **não autoriza automaticamente** abertura de PR.
- Esse status **não autoriza** merge na `main`.
- Esse status **não autoriza** início da Sprint 1.

## Sprint 0 — escopo já implementado (GO controlado)

- Fundação técnica inicial de domínio:
  - state machine
  - RBAC/ownership
  - reasons de cancelamento/ajuste
  - testes de domínio

## Validações do checkpoint

- `npm run typecheck`: **PASS**
- `npm run test`: **PASS (16/16)**

## Limites obrigatórios

- `main` protegida.
- PR ainda não autorizado.
- Merge não autorizado.
- Sprint 1 não autorizada.

## Próximo gate obrigatório

- Revisão final da Sprint 0 e autorização explícita para abrir PR.

## Histórico de decisão executiva

- `DECISAO_EXECUTIVA:` GO controlado para início da implementação (Sprint 0)
- `RESPONSAVEL_DECISAO:` Toni
- `DATA_DECISAO:` 2026-05-28

## Critérios usados no gate Sprint 0

1. Fluxos críticos com critérios de aceite testáveis.
2. Matriz de permissões por ação/tela consolidada.
3. Regras de integridade/concorrência definidas.
4. Contrato mínimo dos relatórios fechado.
5. Política de legado explícita (SAGRADO consulta pontual apenas).

## Observação canônica

SAGRADO-PEDIDOS permanece legado e não deve receber evolução de produto.
