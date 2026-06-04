# Arco ERP — SPEC v1 (V1 Operacional, Planning-Only)

## 1) Purpose and scope

Esta SPEC v1 define a baseline canônica do produto **Arco ERP** (projeto novo), consolidando decisões executivas já fechadas.

A direção vigente da V1 é definida em `docs/DECISION-FLOW-CANON.md`: **a V1 é operacional completa, não MVP mínimo**. Esta SPEC permanece planning-only e não autoriza implementação, banco, migrations, API freeze ou frontend sem gate específico.

**Inclui:**
- normalização de domínio/copy;
- state machine comercial;
- permissões V1;
- política de numeração;
- modelo operacional de dados/eventos;
- mapa estrutural de telas;
- matriz de relatórios operacionais;
- gates de governança.

**NO-GO nesta etapa:**
- sem implementação de código;
- sem criação de telas finais;
- sem migrations definitivas;
- sem API freeze;
- sem merge do PR-002.

---

## 2) Product identity and glossary

- Produto canônico: **Arco ERP**.
- Legado/referência: **Sagrado Pedidos** (sem cópia direta como base).
- Módulo comercial canônico: **Pedidos**.
- Termo proibido como módulo: **Documentos**.

### Vocabulário canônico (permitido)
- `QUOTE_DRAFT` → Orçamento em rascunho
- `ORDER_CONFIRMED` → Pedido confirmado
- `INVOICED` → Faturado (Registro Operacional de Faturamento)
- `CANCELED` → Cancelado

### Derivas proibidas
- `ORDER_ADJUSTED` como estado comercial.
- Comunicação como status comercial.

---

## 3) V1 operacional vs futuro vs fora de escopo

| Área | V1 operacional | Futuro/Fase 2 | Fora de escopo atual |
|---|---|---|---|
| Clientes | Completo para operação comercial | CRM avançado/agenda | — |
| Produtos | Completo para orçamento/pedido | regras automáticas de desconto | — |
| Tabela de preços | **Sim** | engine avançada de precificação | — |
| Condições de pagamento | **Sim** | regras automáticas de crédito/faturamento | gateway/boleto automático |
| Pedidos (core) | Orçamento numerado -> pedido numerado, emitido e compartilhável | evoluções de automação | — |
| Usuários e permissões (S-082) | **RBAC e auditoria na V1** | perfis adicionais | `VISUALIZADOR` sem decisão explícita |
| Faturamento | Registro Operacional de Faturamento manual | evoluções financeiras | Fiscal/NF-e/SEFAZ/gateway/boleto automático |
| Relatórios | Relatórios operacionais básicos | BI avançado | DW/analytics complexa |
| Perfis | ADMIN + REPRESENTANTE | perfis adicionais | perfil extra sem decisão |

Regra canônica da V1:

> Orçamento nasce quando cliente válido é selecionado e salvo, gerando número canônico de orçamento. Ao confirmar, o orçamento vira pedido com número próprio de pedido. Enviar, compartilhar, imprimir ou gerar PDF é ação de comunicação e não altera `commercial_status`.

---

## 4) Domain model and canonical state machine

### Estados comerciais oficiais
1. `QUOTE_DRAFT`
2. `ORDER_CONFIRMED`
3. `INVOICED`
4. `CANCELED`

### Transições permitidas
- `QUOTE_DRAFT -> ORDER_CONFIRMED`
- `QUOTE_DRAFT -> CANCELED`
- `ORDER_CONFIRMED -> INVOICED`
- `ORDER_CONFIRMED -> CANCELED` (ADMIN)
- `ORDER_CONFIRMED + admin_adjustment -> ORDER_CONFIRMED`
- `INVOICED + admin_adjustment -> INVOICED`

### Regras canônicas
- **Confirmar pedido** é o único ponto de conversão de orçamento em pedido.
- `ORDER_ADJUSTED` é **lifecycle_event** + `order_revision`, não estado comercial.
- Pedido confirmado e pedido faturado não são imutáveis absolutos: podem ser alterados conforme perfil de acesso, sempre com revisão auditável.
- Snapshot comercial é obrigatório para preservar a verdade histórica, mas não bloqueia correções posteriores por revisão.

---

## 5) Permissions model (V1)

### Perfis oficiais
- `ADMIN`
- `REPRESENTANTE`

Sem `VISUALIZADOR` na V1 sem decisão explícita posterior.

### Regras-chave
- ADMIN pode cancelar `ORDER_CONFIRMED`.
- ADMIN pode ajustar pedido confirmado com auditoria/revisão.
- ADMIN pode registrar e corrigir Registro Operacional de Faturamento com auditoria/revisão.
- ADMIN pode ajustar pedido faturado com auditoria/revisão.
- REPRESENTANTE só pode cancelar orçamento próprio em `QUOTE_DRAFT`.
- REPRESENTANTE não pode cancelar `ORDER_CONFIRMED`.
- REPRESENTANTE não pode ajustar pedido confirmado/faturado sem permissão explícita.
- REPRESENTANTE não pode registrar faturamento.

---

## 6) Numbering policy

- Orçamento: `ORC-0001`
- Pedido: `PED-0001`

Regras:
- sequências separadas ORC/PED;
- ORC nasce ao criar rascunho após cliente válido;
- PED nasce apenas ao confirmar pedido;
- data fica em campos (`created_at`, `confirmed_at`, `invoiced_at`, `canceled_at`), não no número.

---

## 7) Communication / output events model

Comunicação é apenas `output_event`:
- `SEND_WHATSAPP`
- `SEND_EMAIL`
- `GENERATE_PDF`
- `PRINT`
- `COPY_LINK`
- `SHARE`

Regra: **nunca altera `commercial_status`**.

Termos proibidos como status comercial:
- Comunicado
- Compartilhado
- Enviado
- Impresso
- PDF gerado

---

## 8) Data model operational scope (planning level)

Entidades mínimas:
- `users`
- `roles`
- `user_roles`
- `customers`
- `products`
- `payment_terms`
- `price_tables`
- `customer_contacts`
- `customer_addresses`
- `payment_schedules`
- `quotes`
- `quote_items`
- `orders`
- `order_items`
- `order_revisions`
- `lifecycle_events`
- `output_events`
- `invoices_simple`
- `targets`
- `commission_rules`

Capacidades obrigatórias:
- ownership (`representante_id`)
- estado comercial canônico
- snapshot comercial em orçamento/pedido confirmado, incluindo cliente, endereço, contato, produto, preço, condição de pagamento e vencimentos
- histórico de revisão (`order_revisions`)
- trilha de cancelamento (ator, motivo, data)

---

## 9) Screen foundation map (V1, sem pixel-perfect)

Referência normativa:
- `docs/SCREEN-FLOW-MAP.md` (mapa funcional canônico de telas/fluxos da V1)
- SCREEN_AND_DESIGN_FOUNDATION_PACK v2.1
- SPEC_PRE_FREEZE_PACK

Telas/áreas estruturais V1:
1. Login
2. Home operacional (KPIs/alertas)
3. Clientes (lista/perfil/cadastro/edição/histórico)
4. Produtos (lista/detalhe/tabela de preços)
5. Condições de pagamento (lista/edição/simulador)
6. Pedidos (lista, steps de orçamento, revisão, confirmação, detalhe)
7. Ajuste administrativo de pedido confirmado (ADMIN)
8. Registro Operacional de Faturamento
9. Usuários e permissões (S-082, V1)
10. Hub de relatórios operacionais

---

## 10) UX/mobile/accessibility guardrails

- Mobile-operacional para fluxo de orçamento/pedido.
- Ações críticas sempre visíveis e confirmadas.
- Contraste AA e foco visível.
- Labels explícitos e erros claros.
- Navegação por teclado no desktop.
- Não depender apenas de cor para status.

---

## 11) Reporting V1 matrix (operacional)

1. Vendas
2. Conversão orçamento → pedido
3. Orçamentos em aberto
4. Clientes
5. Produtos
6. Comissões estimadas
7. Metas/desempenho
8. Envios/compartilhamentos

Mínimos obrigatórios de dados/eventos:
- vínculo quote→order
- `confirmed_at`, `canceled_at`, `invoiced_at`
- snapshots de itens/preços/descontos
- `lifecycle_events`
- `output_events`

---

## 12) Registro Operacional de Faturamento boundaries

Permitido na V1:
- status `INVOICED`;
- registro operacional manual (documento/referência informado manualmente, data, valor, vencimento(s), observação);
- correção por ADMIN com revisão auditável.

Proibido na V1 sem decisão futura explícita:
- NF-e
- emissão fiscal
- integração SEFAZ
- cálculo fiscal
- boleto automático
- gateway
- contas a receber completo
- integração externa

---

## 13) Governance gates (Go/No-Go)

### GO (planejamento para implementação)
- domínio/copy canônicos sem contradição;
- state machine fechada;
- permissões V1 fechadas;
- numeração canônica fechada;
- matriz de relatórios operacionais fechada;
- escopo de Registro Operacional de Faturamento limitado aceito.

### NO-GO
- reintroduzir “Documentos” como módulo;
- tratar comunicação como status comercial;
- usar `ORDER_ADJUSTED` como estado;
- expandir fiscal/NF-e/SEFAZ/gateway na V1;
- iniciar implementação sem gate de planejamento aprovado.

---

## 14) Open decisions

Sem bloqueios executivos abertos para consolidação da SPEC v1.

Observações não bloqueantes:
- taxonomia final de motivos de cancelamento/ajuste;
- priorização de formato de exportação dos relatórios.

---

## 15) Acceptance criteria for moving to implementation planning

1. SPEC v1 aprovada como baseline canônica.
2. Módulo comercial “Pedidos” aceito por todos os envolvidos.
3. Estados comerciais limitados aos 4 oficiais.
4. `ORDER_ADJUSTED` somente evento + revisão.
5. Permissões ADMIN/REPRESENTANTE aplicadas conforme matriz.
6. Numeração `ORC-0001` / `PED-0001` aplicada.
7. Comunicação separada por `output_events`.
8. S-082 e RBAC/auditoria em V1.
9. Registro Operacional de Faturamento sem escopo fiscal.
10. Matriz dos 8 relatórios validada.
11. NO-GO de implementação/freeze nesta etapa respeitado.

---

## 16) Artefatos derivados canônicos (hardening do planning)

Os artefatos abaixo detalham a operacionalização da SPEC para futuro planejamento técnico.

1. `docs/SPEC-OPS-ADDENDUM.md` (AC detalhado em GWT)
2. `docs/API-CONTRACTS.yaml` (contrato API da V1, a alinhar após decisão documental/dados)
3. `docs/DATA-MODEL-OPS.md` (modelo lógico + integridade)
4. `docs/RBAC-MATRIX.md` (autorização por tela/ação)
5. `docs/REPORTS-DICTIONARY.md` (contrato funcional dos 8 relatórios)
6. `docs/TEST-AND-RELEASE-GATE.md` (gate de testes e operação)
7. `docs/SCREEN-FLOW-MAP.md` (mapa funcional canônico de telas/fluxos)

### Regra de governança

- SAGRADO-PEDIDOS permanece legado de consulta pontual.
- Nenhum artefato derivado autoriza implementação de código sem gate explícito de aprovação.
