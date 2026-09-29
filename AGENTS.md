# Regras do projeto: glowdc-integration

Leia este arquivo e `docs/PROCESSO-DE-CRIACAO.md` antes de pesquisar, planejar,
implementar ou validar qualquer mudança.

## Regras operacionais obrigatórias

1. Repositórios remotos são acessados, consultados e clonados com `gh`.
2. Páginas são validadas pelo MCP Playwright, headless por padrão. Sem o MCP,
   declare o bloqueio e não substitua por inspeção manual.
3. Projetos vizinhos podem ser consultados após o aviso da sessão, apenas como
   evidência contextual; padrões legados não são copiados implicitamente.
4. Nunca exponha segredos, payloads completos ou dados pessoais. Use fixtures
   sintéticas e dados minimizados.
5. Confirme alvo, credenciais e efeito antes de qualquer envio externo real.
6. No Windows, use somente o PowerShell corrente e integrado ao workspace.

## Método

Spec Kit define especificação e gates; Superpowers exige design, plano e
evidência; Dark Factory organiza fatias verticais, revisão congelada e aceite.

Webhooks são tráfego não confiável: valide autenticidade, schema, escopo e
idempotência antes de efeitos externos. Mudanças em atribuição e conversão
declaram contrato, deduplicação e estratégia de retry.

