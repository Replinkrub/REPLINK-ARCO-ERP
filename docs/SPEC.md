# Arco ERP — SPEC v1 (Consolidada, Planning-Only)

## 1) Purpose and scope

Esta SPEC v1 define a baseline canônica do produto **Arco ERP** (projeto novo), consolidando decisões executivas já fechadas.

**Inclui:**
- normalização de domínio/copy;
- state machine comercial;
- permissões MVP;
- política de numeração;
- modelo mínimo de dados/eventos;
- mapa estrutural de telas;
- matriz de relatórios MVP;
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
- `INVOICED` → Faturado (registro simples)
- `CANCELED` → Cancelado

### Derivas proibidas
- `ORDER_ADJUSTED` como estado comercial.
- Comunicação como status comercial.

---

## 3) MVP vs Phase 2 vs Out-of-scope

| Área | MVP/Foundation | Fase 2 | Fora de escopo atual |
|---|---|---|---|
| Pedidos (core) | Sim | Evolução | — |
| Usuários e permissões (S-082) | **Sim** | Não | — |
| Faturamento | Registro simples | Evoluções | Fiscal/NF-e/gateway/boleto/integr. |
| Relatórios | 8 relatórios operacionais | BI avançado | DW/analytics complexa |
| Perfis | ADMIN + REPRESENTANTE | Perfis adicionais | Perfis extras no MVP |

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

### Regras canônicas
- **Confirmar pedido** é o único ponto de conversão de orçamento em pedido.
- `ORDER_ADJUSTED` é **lifecycle_event** + `order_revision`, não estado comercial.

---

## 5) Permissions model (MVP)

### Perfis oficiais
- `ADMIN`
- `REPRESENTANTE`

Sem `VISUALIZADOR` no MVP.

### Regras-chave
- ADMIN pode cancelar `ORDER_CONFIRMED`.
- ADMIN pode ajustar pedido confirmado com auditoria/revisão.
- ADMIN pode registrar faturamento simples.
- REPRESENTANTE só pode cancelar orçamento próprio em `QUOTE_DRAFT`.
- REPRESENTANTE não pode cancelar `ORDER_CONFIRMED`.
- REPRESENTANTE não pode ajustar pedido confirmado.
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

## 8) Data model minimum (planning level)

Entidades mínimas:
- `users`
- `roles`
- `user_roles`
- `customers`
- `products`
- `payment_terms`
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
- snapshot em pedido confirmado
- histórico de revisão (`order_revisions`)
- trilha de cancelamento (ator, motivo, data)

---

## 9) Screen foundation map (MVP, sem pixel-perfect)

Referência normativa:
- SCREEN_AND_DESIGN_FOUNDATION_PACK v2.1
- SPEC_PRE_FREEZE_PACK

Telas/áreas estruturais MVP:
1. Login
2. Home operacional (KPIs/alertas)
3. Clientes (lista/perfil/cadastro/edição/histórico)
4. Produtos (lista/detalhe/tabela de preços)
5. Condições de pagamento (lista/edição/simulador)
6. Pedidos (lista, steps de orçamento, revisão, confirmação, detalhe)
7. Ajuste administrativo de pedido confirmado (ADMIN)
8. Registro de faturamento simples
9. Usuários e permissões (S-082, MVP/foundation)
10. Hub de relatórios MVP

---

## 10) UX/mobile/accessibility guardrails

- Mobile-operacional para fluxo de orçamento/pedido.
- Ações críticas sempre visíveis e confirmadas.
- Contraste AA e foco visível.
- Labels explícitos e erros claros.
- Navegação por teclado no desktop.
- Não depender apenas de cor para status.

---

## 11) Reporting MVP matrix (8 relatórios)

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

## 12) Faturamento MVP boundaries

Permitido no MVP:
- status `INVOICED`;
- registro simples (data, valor, observação, referência manual opcional).

Proibido no MVP:
- NF-e
- emissão fiscal
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
- permissões MVP fechadas;
- numeração canônica fechada;
- matriz de relatórios MVP fechada;
- escopo de faturamento limitado aceito.

### NO-GO
- reintroduzir “Documentos” como módulo;
- tratar comunicação como status comercial;
- usar `ORDER_ADJUSTED` como estado;
- expandir fiscal/NF-e/gateway no MVP;
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
8. S-082 em MVP/foundation (fora de Fase 2).
9. Faturamento MVP sem escopo fiscal.
10. Matriz dos 8 relatórios validada.
11. NO-GO de implementação/freeze nesta etapa respeitado.

---

## 16) Artefatos derivados canônicos (hardening do planning)

Os artefatos abaixo detalham a operacionalização da SPEC para futuro planejamento técnico.

1. `docs/SPEC-OPS-ADDENDUM.md` (AC detalhado em GWT)
2. `docs/API-CONTRACTS.yaml` (contrato API MVP)
3. `docs/DATA-MODEL-OPS.md` (modelo lógico + integridade)
4. `docs/RBAC-MATRIX.md` (autorização por tela/ação)
5. `docs/REPORTS-DICTIONARY.md` (contrato funcional dos 8 relatórios)
6. `docs/TEST-AND-RELEASE-GATE.md` (gate de testes e operação)

### Regra de governança

- SAGRADO-PEDIDOS permanece legado de consulta pontual.
- Nenhum artefato derivado autoriza implementação de código sem gate explícito de aprovação.
