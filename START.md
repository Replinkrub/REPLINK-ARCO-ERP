# ARCO-ERP — START

## Estado atual

- Projeto: ARCO-ERP
- Estado: pronto para iniciar Sprint 3
- Sprint 0: concluída
- Sprint 1: concluída
- Sprint 2: concluída
- Main: sincronizada com origin/main no último gate conhecido
- Typecheck: PASS
- Tests: PASS — 39/39
- Próximo trabalho: Sprint 3 — SPEC-Led Domain Foundation Completion

## Decisão canônica

A Sprint 3 deve seguir a SPEC.

A prioridade é fechar lacunas estruturais exigidas pela SPEC antes de avançar para fluxos operacionais mais amplos.

Regra:
- SPEC > pressa de feature.
- Base sólida antes de camada superior.
- Não criar abstrações sem necessidade real.
- Não fazer hardening genérico.
- Só implementar o que for REQUIRED_BY_SPEC, testável e local ao domínio.

## Sprint 3 — SPEC-Led Domain Foundation Completion

Objetivo:
Fechar lacunas de fundação de domínio exigidas pela SPEC.

Lacunas REQUIRED_BY_SPEC:

1. Numeração canônica
- ORC-####
- PED-####

2. Conversão quote → order
- vínculo explícito source_quote_id
- snapshot mínimo dedicado

3. Ajuste administrativo
- estrutura explícita de order_revision
- evento ORDER_ADJUSTED

4. Output events
- separar semanticamente output_events de lifecycle_events
- output_event não altera status comercial

5. Dupla confirmação
- contrato canônico de negação/conflito para confirmação duplicada
- sem modelagem distribuída/lock avançado nesta fase

6. Documentação de gate
- atualizar estado real pós Sprint 2
- manter rastreabilidade com SPEC

## Escopo permitido da Sprint 3

- domínio puro
- tipos de domínio
- regras comerciais exigidas pela SPEC
- testes positivos/negativos
- documentação factual de gate

## Escopo proibido

- frontend
- API/camada externa
- banco/persistência/migration
- integração fiscal real
- integração com Sagrado/legado
- importação/migração de legado
- workflow engine genérico
- abstrações futuras sem caso SPEC

## Critério anti-overengineering

Um item só entra se responder SIM para todas:

1. Está explícito na SPEC/Addendum/RBAC?
2. Protege regra comercial central?
3. Tem teste objetivo?
4. É local ao domínio?
5. Reduz ambiguidade real?

Se qualquer resposta for NÃO, deixar fora da Sprint 3.

## Plano recomendado

Slice 1:
Numeração canônica ORC/PED + testes.

Slice 2:
Conversão quote→order com source_quote_id e snapshot mínimo + testes.

Slice 3:
order_revision explícito no ajuste administrativo + testes.

Slice 4:
Separação output_events vs lifecycle_events + testes de regressão.

Slice 5:
Atualização documental final e checklist anti-overengineering.

## Stash técnico preservado

Existe stash técnico anterior:

wip/test-sprint2-commercial-flow-e2e-before-sprint3-kickoff

Regra:
Não aplicar automaticamente.
Só avaliar depois que Sprint 3 estiver aberta e se o conteúdo ajudar a validar fluxo sem contrariar a SPEC.

## Primeiro comando da próxima sessão

Validar estado:

git checkout main
git pull --ff-only origin main
git status -sb
npm run typecheck
npm run test

Depois ler:

1. START.md
2. docs/SPEC.md
3. docs/SPEC_REVIEW.md
4. docs/SPEC-OPS-ADDENDUM.md
5. docs/RBAC-MATRIX.md
6. docs/TEST-AND-RELEASE-GATE.md
7. docs/DECISION_SPEC_APPROVAL.md
8. src/domain
9. tests

## Gate seguinte

Autorizar implementação da Sprint 3 em branch técnica:

feat/sprint3-spec-led-domain-foundation

Não implementar antes desse gate.
