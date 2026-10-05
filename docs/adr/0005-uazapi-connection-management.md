# ADR 0005 — Diagnóstico seguro e suspensão de conexões UAZAPI

- Status: aprovado
- Data: 2026-10-02

## Contexto

O Worker envia `redirect: "error"`; a execução live grava erro de runtime antes
de obter status HTTP da UAZAPI. Os testes atuais mockam `fetch` e não inspecionam
essa opção. Dois registros distintos apontam para o mesmo host. A tela de edição
sempre cria uma nova linha. Exclusão de `provider_connections` possui cascatas
para `webhook_events` e `attributions`.

## Decisões

1. Usar `redirect: "manual"` e rejeitar 3xx sem seguir destino externo, mantendo
   o token no host explicitamente permitido.
2. Separar código/resumo seguro do detalhe técnico sanitizado, guardando este
   último apenas no log administrativo e no runtime log de contingência.
3. Atualizar conexão existente via PATCH; token omitido não altera o segredo.
4. Manter os registros e usar suspensão reversível, sem exclusão física.
5. Reativar somente após teste posterior à suspensão e sempre em observação.

## Consequências

É necessária migração aditiva para resumo e timestamp de suspensão. A API e UI
ganham contratos de diagnóstico e gestão. A recuperação operacional preserva
dados históricos e exige uma validação explícita antes de voltar a aceitar
webhooks.
