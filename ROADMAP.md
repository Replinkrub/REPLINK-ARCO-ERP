# ROADMAP — ARCO-ERP (v0)

> Última atualização: 2026-06-01  
> Dono operacional: Atlas  
> Dono da prioridade executiva: Toni

## 1) Objetivo do produto

Entregar o ARCO-ERP como frente canônica de operação comercial (orçamento -> pedido -> faturamento simples), com execução guiada pela `docs/SPEC.md`, sem regressão de regras de domínio e com gates explícitos até entrega operacional.

## 2) Status atual

- Sprints 0, 1 e 2 concluídas e mergeadas em `main`.
- Sprint 3 (Slices 1-5) concluída localmente na branch de trabalho, com fechamento documental de gate.
- Baseline de validação registrada:
  - `npm run typecheck` PASS
  - `npm run test` PASS (50/50)
- SAGRADO-PEDIDOS permanece legado de consulta pontual (sem evolução de produto).

## 3) Fase/sprint atual

**Pós-fechamento da Sprint 3 (SPEC-Led Domain Foundation Completion)** em modo de decisão operacional.

## 4) Última entrega fechada

Fechamento do Slice 5 da Sprint 3 (consolidação documental e gate final local), com lacunas `REQUIRED_BY_SPEC` de fundação tratadas nos slices 1-4 e rastreabilidade atualizada.

## 5) Próximo gate aprovado

**Gate operacional vigente (aprovado no plano):** executar decisão explícita de push/PR da sessão completa da Sprint 3.

Condições para executar o gate:
1. revisar branch de trabalho da Sprint 3;
2. validar escopo estritamente alinhado à SPEC;
3. confirmar evidências de validação (typecheck/test);
4. aprovar abertura de PR sem ampliar escopo.

## 6) Régua de evolução do projeto (etapas até entrega)

### Etapas já concluídas

1. **Etapa 0 — Fundação inicial (Sprint 0)** ✅
   - domínio inicial, state machine base, testes iniciais.
2. **Etapa 1 — Núcleo comercial (Sprint 1)** ✅
   - document core + hardening inicial + lifecycle/invoicing simples.
3. **Etapa 2 — Hardening de domínio (Sprint 2)** ✅
   - validation layer + refinamento semântico de erro de ajuste.
4. **Etapa 3 — SPEC-Led Domain Foundation Completion (Sprint 3, Slices 1-5)** ✅ (local)
   - fechamento de lacunas `REQUIRED_BY_SPEC` + fechamento documental local.

### Etapas pendentes até entrega deste ciclo

5. **Etapa 4 — Publicação controlada da Sprint 3** (pendente)
   - push da branch da sessão;
   - abertura de PR única da Sprint 3;
   - validação final de escopo/no-regression.

6. **Etapa 5 — Gate de revisão e decisão de merge** (pendente)
   - revisão técnica/documental do PR;
   - decisão explícita de merge (sem automação).

7. **Etapa 6 — Entrega operacional do ciclo** (pendente)
   - merge realizado;
   - validação pós-merge em `main`;
   - checkpoint de encerramento e definição formal do próximo ciclo.

### Etapas macro até entrega do MVP do projeto

8. **Etapa 7 — Planejamento técnico do próximo ciclo (pós Sprint 3)**
   - quebrar backlog `REQUIRED_BY_SPEC` em slices pequenos;
   - definir critérios de aceite, risco e validação por slice.

9. **Etapa 8 — Execução incremental dos slices do MVP**
   - implementar somente escopo alinhado à SPEC;
   - revisar e validar por PR pequena, sem salto de escopo.

10. **Etapa 9 — Consolidação operacional do MVP**
    - fechar lacunas críticas de domínio/reporting/RBAC previstas na SPEC;
    - validar consistência ponta a ponta do fluxo comercial canônico.

11. **Etapa 10 — Gate final de entrega do MVP**
    - evidência de critérios obrigatórios atendidos;
    - decisão executiva formal de entrega do ciclo MVP.

## 7) Próximos marcos imediatos

1. Publicar PR da sessão completa da Sprint 3 (quando autorizado).
2. Revisão de no-regression e aderência à SPEC.
3. Decisão de merge explícita (sem automação).
4. Definir próximo ciclo somente após gate fechado (sem criação automática de Slice 6).

## 8) Fora de escopo (neste ciclo)

- Slice 6 (não canônico sem nova decisão formal).
- Frontend/camada externa.
- Banco/migrations/integrações fiscais (NF-e/gateway/boleto).
- Integrações com legado SAGRADO.
- Refactors amplos sem requisito explícito da SPEC.

## 9) Dependências

- `docs/SPEC.md` (fonte de verdade).
- `docs/SPEC-OPS-ADDENDUM.md`, `docs/RBAC-MATRIX.md`, `docs/API-CONTRACTS.yaml`, `docs/DATA-MODEL-OPS.md`, `docs/REPORTS-DICTIONARY.md`.
- Gate documental: `docs/TEST-AND-RELEASE-GATE.md` e `docs/DECISION_SPEC_APPROVAL.md`.
- Decisão operacional de Toni/Atlas para janela de push/PR.

## 10) Decisões pendentes

1. Momento operacional de publicar push/PR da sessão completa da Sprint 3.
2. Critério de janela de merge após revisão do PR.
3. Priorização do próximo ciclo após fechamento efetivo do gate atual.

## 11) Riscos

1. **Risco de desvio de escopo:** abrir evolução fora da SPEC antes de fechar gate atual.
2. **Risco de regressão operacional:** publicar PR sem checklist final de no-regression.
3. **Risco de ambiguidade de fase:** iniciar novo slice sem decisão formal de ciclo.

## 12) Estimativa de tempo (dedicação)

Estimativa para fechar o ciclo atual (Etapas 4, 5 e 6):

1. **Preparação e publicação da Sprint 3 (Etapa 4):** 2h a 4h
2. **Revisão e decisão de merge (Etapa 5):** 2h a 6h (depende de rodada de revisão)
3. **Pós-merge e checkpoint de encerramento (Etapa 6):** 1h a 2h

**Total estimado para destravar e entregar o ciclo:** **5h a 12h** de dedicação operacional.

Estimativa macro para etapas 7 a 10 (até entrega do MVP), sujeita a detalhamento por slice:

- **Etapa 7 (planejamento técnico):** 4h a 8h
- **Etapa 8 (execução incremental MVP):** 2 a 6 semanas (dependente da quantidade de slices aprovados)
- **Etapa 9 (consolidação operacional):** 1 a 2 semanas
- **Etapa 10 (gate final de entrega MVP):** 4h a 12h

**Janela macro estimada até entrega MVP:** **3 a 8 semanas**, com revisão a cada gate.

## 13) Critério para iniciar implementação

Nova implementação só inicia quando **todos** forem verdadeiros:
1. gate atual (push/PR da Sprint 3) fechado com decisão explícita;
2. ciclo seguinte formalmente definido;
3. escopo novo mapeado como `REQUIRED_BY_SPEC` (ou aprovado por decisão formal);
4. branch de trabalho dedicada fora da `main`;
5. critérios de validação e aceite definidos antes de codar.
