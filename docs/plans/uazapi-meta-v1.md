# Plano — UAZAPI para Meta CAPI v1

Status: aprovado e em implementação.

| Fatia | Entrega | Prova |
| --- | --- | --- |
| Contratos | schemas compartilhados e parser UAZAPI | testes de parser |
| Segurança | cifra, HMAC, token constante e allowlist | testes unitários |
| Ingresso | webhook, D1, dedupe e fila | testes de serviços |
| Negócio | migração Supabase e RPC transacional | revisão SQL/typecheck |
| Meta | payload, ledger, retry e auditoria | testes de payload/política |
| Onboarding | login, conexão, teste e ativação | build + Playwright MCP |
| Operação | trilho de eventos, leads e estados | build + Playwright MCP |

Nenhum teste usa credencial real. Deploy, criação do Supabase pago e ativação
de eventos reais são gates externos separados.

