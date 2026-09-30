# QA — login público Glow DC

Commit sob teste: `d6c85a9`  
Alvo: `https://app.maxio.com.br/glowdc/login`

## Cenários

| Cenário | Resultado | Evidência |
| --- | --- | --- |
| Health público | PASS | resposta `status=ok` pelo Worker implantado |
| Autenticação do administrador | PASS | sessão criada sem imprimir token ou senha |
| Consulta autenticada do workspace | PASS | workspace `glowdc`, papel efetivo `owner` |
| Migração D1 | PASS | nenhuma migração remota pendente |
| Renderização e interação no navegador | BLOCKED | Playwright MCP não retornou da inicialização |

## Bloqueio Playwright

Após o deploy, `browser_navigate` foi direcionado ao endereço público e não
retornou conteúdo, snapshot ou erro após mais de 60 segundos. A chamada foi
encerrada. Não foi usado navegador alternativo, inspeção de HTML ou screenshot
passivo como substituto.

Resultado de aceite da superfície web: `BLOCKED`. O deploy e a API estão
operacionais, mas a aprovação visual deve ser repetida quando o Playwright MCP
estiver responsivo.

