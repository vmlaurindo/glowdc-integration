# QA: home de workspaces

- **Data:** 2026-10-02
- **Ambiente:** local, mock sintético; nenhuma integração externa chamada.
- **Revisão congelada:** BLOCKED; worktree já continha alterações anteriores em
  arquivos que se sobrepõem ao escopo. Ver `docs/reviews/workspace-home-worktree.md`.

## Cenários

| Cenário | Estado | Evidência |
| --- | --- | --- |
| Typecheck dos workspaces web, contratos e API | PASS | `npm.cmd run typecheck` |
| Testes unitários | PASS | `npm.cmd test` — 12 arquivos, 58 testes |
| Jornadas Playwright automatizadas | PASS | `npm.cmd run test:e2e` — 7 testes |
| Build frontend | PASS | `npm.cmd run build --workspace @glowdc/web` |
| Bundle Worker em dry-run | PASS | `npm.cmd run build --workspace @glowdc/api` — exit code 0; Wrangler não pôde persistir log fora do workspace (EPERM), mas concluiu o dry-run |
| Home, retorno e dashboard via MCP Playwright headless | PASS | Fluxo local `mock-admin=1`; navegação Home → GlowDC → Home; tema claro e escuro |
| Layout e interação responsivos | PASS | MCP em 320, 390, 761 e 1440 px; sem overflow horizontal, opções de navegação sem sobreposição e cartão sem mudança de geometria no hover |
| Console do navegador | PASS | Nenhum erro de console no fluxo local |
| Leitura administrativa e bloqueio de mutação nas rotas Worker | PASS | Testes de rota com JWT e PostgREST sintéticos: três GET autorizados, usuário não associado recebe 403, criação permanece negada |
| Verificação de papéis em Supabase live / deploy | BLOCKED | Não executados; fora do escopo local e não houve deploy |

## Notas

O seletor mostra apenas as associações do usuário comum e todos os workspaces ao
admin de plataforma. A leitura sem associação limita-se a conexões, leads e
operação; nomes de contato e campos redundantes não são devolvidos por esses
GETs. Nenhum segredo ou dado identificável real foi usado nos testes.
