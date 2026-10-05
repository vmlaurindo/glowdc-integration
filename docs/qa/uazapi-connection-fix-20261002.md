# QA — teste de conexão UAZAPI

Data: 2026-10-02
Estado: PASS para a correção publicada; conexão real depende de repetir o clique
com uma instância e token válidos.

## Causa corrigida

O cliente montava a URL do endpoint juntando dois separadores quando a URL da
instância não tinha caminho. Isso podia alterar o host interpretado pelo runtime
e impedir a chamada a `/instance/status`.

A montagem agora normaliza o caminho da base e preserva o host e eventuais
caminhos configurados. O Worker também captura falhas de rede/credencial,
persiste `needs_attention`, grava auditoria sanitizada e devolve uma mensagem
visível para a interface.

## Evidências

- `npm.cmd test -- --run`: PASS — 11 arquivos, 39 testes.
- `npm.cmd run typecheck`: PASS em web, contracts e api.
- Build e deploy do Worker/bundle: PASS.
- `GET https://app.maxio.com.br/glowdc/health`: HTTP 200.
- Bundle live contém a mensagem de erro específica da UAZAPI e a aba Agendor.
- Migrações Supabase Agendor aplicadas no projeto Glow DC: 7 tabelas verificadas.

## Aceite pendente

O clique final com a conexão do cliente deve confirmar uma destas respostas:

- sucesso: conexão fica `Conectado` e a interface informa confirmação;
- falha de credencial/instância: conexão fica `Requer atenção` e a interface
  apresenta a orientação sem revelar o token.
