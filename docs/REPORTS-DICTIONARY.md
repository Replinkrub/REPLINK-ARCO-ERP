# Reports Dictionary — ARCO-ERP MVP

Status: planning-only  
Escopo: contrato funcional mínimo dos 8 relatórios da SPEC.

## Padrões globais

- Janela padrão: período selecionável (`from`, `to`) no timezone oficial da operação.
- Representante enxerga dados do seu escopo; ADMIN enxerga visão global.
- Fonte canônica: entidades e eventos definidos em `DATA-MODEL-OPS.md`.

## Matriz de relatórios

| # | Relatório | Pergunta de negócio | Fontes mínimas | Métricas-chave | Filtros mínimos |
|---|---|---|---|---|---|
| 1 | Vendas | Quanto vendemos no período? | `orders`, `invoices_simple` | valor total vendido, ticket médio, quantidade de pedidos confirmados | período, representante, cliente |
| 2 | Conversão orçamento -> pedido | Qual taxa de conversão? | `quotes`, `orders`, `lifecycle_events` | taxa conversão %, tempo médio até confirmação | período, representante |
| 3 | Orçamentos em aberto | Quantos orçamentos ainda ativos? | `quotes` | quantidade `QUOTE_DRAFT`, valor potencial | período criação, representante, cliente |
| 4 | Clientes | Quais clientes mais compram e em qual frequência? | `customers`, `orders`, `invoices_simple` | receita por cliente, nº pedidos, último pedido | período, representante, cliente |
| 5 | Produtos | Quais produtos têm maior saída? | `order_items`, `orders` | volume por produto, receita por produto | período, representante, produto |
| 6 | Comissões estimadas | Qual comissão estimada por representante? | `orders`, `commission_rules` | comissão total estimada, comissão por pedido | período, representante |
| 7 | Metas/desempenho | Time está batendo metas? | `targets`, `orders`, `invoices_simple` | atingimento %, gap da meta | período, representante, meta |
| 8 | Envios/compartilhamentos | Como está a comunicação comercial? | `output_events`, `quotes`, `orders` | volume por canal, taxa por etapa do funil | período, canal, representante |

## Regras de cálculo mínimas

1. Conversão = `orders_confirmed / quotes_created` no mesmo período de corte.
2. Receita base (relatório de vendas/faturamento) = soma de `invoices_simple.amount` no período aplicado.
3. Comissão estimada segue `commission_rules` vigente na data da confirmação do pedido.
4. Eventos de comunicação contam por ocorrência em `output_events`, sem alterar status comercial.

## Regras de consistência

- Todo relatório deve indicar timestamp de geração e período aplicado.
- Divergências devem seguir tolerância canônica definida abaixo.
- Não usar dados do SAGRADO para compor números operacionais do ARCO-ERP.

## Tolerância canônica de divergência (MVP)

- Valores monetários: até **R$ 0,05 por documento** ou **0,1% no total agregado** (o que for menor).
- Quantidades inteiras: tolerância **zero**.
- Percentuais: tolerância de **0,01 ponto percentual**.
- Timing operacional não financeiro: defasagem máxima de **5 minutos**.
- Fechamento financeiro/comercial reconciliado: tolerância **zero**.

### Classificação de resultado

- Dentro da tolerância: `PASS_WITH_NOTES`
- Fora da tolerância: `FAIL`
- Divergência sem origem identificada: `BLOCKED`

## Exportação de relatórios (MVP)

- Formato obrigatório e canônico no MVP: **CSV**.
- `XLSX`: pós-MVP, salvo decisão operacional explícita.
- `PDF`: fora do MVP, exceto visualização/impressão simples já existente sem custo técnico.
- Visualização em tela/impressão não substitui exportação CSV para conciliação.

## Definition of Done (relatórios)

- 8/8 relatórios com fontes, métricas e filtros definidos.
- Fórmulas mínimas documentadas para conversão, receita e comissão.
- Governança de escopo (ADMIN global / REPRESENTANTE por ownership) explícita.
- Critérios de tolerância e classificação PASS/FAIL/BLOCKED aplicados.
- CSV definido como formato canônico de exportação no MVP.
