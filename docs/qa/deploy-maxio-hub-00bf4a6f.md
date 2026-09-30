# Deploy: Maxio Hub

## Publicação

- Data: 30/09/2026
- Worker: `glowdc-integration-api`
- Versão Cloudflare: `00bf4a6f-1f92-4cd2-8af1-7122b5e314fe`
- Fonte local: `9f88edd`, incluindo o frontend final em `c682ab5`
- Rotas: `https://app.maxio.com.br/glowdc` e descendentes
- Meta CAPI: permaneceu desativada (`META_SENDS_ENABLED=false`)

## Evidências pós-deploy

| Cenário | Resultado |
| --- | --- |
| Login público | PASS — HTTP 200 |
| Título e heading do Maxio Hub | PASS |
| PNG da marca | PASS — carregado com largura natural de 1448 px |
| Console e recursos estáticos | PASS — zero erros e zero respostas 4xx/5xx |
| Autenticação administrativa temporária | PASS |
| `GET /api/workspaces` | PASS — HTTP 200 |
| `GET /api/leads` | PASS — HTTP 200 |
| `GET /api/connections` | PASS — HTTP 200 |
| `GET /api/operations` | PASS — HTTP 200 |
| Logout e retorno a `/glowdc/login` | PASS |

## Observação

A falha local `NetworkError when attempting to fetch resource` não se repetiu
no domínio publicado. O frontend e a API respondem pela mesma origem em produção.
Mudanças futuras de solução ou experiência devem voltar ao ciclo local antes de
novo deploy, conforme solicitado pelo responsável.
