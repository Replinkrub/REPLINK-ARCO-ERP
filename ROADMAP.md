# ROADMAP — ARCO-ERP (Produto + Execução Técnica)

> Última atualização: 2026-06-01  
> Dono operacional: Atlas  
> Dono da prioridade executiva: Toni  
> Fonte de verdade funcional: `docs/SPEC.md`

## 0) Papel deste arquivo (e separação de responsabilidades)

Este `ROADMAP.md` define **evolução de produto + evolução técnica por fases**, com prioridades, gates e critérios de aceite.

Não é arquivo de diário de sessão.

- Estado da sessão, branch, PR, comandos de retomada => `START.md` (ou futuro `session_start.md` local).
- Decisão e gate de ciclo => `docs/DECISION_SPEC_APPROVAL.md` e `docs/TEST-AND-RELEASE-GATE.md`.

## 1) Visão do produto

O ARCO-ERP deve operar como fluxo comercial canônico, previsível e auditável:

**cliente -> orçamento -> pedido -> envio/impressão -> faturamento simples**

Regras centrais:
- SPEC governa nomenclatura, estados e permissões;
- comunicação (enviar/imprimir) é evento de saída, não mudança de status comercial;
- SAGRADO-PEDIDOS é legado de consulta pontual, sem acoplamento funcional.

## 2) Fase atual (separação clara do que já foi feito)

### Já concluído
- Sprint 0, Sprint 1 e Sprint 2 mergeadas em `main`.
- Sprint 3 (Slices 1-5) concluída no escopo técnico/documental.

### Falta fechar no ciclo atual (não é evolução nova de produto)
- push da branch final da Sprint 3 (se aplicável);
- PR de fechamento da Sprint 3;
- revisão de escopo/no-regression;
- merge explícito;
- validação pós-merge em `main`.

## 3) Ordem de prioridade (régua de execução)

- **P0**: necessário para operação mínima do fluxo comercial canônico.
- **P1**: necessário para controle, segurança operacional e auditabilidade.
- **P2**: melhoria posterior sem bloquear operação mínima.

Classificação atual:
- Etapa 4, 5, 6, 8 => **P0**
- Etapa 7, 9 => **P1**
- Evoluções não essenciais pós-MVP => **P2**

## 4) Mapa de fases (produto + execução técnica)

## Etapa 4 — Fechamento e publicação da fundação de domínio (**P0**) 

**Objetivo da fase**  
Fechar corretamente o ciclo da Sprint 3 já implementado.

**Entregável prático**  
PR de fechamento da Sprint 3 revisado, aprovado e mergeado com validação pós-merge.

**Módulos/áreas de código prováveis**  
`src/domain`, `tests/*.spec.ts`, `docs/*gate*`, `README.md`, `START.md`.

**Requisitos funcionais**
1. branch final revisada sem desvio de escopo;
2. PR única de fechamento com rastreabilidade da SPEC;
3. main validada após merge.

**Critérios de aceite**
- PR da Sprint 3 sem findings High abertos;
- escopo estritamente alinhado ao que já foi decidido;
- checkpoint pós-merge registrado.

**Validações obrigatórias (gate)**
- `npm run typecheck`
- `npm run test`
- revisão de escopo (SPEC x diff)
- aceite funcional de fechamento do ciclo

**Fora de escopo**
- iniciar Slice 6;
- abrir nova feature de produto.

## Etapa 5 — Fluxo operacional de orçamento (**P0**)

**Objetivo da fase**  
Garantir orçamento operacional íntegro desde criação até atualização.

**Entregável prático**  
Fluxo de orçamento estável com numeração, estado inicial e atualização sem ambiguidade.

**Módulos/áreas de código prováveis**  
`src/domain/*quote*`, camada de aplicação/use cases (quando aberta), persistência de quotes.

**Requisitos funcionais**
1. numeração de orçamento consistente (`ORC-####`);
2. criação ao selecionar cliente válido;
3. estado inicial correto (`QUOTE_DRAFT`);
4. salvar/atualizar sem converter status indevidamente.

**Critérios de aceite**
- criação de orçamento sempre vinculada a cliente válido;
- status comercial preservado em edições;
- casos de erro de entrada com resposta previsível.

**Validações obrigatórias (gate)**
- `npm run typecheck`
- `npm run test` (incluindo cenários de orçamento)
- build quando aplicável
- revisão de escopo e aceite funcional

**Fora de escopo**
- comunicação por canais externos como critério de conclusão de orçamento;
- fiscal completo.

## Etapa 6 — Conversão orçamento -> pedido (**P0**)

**Objetivo da fase**  
Fechar conversão comercial correta por ação explícita.

**Entregável prático**  
Ação "Gerar Pedido" convertendo orçamento em pedido com vínculo rastreável.

**Módulos/áreas de código prováveis**  
`src/domain/commercialDocument*`, `src/domain/events*`, testes de conversão.

**Requisitos funcionais**
1. ação explícita "Gerar Pedido";
2. manter vínculo com orçamento origem (`source_quote_id`/equivalente);
3. transição de status conforme SPEC;
4. impedir que ação de envio altere tipo/status comercial.

**Critérios de aceite**
- cada pedido confirmado referencia orçamento origem;
- conversão só ocorre na ação canônica;
- envio/impressão não converte status.

**Validações obrigatórias (gate)**
- `npm run typecheck`
- `npm run test` (conversão positiva/negativa)
- revisão de escopo e aceite funcional

**Fora de escopo**
- atalhos de conversão por evento de comunicação;
- automações externas de faturamento.

## Etapa 7 — Comunicação do documento (**P1**)

**Objetivo da fase**  
Separar definitivamente comunicação de estado comercial.

**Entregável prático**  
Ações de enviar/imprimir registradas como `output_events` com rastreabilidade.

**Módulos/áreas de código prováveis**  
`src/domain/outputEvents*`, API/backend de comunicação, camada de integração futura.

**Requisitos funcionais**
1. enviar e-mail/WhatsApp/imprimir como ação de comunicação;
2. não alterar tipo/status comercial do documento;
3. registrar evento de envio/impressão.

**Critérios de aceite**
- documento mantém estado comercial após envio;
- trilha de comunicação auditável por evento.

**Validações obrigatórias (gate)**
- `npm run typecheck`
- `npm run test` (pós-envio sem mudança de status)
- build quando aplicável
- revisão de escopo e aceite funcional

**Fora de escopo**
- motor de campanhas;
- automação comercial fora do fluxo core.

## Etapa 8 — Fechamento de pedido (**P0**)

**Objetivo da fase**  
Consolidar ciclo de vida de pedido confirmado com regras administrativas e auditoria.

**Entregável prático**  
Fluxo de revisão administrativa, cancelamento e histórico de eventos consistente.

**Módulos/áreas de código prováveis**  
`src/domain/*order*`, `order_revisions`, `lifecycle_events`, RBAC/authorization.

**Requisitos funcionais**
1. pedido confirmado com regras de transição válidas;
2. revisão administrativa auditável;
3. cancelamento com política por perfil;
4. histórico de eventos íntegro;
5. regras bloqueantes mínimas para ações inválidas.

**Critérios de aceite**
- ações ADMIN e REPRESENTANTE respeitam RBAC;
- eventos de revisão/cancelamento rastreáveis;
- bloqueios funcionam para operações proibidas.

**Validações obrigatórias (gate)**
- `npm run typecheck`
- `npm run test` (RBAC + ciclo de pedido)
- revisão de escopo e aceite funcional

**Fora de escopo**
- workflows enterprise genéricos;
- integrações legadas.

## Etapa 9 — Faturamento simples / preparação fiscal (**P1**)

**Objetivo da fase**  
Fechar separação entre pedido e faturamento simples, preparando base para fase fiscal futura.

**Entregável prático**  
Contrato de dados de faturamento simples estável e alinhado à SPEC.

**Módulos/áreas de código prováveis**  
`invoices_simple` (modelo), regras de transição para `INVOICED`, API de registro simples.

**Requisitos funcionais**
1. separar pedido de faturamento;
2. registrar faturamento simples sem NF-e;
3. preparar contrato de dados para evolução fiscal futura.

**Critérios de aceite**
- faturamento simples não invade escopo fiscal completo;
- status e eventos coerentes com a SPEC;
- contrato de dados documentado.

**Validações obrigatórias (gate)**
- `npm run typecheck`
- `npm run test`
- build quando aplicável
- revisão de escopo e aceite funcional

**Fora de escopo**
- NF-e completa;
- gateway/boleto;
- fiscal avançado sem decisão formal.

## 5) Mapa técnico por área

### 5.1 Domínio
- fonte principal no estado atual: `src/domain`;
- manter invariantes de estado comercial, numeração e eventos canônicos;
- priorizar regras explícitas e testáveis.

### 5.2 Aplicação / use cases
- abrir/expandir camada de casos de uso por etapa (orçamento, conversão, faturamento);
- orquestrar regras sem duplicar lógica de domínio.

### 5.3 Persistência
- consolidar entidades de quotes/orders/revisions/events/invoices simples;
- garantir vínculo quote->order e trilha auditável.

### 5.4 API / backend
- expor ações canônicas (criar orçamento, gerar pedido, enviar, faturar simples);
- preservar semântica de erro e idempotência conforme contratos.

### 5.5 Frontend
- liberar evolução de frontend **somente após fechamento da fundação necessária em main**;
- UI deve refletir regras canônicas de status/ação, sem atalhos semânticos.

### 5.6 Testes
- mínimo obrigatório por etapa: cenário positivo + negação crítica;
- manter cobertura de regressão para status, conversão e RBAC;
- comandos de gate: typecheck + tests (+ build quando existir).

### 5.7 Documentação
- `docs/SPEC.md` e artefatos derivados sincronizados a cada mudança relevante;
- `ROADMAP.md` registra evolução por fases;
- `START.md` registra estado de sessão/retomada.

## 6) Gates obrigatórios por etapa

Toda etapa só avança com gate `Pass` contendo:
1. `npm run typecheck` (obrigatório)
2. `npm run test` (obrigatório)
3. `npm run build` quando aplicável
4. revisão de escopo (SPEC x mudança)
5. aceite funcional da etapa

Sem esses 5 itens => etapa permanece `Blocked`.

## 7) Anti-escopo (regras de proteção)

1. Não iniciar Slice 6 sem decisão formal.
2. Não misturar evolução com SAGRADO-PEDIDOS.
3. Não pular para fiscal completo sem aprovação executiva.
4. Não transformar envio/impressão em mudança de status comercial.
5. Não iniciar frontend antes da fundação necessária estar mergeada em `main`.
6. Não executar implementações fora da SPEC sem decisão formal de escopo.

## 8) Estimativa de dedicação

### Fechamento do ciclo atual (Etapa 4)
- 4h a 10h (publicação, revisão, merge, pós-merge)

### Evolução técnica até MVP operacional (Etapas 5 a 9)
- Etapa 5: 3 a 6 dias
- Etapa 6: 3 a 6 dias
- Etapa 7: 2 a 5 dias
- Etapa 8: 4 a 8 dias
- Etapa 9: 3 a 6 dias

Janela estimada total: **3 a 8 semanas**, com revisão por gate.
