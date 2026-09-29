# Processo de criação

O processo oficial usa, nesta ordem, Spec Kit, Superpowers e Dark Factory.

## Fluxo obrigatório

1. Especificar problema, escopo, contratos, falhas e critérios observáveis em
   `docs/specs/` e obter aprovação humana.
2. Registrar decisões de arquitetura em `docs/adr/`, criar um plano executável
   em `docs/plans/` e obter aprovação humana.
3. Implementar fatias verticais com testes focados e dados sintéticos.
4. Executar testes, typecheck e build. Fluxos web exigem MCP Playwright
   headless. Revisar um commit congelado e registrar evidência em
   `docs/reviews/` e `docs/qa/`.
5. Aceitar o caminho real do usuário como `PASS`, `FAIL` ou `BLOCKED`.

Integrações, PII, credenciais e conversões também exigem revisão de segurança,
idempotência, retry, retenção, rollback e confirmação antes de envio externo.

