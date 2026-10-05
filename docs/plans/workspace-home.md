# Plano: home de workspaces e revisão visual

## Fatias

1. **Política de leitura:** adicionar uma autorização reutilizável que aceite
   associação de workspace ou papel de administrador de plataforma; cobri-la
   com teste unitário.
2. **API somente leitura:** usar essa autorização apenas nos três endpoints GET
   da visão geral, leads e operação. Manter todos os endpoints de escrita e
   configuração com as guardas atuais; reduzir as respostas aos campos que a
   interface consome e testar negação com HTTP 403, permissão e bloqueio de
   escrita.
3. **Seleção no frontend:** carregar membros e contexto administrativo; listar
   todos via API administrativa somente para admin de plataforma. Após login,
   iniciar em Workspaces e abrir dashboard somente após escolha. Exibir acesso
   somente leitura para workspaces sem associação, além de estados de retry,
   vazio e pendente.
4. **Navegação e acabamento:** ação persistente Workspaces; preservar seletor
   rápido no cabeçalho; em mobile mostrar Home, Geral, Leads, Operação e Mais,
   que contém Conectar e Agendor. Corrigir grid, overflow, foco e hover da home e
   da visão geral sem alterar as outras áreas.
5. **Verificação e aceite:** testes de política/mock, typecheck/build, testes
   e2e com dados sintéticos e fluxo real via Playwright MCP headless; registrar
   QA e revisão do delta.

## Provas

- Teste unitário da política cobre membro, administrador de plataforma sem
  associação e usuário sem associação.
- Testes de API garantem que a exceção alcance apenas leituras autorizadas e
  que escritas/configuração permaneçam negadas sem associação/papel.
- Testes e2e cobrem sempre-home, escolha, retorno, recuperação de erro,
  somente-leitura e navegação mobile sem sobreposição.
- Playwright MCP valida home e dashboard em larguras desktop, tablet e mobile,
  temas claro/escuro, interações por clique/teclado e ausência de overflow.

## Limites

Sem mudança de banco, contrato de eventos, comportamento de integrações ou
deploy. As alterações locais existentes de UAZAPI/Agendor devem ser preservadas.
