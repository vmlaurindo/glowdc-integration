# Plano — diagnóstico e gestão de conexões UAZAPI

Status: implementado localmente; aceite parcial, com bloqueios de QA visual e implantação.

| Fatia | Entrega | Prova |
| --- | --- | --- |
| Runtime e diagnóstico | `redirect: manual`, bloqueio de 3xx, classificação e sanitização | testes UAZAPI com redirect e estados HTTP |
| Persistência e contrato | código/resumo por conexão, mensagem segura na auditoria, resposta diagnóstica | testes API/contratos e migração aditiva |
| Gestão | edição no mesmo ID com token opcional; suspensão/reativação reversíveis | testes de schema, autorização e transições |
| Experiência | legenda na ação, erro na Visão geral e detalhe no histórico admin | Playwright MCP headless com API mock |
| Aceite | testes, typecheck, build e revisão do delta | resultados registrados sem operação Meta/WhatsApp |

Restrições: manter os dois registros atuais; não consultar nem comparar tokens;
não excluir conexões; não instalar webhook nem enviar eventos durante a validação.
Publicação e teste live ficam para gate posterior.
