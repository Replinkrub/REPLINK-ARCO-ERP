# SPEC Review — ARCO-ERP v0

Revisor: **spec-engineer (gate de planejamento)**
Data: 2026-05-28

## Resultado do gate

**APPROVED_WITH_CONDITIONS**

A SPEC está apta para avançar em **planejamento técnico**, mas ainda não para implementação.

## Pontos fortes

- Identidade canônica clara (ARCO-ERP novo, SAGRADO legado).
- State machine comercial objetiva.
- Fronteiras de MVP e NO-GO bem definidas.
- Separação entre estado comercial e comunicação.

## Riscos principais

1. Critérios de aceite ainda macro (falta detalhe Given/When/Then).
2. Regras de concorrência/idempotência não especificadas.
3. Matriz de permissões por ação/tela ainda incompleta.
4. Contrato operacional dos relatórios precisa detalhamento.
5. Risco de recontaminação por conceitos legados se governança falhar.

## Condições obrigatórias antes de implementar

1. Fechar critérios testáveis dos fluxos críticos.
2. Publicar matriz de autorização por perfil/ação.
3. Definir regras de integridade transacional e conflito.
4. Fechar contrato funcional dos relatórios MVP.
5. Reafirmar política: SAGRADO somente consulta pontual.
