# QA — Supabase Glow DC e `/glowdc/login`

Commit: `03329cf`.

| Cenário | Estado | Evidência |
| --- | --- | --- |
| projeto remoto correto e vazio | PASS | nome, ref, região e zero tabelas confirmados antes da aplicação |
| schema de negócio | PASS | 10 tabelas criadas |
| isolamento RLS | PASS | 10/10 tabelas com RLS ativo |
| funções administrativas | PASS | 3 funções; zero grants inseguros |
| configuração Auth | PASS | signup desabilitado, Site URL e redirect confirmados |
| testes automatizados | PASS | 5 arquivos, 20 testes |
| typecheck frontend e Worker | PASS | exit 0 |
| bundle Vite com base `/glowdc/` | PASS | 78 módulos, exit 0 |
| Worker + Static Assets | PASS | 58 assets, binding `ASSETS`, dry-run exit 0 |
| navegação headless `/glowdc/login` | BLOCKED | MCP Playwright não concluiu a inicialização após timeouts |
| deploy Cloudflare | BLOCKED | recursos D1/Queues e segredos ainda não provisionados |
| login real | BLOCKED | anon/publishable e service role keys ainda não cadastradas no runtime |

Resultado geral: `BLOCKED`. A estrutura Supabase está aplicada; o bloqueio é de
aceite web/deploy, não de banco.
