# Especificação — UAZAPI para Meta CAPI v1

Status: aprovado em 2026-09-29.

## Problema e usuário

A equipe interna da agência precisa integrar instâncias WhatsApp Business via
UAZAPI, reconhecer entradas originadas por anúncios e registrar/enviar uma
conversão `LeadSubmitted` à Meta sem operar uma caixa de mensagens.

## Escopo

- autenticação interna com Supabase Auth e workspaces isolados;
- onboarding de uma instância UAZAPI por conexão, incluindo teste e instalação
  automática do webhook, com instrução de fallback manual;
- ingestão assíncrona de mensagens individuais recebidas;
- contato, lead, atribuição e ledger de conversão persistidos no Supabase;
- payload bruto sanitizado e cifrado no D1 por sete dias;
- envio Meta apenas quando `ctwa_clid` e `source_id`/`ad_id` estiverem completos;
- modo observação por padrão e ativação explícita por workspace;
- auditoria sanitizada do envio Meta no D1 por sessenta dias.

## Fora do escopo

Agendor, Google Ads, inbox, envio de mensagens, regras por texto/etiqueta,
gestão de frota UAZAPI e cadastro público.

## Contratos e segurança

O webhook `POST /webhooks/uazapi/:connectionId` compara em tempo constante o
token recebido com o token cifrado da conexão, remove segredos antes de gravar
e responde após enfileirar. URLs UAZAPI exigem HTTPS, hostname permitido e
bloqueio de loopback, redes privadas e metadata. Telefone, nome e `ctwa_clid`
são cifrados; hashes HMAC determinísticos servem para busca/deduplicação.

## Deduplicação

- entrega: `(connection_id, external_message_id)`; sem ID, hash do payload
  sanitizado;
- contato: `(workspace_id, phone_hmac)`;
- atribuição: `(workspace_id, ctwa_clid_hmac)`;
- conversão: `sha256(workspace_id:connection_id:external_message_id:LeadSubmitted)`.

## Critérios de aceite

1. Uma conexão pode ser salva, testada e ter o webhook configurado sem expor o
   token ao navegador após o envio.
2. Token inválido, grupo, saída, payload inválido e duplicata não causam efeito
   externo e ficam classificáveis para operação.
3. Entrada orgânica cria/atualiza lead, mas não cria envio Meta.
4. Entrada paga completa cria exatamente uma conversão; repetição não duplica.
5. Modo observação registra `observed`; modo ativo enfileira e audita Meta.
6. Falhas transitórias são retentadas; 4xx, exceto 429, terminam sem loop.
7. Retenção exclui material bruto após 7 dias e auditoria após 60 dias.

