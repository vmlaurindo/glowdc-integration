# ADR 0007 — verificar configuração do webhook sem sobrescrevê-la

Status: aceito em 2026-10-05.

## Contexto

O estado “instalado” era inferido apenas de um 2xx de `POST /webhook`. A pessoa
responsável também pode configurar o destino diretamente na UAZAPI, e uma nova
chamada POST no modo simples pode substituir configuração existente. A API
oficial disponibiliza `GET /webhook`, que retorna destinos e filtros atuais.

## Decisão

A tela principal passa a verificar com `GET /webhook` e registrar o estado local
somente após comparar um único destino habilitado com o contrato Glow DC. O
endereço esperado é exibido para cópia. O fluxo de verificação é somente leitura
no provedor; configurações remotas ficam sob controle explícito da pessoa
operadora.

O contrato local mantém URL estática, `messages` e `connection`, exclusões de
mensagens próprias e grupos, e ambas as opções de sufixo de URL desativadas.
Eventos extras não afetam a ingestão. Isso não copia as etiquetas e mensagens
de atualização do Rastrack, que não são processadas pelo parser atual do Glow DC.

## Consequências

- “Verificado” significa que o provedor reportou configuração compatível, não
  que um evento real já chegou.
- Divergências retiram o marcador local de instalação e impedem ativação até
  nova verificação bem-sucedida.
- Nenhuma URL retornada pelo provedor, payload, token ou segredo é enviado à UI,
  auditoria ou logs.
- Configuração automática pode ser adicionada depois como ação separada,
  explícita e documentada; não é acionada durante verificação.

## Referência primária

Contrato UAZAPI: [`GET /webhook`](https://docs.uazapi.com/endpoint/get/webhook) e
[`POST /webhook`](https://docs.uazapi.com/endpoint/post/webhook).
