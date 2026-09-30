# Especificação: autoatendimento da conta

Status: persistência em implementação para publicação live autorizada em
2026-09-30; não inclui integração UAZAPI.

## Objetivo

Oferecer no menu do avatar uma área `Conta` para a pessoa autenticada consultar
e alterar seu próprio nome, e-mail, foto e senha sem misturar essas ações com a
administração de workspaces.

## Protótipo local

- `Conta` aparece para qualquer identidade do modo mock.
- Nome, e-mail e foto são alterados somente em memória.
- A foto aceita PNG, JPG ou WebP de até 2 MB e não é enviada para nenhum serviço.
- A senha exige ao menos 12 caracteres no mock e nunca é armazenada.
- Recarregar a página restaura todos os valores sintéticos.
- Nenhuma chamada é feita ao Supabase ou à API live.

## Contrato de produção

A implementação persistente usa Supabase Auth como única fonte de verdade e
exige:

- sessão recente ou nova autenticação para alterar senha;
- confirmação no endereço novo para troca de e-mail;
- armazenamento privado `profile-photos`, limitado a 2 MB e tipos PNG, JPG e
  WebP, com política RLS restrita ao diretório da própria conta;
- alteração de senha após reautenticação com a senha atual;
- invalidação adequada de sessões após mudanças sensíveis;
- nenhuma senha, token ou conteúdo de foto em logs, metadados ou auditoria.

Endpoints simulados pelo protótipo:

- `GET /api/account`;
- `PATCH /api/account`;
- `POST /api/account/password`.

Essas rotas permanecem somente no mock local. Em produção, perfil, senha e foto
usam diretamente o SDK do Supabase no navegador autenticado; os tokens de
serviço nunca chegam ao bundle. Trocas de e-mail passam pelo fluxo de
confirmação de Supabase Auth.

## Critérios de aceite

1. O menu do avatar oferece Conta, Administração quando autorizada e Sair.
2. Administração não aparece na navegação operacional principal.
3. Nome, e-mail e foto podem ser alterados no mock e refletem no menu.
4. A troca de senha valida confirmação e comprimento mínimo.
5. O menu funciona por teclado, fecha com `Escape` e fecha ao clicar fora.
6. Desktop e mobile não apresentam rolagem horizontal da página.
7. O mock local confirma ausência de chamadas aos ambientes remotos.
8. O caminho real usa Auth/Storage com políticas por `auth.uid()` e não guarda
   a senha na aplicação.
9. Nenhum teste envia e-mail de convite nem altera uma senha real.
