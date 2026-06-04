# Session Handoff — Gate G inicial integrado

Data: 2026-06-04  
Branch de origem: `feat/gate-g-pr1-quote-to-order`  
Status: **Gate G inicial mergeado em `main`**

## 1) O que foi fechado

Dois PRs foram mergeados com merge commit:

| PR | Título | Merge commit |
|---|---|---|
| #30 | `Gate A-F: document canonical ERP foundation and Gate G handoff` | `0962558` |
| #31 | `Gate G: backend/data foundation for quote-to-order and migrations` | `6d7cd19` |

## 2) Entrega técnica do Gate G inicial

### ORC → PED canônico

- ORC permanece como `document_type=quote`.
- PED nasce como novo registro `document_type=order`.
- PED referencia ORC por `source_quote_id`.
- Dupla confirmação não cria dois PEDs.
- ORC mantém numeração `ORC-*`; PED mantém numeração `PED-*`.

### Migration runner controlado

- Runner cria tabela técnica `schema_migrations`.
- Migrations aplicadas são rastreadas por `filename` e checksum SHA-256.
- Filename + mesmo checksum: runner pula (`SKIP`).
- Filename + checksum divergente: runner bloqueia com erro explícito.
- Falha durante migration não registra a migration como aplicada.
- Runner usa advisory lock para evitar execução concorrente.

## 3) Validações registradas antes do merge

```txt
npm run typecheck        PASS
npm run test             PASS — 94/94
npm run db:migrate       PASS — 001 skipped
npm run db:migrate       PASS — 001 skipped
npm run test:smoke:db    PASS
git diff --check         PASS
```

`DATABASE_URL` foi carregado de `.env.local` sem expor segredo.

## 4) Fora de escopo preservado

- Nenhuma migration `002+` criada.
- `001_init_commercial_documents.sql` intacta.
- Frontend não iniciado.
- RBAC não implementado neste slice.
- `GESTOR_COMERCIAL` não ativado como produto.
- `erp_app_flow_map.html` permaneceu untracked e fora dos PRs.
- Sem NF-e, SEFAZ, gateway, boleto automático ou faturamento parcial.

## 5) Próximo ponto recomendado

Próximo slice:

```txt
Gate G PR 3 — security/tenant/roles/audit base
```

Antes de editar:

1. confirmar branch fora de `main`;
2. revisar `docs/MIGRATION-PLAN-OPS.md`;
3. revisar `docs/RBAC-MATRIX.md`;
4. revisar `docs/AUDIT-MODEL-OPS.md`;
5. revisar `docs/TEST-STRATEGY-OPS.md`;
6. declarar migrations, constraints, tests e validações previstas.

## 6) Bloqueios mantidos

- Não criar migration funcional nova sem escopo técnico aprovado.
- Não alterar API contract sem gate/revisão.
- Não ativar `GESTOR_COMERCIAL` como fluxo operacional neste momento.
- Não implementar frontend antes dos gates backend/API correspondentes.
- Não versionar `erp_app_flow_map.html`.
