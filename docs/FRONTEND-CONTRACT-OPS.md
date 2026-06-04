# Frontend Contract Ops — ARCO-ERP V1 Operacional

> Status: Gate E — Frontend Contract & Shell Plan  
> Complementa: `docs/FRONTEND-SHELL-PLAN.md`  
> Base: `docs/SPEC.md`, `docs/SCREEN-FLOW-MAP.md`, `docs/DATA-MODEL-OPS.md`, `docs/RBAC-MATRIX.md`, `docs/AUDIT-MODEL-OPS.md`, `docs/API-CONTRACTS.yaml`, `docs/API-CONTRACTS-OPS.md`  
> Escopo: contrato operacional de frontend; não autoriza implementação, componentes, migrations, backend ou alteração de API

## 1) Decisão do Gate E

O frontend da V1 deve operar como camada de apresentação e orquestração de UX sobre contratos de API, RBAC e auditoria já definidos.

Decisões canônicas:

- Backend/API é a fonte real de autorização.
- Frontend usa `available_actions` para orientar visibilidade/estado de botões, mas a lista é calculada pelo backend, não substitui RBAC e todo endpoint de action revalida permissão no backend.
- `available_actions` pode mudar entre leitura e execução por alteração de perfil, ownership, tenant, status, revisão ou concorrência; a UI deve tratar 403/409/422 como resultado operacional esperado.
- `commercial_status` só exibe `QUOTE_DRAFT`, `ORDER_CONFIRMED`, `INVOICED` e `CANCELED`.
- Comunicação, envio, PDF, link e impressão aparecem como `output_badges` e timeline, nunca como status comercial.
- ORC e PED aparecem como documentos distintos; PED deve exibir vínculo com `source_quote_id`/ORC de origem.
- Pedido confirmado/faturado pode ser editável somente por ações autorizadas, com motivo, revisão e auditoria.
- Toda action crítica deve bloquear duplo clique, exigir confirmação quando aplicável, enviar `Idempotency-Key` e tratar 401/403/404/409/422.

## 2) Contratos de tela por módulo

### 2.1 Autenticação e Home

| Área | Telas | Ações principais | Dependências API/RBAC | Estados obrigatórios |
| --- | --- | --- | --- | --- |
| Login | Login, recuperar senha, redefinir senha | autenticar, recuperar acesso | auth/session futura; perfil/tenant ativo | loading, erro credencial, sessão expirada |
| Home operacional | KPIs, atalhos, alertas | iniciar orçamento, abrir clientes, pedidos, relatórios | listagens/relatórios conforme tenant + ownership | loading, empty, erro, denied parcial por módulo |

Home não deve esconder que a V1 é completa: atalhos mínimos devem contemplar clientes, produtos, preços, condições, orçamentos/pedidos, faturamento operacional, relatórios e configurações conforme perfil.

### 2.2 Clientes

| Tela | Ações | Dependências API/RBAC | Regras de UX |
| --- | --- | --- | --- |
| Lista de clientes | buscar, filtrar, paginar, abrir, novo cliente | `GET /v1/customers`; `create_customer`, `view_customer` | filtros persistem em URL; 404 não usado para lista vazia |
| Perfil do cliente | ver dados, contatos, endereços, condição padrão, histórico | `GET /v1/customers/{customerId}`; escopo carteira/equipe | exibir bloqueio quando recurso fora do escopo retornar 404/403 |
| Cadastro/edição | salvar dados legais, contatos, endereços e perfil comercial | `POST /v1/customers`, `PATCH /v1/customers/{customerId}`, contacts/addresses | edição de cliente não altera snapshots de pedidos confirmados; aviso explícito |
| Histórico comercial | abrir ORC/PED do cliente | `GET /v1/commercial-documents` filtrado por cliente quando disponível | ORC/PED distintos; badges de output separados |

### 2.3 Produtos

| Tela | Ações | Dependências API/RBAC | Regras de UX |
| --- | --- | --- | --- |
| Lista de produtos | buscar, filtrar, paginar, abrir, criar se permitido | `GET /v1/products`; `create_product` | `REPRESENTANTE` lê produtos, mas não cria/edita por padrão |
| Detalhe/edição | ver SKU, marca, categoria, unidade, embalagem, disponibilidade | `PATCH /v1/products/{productId}` | alteração não modifica documentos confirmados; aviso obrigatório |
| Produto no orçamento | selecionar produto e quantidade | `GET /v1/products`, tabela aplicável | disponibilidade é informativa na V1, não bloqueio transacional salvo API validar diferente |

### 2.4 Tabela de preços

| Tela | Ações | Dependências API/RBAC | Regras de UX |
| --- | --- | --- | --- |
| Lista de tabelas | buscar, filtrar, criar/editar se permitido | `GET /v1/price-tables`, `POST /v1/price-tables` | edição sensível pode exigir motivo conforme API/RBAC |
| Itens de preço | criar/alterar item, vigência, faixa | `POST /v1/price-tables/{priceTableId}/items` | 409 por vigência conflitante deve mostrar conflito corrigível |
| Aplicação no orçamento | aplicar preço ao item | quote upsert + preço aplicado | divergência do preço de tabela aciona UX de override |

### 2.5 Condições de pagamento

| Tela | Ações | Dependências API/RBAC | Regras de UX |
| --- | --- | --- | --- |
| Lista | buscar, criar/editar se permitido | `GET /v1/payment-terms`, `POST /v1/payment-terms` | `REPRESENTANTE` lê/aplica; edição depende de permissão |
| Criar/editar | definir forma, tipo, parcelas, prazos | `PATCH /v1/payment-terms/{paymentTermId}` | edição não altera pedidos antigos |
| Simulação/aplicação | simular vencimentos e aplicar ao orçamento | contrato de pagamento/futuro endpoint específico se necessário | parcelas aplicadas viram snapshot do documento |

### 2.6 Orçamento

| Step | Tela | Ações | Dependências API/RBAC | Regras de UX |
| --- | --- | --- | --- | --- |
| 1 | Cliente | selecionar cliente, endereço, contato | `POST /v1/quotes`, `PATCH /v1/quotes/{quoteId}` | ao salvar cliente válido, ORC numerado nasce |
| 2 | Produtos | adicionar/remover item, quantidade, preço | products, price tables, quote patch | salvar rascunho; override exige motivo quando preço divergir |
| 3 | Pagamento | aplicar condição e parcelas | payment terms + quote patch | vencimentos devem ser visíveis antes da revisão |
| 4 | Revisão | conferir snapshots, totais e observações | quote get/patch | botão Confirmar usa `available_actions.confirm_quote_to_order` |

Orçamento confirmado não vira pedido por mutação visual. A confirmação chama action e recebe resultado contendo ORC preservado + novo PED.

### 2.7 Confirmação ORC → PED

| Elemento | Contrato de UX |
| --- | --- |
| Ação | `POST /v1/quotes/{quoteId}/actions/confirm` com `Idempotency-Key` |
| Pré-condição visual | ORC em `QUOTE_DRAFT`, payload válido, ação presente em `available_actions` |
| Confirmação | confirmação explícita simples; motivo não obrigatório salvo exceção retornada/definida pela API |
| Resultado | mostrar `PED-####` como novo documento e link para ORC de origem |
| Duplo clique | botão entra em `submitting`; repetição usa mesma idempotency key da tentativa |
| Conflito | 409 `ORC_ALREADY_CONVERTED` deve oferecer abrir PED existente se API retornar referência |

### 2.8 Pedido confirmado/faturado

| Tela | Ações | Dependências API/RBAC | Regras de UX |
| --- | --- | --- | --- |
| Detalhe do pedido | visualizar snapshot, status, badges, timeline, parcelas | `GET /v1/orders/{orderId}` | status e output badges em áreas distintas |
| Editar pedido confirmado | iniciar revisão, alterar itens/pagamento/campos permitidos | `POST /v1/orders/{orderId}/actions/revise-confirmed` | motivo obrigatório; enviar `expected_revision_number` |
| Editar pedido faturado | revisão ADMIN | `POST /v1/orders/{orderId}/actions/revise-invoiced` | confirmação forte + motivo; `REPRESENTANTE` não vê ação como executável |
| Cancelar pedido | motivo + confirmação forte | `POST /v1/orders/{orderId}/actions/cancel` | nunca editar comercialmente documento `CANCELED` |

## 3) UX de ações críticas

Toda action crítica deve usar o mesmo padrão visual:

1. botão/ação só fica primária quando presente em `available_actions`;
2. se ação ausente, UI deve ocultar ou desabilitar com motivo curto quando a API fornecer contexto;
3. abrir modal/painel de confirmação quando ação exige confirmação forte;
4. coletar `reason_code` e `reason_note` quando obrigatório;
5. gerar `Idempotency-Key` por tentativa de submissão e manter a mesma key durante retry da mesma tentativa;
6. desabilitar submit e ações concorrentes enquanto `submitting`;
7. enviar `expected_revision_number` para revisões/cancelamentos que dependem de concorrência;
8. após sucesso, refetch do documento para atualizar status, badges, timeline, revision number e actions.

Actions críticas da V1:

- `confirm_quote_to_order`;
- `cancel_quote`;
- `cancel_order`;
- `revise_confirmed_order`;
- `revise_invoiced_order`;
- `override_item_price`;
- `register_operational_invoice`;
- `correct_operational_invoice`;
- `send_output`/`generate_pdf` quando persistem evento.

Matriz mínima por action crítica:

| Action | Confirmação | Motivo | Loading/duplo clique | Sucesso | Timeline/revisão |
| --- | --- | --- | --- | --- | --- |
| `confirm_quote_to_order` | confirmação explícita simples | não obrigatório, salvo exceção de API | `submitting`; mesma `Idempotency-Key` no retry | abrir/mostrar novo `PED-####` e vínculo com ORC | lifecycle de conversão/confirmação; ORC preservado |
| `revise_confirmed_order` / `edit_confirmed_order` | confirmação explícita; forte se alto impacto | `reason_code` obrigatório; `reason_note` conforme regra | bloquear submit; enviar `expected_revision_number` | refetch do pedido revisado | nova revisão + diff + audit/lifecycle quando aplicável |
| `revise_invoiced_order` / `edit_invoiced_order` | confirmação forte | motivo obrigatório; detalhe recomendado sempre | bloquear submit; enviar `expected_revision_number` | refetch do pedido faturado | revisão ADMIN + diff + audit/lifecycle |
| `override_item_price` | confirmação explícita quando altera valor aplicado | `price_override_reason`/motivo obrigatório | bloquear item/submit; idempotente quando action persistente | recalcular totais a partir do retorno/refetch | audit; revisão se pós-confirmação |
| `register_operational_invoice` | confirmação explícita | motivo/observação conforme payload; campos manuais obrigatórios | bloquear submit; idempotente | status `INVOICED` conforme retorno; refetch | lifecycle `ORDER_INVOICED_OPERATIONALLY` + audit |
| `correct_operational_invoice` | confirmação forte | motivo obrigatório | bloquear submit; idempotente; enviar revisão quando exigida | refetch do pedido/faturamento | revisão + diff + audit + lifecycle de correção/cancelamento operacional |
| `cancel_order` | confirmação forte | motivo obrigatório | bloquear submit; idempotente; enviar `expected_revision_number` quando exigido | status `CANCELED` conforme retorno | revisão/audit/lifecycle de cancelamento |

## 4) Motivo obrigatório

UX mínima:

- usar seletor `reason_code` com opções canônicas futuras vindas da API ou enum compartilhado;
- exigir `reason_note` quando `reason_code = OUTROS` ou quando a ação sensível exigir detalhe;
- manter campos preenchidos após erro 422;
- mostrar resumo do impacto antes do submit em revisão/cancelamento/faturamento;
- registrar visualmente que motivo será auditado.

Motivo obrigatório para: cancelamentos, revisão de pedido confirmado/faturado, override de preço, correção/cancelamento de faturamento operacional, mudança sensível de preço/tabela/condição e exceções de permissão.

## 5) Timeline, revisão e auditoria

O detalhe de ORC/PED deve ter área de timeline com fontes separadas:

| Fonte | Exibição | Não pode virar |
| --- | --- | --- |
| `lifecycle_events` | marcos comerciais: criado, convertido, confirmado, faturado, cancelado, ajustado | diff detalhado |
| `commercial_document_revisions` | cards de revisão com número, ator, motivo, data | decisão de permissão |
| `commercial_document_revision_changes` | tabela before/after por campo crítico | snapshot principal |
| `output_events` | WhatsApp, e-mail, PDF, impressão, link | `commercial_status` |
| `audit_events` | visível para perfis autorizados quando necessário | timeline comercial comum |

Timeline deve deixar claro quando um pedido foi revisado sem criar estado `ORDER_ADJUSTED`.

Visibilidade por perfil:

- `ADMIN`: pode ver timeline completa do tenant, incluindo audit events relevantes quando a API expuser.
- `GESTOR_COMERCIAL`: vê timeline de clientes/documentos da equipe explicitamente vinculada; audit sensível só quando API permitir.
- `REPRESENTANTE`: vê lifecycle, output e revisões dos próprios documentos/carteira; audit administrativo ou de outros usuários não deve ser exposto.
- Recurso fora do escopo deve seguir semântica 404/403 da API sem revelar existência indevida.

## 6) Comunicação, output, PDF e impressão

UX obrigatória:

- ações de WhatsApp, e-mail, PDF, copiar link e imprimir ficam no grupo Comunicação/Saídas;
- sucesso gera badge/evento derivado de `output_events`;
- `commercial_status` permanece inalterado;
- output deve usar `Idempotency-Key` quando persistir evento;
- timeline deve registrar ator, canal, destinatário/contato snapshot quando retornado pela API;
- erros de canal não podem cancelar/alterar pedido automaticamente.

## 7) Faturamento operacional

| Fluxo | Contrato de UX |
| --- | --- |
| Registrar faturamento | Disponível somente quando `available_actions` permitir `register_operational_invoice`; coletar referência/documento manual, data, valor, vencimentos e observação; submit idempotente |
| Status após sucesso | Pedido passa a `INVOICED` conforme retorno da API; exibir como status comercial oficial |
| Corrigir faturamento | ADMIN via `correct_operational_invoice`; motivo obrigatório; confirmação forte; revisão/audit |
| Cancelar/corrigir registro operacional | Não tratar como simples `commercial_status = CANCELED`; usar action específica e timeline |

Regras obrigatórias:

- V1 permite 1 registro operacional ativo por pedido.
- tentativa de duplicar registro ativo deve ser tratada como 409 `ACTIVE_OPERATIONAL_INVOICE_EXISTS`, com refetch do pedido/faturamento e opção de abrir/corrigir o registro existente quando a API retornar referência.
- correção/cancelamento operacional usa `correct_operational_invoice`, nunca edição livre nem simples `commercial_status = CANCELED`.
- faturamento parcial, NF-e, SEFAZ, gateway e boleto automático não entram na UX V1 sem decisão futura.

## 8) Listagens, filtros, paginação e busca

Listagens devem ser server-driven e compatíveis com API:

- clientes: `q`, `page`, `page_size`, `sort`;
- produtos: `q`, `page`, `page_size`, `sort`;
- tabelas de preço/condições: `q`, `page`, `page_size`, `sort`;
- documentos comerciais: `document_type`, `commercial_status`, período, `page`, `page_size`, `sort`;
- eventos/revisões: documento, período, tipo, `page`, `page_size`, `sort`;
- relatórios: período, status, cliente/produto quando suportado.

Filtros críticos devem refletir na URL para retomada e compartilhamento interno. Lista vazia é `empty`, não erro.

## 9) Estados visuais obrigatórios

| Estado | Uso | Regra |
| --- | --- | --- |
| `loading` | primeira carga ou refetch | não mostrar ações críticas ativas com dados obsoletos |
| `submitting` | action/form em execução | bloquear duplo clique e manter idempotency key |
| `empty` | sem resultados | oferecer próxima ação quando permitida |
| `error` | falha genérica | mostrar retry seguro; não inventar estado comercial |
| `blocked` | dependência/gate/API indisponível | indicar que fluxo depende de API/migration, sem mock definitivo |
| `denied` | 403 ou action ausente | explicar que backend decide permissão; não sugerir bypass |
| `not_found` | 404 | recurso inexistente ou fora do escopo de visibilidade |
| `conflict` | 409 | diferenciar idempotência, revisão, faturamento ativo e transição inválida; refetch antes de nova tentativa |
| `validation` | 422 | manter formulário e destacar campos/regras |

## 10) Tratamento de erros 401/403/404/409/422

| Código | UX obrigatória |
| --- | --- |
| 401 | encerrar/renovar sessão; redirecionar para login preservando rota de retorno quando seguro |
| 403 | recurso visível, mas ação negada por RBAC/escopo; mostrar acesso negado sem sugerir bypass e sem retry cego |
| 404 | recurso inexistente ou fora do escopo de visibilidade; UI não deve vazar que o recurso existe fora da carteira/tenant |
| 409 | conflito de estado, revisão, idempotência ou faturamento ativo; aplicar UX específica abaixo e fazer refetch antes de nova tentativa |
| 422 | validação/regra de negócio; manter dados digitados e mostrar campos/motivo ausente/idempotency ausente |

UX específica para 409:

| Código 409 | UX obrigatória |
| --- | --- |
| `IDEMPOTENCY_CONFLICT` | informar que a mesma chave foi usada com payload diferente; bloquear retry automático; gerar nova tentativa somente após confirmação do usuário e revisão do payload |
| `REVISION_CONFLICT` | informar que o documento mudou; refetch obrigatório; oferecer comparar versão atual antes de reenviar |
| `ACTIVE_OPERATIONAL_INVOICE_EXISTS` | informar que já existe registro operacional ativo; refetch e abrir registro existente/correção quando permitido |
| `INVALID_STATE_TRANSITION` | informar que o status atual não permite a ação; refetch e atualizar `available_actions`/status/timeline |

## 11) Exibição de `commercial_status`, `output_badges` e `available_actions`

- `commercial_status`: chip principal único, com texto canônico e cor/acessibilidade sem depender apenas de cor.
- `output_badges`: grupo secundário de badges; pode conter múltiplos eventos de comunicação.
- `available_actions`: fonte para renderizar ações permitidas/desabilitadas no contexto atual.
- `available_actions` é calculado pelo backend para o ator atual e não substitui RBAC server-side.
- `available_actions` pode mudar entre leitura e execução; toda action deve aceitar retorno 403/409/422 e atualizar a UI por refetch.
- Ausência de ação em `available_actions` não é bug visual; é bloqueio operacional até novo retorno da API.
- Mesmo quando a ação aparece, action endpoint pode retornar 403/409/422; frontend deve tratar sem assumir bug da API.

## 12) Dependências de API e RBAC

Gate E depende de Gate D para:

- listagens e detalhes de clientes, produtos, preços, condições e documentos;
- responses de documento com `commercial_status`, `output_badges`, `available_actions`, timeline e revisão;
- actions críticas com `Idempotency-Key`;
- erros padronizados 401/403/404/409/422;
- autorização por tenant, ownership/carteira, equipe e perfil;
- audit/revision/lifecycle/output gerados no servidor.

Sem esses contratos implementados, a tela correspondente deve ficar bloqueada ou usar placeholder explícito de planejamento, nunca mock definitivo que pareça funcional.

## 13) Bloqueios antes da implementação

Continuam bloqueados até gates e implementação técnica adequados:

- criar componentes, rotas reais ou telas finais;
- alterar API contracts ou backend;
- alterar banco ou criar migrations;
- implementar frontend antes de Gate E aprovado;
- implementar fluxos dependentes de dados antes de Gate F/G/H conforme `ROADMAP.md`;
- versionar ou alterar `erp_app_flow_map.html`;
- tratar comunicação como status;
- permitir bypass visual de RBAC.

## 14) Implicações para testes frontend

Testes futuros devem cobrir, no mínimo:

- renderização por `available_actions` para ADMIN, GESTOR_COMERCIAL e REPRESENTANTE;
- action crítica bloqueando duplo clique e enviando `Idempotency-Key`;
- motivo obrigatório e 422 preservando formulário;
- 403 ocultando/desabilitando ação sem bypass;
- 409 de revisão exigindo refetch;
- ORC preservado e PED distinto após confirmação;
- comunicação gerando badge sem alterar `commercial_status`;
- pedido confirmado/faturado com edição somente via revisão autorizada;
- faturamento operacional e correção com confirmação/motivo;
- timeline exibindo lifecycle/output/revision sem criar status indevido.

## 15) Critério de aceite Gate E

Gate E passa se:

- rotas, módulos, telas, ações, estados e dependências estão definidos;
- frontend não é tratado como fonte de autorização;
- `available_actions`, `output_badges`, revisão/timeline e erros API estão refletidos;
- ações críticas têm UX de confirmação, motivo, idempotência e conflito;
- nenhum código, migration, componente, backend ou API contract foi alterado.

## 16) Próximo gate

Próximo gate recomendado: **Gate F — Migration Plan + Test Strategy**.

Motivo: Gate E fecha o contrato operacional de frontend; o próximo risco real é planejar migrations, compatibilidade e testes antes de qualquer alteração de banco ou implementação técnica.
