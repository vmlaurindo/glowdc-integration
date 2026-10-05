# Revisão — verificação do webhook UAZAPI

Data: 2026-10-05
Escopo: revisão da mudança na árvore de trabalho, sem commit congelado.

## Itens revisados

- O botão de verificação usa leitura `GET /webhook`; não chama endpoint de gravação na UAZAPI.
- A confirmação exige URL estática exata, webhook habilitado, eventos requeridos e filtros contra mensagens próprias/grupos; opções dinâmicas são recusadas.
- URLs e resposta bruta do provedor não são devolvidas ao navegador nem registradas nos eventos de auditoria.
- O marcador `webhook_installed_at` só é gravado após verificação bem-sucedida; divergências o limpam e mantêm a conexão em `needs_webhook`.
- Interface oferece a URL calculada do callback e instruções para configuração manual, sem declarar instalação antes da conferência.
- Cobertura automatizada inclui URL divergente, configuração incompleta/desabilitada, destino duplicado e resposta inválida.

## Parecer

Revisão local aprovada para validação funcional. A árvore já continha outras mudanças não relacionadas; esta revisão não atribui nem altera essas mudanças. O aceite de produção permanece pendente de revisão em commit/árvore congelada, deploy autorizado e conferência da instância real via Playwright/MCP e leitura autenticada, sem escrita no provedor.
