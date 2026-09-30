# QA headless — login Glow DC

Data: 2026-09-29  
Commit sob teste: `1c34826`  
Alvo: `http://127.0.0.1:5173/glowdc/login`

## Preparação

- Vite iniciado no PowerShell integrado em `127.0.0.1:5173`;
- variáveis Supabase injetadas no processo sem imprimir valores;
- aplicação informou estado `ready` antes da tentativa de navegação.

## Cenário

1. Navegar para `/glowdc/login` com Playwright MCP headless.
2. Obter snapshot de acessibilidade.
3. Validar apresentação, console, rede e comportamento do formulário.

Resultado: `BLOCKED`.

## Evidência do bloqueio

- `browser_navigate` não retornou conteúdo após mais de 60 segundos;
- a chamada foi encerrada e uma sessão limpa foi tentada;
- `browser_tabs` também não retornou conteúdo após mais de 60 segundos;
- o bloqueio ocorreu antes de qualquer resposta da página ou snapshot;
- o servidor Vite foi encerrado ao final.

Não foi usado navegador manual, inspeção de HTML ou automação alternativa, em
conformidade com `AGENTS.md`. A validação deve ser repetida quando o Playwright
MCP estiver responsivo.

