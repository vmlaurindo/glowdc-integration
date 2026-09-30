# Especificação: autoatendimento da conta

Status: protótipo local solicitado em 2026-09-30; persistência remota ainda não
aprovada nem implementada.

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

## Contrato futuro de produção

A implementação persistente deverá usar Supabase Auth como única fonte de
verdade e exigir:

- sessão recente ou nova autenticação para alterar senha;
- confirmação no endereço novo para troca de e-mail;
- armazenamento privado e política de remoção para foto de perfil;
- validação de tipo, tamanho e conteúdo do arquivo no backend;
- invalidação adequada de sessões após mudanças sensíveis;
- auditoria de segurança sem registrar senha, token ou conteúdo da foto.

Endpoints simulados pelo protótipo:

- `GET /api/account`;
- `PATCH /api/account`;
- `POST /api/account/password`.

Eles não existem no Worker real nesta etapa.

## Critérios locais de aceite

1. O menu do avatar oferece Conta, Administração quando autorizada e Sair.
2. Administração não aparece na navegação operacional principal.
3. Nome, e-mail e foto podem ser alterados no mock e refletem no menu.
4. A troca de senha valida confirmação e comprimento mínimo.
5. O menu funciona por teclado, fecha com `Escape` e fecha ao clicar fora.
6. Desktop e mobile não apresentam rolagem horizontal da página.
7. Testes confirmam ausência de chamadas aos ambientes remotos.

