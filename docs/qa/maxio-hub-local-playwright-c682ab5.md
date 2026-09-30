# QA local: Maxio Hub

## Resultado geral

`PASS`

## Escopo e autorização

O Playwright MCP permaneceu sem resposta em chamadas de navegação, listagem de
abas e encerramento. Em 30/09/2026, o responsável autorizou explicitamente o uso
de outra instância Playwright. A contingência foi executada com Playwright Test
1.63.0 e Google Chrome em modo headless.

Nenhuma credencial real foi usada no fluxo autenticado. Supabase e APIs do
dashboard receberam fixtures sintéticas e nenhuma ação externa foi disparada.

## Evidências

| Cenário | Resultado |
| --- | --- |
| Login desktop, título, marca e ausência de erros de console | PASS |
| Alternância e persistência de tema após reload | PASS |
| Login em viewport 390 × 844 sem overflow horizontal | PASS |
| Sessão sintética e entrada no dashboard | PASS |
| Navegação por Visão geral, Leads, Operação e Conectar | PASS |
| Marca `m.hub` visível e centralizada no quadro branco | PASS — captura Playwright revisada |
| `npm.cmd test` | PASS — 7 arquivos, 24 testes |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run build` e Worker dry-run | PASS |

## Defeitos encontrados e corrigidos

1. Variáveis públicas locais não eram carregadas pelo Vite, interrompendo o
   React antes da primeira renderização.
2. Ativos públicos ignoravam o base path `/glowdc/` e retornavam 404.
3. O botão de visibilidade da senha tornava o nome acessível do campo ambíguo.
4. O recorte do PNG da marca exibia somente a área vazia; o wordmark foi
   enquadrado dentro das dimensões reais do quadro.

## Limites

Este aceite cobre o frontend local com dados sintéticos. Não autoriza deploy e
não substitui uma futura prova integrada dos provedores externos.
