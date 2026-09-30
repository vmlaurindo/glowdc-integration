# Operação e deploy

## Ambientes e gates

Esta base não cria nem cobra recursos automaticamente. Antes do primeiro
deploy, confirme nominalmente:

1. projeto Supabase dedicado e plano contratado;
2. conta Cloudflare, banco D1, duas filas, duas DLQs e rota do Worker;
3. instância UAZAPI de teste e hostname incluído na allowlist;
4. dataset/page da Meta e versão Graph suportada;
5. ambiente de teste, nunca produção, para o primeiro percurso.

O deploy começa com `META_SENDS_ENABLED=false`. Cada conexão também começa em
`observation`. Os dois controles precisam permitir o envio.

## Segredos do Worker

Cadastre por `wrangler secret put`, sem copiar valores para arquivos:

- `SUPABASE_URL` e `SUPABASE_SECRET_KEY` (emitida pelo projeto Supabase e usada somente no Worker);
- `CREDENTIAL_ENCRYPTION_KEY`: 32 bytes aleatórios em base64;
- `PAYLOAD_ENCRYPTION_KEY`: outra chave de 32 bytes em base64;
- `IDENTITY_HMAC_KEY`: outra chave de 32 bytes em base64.

Defina `META_GRAPH_VERSION` explicitamente após verificar a versão vigente.
`UAZAPI_ALLOWED_HOSTS` recebe uma lista separada por vírgula; o padrão aceita
subdomínios de `.uazapi.com`. Não permita curingas genéricos.

## Recursos Cloudflare

Substitua o ID D1 em `workers/api/wrangler.toml`, crie as filas descritas no
arquivo e aplique a migração. Gere primeiro `apps/web/dist`; o binding
`ASSETS` publica esse bundle pelo mesmo Worker.

O endpoint público `https://app.maxio.com.br/glowdc` alimenta
`PUBLIC_API_BASE_URL`; `WEB_APP_ORIGIN` é `https://app.maxio.com.br`. As três
variáveis públicas `VITE_*` são injetadas durante o build.
Somente a anon key do Supabase vai ao frontend.

## Supabase

Aplique `supabase/migrations` em um projeto novo. Desabilite cadastro público e
convide a equipe pela área Auth. O primeiro usuário cria o workspace pelo
painel; a RPC transacional o torna owner.

Para provisionamento administrativo, injete `SUPABASE_ACCESS_TOKEN` e
`SUPABASE_PROJECT_REF` apenas no processo e execute
`scripts/supabase-admin.mjs`. O script confirma nome e referência do projeto,
recusa tabelas-alvo preexistentes e não imprime respostas administrativas em
falhas. A aplicação por Management API é um baseline; antes de adotar o CLI no
mesmo projeto, marque `202609290001` como aplicada no histórico de migrações.

O runtime também exige `SUPABASE_SECRET_KEY`; o frontend exige a chave
publishable como `VITE_SUPABASE_PUBLISHABLE_KEY`. Essas chaves são emitidas pelo
projeto Supabase, não geradas localmente. Nenhuma delas deve ser
versionada.

No `.env` operacional, `SUPABASE_PUBLISHABLE_KEY` registra a chave emitida pelo
projeto e `VITE_SUPABASE_PUBLISHABLE_KEY` contém o mesmo valor sob o nome que o
Vite permite disponibilizar ao frontend. A chave publishable é pública por
definição; a segurança dos dados continua dependendo de autenticação e RLS.

## Ativação segura

1. Salvar conexão UAZAPI.
2. Testar a instância.
3. Instalar o webhook automaticamente ou usar o fallback exibido.
4. Salvar destino Meta, preferencialmente com test event code.
5. Permanecer em observação e conferir entradas/deduplicação.
6. Confirmar dataset, credencial e impacto esperado.
7. Habilitar o flag global no ambiente de teste e ativar a conexão.
8. Só então repetir a decisão para produção.

## Falhas, retry e recuperação

- ingresso e Meta têm cinco tentativas e DLQ;
- 408, 429 e 5xx da Meta são transitórios; demais 4xx são terminais;
- `POST /api/deliveries/:id/retry` reenfileira ingresso autorizado;
- `POST /api/conversions/:id/retry` reenfileira uma conversão não enviada;
- todos os reenvios manuais geram audit log;
- `event_id` é determinístico, portanto retry não cria nova conversão.

Antes de reprocessar uma DLQ, corrija a causa e confirme que o destino é de
teste ou que o efeito real foi autorizado.

## Retenção e exclusão

O cron remove payloads D1 após 7 dias e auditorias Meta após 60 dias. O
Supabase mantém o ledger sanitizado até exclusão explícita do workspace. A
exclusão em cascata é o mecanismo de remoção; uma interface destrutiva não faz
parte da v1.

## Rotação de chaves

A v1 marca envelopes como `v1`, mas não faz rotação automática. Para trocar
chaves, implemente um job auditado que decifre com a versão anterior e cifre
com a nova antes de remover a chave antiga. Nunca apenas substitua o segredo:
isso tornaria credenciais e identidades existentes irrecuperáveis.
