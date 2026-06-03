# SCREEN FLOW MAP — ARCO-ERP V1 Operacional

> Status: Gate A — canônico para telas e fluxos  
> Base normativa: `docs/SPEC.md`, `docs/DECISION-FLOW-CANON.md`, `ROADMAP.md`  
> Insumo de descoberta local: `erp_app_flow_map.html` (não versionado neste gate)  
> Escopo: produto/fluxo funcional; não autoriza implementação técnica

## 1) Objetivo

Este documento canoniza o fluxo operacional da V1 do ARCO-ERP em Markdown revisável, sem transformar o `erp_app_flow_map.html` em fonte canônica permanente.

Ele deve alimentar os próximos gates:

- **Gate B — Data Model Decision**;
- **Gate C — RBAC + Audit Model**;
- **Gate D — API Contract Alignment**;
- **Gate E — Frontend Contract & Shell Plan**;
- testes funcionais e de regressão.

## 2) Fontes e hierarquia canônica

1. `docs/SPEC.md` — contrato de produto e invariantes.
2. `docs/DECISION-FLOW-CANON.md` — decisão de V1 operacional completa.
3. `ROADMAP.md` — slicing, sequência, gates e bloqueios.
4. `docs/SCREEN-FLOW-MAP.md` — mapa canônico de módulos, telas, ações e navegação.
5. `erp_app_flow_map.html` — insumo visual local, não versionado e não canônico.

Se houver conflito entre o HTML e este documento, prevalecem `docs/SPEC.md`, `docs/DECISION-FLOW-CANON.md` e este mapa canônico.

## 3) Invariantes funcionais

- V1 é operacional completa, não MVP mínimo.
- Comunicação, envio, impressão, PDF e link são eventos/badges, nunca `commercial_status`.
- Estados comerciais oficiais: `QUOTE_DRAFT`, `ORDER_CONFIRMED`, `INVOICED`, `CANCELED`.
- Orçamento salvo com cliente válido recebe número `ORC-####`.
- Pedido confirmado recebe número próprio `PED-####`.
- Pedido confirmado pode ser alterado por perfil autorizado com revisão auditável.
- Pedido faturado pode ser alterado por `ADMIN` com revisão auditável.
- Snapshot comercial preserva histórico, mas não impede revisão autorizada.
- RBAC e auditoria são requisitos da V1.
- Registro Operacional de Faturamento é manual/operacional; não é NF-e, SEFAZ, gateway ou boleto automático.

## 4) Módulos operacionais da V1

| Módulo | Papel na V1 | Entra na V1? | Observação |
| --- | --- | --- | --- |
| Autenticação | Entrada, sessão e recuperação de acesso | Sim | Sem login social obrigatório. |
| Home / Operação | KPIs, atalhos e alertas operacionais | Sim | Agenda avançada fica futura. |
| Clientes | Hub comercial do PDV/cliente | Sim | Cliente completo inclui contatos, endereços e condições. |
| Catálogo / Produtos | Produto completo e tabela de preços | Sim | Regras automáticas de desconto ficam futuras. |
| Comercial | Orçamento -> pedido -> revisão/eventos | Sim | Coração da V1. |
| Pagamento / Condições | Forma, prazo, parcelas e vencimentos | Sim | Não confundir com faturamento. |
| Financeiro / Relatórios | Listagens, vendas, envios, performance operacional | Sim | BI/fluxo de caixa avançado fica futuro. |
| Configurações | Perfil, preferências, RBAC/admin | Sim | `VISUALIZADOR` fora até decisão explícita. |

## 5) Fluxo principal canônico

```txt
A-001 Login
-> H-010 Home / KPIs
-> C-020 Lista de clientes
-> C-021 Perfil do cliente
-> C-026 Criar orçamento
-> O-041 Cliente (ou pular quando cliente já vier do perfil)
-> O-042 Produtos
-> O-043 Pagamento / condições
-> O-044 Revisar orçamento
-> O-045 Confirmar pedido
-> O-046 Pedido confirmado
-> O-047 Detalhe do pedido
-> O-048 Comunicação / saídas
-> O-049 Registro Operacional de Faturamento
-> O-050 Cancelamento / encerramento, quando aplicável
```

Regras do fluxo:

- O orçamento nasce salvo e numerado após cliente válido.
- Se o fluxo iniciar em `C-021`/`C-026`, o cliente pode vir pré-carregado e o step `O-041` pode ser apenas confirmação/revisão do contexto.
- `O-045` é o único ponto de conversão orçamento -> pedido.
- `O-048` não confirma pedido e não muda status.
- `O-049` registra faturamento operacional manual e pode levar o pedido a `INVOICED`.
- Alterações pós-confirmação/faturamento passam por revisão/auditoria.

## 6) Catálogo canônico de telas

### 6.1 Autenticação

| ID | Tela | Objetivo | Dados obrigatórios | Ação primária | Ações secundárias | Navega para | Status/evento | Permissões funcionais |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A-001 | Login | Autenticar usuário e iniciar sessão. | e-mail/usuário, senha | Entrar | Recuperar senha | H-010, A-002 | Sessão autenticada | Usuário válido |
| A-002 | Recuperar senha | Solicitar redefinição por e-mail. | e-mail cadastrado | Enviar link | Voltar ao login | A-003, A-001 | Evento de segurança/acesso | Usuário não autenticado |
| A-003 | Redefinir senha | Definir nova senha com token. | token, nova senha, confirmação | Salvar nova senha | Solicitar novo link | A-001 | Evento de segurança/acesso | Token válido |

### 6.2 Home / Operação

| ID | Tela | Objetivo | Dados obrigatórios | Ação primária | Ações secundárias | Navega para | Status/evento | Permissões funcionais |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| H-010 | Home / KPIs | Exibir visão operacional e atalhos. | período, KPIs operacionais, alertas | Iniciar novo orçamento | Ver clientes, pedidos, relatórios, catálogo, configurações | C-020, O-040, F-070, P-030 | Sem mudança comercial | ADMIN/REPRESENTANTE conforme escopo |
| H-011 | Notificações | Exibir alertas de pedidos, vencimentos e eventos. | notificações, tipo, vínculo | Ir para item relacionado | Marcar como lida | O-047, H-010 | Evento de leitura/notificação | ADMIN/REPRESENTANTE conforme escopo |
| H-012 | Agenda comercial | Agenda/follow-up comercial. | calendário, tarefas, vínculos | Ver tarefa do dia | Criar lembrete | C-021, O-040 | Futuro | Fora da V1 comum |

### 6.3 Clientes — Hub Comercial

| ID | Tela | Objetivo | Dados obrigatórios | Ação primária | Ações secundárias | Navega para | Status/evento | Permissões funcionais |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-020 | Lista de clientes | Buscar e selecionar cliente para operação. | nome/CNPJ, status, segmento, região/filtros | Abrir perfil | Novo cadastro, exportar, filtrar | C-021, C-022, O-041 | Sem mudança comercial | ADMIN todos; REPRESENTANTE carteira/escopo |
| C-021 | Perfil do cliente | Hub do cliente com dados, contatos, endereços, histórico e ação comercial. | razão/nome, CNPJ, endereço, contato principal, status, condição padrão | Criar orçamento | Editar, histórico, condições, pedidos | C-026, C-023, C-024, C-025, O-040 | Sem mudança comercial | ADMIN todos; REPRESENTANTE carteira/escopo |
| C-022 | Cadastro de cliente | Criar cliente completo para operação. | CNPJ/documento, razão/nome, endereço, contato, segmento, condição padrão | Salvar cliente | Cancelar | C-021 | Evento cadastral | ADMIN/REPRESENTANTE conforme política |
| C-023 | Edição de cadastro | Atualizar cliente sem afetar histórico já confirmado. | campos do cliente, motivo quando crítico | Salvar alterações | Cancelar, inativar | C-021 | Evento cadastral; não altera pedidos antigos | ADMIN; REPRESENTANTE conforme carteira/campo |
| C-024 | Histórico comercial | Consultar orçamentos, pedidos, notas e interações do cliente. | cliente, período, documentos | Ver detalhe | Adicionar nota, novo orçamento baseado, exportar | O-047, C-021 | Evento de nota/consulta | ADMIN todos; REPRESENTANTE carteira/escopo |
| C-025 | Condições do cliente | Definir condições comerciais padrão do cliente. | forma, prazo, limite, tabela aplicada | Salvar condição padrão | Usar no orçamento | G-060, O-041/O-043 | Evento cadastral/comercial | ADMIN; REPRESENTANTE se autorizado |
| C-026 | Criar orçamento | Iniciar orçamento com cliente pré-selecionado. | cliente válido | Ir para produtos | Cancelar e voltar | O-042, C-021 | Cria/salva orçamento `QUOTE_DRAFT` com `ORC-####` | ADMIN/REPRESENTANTE autorizado |

### 6.4 Catálogo / Produtos

| ID | Tela | Objetivo | Dados obrigatórios | Ação primária | Ações secundárias | Navega para | Status/evento | Permissões funcionais |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P-030 | Lista de produtos | Buscar produto por nome/SKU/marca/categoria. | SKU/nome, marca, categoria, disponibilidade | Ver detalhe | Adicionar ao orçamento aberto, ver preços | P-031, P-032, O-042 | Sem mudança comercial | ADMIN/REPRESENTANTE leitura; edição conforme RBAC |
| P-031 | Detalhe do produto | Exibir ficha técnica/comercial completa. | SKU, descrição, unidade/embalagem, marca, preço, disponibilidade | Adicionar ao orçamento | Ver tabela, compartilhar produto | O-042, P-032 | Sem mudança comercial; pode gerar output_event futuro | ADMIN/REPRESENTANTE leitura |
| P-032 | Tabela de preços | Selecionar/aplicar preço ao orçamento. | produto/linha, preço, faixa, condição, vigência/margem | Aplicar preço ao orçamento | Exportar, comparar faixas | O-042 | Snapshot de preço no orçamento/pedido | ADMIN configura; REPRESENTANTE aplica conforme regra |
| P-033 | Regras de desconto | Regras automáticas de desconto. | regra, validade, limite | Ativar regra | Testar, histórico | P-030, O-042 | Futuro | Fora da V1 comum |

### 6.5 Comercial — Orçamento -> Pedido

| ID | Tela | Objetivo | Dados obrigatórios | Ação primária | Ações secundárias | Navega para | Status/evento | Permissões funcionais |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O-040 | Lista de orçamentos / pedidos | Listar e filtrar documentos comerciais. | número, cliente, status, data, produto/marca | Abrir documento | Novo orçamento, exportar, filtrar | O-041, O-047 | Sem mudança comercial | ADMIN todos; REPRESENTANTE escopo |
| O-041 | Novo orçamento — Cliente | Confirmar cliente/contexto do orçamento. | cliente, endereço entrega, data desejada, observação | Próximo — Produtos | Cancelar/descartar | O-042 | Cria/salva `QUOTE_DRAFT` com `ORC-####` quando ainda não existir | ADMIN/REPRESENTANTE autorizado |
| O-042 | Novo orçamento — Produtos | Montar itens, quantidades e preços. | produto, quantidade, preço aplicado, subtotal | Próximo — Pagamento | adicionar/remover item, ajustar qtd, salvar rascunho | O-043, P-030 | Atualiza `QUOTE_DRAFT`; snapshot parcial | ADMIN/REPRESENTANTE autorizado; preço conforme RBAC |
| O-043 | Novo orçamento — Pagamento | Definir forma, prazo, parcelas e vencimentos. | forma, condição, prazo, parcelas/vencimentos, condição padrão | Próximo — Revisão | usar padrão, simular, voltar | O-044, G-062 | Atualiza `QUOTE_DRAFT`; snapshot de pagamento | ADMIN/REPRESENTANTE autorizado |
| O-044 | Revisar orçamento | Revisar cliente, itens, valores e pagamento antes da conversão. | resumo, itens, totais, condição, vencimentos, observações | Confirmar pedido | editar produtos, editar pagamento, salvar rascunho, cancelar | O-045, O-042, O-043 | Mantém `QUOTE_DRAFT` até confirmação | ADMIN/REPRESENTANTE autorizado |
| O-045 | Confirmar pedido | Converter orçamento em pedido. | confirmação explícita, orçamento válido, ator, sequência PED | Confirmar e gerar pedido | voltar à revisão | O-046 | `QUOTE_DRAFT -> ORDER_CONFIRMED`; gera `PED-####`; snapshot completo | ADMIN/REPRESENTANTE autorizado |
| O-046 | Pedido confirmado | Feedback de sucesso e próximas ações. | número PED, cliente, resumo, data/hora, status | Ver detalhe | comunicar, novo orçamento, home | O-047, O-048, H-010 | Sem nova transição; confirma exibição de `ORDER_CONFIRMED` | ADMIN/REPRESENTANTE escopo |
| O-047 | Detalhe do pedido | Exibir pedido, status, eventos, revisões e ações permitidas. | PED, status, cliente snapshot, itens, valores, pagamento, timeline | Ver timeline/revisões | comunicar, faturar, cancelar, ajustar se autorizado | O-048, O-049, O-050 | Pode iniciar eventos/revisões, mas não por visualização | ADMIN todos; REPRESENTANTE escopo e ações limitadas |
| O-048 | Comunicação / saídas | Registrar envio/geração/compartilhamento. | pedido/orçamento, contato/canal, formato | Enviar por WhatsApp | e-mail, PDF, copiar link, imprimir | O-047 | `output_event`; badge derivado; não muda `commercial_status` | ADMIN/REPRESENTANTE autorizado |
| O-049 | Registro Operacional de Faturamento | Registrar faturamento manual/operacional. | pedido confirmado, referência/documento manual, data, valor, vencimentos, observação | Registrar faturamento | corrigir se ADMIN, voltar | O-047 | `ORDER_CONFIRMED -> INVOICED`; revisão se corrigido | ADMIN; REPRESENTANTE sem permissão padrão |
| O-050 | Cancelamento / encerramento | Cancelar orçamento/pedido com motivo. | motivo, confirmação, ator, documento | Confirmar cancelamento | manter ativo | O-040, H-010 | `QUOTE_DRAFT/ORDER_CONFIRMED -> CANCELED`; revisão/evento | ADMIN para pedido; REPRESENTANTE apenas orçamento próprio, salvo regra futura |

### 6.6 Pagamento / Condições

| ID | Tela | Objetivo | Dados obrigatórios | Ação primária | Ações secundárias | Navega para | Status/evento | Permissões funcionais |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G-060 | Lista de condições comerciais | Gerir condições reutilizáveis. | nome, forma, prazo, tipo | Criar condição | editar, duplicar, inativar | G-061, O-043 | Evento cadastral | ADMIN configura; REPRESENTANTE lê/aplica |
| G-061 | Criar / editar condição | Criar/editar condição comercial. | nome, forma, tipo, prazo, parcelas | Salvar condição | cancelar, simular | G-060, G-062 | Evento cadastral; não altera pedidos antigos | ADMIN; REPRESENTANTE se autorizado |
| G-062 | Simulador de vencimentos | Calcular cronograma para orçamento/pedido. | valor, condição, data referência | Aplicar ao orçamento | simular nova, exportar | O-043 | Snapshot de vencimentos quando aplicado | ADMIN/REPRESENTANTE autorizado |
| G-063 | Regras de faturamento | Regras automáticas de crédito/faturamento. | limite/regra/integração | Salvar regra | testar | G-060, F-070 | Futuro | Fora da V1 comum |
| G-064 | Integração gateway pagamento | Gateway/links/boletos automáticos. | credenciais/configuração | Ativar integração | testar conexão | G-060 | Futuro | Fora da V1 |

### 6.7 Financeiro / Relatórios

| ID | Tela | Objetivo | Dados obrigatórios | Ação primária | Ações secundárias | Navega para | Status/evento | Permissões funcionais |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F-070 | Dashboard financeiro | Consolidar faturamento operacional, metas e indicadores. | período, pedidos, faturamento, metas/clientes | Ver relatório | ir para vendas, metas, exportar | F-071, F-072, F-073 | Consulta/relatório | ADMIN global; REPRESENTANTE escopo |
| F-071 | Relatório de vendas | Analisar pedidos por período, cliente, produto e marca. | período, agrupamento, status, totais | Exportar relatório | filtrar, CSV/PDF | H-010 | Consulta/relatório | ADMIN global; REPRESENTANTE escopo |
| F-072 | Comissões | Extrato de comissões/marcas. | período, marca, pedidos faturados, percentual | Exportar extrato | filtrar | F-070 | Relatório informativo; não bloqueante da V1 comum | Ambiguidade: comum vs representação |
| F-073 | Metas / desempenho | Acompanhar metas por período/marca/cliente. | meta, realizado, projeção | Editar metas | exportar, comparar | F-070 | Relatório/configuração | Ambiguidade: comum vs representação |
| F-074 | Fluxo de caixa | Projeção avançada de caixa. | vencimentos, período | Ver projeção | exportar | F-070 | Futuro | Fora da V1 comum |

### 6.8 Configurações

| ID | Tela | Objetivo | Dados obrigatórios | Ação primária | Ações secundárias | Navega para | Status/evento | Permissões funcionais |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S-080 | Perfil do usuário | Editar dados do próprio usuário. | nome, e-mail, telefone/WhatsApp, foto | Salvar alterações | alterar senha, sair | H-010 | Evento de usuário | Próprio usuário; admin conforme política |
| S-081 | Configurações gerais | Preferências operacionais e parâmetros. | notificações, marcas, preferências | Salvar configurações | gerenciar usuários/integrações | H-010, S-082 | Evento administrativo | ADMIN |
| S-082 | Usuários e acesso | Gerenciar usuários, perfis e status. | usuários, perfil, status | Criar usuário | editar permissões, desativar, resetar senha | H-010 | Evento RBAC/auditoria | ADMIN |
| S-083 | Integrações externas | APIs/webhooks externos. | credenciais, webhooks | Ativar integração | testar, logs | H-010 | Futuro | Fora da V1 sem decisão |

## 7) Status comercial vs eventos/output

| Conceito | Pode ser `commercial_status`? | Origem | Exemplo visual permitido |
| --- | --- | --- | --- |
| Orçamento em rascunho | Sim | `QUOTE_DRAFT` | Status: Rascunho |
| Pedido confirmado | Sim | `ORDER_CONFIRMED` | Status: Pedido confirmado |
| Faturado operacionalmente | Sim | `INVOICED` | Status: Faturado |
| Cancelado | Sim | `CANCELED` | Status: Cancelado |
| Enviado por WhatsApp | Não | `output_event` | Badge: Enviado por WhatsApp |
| PDF gerado | Não | `output_event` | Badge: PDF gerado |
| Impresso | Não | `output_event` | Badge: Impresso |
| Pedido ajustado | Não | `order_revision` + lifecycle event | Badge/linha de timeline: Revisado |

## 8) Regras ORC/PED no fluxo de telas

- `ORC-####` nasce quando o orçamento é salvo com cliente válido (`C-026` ou `O-041`).
- Steps `O-042`, `O-043` e `O-044` atualizam o orçamento; não criam pedido.
- `PED-####` nasce somente em `O-045`.
- Pedido mantém vínculo com orçamento de origem.
- Pedido confirmado congela snapshot comercial completo, mas pode receber revisão autorizada.
- Comunicação em `O-048` não gera `PED` e não altera status.

## 9) Conflitos resolvidos entre HTML visual e SPEC/Gate 0

| Ponto do HTML | Risco | Decisão canônica |
| --- | --- | --- |
| Lifecycle visual inclui “Compartilhado/Comunicado”. | Virar status comercial indevido. | Comunicação é `output_event`/badge, nunca `commercial_status`. |
| Pedido descrito como “imutável”. | Bloquear correções operacionais ou esconder mutações. | Pedido confirmado/faturado é preservado por snapshot e revisável por perfil com auditoria. |
| Faturamento cita NF/boleto/anexo. | Abrir escopo fiscal/gateway. | V1 só tem Registro Operacional de Faturamento manual. |
| S-082 cita `visualizador`. | Expandir RBAC cedo demais. | `VISUALIZADOR` fora da V1 sem decisão explícita. |
| Comissões/metas aparecem em financeiro/configurações. | Misturar lógica de representação com núcleo comum. | Mantidas como ambiguidade; não podem bloquear núcleo comum da V1. |
| HTML como arquivo visual. | Criar duas fontes canônicas. | HTML permanece insumo local; este Markdown é canônico. |

## 10) Entradas para Gate B — Data Model Decision

Gate B deve modelar, no mínimo:

- `customers` com contatos e endereços;
- `products` com marca, categoria, embalagem/unidade e disponibilidade operacional;
- `price_tables` com vigência/faixa/perfil/condição quando aplicável;
- `payment_terms` e `payment_schedules`;
- `quotes`/`orders` ou documento comercial híbrido;
- itens de orçamento/pedido com snapshot;
- `output_events`;
- `lifecycle_events`;
- `order_revisions`;
- `invoices_simple` ou nome técnico equivalente para Registro Operacional de Faturamento;
- vínculos de ownership/tenant/representante.

Decisões críticas para Gate B:

1. modelo único/híbrido/separado para orçamento e pedido;
2. composição exata do snapshot comercial;
3. vigência e aplicação da tabela de preço;
4. cardinalidade de contatos e endereços;
5. estrutura de revisão before/after;
6. como corrigir faturamento operacional sem fiscal real.

## 11) Entradas para Gate C — RBAC + Audit Model

Gate C deve detalhar permissões por ação para:

- criar/editar cliente;
- criar/editar produto;
- configurar/aplicar tabela de preço;
- configurar/aplicar condição de pagamento;
- criar/editar orçamento;
- confirmar pedido;
- alterar pedido confirmado;
- alterar pedido faturado;
- cancelar orçamento/pedido;
- registrar/corrigir faturamento operacional;
- executar comunicação/output;
- ver/exportar relatórios;
- gerenciar usuários/acesso.

Toda ação crítica deve definir: `Allow`, `Deny`, condição, motivo obrigatório e evento/revisão gerado.

## 12) Entradas para Gate D — API Contract Alignment

Gate D deve derivar contratos para:

- CRUD/consulta de clientes, contatos e endereços;
- CRUD/consulta de produtos;
- tabela de preço e aplicação de preço;
- condições de pagamento e simulação de vencimentos;
- criação/atualização de orçamento por steps;
- confirmação de pedido;
- comunicação/output events;
- Registro Operacional de Faturamento;
- revisão/auditoria;
- listagens e relatórios operacionais.

Regras de contrato:

- ações críticas exigem idempotência quando aplicável;
- erros 401/403/409/422 devem estar definidos;
- endpoints não podem aceitar status comerciais falsos;
- API não pode depender só de bloqueio de UI para RBAC.

## 13) Entradas para Gate E — Frontend Contract & Shell Plan

Gate E deve planejar:

- rotas por módulo;
- navegação principal e breadcrumbs;
- estados visuais oficiais vs badges derivados;
- telas de loading/empty/error;
- bloqueios/desabilitação por permissão;
- confirmação de ações críticas;
- timeline de eventos/revisões;
- impressão/visualização/compartilhamento sem mutar status.

## 14) Ambiguidades restantes

Estas ambiguidades não autorizam implementação técnica:

1. Campos finais de cliente completo e obrigatoriedade de múltiplos endereços.
2. Contato principal obrigatório vs múltiplos contatos opcionais.
3. Estoque/disponibilidade: informativo ou bloqueante?
4. Tabela de preço: vigência, perfil de cliente, condição e margem mínima.
5. Preço editável: limites por perfil e necessidade de motivo.
6. Condições de pagamento padrão da V1 e prazos configuráveis.
7. Faturamento operacional: como corrigir/cancelar sem criar estado fiscal.
8. Comissões/metas: relatório comum da V1 ou extensão específica de representação.
9. Autenticação adicional para confirmar pedido ou alterar pedido faturado.
10. Exportações: CSV/PDF entram por tela ou por relatório específico?

## 15) Critérios de aceite do Gate A

Gate A passa se:

1. este documento for aceito como mapa funcional canônico de telas/fluxos;
2. `docs/SPEC.md` permanecer contrato de produto, sem duplicar todo o screen map;
3. `erp_app_flow_map.html` permanecer não versionado e inalterado;
4. comunicação estiver separada de `commercial_status`;
5. pedido confirmado/faturado estiver revisável por permissão e auditoria;
6. cliente, produto, preço, pagamento, RBAC, auditoria e faturamento operacional permanecerem na V1;
7. próximos gates B/C/D/E tiverem entradas claras;
8. nenhuma alteração técnica tiver sido feita.

## 16) Próximo gate recomendado

Executar **Gate B — Data Model Decision**.

Motivo: o screen flow agora define os objetos, ações, snapshots, revisões e eventos que o modelo de dados precisa suportar. Sem Gate B, qualquer migration, API ou frontend deve permanecer `Blocked`.
