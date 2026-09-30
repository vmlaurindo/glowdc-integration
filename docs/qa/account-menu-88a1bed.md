# QA: menu da conta e equipe

Data: 2026-09-30.

## Resultado

`PASS` para validação local com dados sintéticos.

`BLOCKED` para o gate oficial do Playwright MCP. A operação de navegação foi
localizada, mas novamente não retornou e precisou ser encerrada. O Playwright
headless local autorizado produziu evidência auxiliar, sem substituir o gate.

## Evidências

- `npm.cmd test`: 8 arquivos e 29 testes aprovados;
- `npm.cmd run typecheck`: web, contratos e API aprovados;
- `npm.cmd run build`: Vite e dry-run do Worker concluídos;
- `npm.cmd run test:e2e`: 5 cenários aprovados;
- menu do avatar verificado em desktop e mobile;
- Conta verificada com alteração sintética de nome, foto e senha;
- Administração verificada somente pelo menu do avatar;
- tabela de equipe verificada com células de desktop preservadas;
- nenhum acesso a Supabase ou API live durante o mock;
- nenhuma rolagem horizontal da página no viewport de 390 × 844.

O Wrangler repetiu o aviso de permissão no arquivo global de log, mas concluiu
o dry-run com código de saída bem-sucedido.

## Caminho para revisão

`http://127.0.0.1:5173/glowdc/dashboard?mock-admin=1`

O servidor local permanece ativo nesta sessão. Recarregar restaura as fixtures.

