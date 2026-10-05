# QA — gestão e diagnóstico de conexões UAZAPI

Data: 2026-10-02
Ambientes: local com API mockada e live Glow DC; validação visual via Playwright MCP headless. Nenhum evento externo enviado.

| Cenário | Estado | Evidência |
| --- | --- | --- |
| Worker/API typecheck | PASS | `tsc --noEmit -p workers/api/tsconfig.json` |
| Frontend typecheck | PASS | `tsc --noEmit -p apps/web/tsconfig.json` |
| Testes automatizados | PASS | 49 testes em 11 arquivos (`vitest run`) |
| Build web | PASS | `vite build` em `apps/web`; build concluído com aviso de chunk > 500 kB |
| Diff whitespace check | PASS | `git diff --check` |
| Dashboard live com Playwright | PASS | `/glowdc/login` redirecionou para o dashboard autenticado; duas conexões apareceram em atenção, sem dados de leads. |
| Navegação real na interface com Playwright | BLOCKED | MCP abriu dashboard local e live; cliques nos botões laterais expiraram aguardando visibilidade/estabilidade. O fluxo de edição/teste/log não foi aceito visualmente. |
| Migration Supabase | PASS | `202610020001_uazapi_connection_diagnostics.sql` aplicada ao projeto Glow DC; as duas colunas foram verificadas via Management API. |
| Deploy Cloudflare | PASS | `scripts/deploy-live.mjs`; versão `265bb1d0-d861-4f8b-98a0-d1312c5d71a7`, envio Meta permanece desabilitado. |
| Smoke de produção | PASS | Health, autenticação, workspace e papel owner confirmados; somente endpoints de leitura. |
| Contagens de ingestão | PASS — zero | Supabase: 0 `webhook_events`, 0 leads, 0 atribuições e 0 conversões. D1: 0 deliveries e 0 entregas Meta auditadas. Consulta agregada, sem leitura de payloads. |
| Webhook/provider/Meta | NOT RUN | Sem teste UAZAPI, instalação de webhook ou envio à Meta/WhatsApp. |

O deploy e a migration estão concluídos. O aceite de interface permanece BLOCKED até repetir o percurso de edição, falha 504, suspensão e retomada pelo Playwright MCP após destravar a navegação. O smoke test não produziu eventos de lead.
