# Plano — configuração manual e verificação do webhook UAZAPI

Status: aprovado pelo pedido explícito de aplicar as correções, 2026-10-05.

| Fatia | Entrega | Prova |
| --- | --- | --- |
| Contrato remoto | GET `/webhook`, parser defensivo e comparação minimizada | testes unitários sintéticos para retorno correto, inválido e falha HTTP |
| Estado do Worker | endpoint autenticado de verificação; grava status/timestamp só em match; limpa marcador em divergência | testes de contrato/rota e auditoria sem segredos |
| Experiência | URL pública copiável; ação renomeada para verificar; resultado explica divergências | Playwright MCP headless com mock, sem chamadas ao provedor |
| Segurança e aceite | revisar dados enviados a audit/log e testar ativação bloqueada | typecheck, unit, build, E2E, revisão do delta e registro QA |

## Configuração esperada no Glow DC

- `enabled: true`
- URL derivada da API do Glow DC e do ID da conexão
- eventos requeridos `messages` e `connection`
- exclusões requeridas `fromMeYes` e `isGroupYes`
- `addUrlEvents: false` e `addUrlTypesMessages: false`
- eventos extras são tolerados; URLs com sufixo dinâmico não são.

O fluxo não altera a configuração do provedor. Se houver divergência, a tela
mostra os requisitos pendentes e o endereço que deve ser usado na UAZAPI.
