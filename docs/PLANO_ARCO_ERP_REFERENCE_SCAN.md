# ARCO ERP REFERENCE SCAN — Viabilidade de Uso de Referências Open-Source

Status: **decisão pendente**  
Tipo: análise de viabilidade  
Regra: não clonar, não copiar código, não alterar arquitetura e não implementar nesta etapa.

## 1. Objetivo

Este plano serve para avaliar se uma análise controlada de ERPNext/Frappe e Odoo/OCA Brazil ajuda ou atrapalha a construção do ARCO ERP.

O ARCO ERP continua sendo o **motor operacional da ARCO**. CRM continua separado. REPLINK CONTROL continua sendo o orquestrador. Fiscal continua como módulo futuro.

A avaliação deve decidir se vale criar um laboratório de referência para comparar arquitetura, módulos, schema, fluxos e padrões técnicos, sem transformar essas referências em base do produto.

## 2. Hipótese

### Hipótese principal

Varrer ERPNext/Frappe e Odoo/OCA Brazil pode reduzir tempo de decisão técnica e evitar erro de modelagem em módulos operacionais como cliente, produto, preço, pedido, permissões, importação/exportação e eventos.

### Hipótese contrária

A varredura pode aumentar complexidade, consumir tempo, gerar distração e criar risco de copiar padrões grandes demais para o MVP da ARCO.

## 3. Escopo da análise

### Repositórios de referência

- ERPNext: https://github.com/frappe/erpnext
- Frappe Framework: https://github.com/frappe/frappe
- Frappe Docker: https://github.com/frappe/frappe_docker
- Odoo: https://github.com/odoo/odoo
- OCA Brazil / Localização brasileira do Odoo: https://github.com/OCA/l10n-brazil
- Twenty CRM: https://github.com/twentyhq/twenty

### ERPNext/Frappe — referência operacional/arquitetural

Analisar apenas como referência:

- cliente;
- contato;
- produto/SKU;
- tabela de preço;
- pedido;
- fornecedor/representada;
- compra;
- estoque;
- financeiro básico;
- permissões;
- workflow;
- importação/exportação;
- API;
- eventos/auditoria;
- deploy/self-host apenas como referência.

### Odoo/OCA Brazil — referência fiscal futura

Analisar apenas como referência futura para:

- fiscal Brasil;
- CNPJ;
- NF-e;
- NFS-e;
- SPED;
- certificado A1;
- plano de contas;
- campos fiscais futuros;
- localização brasileira.

### Twenty — fronteira CRM/ERP

Twenty não faz parte da varredura ERP. Deve ser citado apenas para manter clara a separação:

- Twenty = CRM;
- ARCO ERP = motor operacional;
- REPLINK CONTROL = orquestrador;
- Odoo/OCA = referência fiscal futura;
- ERPNext/Frappe = referência operacional/arquitetural.

Não analisar Twenty como ERP, não clonar e não misturar entidades de CRM dentro do ARCO ERP.

## 4. Fora de escopo

- Não copiar código.
- Não usar ERPNext como base do produto.
- Não usar Odoo como base do produto.
- Não trazer fiscal para o MVP.
- Não implementar clone/laboratório ainda.
- Não reescrever o ARCO ERP.
- Não pausar o MVP por causa dessa análise.
- Não clonar repositórios nesta missão.

## 5. Critérios de decisão

A varredura só deve ser aprovada se responder positivamente a pelo menos **4 dos 6 critérios** abaixo:

1. Reduz tempo de modelagem do ARCO ERP?
2. Evita erro estrutural relevante?
3. Ajuda diretamente nos próximos patches?
4. Cabe em sprint único?
5. Não aumenta risco de escopo?
6. Não cria risco jurídico/licença?

Se a análise não atender pelo menos 4 critérios, a recomendação padrão deve ser adiar ou descartar.

## 6. Capacidade necessária

Estimativa preliminar, sem execução:

| Atividade | Estimativa | Observação |
|---|---:|---|
| Clonar e organizar repositórios | 0,5 dia | Apenas se a decisão for aprovada. Não executar agora. |
| Varrer módulos ERPNext/Frappe | 1–2 dias | Foco em cliente, produto, preço, pedido, importação, permissões e eventos. |
| Varrer Odoo/OCA Brazil | 0,5–1 dia | Apenas campos fiscais futuros, sem trazer fiscal ao MVP. |
| Comparar com schema atual | 1 dia | Cruzar contra migrations e entidades já existentes. |
| Gerar relatório | 0,5 dia | Resultado deve virar decisão objetiva. |
| Transformar em backlog útil | 0,5 dia | Só aceitar itens que acelerem próximos patches. |

Classificação de esforço provável: **médio — 1 sprint curto**, se escopo for rigidamente limitado.

Impacto sobre desenvolvimento atual: compete diretamente com os próximos patches de importação, integração, IDs externos e metadata. Se for executado agora, deve substituir uma fatia da sprint, não rodar em paralelo informal.

## 7. Pergunta central

Essa análise acelera o ARCO ERP ou vira distração?

Resposta preliminar: **pode acelerar somente se for limitada a uma sprint única e produzir decisões diretamente aplicáveis aos próximos patches**. Se virar comparação ampla de ERP genérico, vira distração e aumenta risco de escopo.

## 8. Possíveis decisões

### Decisão A — Executar agora

Condição: só se couber em sprint único e gerar insumo direto para os próximos patches.

Escopo mínimo aceitável:

- importação/exportação;
- IDs externos/metadata;
- cliente/produto/preço/pedido;
- eventos/auditoria;
- permissões;
- campos fiscais futuros apenas como checklist de não arrependimento.

### Decisão B — Adiar

Condição: se for útil, mas competir com importação, integração e IDs externos.

Esta é a opção padrão se o próximo ciclo do ARCO ERP precisar continuar entregando base operacional imediatamente.

### Decisão C — Descartar

Condição: se aumentar complexidade ou não trouxer ganho prático imediato.

Descartar não significa ignorar boas práticas; significa não gastar sprint com laboratório externo agora.

## 9. Relação com o MVP atual

Gaps já apontados no ARCO ERP:

- importação de dados;
- integração;
- IDs externos;
- metadata;
- representadas mais completas;
- histórico explícito de status;
- arquitetura/repo canônico.

### A varredura ajuda diretamente?

- **Importação de dados:** sim, ERPNext/Frappe pode ajudar em padrões de import/export.
- **Integração:** parcialmente, pode ajudar em eventos/API, mas não resolve integrações ARCO/Twenty/REPLINK CONTROL.
- **IDs externos:** pouco; é decisão do nosso contexto.
- **Metadata:** pouco; é decisão de schema local.
- **Representadas mais completas:** sim parcialmente, por comparação com fornecedor/supplier.
- **Histórico de status:** sim, por padrões de workflow/status history.
- **Arquitetura/repo canônico:** parcialmente, Frappe ajuda como referência modular, mas não deve ditar estrutura TypeScript.

Conclusão: a varredura é útil para **importação, workflow/status, permissões e eventos**, mas não deve bloquear os patches de base já identificados.

## 10. Recomendação final do Atlas

- **Executar agora?** Não como padrão.
- **Executar depois?** Sim, se Toni aprovar uma sprint curta dedicada.
- **Descartar?** Não descartar ainda; manter como decisão pendente.
- **Cabe em sprint único?** Cabe somente com escopo mínimo e timebox rígido.
- **Escopo mínimo:** importação/exportação, entidades operacionais essenciais, workflow/status, permissões, eventos/auditoria e checklist fiscal futuro.
- **Risco:** virar distração, ampliar escopo para ERP genérico, induzir arquitetura grande demais e gerar preocupação jurídica/licença se alguém copiar código.
- **Ganho real:** reduzir erro de modelagem e acelerar decisões de importação, status history, permissões e eventos.
- **Impacto no cronograma:** se executado agora, desloca os próximos patches de MVP; se adiado, preserva cadência de entrega e mantém a hipótese registrada.

Recomendação objetiva: **adiar por enquanto e executar somente se a próxima decisão estratégica priorizar reduzir risco de modelagem sobre velocidade de entrega dos patches de importação/integração**.
