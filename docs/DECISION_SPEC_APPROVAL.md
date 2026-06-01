# DECISION — SPEC Approval Gate (ARCO-ERP v0)

Data: 2026-05-28
Status: **Sprints 0, 1 e 2 concluídas na `main` + Sprint 3 consolidada + Etapa 5 concluída + Etapa 6 concluída e mergeada na `main`**

## Decisão canônica registrada

- A fase **planning-only / no-go implementação** foi superada por decisão executiva registrada em 2026-05-28.
- A implementação inicial da fundação de domínio foi executada na branch `feat/sprint0-bootstrap` e mergeada na `main` via PR #2.
- Sprint 1 foi concluída e mergeada na `main` (PRs #4, #5, #6).
- Sprint 2 foi concluída e mergeada na `main` (PRs #7 e #8).
- O ciclo autorizado é **Sprint 3 — SPEC-Led Domain Foundation Completion**.
- Slices 1-4 da Sprint 3 foram concluídos localmente na branch de trabalho.
- Slice 5 (fechamento documental e gate final da Sprint 3) foi concluído localmente.
- Etapa 5 (fluxo operacional de orçamento) foi concluída e mergeada na `main` via PR #14.
- Etapa 6 (conversão orçamento -> pedido) foi concluída e mergeada na `main` via PR #17.
- Este gate **não autoriza automaticamente** merge de futuros PRs.

## Escopo entregue até o último gate

- Sprint 0: fundação técnica inicial de domínio.
- Sprint 1: commercial document core + hardening + lifecycle/invoicing.
- Sprint 2: domain hardening & validation layer + refinamento de erro semântico de ajuste.

## Validações do checkpoint

- `npm run typecheck`: **PASS**
- `npm run test`: **PASS (65/65)**
- PRs relevantes mergeados: **#2, #4, #5, #6, #7, #8, #14, #17**

## Limites obrigatórios

- `main` protegida.
- Sem ampliação de escopo além da SPEC v1.
- Fechamento do Slice 5 não implica abertura automática de novo slice.
- Merge de futuros PRs continua dependente de aprovação explícita.
- Evitar hardening genérico/abstrações sem requisito objetivo da SPEC.

## Próximo gate obrigatório

- Registrar decisão operacional de push/PR da sessão completa após revisão final.
- Não há Slice 6 canônico nesta sprint sem nova decisão formal.

## Histórico de decisão executiva

- `DECISAO_EXECUTIVA:` GO controlado para início da implementação (Sprint 0)
- `RESPONSAVEL_DECISAO:` Toni
- `DATA_DECISAO:` 2026-05-28
- `ATUALIZACAO_GATE:` Etapa 6 concluída com merge do PR #17 e validação pós-merge em main
- `PRS_REFERENCIA:`
  - https://github.com/Replinkrub/REPLINK-ARCO-ERP/pull/2
  - https://github.com/Replinkrub/REPLINK-ARCO-ERP/pull/4
  - https://github.com/Replinkrub/REPLINK-ARCO-ERP/pull/5
  - https://github.com/Replinkrub/REPLINK-ARCO-ERP/pull/6
  - https://github.com/Replinkrub/REPLINK-ARCO-ERP/pull/7
  - https://github.com/Replinkrub/REPLINK-ARCO-ERP/pull/8
  - https://github.com/Replinkrub/REPLINK-ARCO-ERP/pull/14
  - https://github.com/Replinkrub/REPLINK-ARCO-ERP/pull/17

## Critérios usados no gate Sprint 0

1. Fluxos críticos com critérios de aceite testáveis.
2. Matriz de permissões por ação/tela consolidada.
3. Regras de integridade/concorrência definidas.
4. Contrato mínimo dos relatórios fechado.
5. Política de legado explícita (SAGRADO consulta pontual apenas).

## Observação canônica

SAGRADO-PEDIDOS permanece legado e não deve receber evolução de produto.
