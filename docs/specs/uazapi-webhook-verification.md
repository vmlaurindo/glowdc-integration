# Especificação — configuração manual e verificação do webhook UAZAPI

Status: aprovado pelo pedido explícito de aplicar as correções, 2026-10-05.

## Problema

O botão atual chama `POST /webhook` na UAZAPI e registra `webhook_installed_at`
apenas porque a resposta HTTP foi 2xx. A tela não oferece a URL copiável para a
configuração manual nem consulta o que ficou salvo no provedor. Isso pode
sobrescrever configurações já feitas e apresenta “Webhook instalado” sem
confirmar destino, eventos ou filtros.

## Resultado esperado

- Mostrar a URL pública do receiver desta conexão, com ação acessível para
  copiar; não incluir token ou segredo na URL.
- A ação primária consulta `GET /webhook` e compara o estado salvo sem gravar
  configuração na UAZAPI.
- Só considerar verificado um destino único, habilitado, com URL exata do
  receiver, eventos `messages` e `connection`, filtros `fromMeYes` e
  `isGroupYes`, e `addUrlEvents`/`addUrlTypesMessages` desativados.
- Ao confirmar, registrar `webhook_installed_at`, estado de observação e
  auditoria. Em divergência, limpar o marcador anterior, bloquear ativação e
  explicar os itens pendentes sem exibir resposta bruta, URL do provedor ou
  credencial.
- O botão não envia mensagens, não emite eventos de teste e não altera a
  configuração já salva na UAZAPI.

## Contrato e falhas

O Worker consulta `GET /webhook` com credencial apenas no header `token`.
Resposta inválida, HTTP não-2xx, destino ausente/desabilitado/duplicado ou
configuração incompatível não marca a conexão como instalada. O audit log usa
código estável e detalhes booleanos minimizados; nunca armazena o corpo do
provedor ou a URL recebida.

O receiver continua autenticando pelo campo de token do envelope UAZAPI e
responde à configuração da instância por conexão. A URL esperada é derivada de
`PUBLIC_API_BASE_URL` e do ID da conexão.

## Critérios de aceite

1. Verificação usa `GET /webhook` e nunca `POST /webhook`.
2. Estado só passa para observação quando exatamente um destino habilitado
   corresponde ao contrato esperado.
3. Divergências deixam a conexão em `needs_webhook`, limpam o marcador de
   instalação e não permitem ativar envios.
4. Respostas e logs não revelam tokens, URL retornada pelo provedor ou payloads.
5. A tela mostra a URL gerada e permite copiá-la; o botão é rotulado como
   verificação, não instalação.
6. Testes cobrem configuração correta, URL divergente, ausente, duplicada,
   desabilitada, eventos/filtros incompatíveis, flags dinâmicas e falha HTTP.

## Limites

Não criar receiver compatível com a rota do Rastrack (`/webhooks/whatsapp/:id`),
não alterar configuração remota, não trocar token, não enviar mensagem de
teste e não publicar em produção nesta alteração.
