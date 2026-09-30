# QA: protótipo administrativo local

Data: 2026-09-30.

## Resultado

`PASS` para uso local com dados sintéticos.

`BLOCKED` para o gate oficial de Playwright MCP: as operações de navegação e de
listagem de abas foram encontradas, mas não retornaram dentro das janelas de
execução. O runner Playwright headless já autorizado foi usado somente como
evidência auxiliar, sem substituir esse gate.

## Evidências

- `npm.cmd test`: 8 arquivos, 28 testes aprovados.
- `npm.cmd run typecheck`: web, contracts e API aprovados.
- `npm.cmd run build`: Vite e dry-run do Worker concluídos.
- `npm.cmd run test:e2e`: 5 cenários headless aprovados.
- Jornada administrativa coberta: abrir dados GlowDC sintéticos, renomear,
  convidar integrante e confirmar registros na auditoria.
- Viewport mobile coberto em 390 × 844 sem rolagem horizontal da página.
- O teste monitorou requisições e confirmou ausência de chamadas ao Supabase e
  à API live durante o modo mock.
- O Wrangler emitiu aviso de permissão ao tentar abrir seu arquivo global de
  log; o dry-run continuou e encerrou com sucesso.

## Caminho local

Com o Vite ativo, acessar:

`http://127.0.0.1:5173/glowdc/dashboard?mock-admin=1`

Os dados são reiniciados ao recarregar. A URL não habilita o modo mock em build
de produção nem fora de loopback.

