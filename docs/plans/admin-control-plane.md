# Plano: administração do Maxio Hub

Status: proposto; implementação não iniciada.

Dependências de aprovação:

- `docs/specs/admin-control-plane.md`;
- `docs/adr/0003-platform-administration.md`.

## Fatia 1 — autorização e contratos

- Criar schemas compartilhados para nome de workspace, convite e alteração de
  papel.
- Implementar uma matriz pura e testável de capacidades globais e locais.
- Adicionar migração para `platform_admins`, `workspaces.updated_at` e funções
  transacionais de mutação/auditoria.
- Atualizar o bootstrap para associar o primeiro administrador global sem
  imprimir credenciais.
- Restringir a rota legada de criação de workspace à mesma regra global.
- Prova: testes dos schemas, matriz, travessia entre tenants e último owner.

## Fatia 2 — gestão de workspaces

- Criar `GET/POST /api/admin/workspaces` e
  `PATCH /api/admin/workspaces/:id`.
- Manter slug somente leitura e aceitar apenas alteração de nome no PATCH.
- Tornar criação e alteração idempotentes onde aplicável e mapear conflitos
  para erros estáveis.
- Registrar `workspace.created` e `workspace.updated` com metadados mínimos.
- Prova: testes de rota com Supabase simulado e teste da função SQL em ambiente
  isolado; nenhuma mutação em produção nesta etapa.

## Fatia 3 — gestão de equipe

- Criar adaptador backend para os recursos administrativos mínimos do Supabase
  Auth, sem retornar tokens ou campos desnecessários.
- Implementar listagem, convite/associação, reenvio, alteração de papel e
  revogação.
- Aplicar hierarquia de papéis, proteção de auto-revogação e garantia de último
  owner no servidor e no banco.
- Auditar toda mutação; sanitizar falhas do provedor de e-mail.
- Prova: testes com fetch simulado cobrindo usuário novo, existente, duplicado,
  falha de convite e tentativa de escalada.

## Fatia 4 — leitura de auditoria

- Criar endpoint paginado por cursor e limitado ao escopo autorizado.
- Resolver somente os atores presentes na página pelo backend.
- Expor uma descrição segura das ações sem payloads ou segredos.
- Prova: testes de paginação estável, escopo por workspace e sanitização.

## Fatia 5 — interface administrativa

- Atualizar `PRODUCT.md` e `DESIGN.md` com a superfície administrativa.
- Acrescentar o grupo `Administração` ao shell atual conforme capacidades.
- Construir três superfícies densas e responsivas: Workspaces, Equipe e
  Auditoria, reutilizando tokens, tabelas, feedbacks e temas do Maxio Hub.
- Mover o formulário de criação para Workspaces e manter um estado orientado
  para platform admins sem memberships.
- Atualizar o seletor e cabeçalho imediatamente após renomear um workspace.
- No mobile, agrupar administração sem reduzir os alvos de toque abaixo de
  44 px.
- Prova: testes de componentes/estado e build sem novas bibliotecas de UI.

## Fatia 6 — verificação em árvore congelada

- Executar testes, typecheck e build de todos os workspaces.
- Executar revisão de segurança focada em autorização, PII, auditoria e
  isolamento entre tenants.
- Congelar um commit e revisar somente essa árvore.
- Validar em Playwright MCP headless: visibilidade por papel, criação simulada,
  rename refletido no seletor, equipe, auditoria, tema e responsividade.
- Enquanto o MCP estiver indisponível, registrar `BLOCKED` no aceite web. O
  Playwright local autorizado pode ser usado como evidência auxiliar.
- Registrar resultados em `docs/reviews/` e `docs/qa/`.

## Fatia 7 — aplicação controlada e deploy

- Apresentar evidências e pedir aceite humano antes de aplicar migração remota.
- Confirmar destinatário antes de qualquer teste de convite real.
- Aplicar migração e bootstrap sem exibir segredos.
- Fazer smoke test somente leitura em produção antes de uma mutação controlada.
- Publicar apenas após aprovação explícita e registrar versão/rollback.

## Ordem de rollback

1. Desativar navegação administrativa no frontend.
2. Desativar novas rotas no Worker.
3. Restaurar a versão anterior do Worker/Assets.
4. Manter tabelas e colunas aditivas até investigação; não executar downgrade
   destrutivo durante incidente.

