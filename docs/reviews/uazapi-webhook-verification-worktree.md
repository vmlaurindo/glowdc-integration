# Revisão — verificação do webhook UAZAPI

Data: 2026-10-05
Escopo: revisão do commit congelado `3bd09c1` e confirmação de publicação.

## Itens revisados

- O botão de verificação usa leitura `GET /webhook`; não chama endpoint de gravação na UAZAPI.
- A confirmação exige URL estática exata, webhook habilitado, eventos requeridos e filtros contra mensagens próprias/grupos; opções dinâmicas são recusadas.
- URLs e resposta bruta do provedor não são devolvidas ao navegador nem registradas nos eventos de auditoria.
- O marcador `webhook_installed_at` só é gravado após verificação bem-sucedida; divergências o limpam e mantêm a conexão em `needs_webhook`.
- Interface oferece a URL calculada do callback e instruções para configuração manual, sem declarar instalação antes da conferência.
- Cobertura automatizada inclui URL divergente, configuração incompleta/desabilitada, destino duplicado e resposta inválida.

## Parecer

Revisão do commit aprovada para publicação. O commit inclui o conjunto completo de mudanças pendentes autorizado pelo usuário (workspace/admin, integrações Agendor, gestão/diagnóstico UAZAPI e leitura/verificação de webhook). As migrations Supabase foram aplicadas ao projeto esperado e verificadas; o Worker foi publicado e o caminho de usuário foi validado no live via Playwright MCP headless. A conferência da configuração UAZAPI foi somente leitura, sem alteração remota.
