# ADR 0001 — Cloudflare, Supabase e UAZAPI

Status: aceito; hospedagem do frontend alterada pelo ADR 0002.

## Decisão

Usar React/Vite em Cloudflare Pages, um Worker Hono com D1 e Queues, e um
projeto Supabase dedicado pago para Auth e dados de negócio. Cada conexão usa
uma instância UAZAPI fornecida pela operação. Credenciais ficam cifradas pelo
Worker e nunca são devolvidas pela API.

O D1 é a caixa operacional temporária e auditável. O Supabase é a fonte
persistente de workspaces, contatos, leads, atribuições e conversões. O envio
Meta permanece desligado globalmente e em observação por workspace até
ativação explícita.

## Consequências

Há duas superfícies de persistência e duas filas que precisam de reconciliação.
Em troca, recebimento rápido, retry e retenção curta não sobrecarregam o banco
de negócio. O novo projeto Supabase gera custo e deverá ser provisionado apenas
após confirmação explícita; esta base contém configuração, não provisionamento.
