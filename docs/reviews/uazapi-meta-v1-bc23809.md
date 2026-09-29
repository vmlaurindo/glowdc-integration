# Revisão — UAZAPI para Meta CAPI v1

Commit revisado: `bc23809` (`product/cloudflare-v1`).

## Escopo revisado

- contratos e normalização UAZAPI;
- autenticação, autorização de workspace e proteção de credenciais;
- webhook, D1, filas, retenção e recuperação;
- transação Supabase, atribuição e deduplicação;
- construção, retry e auditoria Meta;
- onboarding e superfícies operacionais;
- configuração e documentação de deploy.

## Achados corrigidos durante a revisão

1. JID com sufixo de dispositivo contaminava o telefone normalizado.
2. Timestamp numérico em milissegundos era tratado como segundos.
3. A deduplicação persistente ocorria depois da atualização do contato.
4. Concorrência pelo mesmo `ctwa_clid` podia violar o índice único.
5. Exceção de rede Meta poderia terminar sem retry/auditoria.
6. Destino Meta ausente deixava conversão indefinidamente em `queued`.
7. URL UAZAPI rejeitada pela política retornava 500 em vez de 400.

Todos foram corrigidos no commit revisado. Os testes subiram de 15 para 17.

## Segurança

- segredos ficam no Worker e em envelopes AES-GCM com AAD;
- HMAC separa busca determinística da cifra de PII;
- webhook compara token em tempo constante e persiste o payload já sanitizado;
- URLs do provedor exigem HTTPS, allowlist e bloqueio de destinos privados;
- browser não recebe service role nem credenciais salvas;
- logs e auditorias não recebem payload, PII ou tokens;
- envio externo exige flag global e ativação da conexão.

Busca por padrões comuns de tokens no código não encontrou valor real.

## Resultado

Não há achado crítico ou alto conhecido no código revisado. O produto não está
aceito para deploy: a migração Supabase, o fluxo Playwright e integrações reais
permanecem bloqueados conforme o relatório de QA.

O audit de dependências tem três advisories moderados, restritos à cadeia de
desenvolvimento Wrangler → Miniflare → undici. A versão anterior do Wrangler
introduziu cinco advisories altos e foi rejeitada; aguardamos correção upstream
para eliminar os três moderados sem regressão.

