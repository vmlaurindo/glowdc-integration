# Plano: sistema visual Maxio Hub

## Fatia 1 — fundação e identidade

- Registrar `PRODUCT.md`, `DESIGN.md` e esta especificação.
- Copiar os dois ativos fornecidos para `apps/web/public` com nomes estáveis.
- Criar contrato testável de preferência e alternância de tema.
- Atualizar metadados e fontes sem incluir novas dependências.
- Prova: teste unitário da resolução de tema e revisão dos arquivos públicos.

## Fatia 2 — login e shell

- Adaptar login e loading para a identidade m.hub.
- Criar shell lateral agrupado no desktop e navegação inferior no mobile.
- Implementar ícones SVG locais, seletor de tema e visibilidade de senha.
- Prova: typecheck e build do workspace web.

## Fatia 3 — superfícies operacionais

- Redesenhar visão geral, onboarding, leads, operação e estados vazios.
- Manter todas as chamadas `api(...)` e tipos de domínio sem alteração.
- Prova: diff confirma ausência de mudanças em workers/packages e testes completos.

## Fatia 4 — verificação e aceite local

- Executar testes, typecheck e build.
- Iniciar Vite localmente sem expor segredos.
- Validar em Playwright MCP headless: login, alternância/persistência de tema,
  responsividade e, quando houver sessão segura disponível, shell autenticado.
- Congelar commit local e registrar revisão/QA. Não publicar nem implantar.
