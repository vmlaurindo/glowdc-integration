# QA — verificação do webhook UAZAPI

Data: 2026-10-05
Escopo: validação local da leitura e conferência do webhook já salvo na UAZAPI.

## Evidências locais

- `npm.cmd run typecheck` — aprovado.
- `npm.cmd test` — aprovado: 12 arquivos, 63 testes.
- `npm.cmd run build` — build do frontend e dry-run do Worker concluídos. Wrangler exibiu `EPERM` ao tentar gravar log fora do workspace, mas o dry-run terminou com sucesso.
- `npm.cmd run test:e2e` — aprovado: 7 testes.
- Playwright MCP headless em ambiente local/mock — endpoint de callback exibido e copiável; a ação “Verificar webhook salvo” confirmou o cenário mock sem escrita no provedor.
- Playwright MCP headless em viewport móvel (390×844) — card dentro do viewport, sem overflow horizontal; console sem erros.
- `git diff --check` — sem erros de whitespace.

## Publicação e validação live

- Commit publicado: `3bd09c1`.
- Cloudflare Worker version: `f29332f6-0568-4ceb-926b-ae689a960b4d`.
- Migrations Supabase aditivas aplicadas ao projeto Glow DC; verificação confirmou 7 tabelas Agendor e 2 colunas de diagnóstico UAZAPI.
- Smoke live — health, autenticação, workspace `glowdc` como owner e endpoints administrativos aprovados.
- Playwright MCP headless em `https://app.maxio.com.br/glowdc` — home autenticada, abertura do workspace, tela Conectar, endereço de callback e botão “Verificar webhook salvo” presentes; a verificação da instância retornou sucesso. Nenhuma configuração foi gravada na UAZAPI.
- Console do navegador sem erros.

## Limite de verificação automatizada

Nesta execução, `npm.cmd run test:e2e` exibiu os sete cenários mas o processo não encerrou nem forneceu resultado final; foi interrompido. Não conto essa execução como aprovação E2E. O fluxo live acima foi percorrido e observado via Playwright MCP.
