# DECISION — SPEC Approval Gate (ARCO-ERP v0)

Data: 2026-05-28
Status: **GO DOCUMENTAL LIMPO / NO-GO IMPLEMENTAÇÃO (até decisão executiva final)**

## Recomendação técnica recebida

- Gate técnico (spec-engineer): **APPROVED_WITH_CONDITIONS**

## Decisão operacional proposta

- **Não iniciar implementação ainda**.
- Executar um sprint curto de hardening da SPEC para fechar as condições obrigatórias.

## Atualização de fechamento documental (2026-05-28)

- Sprint documental de hardening concluída com artefatos derivados da SPEC.
- Gate documental interno: **GO limpo (condições técnicas documentais fechadas)**.
- Estado atual: **apto para solicitar decisão executiva de início de implementação**, mantendo bloqueio de código até aprovação formal.
- Pendências técnicas documentais: **nenhuma**.
- Pendência restante: decisão executiva formal de início de implementação.

## Pacote de decisão executiva (Go/No-Go implementação)

### Contexto curto

O ARCO-ERP v0 já possui baseline consolidada + pacote documental de operacionalização.
O projeto está pronto para sair de planning e entrar em execução técnica **se houver decisão formal**.

### Opções viáveis

1. **GO controlado (recomendado)**
   - autoriza início de implementação técnica;
   - mantém validações documentais como checklist obrigatório da Sprint 0 de execução;
   - sem ampliar escopo além da SPEC v1.

2. **NO-GO temporário (mais conservador)**
   - mantém o projeto em planning-only;
   - exige nova revisão executiva antes de qualquer código.

### Recomendação Atlas

**Opção 1 — GO controlado**, por preservar cadência sem perder governança.

### Risco de não decidir

- atraso do início do ARCO-ERP;
- reabertura de discussões já fechadas;
- aumento de custo de coordenação e dependência do Toni.

### Prazo sugerido para decisão

**até 2026-05-30**

### Registro da decisão executiva

- `DECISAO_EXECUTIVA:` _pendente_
- `RESPONSAVEL_DECISAO:` Toni
- `DATA_DECISAO:` _pendente_

## Critérios para virar APPROVED

1. Fluxos críticos com critérios de aceite testáveis.
2. Matriz de permissões por ação/tela consolidada.
3. Regras de integridade/concorrência definidas.
4. Contrato mínimo dos relatórios fechado.
5. Política de legado explícita (SAGRADO consulta pontual apenas).

## Observação canônica

SAGRADO-PEDIDOS permanece legado e não deve receber evolução de produto.
