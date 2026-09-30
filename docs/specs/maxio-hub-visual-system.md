# Especificação: sistema visual Maxio Hub

## Problema

O frontend atual comunica uma landing page editorial da GlowDC, enquanto o
produto é uma ferramenta operacional da MAXIO COMUNICAÇÃO. A identidade, a
densidade e a navegação não correspondem à referência Rastrackdash.

## Objetivo

Retrabalhar somente o frontend para apresentar o produto como **Maxio Hub** ou
`m.hub`, mantendo GlowDC como workspace e preservando integralmente autenticação,
endpoints, schemas e efeitos externos existentes.

## Escopo

- Novo shell visual responsivo inspirado no Rastrackdash.
- Marca e favicon fornecidos pela MAXIO.
- Tema claro/escuro com persistência local e preferência do sistema.
- Navegação agrupada, ícones SVG, estados, tabelas e onboarding redesenhados.
- Login consistente com o produto e opção de mostrar/ocultar senha.
- Metadados do documento ajustados para Maxio Hub e GlowDC.

## Fora de escopo

- Mudanças no Worker, Supabase, D1, filas, UAZAPI, Meta ou contratos de API.
- Novos recursos de negócio, recuperação de senha ou cadastro público.
- Deploy antes de aceite visual local.

## Critérios de aceite

1. A marca principal é MAXIO COMUNICAÇÃO / Maxio Hub; GlowDC aparece como workspace.
2. Os quatro fluxos existentes continuam acessíveis e usam os mesmos endpoints.
3. O tema alterna entre claro e escuro, persiste e é utilizável por teclado.
4. Login, navegação, tabelas, formulários, estados vazios e feedbacks são responsivos.
5. Favicon e marca fornecidos aparecem sem alteração de conteúdo.
6. Testes, typecheck e build passam.
7. A página é validada pelo MCP Playwright headless antes de aceite.
8. Nenhum deploy é executado nesta etapa.

## Aprovação

Mudança solicitada e direção Rastrackdash aprovada pelo responsável no chat em
29/09/2026; nomenclatura MAXIO COMUNICAÇÃO / Maxio Hub / m.hub confirmada em seguida.
