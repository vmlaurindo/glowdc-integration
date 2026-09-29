# Contrato de dados v1

| Dado | Forma | Destino | Retenção |
| --- | --- | --- | --- |
| payload UAZAPI | token removido, JSON cifrado | D1 `deliveries` | 7 dias |
| telefone | AES-GCM + HMAC de busca | Supabase `contacts` | até exclusão |
| nome | AES-GCM, opcional | Supabase `contacts` | até exclusão |
| `ctwa_clid` | AES-GCM + HMAC de busca | Supabase `attributions` | até exclusão |
| `source_id`/`ad_id` | texto | Supabase `attributions` | até exclusão |
| corpo da mensagem | somente no payload cifrado temporário | D1 | 7 dias |
| conversão | IDs, estado e timestamps | Supabase `conversion_events` | até exclusão |
| resposta Meta | somente hash, status e código | D1 audit | 60 dias |

Nenhum token é devolvido pela API depois de salvo. Logs recebem códigos e IDs
técnicos, nunca payload, telefone, nome, `ctwa_clid` ou autorização.

Uma entrada individual recebida pode criar/atualizar contato e lead. Somente a
classificação `paid_complete`, com `ctwa_clid` e `source_id`, cria
`LeadSubmitted`. Grupo, saída, inválido e duplicata não causam efeito externo.

