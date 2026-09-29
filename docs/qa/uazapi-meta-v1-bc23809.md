# QA — UAZAPI para Meta CAPI v1

Commit de código: `bc23809`.

| Cenário | Estado | Evidência |
| --- | --- | --- |
| normalização, segurança e payload Meta | PASS | Vitest 5.0.2: 4 arquivos, 17 testes |
| contratos, frontend e Worker | PASS | TypeScript: 3 projetos, exit 0 |
| bundle do painel | PASS | Vite 7.3.6, 78 módulos, exit 0 |
| bundle do Worker | PASS | Wrangler dry-run, exit 0 |
| migração operacional D1 | PASS | `0001_operational.sql`, 7 comandos locais |
| migração PostgreSQL/Supabase | BLOCKED | Supabase CLI ausente e Docker daemon inativo |
| fluxo web headless | BLOCKED | MCP Playwright não concluiu navegação nem listagem de abas após timeouts |
| UAZAPI real | BLOCKED | nenhuma instância/credencial de teste foi autorizada |
| Meta real | BLOCKED | nenhum dataset/credencial/efeito externo foi autorizado |

Resultado geral: `BLOCKED`.

O bloqueio não invalida build ou testes locais; impede afirmar aceite de ponta
a ponta e impede deploy/ativação. Não foi usado navegador manual como atalho e
nenhum evento foi enviado a provedor externo.

