# ADR 0004 — Integração comercial Agendor por workspace

Data: 2026-10-01. Status: proposto, sujeito à aprovação da especificação/plano.

## Decisões propostas

1. Reaproveitar Cloudflare Worker, D1, Queues, Supabase e contratos existentes.
   Supabase guarda estado durável comercial, configuração e outbox; D1 continua
   operacional. Não criar outro banco Supabase ou outro pipeline Meta.
2. Criar um Durable Object por conta Agendor para serializar chamadas e limitar
   partidas a no máximo 2 req/s, concorrência 1, inclusive entre workspaces que
   compartilhem a conta. Acrescenta binding/migração e custo Cloudflare a verificar.
   Limite apenas em memória do Worker seria insuficiente entre instâncias.
3. Começar o retorno por polling incremental a cada 5 minutos, overlap de 10
   minutos e reconciliação de negócios vinculados. São parâmetros propostos,
   sujeitos à prova de volume. Webhook é aceleração futura e exige contrato de
   autenticação/entrega verificado; não é pré-requisito da primeira entrega.
4. Manter a atribuição da abertura imutável por negociação. Novos toques não
   substituem essa origem. Agendor controla o estado comercial.
5. Manter `ctwa_clid` cifrado no m.hub. Exportação opcional ao Agendor depende de
   aprovação e retenção definida. Isso altera a exigência original de sete campos
   obrigatórios: seis visíveis no CRM e o sétimo apenas quando habilitado.
6. Consumir o contrato normalizado já existente em product. O parser do Rastrack
   é referência para testes e compatibilidade, não substituição automática do
   backend. A afirmação anterior de que bastava reutilizar aquele arquivo não
   descreve a implementação atual de product.
7. Separar ativação de leitura CRM, escrita CRM e envio Meta. Começar em observação;
   configuração incompleta bloqueia somente a capacidade correspondente.

## Consequências e limites

O núcleo pode ser testado antes da UAZAPI. O provedor continua precisando provar
identidade, autenticação e campos de atribuição; não se presume que entregue CTWA.
A arquitetura original afirma exclusividade de Cloud API/BSP para esses campos;
isso não serve como prova do que a UAZAPI efetivamente entrega.

Polling não é tempo real e snapshots não recompõem transições ausentes do histórico.
Escritas externas sem chave idempotente documentada não permitem prometer exactly-once
em timeout: ambiguidades exigem reconciliação antes de nova tentativa.

A ativação ainda depende de funil/etapas, política comercial, destino Meta,
contratos homologados e teste externo autorizado. Aprovar este ADR não autoriza
envio a contas de produção.
