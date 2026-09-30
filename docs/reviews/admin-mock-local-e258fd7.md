# Revisão: protótipo administrativo local

Commit revisado: `e258fd7` (inclui `0ddf310`).

## Escopo congelado

- bypass de autenticação exclusivo de desenvolvimento em loopback;
- API mock em memória, sem chamadas ao Supabase ou ao ambiente live;
- telas de Workspaces, Equipe e Auditoria;
- fixtures sintéticas e responsividade desktop/mobile;
- especificação, ADR e plano da implementação persistente futura.

## Verificações

- O modo mock exige simultaneamente `import.meta.env.DEV`, hostname loopback e
  `?mock-admin=1`.
- O build de produção não habilita o bypass.
- Nenhuma fixture contém tokens, payloads de WhatsApp ou e-mails reais.
- Renomear um workspace preserva slug e ID.
- Convite, alteração de papel e revogação atualizam a auditoria em memória.
- Revogar ou rebaixar o último owner é bloqueado.
- A interface administrativa permanece oculta no fluxo real enquanto
  `/api/admin/context` não existir no backend.
- Nenhuma migração, deploy ou mutação remota faz parte destes commits.

## Achados

Durante a revisão foram corrigidos:

1. restrição adicional do modo mock aos hostnames de loopback;
2. proteção de último owner também na alteração de papel;
3. remoção de e-mails identificáveis das fixtures;
4. apresentação das tabelas administrativas como cartões no mobile.

Nenhum achado aberto bloqueia o uso do protótipo local.

## Limite conhecido

As telas ainda não representam uma implementação administrativa persistente.
Os endpoints, permissões e migrações propostos continuam pendentes de aprovação
e execução do plano `docs/plans/admin-control-plane.md`.

