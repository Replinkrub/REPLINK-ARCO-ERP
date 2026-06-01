# ARCO-ERP (v0)

Status atual: **Sprints 0, 1 e 2 concluídas na `main` + Sprint 3 (Slices 1-5) concluída localmente na branch de trabalho**.

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
- `npm run test`: **PASS (50/50)**

## Runtime readiness local (P1.5)

### Variáveis mínimas de ambiente

- `DATABASE_URL` (obrigatória para migration e smoke DB)
  - exemplo local: `postgresql://arco:arco@localhost:5432/arco_erp`
  - `npm run test:smoke:db` falha imediatamente se a variável não estiver definida

### Bootstrap local com Postgres real

1. Subir Postgres local:

   ```bash
   docker compose -f docker-compose.db.yml up -d
   ```

2. Exportar env mínima:

   ```bash
   export DATABASE_URL="postgresql://arco:arco@localhost:5432/arco_erp"
   ```

3. Aplicar migration SQL:

   ```bash
   npm run db:migrate
   ```

4. Executar smoke real de banco:

   ```bash
   npm run test:smoke:db
   ```

5. Encerrar ambiente local (quando necessário):

   ```bash
   docker compose -f docker-compose.db.yml down
   ```

Se Docker não estiver disponível, usar um Postgres local equivalente (porta 5432, db `arco_erp`, usuário/senha compatíveis com `DATABASE_URL`) e executar os mesmos comandos `db:migrate` e `test:smoke:db`.

## Sprint 3 — estado atual

Nome: **Sprint 3 — SPEC-Led Domain Foundation Completion**

Direção:
- fechar lacunas **REQUIRED_BY_SPEC** antes de fluxo operacional mais amplo;
- evitar hardening genérico e abstrações sem caso real na SPEC.

Status por slice:
- Slice 1: concluído localmente na branch de trabalho.
- Slice 2: concluído localmente na branch de trabalho.
- Slice 3: concluído localmente na branch de trabalho.
- Slice 4: concluído localmente na branch de trabalho.
- Slice 5: fechamento documental e gate final da Sprint 3 (concluído localmente).
- Não existe Slice 6 canônico nesta sprint sem nova decisão formal.

## Limites obrigatórios

- `main` protegida.
- sem ampliação de escopo fora da SPEC.
- sem merge automático de PR.
- sem frontend/camada externa/banco/integrações de legado nesta fase.

## Gate atual obrigatório

- Sprint 3 concluída localmente: seguir para decisão operacional de push/PR quando autorizado.

## Rastreabilidade recente

- PR Sprint 2 (hardening): `https://github.com/Replinkrub/REPLINK-ARCO-ERP/pull/7`
- PR Sprint 2 (refino semântico): `https://github.com/Replinkrub/REPLINK-ARCO-ERP/pull/8`
