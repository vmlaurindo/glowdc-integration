# ADR 0002 — Publicação sob `/glowdc`

Status: aceito em 2026-09-29.

## Contexto

O endereço definido para o produto é
`https://app.maxio.com.br/glowdc/login`, seguindo o domínio operacional dos
outros projetos da agência. Cloudflare Pages não associa isoladamente uma
aplicação a um subcaminho de domínio já compartilhado.

## Decisão

O mesmo Worker que expõe API, webhook e consumidores servirá o bundle Vite por
Cloudflare Static Assets. As rotas Cloudflare serão exclusivamente
`/glowdc` e `/glowdc/*`. Internamente, o Worker remove o prefixo antes de
encaminhar a requisição ao Hono ou ao binding `ASSETS`.

Supabase Auth continua responsável pela autenticação. Não serão copiados os
bancos D1 de senhas e sessões encontrados em projetos anteriores.

## Consequências

- frontend e API compartilham origem em produção;
- `/glowdc/login` é a rota canônica de usuário não autenticado;
- o build do frontend deve existir antes do dry-run/deploy do Worker;
- o Worker passa a ser o artefato único de deploy da aplicação web;
- `app.maxio.com.br` precisa pertencer à mesma conta Cloudflare configurada.
