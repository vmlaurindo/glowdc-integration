# ADR 0006: leitura administrativa sem associação ao workspace

- **Status:** Aceito
- **Data:** 2026-10-02

## Contexto

Administradores de plataforma podem listar todos os workspaces, mas as rotas
operacionais exigem associação de membro. A home de seleção permite que essa
função administrativa escolha ambientes sem associação explícita.

## Decisão

Permitir que o administrador de plataforma consulte, sem escrita, os dados dos
endpoints `GET /api/connections`, `GET /api/leads` e `GET /api/operations`.
Operações de criação, alteração, teste, ativação, configuração de integração e
demais mutações continuam submetidas às regras de associação e papel vigentes.
O frontend identifica esses ambientes como somente leitura e não oferece seus
controles de escrita.

## Consequências

- A seleção administrativa fica funcional sem criar associações artificiais.
- A leitura centralizada amplia o acesso a dados comerciais para administradores
  de plataforma; esse acesso fica limitado aos três recursos necessários à
  home/visão geral/leads/operação.
- Não há mudança de esquema ou dos contratos de eventos.
