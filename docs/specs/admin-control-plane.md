# Especificação: administração do Maxio Hub

Status: proposta para aprovação humana.

## Problema

O Maxio Hub possui autenticação e papéis por workspace, mas não oferece uma
superfície administrativa permanente. A criação de workspace aparece somente
quando a conta autenticada não possui nenhuma associação. Depois que o primeiro
workspace é provisionado, não há caminho na interface para:

- criar outro workspace;
- alterar o nome exibido de um workspace;
- convidar ou remover integrantes e alterar seus papéis;
- consultar a trilha de alterações já gravada em `audit_logs`.

Além disso, o endpoint atual de criação aceita qualquer usuário autenticado. A
administração da agência precisa de uma autoridade global explícita, distinta
dos papéis locais de cada cliente.

## Objetivo

Adicionar ao shell atual uma área **Administração** para gerenciar workspaces,
equipe e auditoria, preservando Supabase Auth, o isolamento por workspace e o
sistema visual do Maxio Hub.

## Referências e adaptação

`eliaspa-so` e `dhyana-spa-app` foram usados somente como evidência de produto:
separação entre usuários, unidades e auditoria; autorização no servidor;
proteções contra remoção do próprio administrador; e registro de toda mudança.

Não serão copiados o banco de autenticação em D1, sessões próprias, unidades
estáticas, senhas temporárias exibidas na tela, hard delete de usuários ou a
arquitetura visual desses projetos. O Maxio Hub continuará usando Supabase Auth
e workspaces dinâmicos.

## Usuários e autoridade

### Administrador da plataforma

O papel `platform_admin` representa a equipe autorizada da MAXIO e não pertence
a um workspace específico. Pode:

- listar e criar workspaces;
- editar o nome de qualquer workspace;
- gerenciar integrantes e papéis de qualquer workspace;
- consultar auditoria de qualquer workspace.

O primeiro administrador será associado pelo script de bootstrap, sem expor
credenciais.

### Papéis do workspace

| Ação | owner | admin | operator | viewer |
| --- | --- | --- | --- | --- |
| Ver administração do workspace | sim | parcial | não | não |
| Renomear workspace | sim | não | não | não |
| Convidar operator/viewer | sim | sim | não | não |
| Convidar ou alterar admin | sim | não | não | não |
| Transferir/adicionar owner | sim, com confirmação | não | não | não |
| Revogar integrante | sim | operator/viewer | não | não |
| Consultar auditoria | sim | sim | não | não |

Um `platform_admin` pode executar todas as ações da tabela. Nenhuma operação
pode remover ou rebaixar o último `owner` de um workspace. Uma pessoa não pode
revogar o próprio acesso quando isso deixar o workspace sem owner.

## Experiência de uso

### Navegação

O desktop adiciona um grupo `Administração` à barra lateral. No mobile, as
entradas administrativas ficam em um menu compacto para não comprimir a barra
operacional. O grupo só aparece quando a API declarar ao menos uma capacidade
administrativa para o usuário.

### Workspaces

A página lista nome, identificador, quantidade de integrantes e data de criação.
Ela oferece:

- botão `Novo workspace`, sempre disponível ao `platform_admin`;
- ação `Editar` para alterar o nome exibido;
- identificador (`slug`) visível e somente leitura nesta versão;
- confirmação e feedback da alteração.

Caminho para o caso solicitado:

`Administração → Workspaces → GlowDC → Editar → Nome → Salvar alterações`.

O nome é apresentação e pode mudar sem alterar o ID interno. O identificador é
mantido estável porque pode participar de automações, URLs e integrações. Uma
eventual troca de identificador será uma migração separada, com análise de
impacto e redirecionamento.

### Criação de workspace

O formulário já existente de nome e identificador passa para a página de
Workspaces. Uma conta sem memberships:

- se for `platform_admin`, entra diretamente nessa página para criar o primeiro
  workspace;
- se não for, vê um estado de acesso pendente, sem permissão para criar tenants.

O endpoint existente será preservado temporariamente por compatibilidade, mas
usará a mesma regra de autorização global do novo endpoint administrativo.

### Equipe

A página usa o workspace selecionado no cabeçalho e apresenta e-mail, papel,
estado do convite e data de entrada. As ações são:

- convidar por e-mail e selecionar papel;
- reenviar convite pendente;
- alterar papel dentro da hierarquia permitida;
- revogar o acesso ao workspace.

Convites são enviados pelo Supabase Auth a partir do Worker. O navegador nunca
recebe a chave administrativa. A primeira validação usa destinatários sintéticos
ou mocks; nenhum e-mail real será disparado sem confirmação do alvo.

Excluir a conta global, definir senha ou redefinir senha não faz parte desta
versão. Revogar acesso remove apenas a associação ao workspace.

### Auditoria

A página exibe registros paginados do workspace selecionado, com:

- data e hora;
- ator;
- ação;
- tipo e identificação do alvo;
- resumo minimizado da mudança.

E-mails de integrantes são resolvidos no backend por Supabase Auth e não serão
duplicados em `audit_logs`. Metadados nunca armazenam tokens, senhas, payloads
de WhatsApp, conteúdo de conversa ou dados de contato.

## Contratos de API propostos

| Método e rota | Autoridade | Resultado |
| --- | --- | --- |
| `GET /api/admin/context` | autenticado | capacidades globais e locais |
| `GET /api/admin/workspaces` | administração | workspaces visíveis |
| `POST /api/admin/workspaces` | platform_admin | cria workspace e owner |
| `PATCH /api/admin/workspaces/:id` | platform_admin/owner | altera somente o nome |
| `GET /api/admin/workspaces/:id/members` | platform_admin/owner/admin | integrantes minimizados |
| `POST /api/admin/workspaces/:id/members` | conforme matriz | convida ou associa integrante |
| `PATCH /api/admin/workspaces/:id/members/:userId` | conforme matriz | altera papel |
| `DELETE /api/admin/workspaces/:id/members/:userId` | conforme matriz | revoga associação |
| `POST /api/admin/workspaces/:id/members/:userId/resend` | conforme matriz | reenvia convite pendente |
| `GET /api/admin/workspaces/:id/audit` | platform_admin/owner/admin | auditoria paginada |

Todas as rotas validam schema, autenticação, escopo e papel no Worker. Nenhuma
decisão de autorização depende apenas da interface.

## Contrato de dados e auditoria

- Nova tabela `platform_admins(user_id, created_at, created_by)`.
- `workspaces` recebe `updated_at`.
- A listagem de integrantes combina `workspace_members` com dados mínimos do
  Supabase Auth no backend.
- Não haverá tabela paralela de senhas, sessões ou perfis completos.
- A paginação de auditoria usa `(created_at, id)` como cursor estável.
- A criação de workspace continua atômica: workspace, owner e auditoria na
  mesma função transacional.

Novas ações de auditoria:

- `workspace.updated`;
- `member.invited`;
- `member.invite_resent`;
- `member.role_updated`;
- `member.revoked`.

Em alterações, `metadata` registra apenas campos modificados e valores de papel
ou nome estritamente necessários. Operações repetidas devem produzir o mesmo
estado e não duplicar memberships; reenvio de convite é uma ação explícita e
auditada.

## Falhas e recuperação

- Slug duplicado: `409 workspace_slug_conflict`.
- E-mail inválido: `400 invalid_member`.
- Membership já existente: resposta idempotente sem novo convite.
- Último owner: `409 last_owner_required`.
- Escopo ou papel insuficiente: `403 workspace_access_denied`.
- Falha de convite: nenhuma membership nova fica órfã; a operação retorna erro
  sanitizado e pode ser repetida.
- Falha de auditoria em uma mutação administrativa: a mutação deve ocorrer em
  função transacional no banco quando envolver somente dados locais. Para o
  convite externo, o estado local e a falha são reconciliáveis e auditados sem
  armazenar a resposta completa do provedor.

## Fora de escopo

- Agendor e novos efeitos em Meta, Google ou WhatsApp.
- Exclusão de workspace ou de usuário do Supabase Auth.
- Alteração de slug.
- Recuperação/troca de senha pela área administrativa.
- Exportação CSV e busca avançada de auditoria nesta primeira fatia.
- Mudança na captura, deduplicação ou entrega de conversões.

## Critérios observáveis de aceite

1. O administrador global encontra `Administração` e cria um workspace pelo
   formulário de nome e identificador, mesmo já pertencendo a outro workspace.
2. Um owner renomeia `GlowDC` pela interface, e o novo nome aparece no seletor
   sem alterar ID ou slug.
3. Um admin sem autoridade global não lista workspaces de outros clientes.
4. Convite, alteração de papel e revogação obedecem à matriz e ficam auditados.
5. O último owner não pode ser removido ou rebaixado.
6. Owner/admin consulta a auditoria apenas do workspace permitido; platform
   admin pode alternar o escopo.
7. Nenhum segredo, payload ou dado de contato aparece em respostas, logs,
   fixtures ou auditoria.
8. Testes, typecheck e build passam.
9. O caminho web é validado em Playwright MCP headless. Se o MCP continuar
   indisponível, o aceite web permanece `BLOCKED`; outro runner pode produzir
   evidência auxiliar, mas não substituir esse gate.
10. Nenhum convite real, deploy ou outra ação externa ocorre sem confirmação.

