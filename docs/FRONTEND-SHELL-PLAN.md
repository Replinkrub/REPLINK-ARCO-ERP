# Frontend Shell Plan — ARCO-ERP V1 Operacional

> Status: Gate E — Frontend Contract & Shell Plan  
> Complementa: `docs/FRONTEND-CONTRACT-OPS.md`  
> Base: `docs/SCREEN-FLOW-MAP.md`, `docs/API-CONTRACTS-OPS.md`, `docs/RBAC-MATRIX.md`  
> Escopo: shell, navegação, rotas e fatias futuras de implementação; não cria telas nem componentes

## 1) Objetivo

Definir como o shell operacional da V1 deve organizar login, home, navegação, módulos, rotas, estados e bloqueios antes da implementação frontend.

Este documento não é design visual pixel-perfect. Ele fixa a estrutura mínima para evitar que a implementação reduza a V1 a pedido simples ou crie UI que contradiga RBAC/API/auditoria.

## 2) Estrutura de rotas proposta

Rotas são contrato semântico de navegação. Nome final, nesting, parâmetros e convenção técnica podem seguir o framework durante implementação, desde que preservem módulo, intenção de tela, dependências de API/RBAC e separação entre ORC, PED, comunicação, revisão e faturamento.

| Rota | Tela/área | Módulo | Dependência principal |
| --- | --- | --- | --- |
| `/login` | Login | Auth | sessão/auth |
| `/recuperar-senha` | Recuperar senha | Auth | auth futura |
| `/redefinir-senha` | Redefinir senha | Auth | auth futura |
| `/` | Home operacional | Home | KPIs/listagens conforme perfil |
| `/clientes` | Lista de clientes | Clientes | `GET /v1/customers` |
| `/clientes/novo` | Cadastro de cliente | Clientes | `POST /v1/customers` |
| `/clientes/:customerId` | Perfil do cliente | Clientes | `GET /v1/customers/{customerId}` |
| `/clientes/:customerId/editar` | Editar cliente | Clientes | `PATCH /v1/customers/{customerId}` |
| `/clientes/:customerId/historico` | Histórico comercial | Clientes | documentos filtrados |
| `/produtos` | Lista de produtos | Produtos | `GET /v1/products` |
| `/produtos/novo` | Cadastro de produto | Produtos | `POST /v1/products` |
| `/produtos/:productId` | Detalhe do produto | Produtos | detalhe/edição produto |
| `/tabelas-preco` | Lista de tabelas | Preços | `GET /v1/price-tables` |
| `/tabelas-preco/:priceTableId` | Detalhe/itens da tabela | Preços | itens/vigência |
| `/condicoes-pagamento` | Lista de condições | Pagamento | `GET /v1/payment-terms` |
| `/condicoes-pagamento/:paymentTermId` | Editar condição | Pagamento | `PATCH /v1/payment-terms/{paymentTermId}` |
| `/orcamentos/novo` | Novo orçamento — cliente | Comercial | `POST /v1/quotes` |
| `/orcamentos/:quoteId/produtos` | Orçamento — produtos | Comercial | `PATCH /v1/quotes/{quoteId}` |
| `/orcamentos/:quoteId/pagamento` | Orçamento — pagamento | Comercial | quote patch + condições |
| `/orcamentos/:quoteId/revisao` | Revisar orçamento | Comercial | quote detail |
| `/orcamentos/:quoteId/confirmar` | Confirmar ORC → PED | Comercial | `confirmQuoteToOrder` |
| `/pedidos` | Lista ORC/PED | Comercial | `GET /v1/commercial-documents` |
| `/pedidos/:orderId` | Detalhe do pedido | Comercial | `GET /v1/orders/{orderId}` |
| `/pedidos/:orderId/revisar` | Revisar pedido confirmado | Comercial | `revise_confirmed_order` |
| `/pedidos/:orderId/revisar-faturado` | Revisar pedido faturado | Comercial | `revise_invoiced_order` |
| `/pedidos/:orderId/comunicacao` | Comunicação/output | Comercial | `send_output` |
| `/pedidos/:orderId/faturamento` | Registro operacional | Faturamento | `register_operational_invoice` |
| `/pedidos/:orderId/faturamento/corrigir` | Correção faturamento | Faturamento | `correct_operational_invoice` |
| `/pedidos/:orderId/cancelar` | Cancelamento | Comercial | `cancel_order` |
| `/relatorios` | Hub relatórios | Relatórios | reports/listagens |
| `/relatorios/vendas` | Vendas | Relatórios | filtros/exports |
| `/relatorios/envios` | Envios/compartilhamentos | Relatórios | output events |
| `/configuracoes` | Configurações gerais | Configurações | ADMIN |
| `/configuracoes/usuarios` | Usuários e acesso | Configurações | `manage_roles` futuro/API |
| `/perfil` | Perfil do usuário | Configurações | sessão/usuário |

## 3) Layout shell/nav principal

### 3.1 Áreas fixas

- Topbar: nome do tenant, usuário/perfil ativo, busca rápida quando implementada, estado de sessão.
- Sidebar ou nav principal: Home, Clientes, Produtos, Tabelas de preço, Condições de pagamento, Pedidos, Faturamento, Relatórios, Configurações.
- Área de conteúdo: título, breadcrumbs, status/badges/contexto, ações primárias, conteúdo principal.
- Área de feedback: toasts não substituem timeline/audit; apenas confirmam interação imediata.

### 3.2 Regras de navegação

- Nav pode ocultar módulos bloqueados por perfil, mas backend continua fonte real de autorização.
- Nav e ações derivam de `available_actions`/perfil retornados pela API quando disponível; isso orienta a UI, não substitui RBAC server-side e pode mudar entre leitura e execução.
- Configurações/usuários aparecem apenas para perfil autorizado.
- Faturamento deve ser módulo/atalho operacional, mas ações só aparecem no pedido quando `available_actions` permitir.
- Comunicação não aparece como etapa de status; aparece como ação/área dentro do documento.

## 4) Home operacional

Home deve funcionar como cockpit operacional:

- atalhos: novo orçamento, clientes, pedidos, produtos, preços, condições, faturamento, relatórios;
- blocos: orçamentos abertos, pedidos confirmados recentes, pedidos faturados, pendências de revisão/faturamento quando API suportar;
- alertas: conflitos/revisões/faturamento pendente quando disponível;
- escopo: ADMIN vê tenant; REPRESENTANTE vê carteira/próprios; GESTOR_COMERCIAL vê equipe explicitamente vinculada.

Não incluir agenda/CRM avançado como requisito bloqueante da V1 comum.

## 5) Agrupamento de módulos no shell

| Grupo nav | Rotas | Observação |
| --- | --- | --- |
| Operação | `/`, `/pedidos`, `/orcamentos/novo` | núcleo comercial diário |
| Clientes | `/clientes`, `/clientes/*` | cliente completo, contatos, endereços |
| Catálogo | `/produtos`, `/tabelas-preco` | produto + preço sem regra automática avançada |
| Pagamento | `/condicoes-pagamento` | condição/simulação, não faturamento |
| Faturamento | `/pedidos/:id/faturamento*`, filtros de faturados | Registro Operacional manual, sem fiscal real |
| Relatórios | `/relatorios/*` | listagens operacionais e export quando permitido |
| Configurações | `/configuracoes/*`, `/perfil` | RBAC/admin/perfil |

## 6) Ações por tela principal

| Tela | Ação primária | Ações secundárias | Bloqueio visual |
| --- | --- | --- | --- |
| Home | Novo orçamento | abrir clientes/pedidos/relatórios | ação ausente por perfil |
| Clientes lista | Abrir cliente | novo, filtros, export futuro | 403/404 fora de escopo |
| Cliente perfil | Criar orçamento | editar, histórico, contatos, endereços | edição conforme RBAC |
| Produtos lista | Abrir produto | novo/editar se permitido | REP sem create/edit |
| Tabela preço | Editar item se permitido | vigência/filtros | 409 vigência conflitante |
| Condição pagamento | Criar/editar se permitido | simular/aplicar | REP sem edição padrão |
| Orçamento steps | Próximo step | salvar rascunho, voltar | validação 422 |
| Revisar orçamento | Confirmar pedido | editar produtos/pagamento, cancelar | action ausente/conflict |
| Pedido detalhe | Comunicação/timeline | faturar, cancelar, revisar se permitido | por `available_actions` |
| Revisão pedido | Salvar revisão | cancelar revisão | motivo/revision conflict |
| Faturamento | Registrar | voltar/corrigir se ADMIN | 409 registro ativo |
| Comunicação | Enviar/Gerar PDF | imprimir, copiar link | não muda status |
| Cancelamento | Confirmar cancelamento | manter ativo | motivo + confirmação forte |

## 7) Componentes conceituais necessários na implementação futura

Estes são contratos conceituais, não componentes criados neste gate:

- `StatusChip`: renderiza somente `commercial_status` oficial.
- `OutputBadges`: renderiza eventos de comunicação/PDF/impressão/link.
- `AvailableActionsBar`: renderiza ações a partir de `available_actions`.
- `ReasonModal`: coleta `reason_code`/`reason_note`.
- `StrongConfirmationDialog`: confirma ações de alto impacto.
- `RevisionTimeline`: exibe lifecycle, revisions, output e audit autorizado.
- `RevisionDiffTable`: exibe before/after por campo crítico.
- `IdempotentSubmitButton`: previne duplo clique e reaproveita key durante retry.
- `ConflictBanner`: orienta refetch/compare/abrir recurso existente e diferencia `IDEMPOTENCY_CONFLICT`, `REVISION_CONFLICT`, `ACTIVE_OPERATIONAL_INVOICE_EXISTS` e `INVALID_STATE_TRANSITION`.
- `AccessDeniedState`: comunica bloqueio sem sugerir bypass.

Implementação futura deve reutilizar padrões existentes do projeto; estes nomes são semânticos e não obrigam nomenclatura técnica.

## 8) Bloqueios por dependência

| Área | Fica bloqueada até | Motivo |
| --- | --- | --- |
| Rotas reais/telas | Gate I + API slice correspondente | Gate E é planejamento |
| Migrations/dados | Gate F/G | Data model ainda não virou migration |
| Actions críticas reais | Gate H | precisam backend/API + RBAC + audit |
| Timeline/revisões reais | Gate H | depende de eventos/revisões persistidos |
| Faturamento operacional real | Gate F/G/H | depende de tabela/serviço/API |
| PDF/envio real persistente | Gate H/I | depende de output event e canal definido |
| Configuração RBAC real | Gate H/I | depende de roles/API/tenant |

## 9) Slices futuros recomendados para Gate I

Quando Gate I for autorizado, implementar por slices pequenos e dependentes de API:

1. shell/autenticação/home operacional;
2. clientes completos com contatos e endereços;
3. produtos completos;
4. tabela de preços;
5. condições de pagamento;
6. orçamento steps cliente/produtos/pagamento/revisão;
7. confirmação ORC → PED e detalhe do pedido;
8. comunicação/output/PDF/impressão como badges/eventos;
9. Registro Operacional de Faturamento;
10. revisão/auditoria/timeline;
11. listagens, filtros, paginação e relatórios;
12. configurações/RBAC visível.

Cada slice deve validar 401/403/404/409/422, estados visuais e ausência de regressão de status/badges.

## 10) Implicações para testes frontend

Planejamento mínimo de testes para implementação futura:

- testes de rota protegida e redirecionamento por sessão;
- testes de nav por perfil/`available_actions`;
- testes de listas com loading/empty/error/paginação/filtro;
- testes de orçamento salvo/numerado e steps;
- teste de confirmação ORC → PED com botão idempotente;
- teste de pedido detalhe separando `commercial_status` e `output_badges`;
- teste de revisão com motivo e `expected_revision_number`;
- teste de 409 revision conflict;
- teste de 403 sem bypass visual;
- teste de faturamento operacional/correção com confirmação forte;
- teste de comunicação sem alteração de status.

## 11) Critério de aceite do shell plan

Este plano é aceito quando:

- rotas cobrem módulos obrigatórios da V1 completa;
- shell diferencia status, badges, actions e timeline;
- módulos bloqueados por API/migration permanecem explicitamente bloqueados;
- slices futuros preservam dependências do `ROADMAP.md`;
- nenhum componente, rota real, migration, backend ou API contract foi criado.

## 12) Próximo gate

Próximo gate recomendado: **Gate F — Migration Plan + Test Strategy**.

Motivo: o shell frontend está planejado; o próximo passo seguro é planejar banco/migrations/testes antes de qualquer implementação técnica.
