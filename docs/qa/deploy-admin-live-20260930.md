# QA: publicação administrativa live

Data: 2026-09-30.

## Resultado

`PASS` para migração, bootstrap, deploy e smoke test de leitura.

## Evidências

- Migração `202609300001_admin_control_plane.sql` aplicada no projeto Supabase
  `Glow DC`.
- Verificação remota: tabela `platform_admins`, coluna `updated_at`, cinco
  funções administrativas, bucket privado de fotos e quatro políticas RLS.
- Bootstrap da conta administrativa existente concluído; nenhum usuário novo
  foi criado e nenhum convite foi enviado.
- Worker `glowdc-integration-api` publicado no Cloudflare live, versão
  `12c4164f-5d55-4fc5-87b2-4ecc3e34ce74`.
- Smoke read-only: health, autenticação, workspace `glowdc`, contexto global de
  administração e listagem administrativa aprovados.
- `npm.cmd test`: 9 arquivos, 33 testes aprovados.
- `npm.cmd run typecheck`: web, contracts e API aprovados.
- `npm.cmd run build`: bundle Vite e dry-run do Worker aprovados.
- `npm.cmd run test:e2e`: 5 cenários headless aprovados com dados sintéticos.

## Bloqueio conhecido

O gate oficial do Playwright MCP headless permaneceu `BLOCKED`: a navegação
para login local e live não retornou dentro da janela de execução. O runner
Playwright headless local foi mantido apenas como evidência auxiliar, conforme
as regras do projeto.

## Efeitos não executados

Nenhum convite, alteração de membro, conexão UAZAPI, webhook, evento Meta ou
conversão foi enviado durante a validação.
