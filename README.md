# GlowDC Integration

Integração operacional entre WhatsApp Business (UAZAPI) e Meta CAPI para
captura, atribuição e acompanhamento de leads. Não é uma plataforma de chat.

## Estrutura

- `apps/web`: painel interno React para onboarding e operação;
- `workers/api`: API, webhook e consumidores de filas no Cloudflare Worker;
- `packages/contracts`: contratos e normalização compartilhados;
- `supabase/migrations`: Auth, dados de negócio, RLS e RPC de ingestão;
- `workers/api/migrations`: caixa operacional e auditoria temporária no D1.

## Desenvolvimento

Requer Node 22+. Copie apenas os arquivos `.example`, use valores locais e
nunca versione segredos.

```text
npm install
npm test
npm run typecheck
npm run build
```

O Supabase local é iniciado pelo CLI oficial via Docker. O Worker local usa
`wrangler dev`. O envio Meta vem desabilitado nos exemplos.

## Gates externos

Criar o projeto Supabase pago, criar recursos Cloudflare, cadastrar segredos,
instalar webhook real e habilitar Meta exigem confirmação explícita do alvo e
do impacto.
