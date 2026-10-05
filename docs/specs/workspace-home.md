# Home de workspaces e revisão visual

## Objetivo

Após autenticar, a pessoa escolhe explicitamente o workspace que deseja operar e
consegue retornar à seleção sem sair do sistema. A home, a visão geral do
workspace e a navegação compartilhada devem manter alinhamento estável em
desktop, tablet e mobile.

## Usuários e escopo

- Membros veem apenas workspaces associados à própria conta.
- Administradores de plataforma veem todos os workspaces.
- Um administrador sem associação ao workspace pode consultar visão geral,
  leads e operação em modo somente leitura. Escritas continuam exigindo a
  associação e o papel já exigidos pelos endpoints.
- A criação de workspaces continua em Administração.
- A revisão visual cobre home, visão geral, cabeçalho e navegação desktop/mobile;
  não redesenha Leads, Operação, Conectar, Agendor, Administração ou Conta.

## Comportamento

- Todo login abre a home, mesmo quando há um único workspace.
- “Workspaces” permanece acessível pela navegação. O seletor do cabeçalho segue
  disponível como troca rápida entre os ambientes listados ao usuário.
- Cada workspace é aberto por um cartão com nome, identificador e indicação de
  acesso somente leitura quando aplicável.
- Falha ao carregar contexto ou lista é apresentada como erro recuperável, com
  ação de tentar novamente; não deve ser apresentada como lista vazia.
- Usuário sem associação e sem acesso administrativo mantém a tela de acesso
  pendente. Administrador sem workspaces permanece na home e pode abrir
  Administração.

## Interface e segurança

- Reutilizar as cores e tipografia atuais do Maxio Hub: grafite/preto, laranja e
  magenta, IBM Plex Sans para leitura, Fraunces com parcimônia em títulos e IBM
  Plex Mono em identificadores.
- O detalhe visual próprio da home é um trilho de sinal laranja-magenta junto
  aos cartões; hover/foco realça borda e trilho sem deslocar o cartão.
- Administrador sem associação recebe somente leitura por `GET` em
  `/api/connections`, `/api/leads` e `/api/operations`.
- Respostas desses recursos retornam apenas campos usados pela interface; não
  incluem nomes/identificadores de contato ou relações redundantes.
- Não alterar o escopo de escrita, os dados armazenados ou o contrato de eventos.

## Aceite

- Login sempre leva à home; selecionar um cartão abre o workspace; “Workspaces”
  retorna à seleção.
- Administrador sem associação consegue consultar somente os três recursos
  GET definidos e não ganha acesso a ações de configuração/escrita.
- Controles e cartões não se sobrepõem ou causam overflow horizontal de 320 px
  a desktop, nos temas claro e escuro.
- Playwright MCP headless registra a jornada home → workspace → home em
  diferentes larguras, incluindo os estados somente leitura, vazio e erro.
