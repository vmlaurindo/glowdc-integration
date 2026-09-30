# ADR 0003 — Administração global e por workspace

Status: aceito para implementação em 2026-09-30, junto da autorização de
publicação live; execução remota depende da credencial de Management API.

## Contexto

O modelo atual tem apenas papéis em `workspace_members`. Isso é suficiente para
operações dentro de um cliente, mas não representa a autoridade da MAXIO para
criar e administrar tenants. Considerar todo `owner` como administrador global
permitiria que o owner de um cliente alcançasse outros workspaces. Autorizar a
criação para qualquer usuário autenticado, como ocorre hoje, também amplia o
escopo indevidamente.

Os projetos `eliaspa-so` e `dhyana-spa-app` possuem administração própria em D1,
mas importar esse plano duplicaria Supabase Auth e criaria uma segunda fonte de
verdade para identidades e sessões.

## Decisão proposta

Adotar dois planos de autorização:

1. `platform_admins` identifica usuários internos da MAXIO autorizados a
   administrar todos os workspaces;
2. `workspace_members.role` mantém `owner`, `admin`, `operator` e `viewer` como
   autoridade restrita a um workspace.

Todas as verificações são executadas no Worker com a chave de serviço do
Supabase. O frontend consome capacidades calculadas pelo backend e serve apenas
como apresentação, nunca como barreira de segurança.

Supabase Auth continua sendo a única fonte de verdade de contas. Convites e a
resolução de e-mails usam a API administrativa do Auth somente no backend. O
banco da aplicação armazena associações e auditoria, não senhas nem sessões.

O slug do workspace permanece imutável nesta versão. O nome pode ser alterado
por `platform_admin` ou pelo `owner` do workspace.

## Alternativas rejeitadas

### Qualquer owner como administrador global

Rejeitada por permitir travessia entre tenants e por misturar propriedade de um
cliente com administração da plataforma.

### Lista de e-mails em variável de ambiente

Rejeitada porque dificulta auditoria e rotação, não oferece integridade
referencial e transforma configuração de deploy em cadastro de acesso.

### Copiar autenticação D1 dos projetos de referência

Rejeitada por duplicar credenciais, sessões, políticas de senha e superfície de
ataque sem benefício para o domínio atual.

### Guardar e-mail em cada log

Rejeitada nesta fase para reduzir duplicação de dados pessoais. A interface
resolve o ator no backend a partir do ID e mostra somente os usuários no escopo
solicitado.

## Consequências

- o bootstrap precisa associar explicitamente o primeiro `platform_admin`;
- a criação de workspace deixa de ser liberada para qualquer autenticado;
- owners continuam autônomos dentro de seus workspaces, sem alcançar outros;
- convites dependem da configuração de e-mail do Supabase Auth;
- consultas administrativas precisam de testes de isolamento por tenant;
- a área administrativa pode crescer sem alterar o pipeline UAZAPI/Meta.

## Rollback

A interface administrativa pode ser removida sem afetar o pipeline. As rotas
podem ser desativadas e a criação anterior restaurada temporariamente. A tabela
`platform_admins` e `updated_at` são aditivas; não exigem remoção imediata para
rollback. Nenhuma migração destrutiva faz parte da decisão.
