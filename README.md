# ARCO-ERP (v0)

Status atual: **Sprints 0, 1 e 2 concluídas na `main` + Sprint 3 em planejamento SPEC-led (sem implementação iniciada)**.

Este repositório inicia o ARCO-ERP do zero, com baseline canônica na SPEC.

## Regra canônica de execução

- **SPEC é a fonte de verdade.**
- SAGRADO-PEDIDOS é legado e serve apenas para consulta pontual histórica.
- Qualquer mudança de escopo deve ser registrada em decisão formal.

## Documento canônico

- `docs/SPEC.md`

## Arquivo de retomada da próxima sessão

- `START.md`

## Estado entregue até agora

- Sprint 0: fundação inicial de domínio (state machine, RBAC/ownership, reasons, testes base).
- Sprint 1: núcleo de documento comercial + hardening inicial + lifecycle/invoicing.
- Sprint 2: domain hardening & validation layer + refinamento semântico de erro de ajuste.

## Validações atuais

- `npm run typecheck`: **PASS**
- `npm run test`: **PASS (39/39)**

## Sprint 3 planejada

Nome: **Sprint 3 — SPEC-Led Domain Foundation Completion**

Direção:
- fechar lacunas **REQUIRED_BY_SPEC** antes de fluxo operacional mais amplo;
- evitar hardening genérico e abstrações sem caso real na SPEC.

## Limites obrigatórios

- `main` protegida.
- sem ampliação de escopo fora da SPEC.
- sem merge automático de PR.
- sem frontend/camada externa/banco/integrações de legado nesta fase.

## Próximo gate obrigatório

- Autorizar explicitamente a implementação da Sprint 3 em branch técnica:
  - `feat/sprint3-spec-led-domain-foundation`

## Rastreabilidade recente

- PR Sprint 2 (hardening): `https://github.com/Replinkrub/REPLINK-ARCO-ERP/pull/7`
- PR Sprint 2 (refino semântico): `https://github.com/Replinkrub/REPLINK-ARCO-ERP/pull/8`
