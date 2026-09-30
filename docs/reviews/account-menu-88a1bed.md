# Revisão: menu da conta e alinhamento da equipe

Árvore revisada: `88a1bed`, incluindo `bf291f1`.

## Escopo

- Administração removida da navegação operacional;
- menu contextual do avatar com Conta, Administração e Sair;
- tela local de perfil e segurança;
- mocks de nome, e-mail, foto e senha;
- correção estrutural das linhas da tabela de equipe;
- comportamento responsivo do menu e das novas superfícies.

## Segurança e privacidade

- o modo mock continua restrito a desenvolvimento em hostname loopback;
- todas as identidades e imagens usadas em testes são sintéticas;
- foto permanece em memória como Data URL e aceita somente PNG/JPG/WebP de até
  2 MB no protótipo;
- senha não é armazenada, registrada ou incluída em evidências;
- testes monitoram chamadas e não observaram acesso ao Supabase ou à API live;
- os endpoints de conta não existem no Worker real e nenhuma capacidade foi
  publicada em produção.

## Revisão visual

- o menu abre acima do avatar no desktop e abaixo do avatar no cabeçalho mobile;
- Conta e Administração mantêm alvos de toque e foco visível;
- o desktop preserva células com `display: table-cell`, mantendo as divisórias
  da equipe contínuas e na mesma altura;
- apenas o mobile converte as linhas administrativas em cartões;
- inspeções headless foram realizadas em 1440 × 980 e 390 × 844.

## Achados

Nenhum achado aberto para o protótipo local. A persistência real de conta
continua condicionada ao contrato de segurança descrito em
`docs/specs/account-self-service.md`.

