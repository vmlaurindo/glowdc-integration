# Especificação — Agendor, evolução comercial e retorno Meta

Data: 2026-10-01. Status: proposta para aprovação; sem autorização de ativação externa.

## Objetivo e escopo

Configurar o Agendor por workspace dentro do m.hub, enriquecer negociações com
atribuição de anúncios, acompanhar a evolução comercial e gerar conversões Meta
a partir de marcos aprovados. A base deve poder ser construída e testada com
eventos normalizados sintéticos antes da homologação da UAZAPI.

Inclui configuração no sistema, criação/enriquecimento de negócios, leitura
incremental do CRM, histórico no m.hub, regras de conversão, retry e auditoria.
Exclui Google Ads, plataforma de conversas, alteração de etapas pelo m.hub,
enriquecimento de campanha pelo Graph e importação indiscriminada do CRM.

## Fontes e limites da evidência

- Arquitetura original: `../../../ARQUITETURA-WHATSAPP-AGENDOR-ADS.md`, relativa
  a este arquivo (fonte no workspace, externa ao repositório product).
- Sondagem local: `../../../docs/achados/agendor-api-v3-funis-e-atribuicao.md`,
  relativa a este arquivo. Leitura da API em 2026-09-30; escritas não
  homologadas. A implementação deverá localizar essas fontes a partir do workspace.
- Código atual: `packages/contracts/src/index.ts`, `workers/api/src/ingest.ts`,
  `meta.ts`, `meta-delivery.ts` e migração inicial Supabase.

O pedido atual amplia a arquitetura original: inclui o retorno comercial e Meta,
antes adiados. Google permanece fora. Os achados locais não substituem uma nova
validação dos contratos oficiais antes da implementação das chamadas externas.

## Comportamento esperado

1. Admin informa token Agendor no sistema; servidor valida conta e apresenta
   funis, etapas, vendedores, origem de lead e campos disponíveis.
2. Admin configura destino e mapeamentos, inicialmente em observação.
3. Evento elegível gera proposta de criação/enriquecimento. Ao ativar escrita,
   cria ou vincula pessoa, resolve negociação aberta e registra contexto do anúncio.
4. Agendor controla etapa, responsável, valor e status comercial. m.hub mantém
   cópia e histórico, identificados pelo ID do negócio, não apenas pelo telefone.
5. Marco aprovado produz uma intenção de conversão. A mesma fila Meta existente
   entrega essa intenção quando atribuição, contrato e ativação permitirem.
6. Operador consulta origem, histórico, última sincronização e resultado de entrega,
   distinguindo pendência, falha, observação, aceitação pela API e atribuição não confirmada.

## Contratos e propriedade

- m.hub é fonte de atribuição e da auditoria de entrega; Agendor é fonte comercial.
- Um contato pode ter várias negociações no tempo. Cada negócio preserva a
  atribuição de sua abertura; novos toques entram no histórico sem substituí-la.
- `NormalizedInbound` permanece a fronteira de entrada do produto. Acrescentar
  campos comprovados de origem quando necessário; nenhum parser Agendor paralelo.
- ID do anúncio não é identificador de clique. Ausência de `ctwa_clid` não impede
  acompanhamento comercial; pode impedir o envio pelo contrato Meta adotado.
- Gravar `ctwa_clid` no Agendor é opcional e exige aprovação específica. Recomenda-se
  mantê-lo cifrado no m.hub; o CRM precisa principalmente de anúncio e links.
- Criação paga exige ID e link de origem conforme requisito original. Ausência do
  link bloqueia essa escrita com motivo explícito; não construir um link fictício.
- Leads orgânicos ficam fora da criação automática nesta versão proposta.

## Segurança, deduplicação e falhas

Todas as chaves de vínculo incluem workspace e integração/conta Agendor. Telefone
é comparado por igualdade após normalização; persistência usa HMAC/cifra existentes.
Nenhum conteúdo de conversa é adicionado ao CRM. Tokens nunca retornam ao navegador.
Permissões seguem roles do sistema: owner/admin configuram e ativam; operador
consulta e solicita retry auditado; viewer somente consulta.

Separar deduplicação de mensagem, atividade, negociação, movimento comercial e
conversão. Serializar chamadas por conta Agendor; usar progresso persistente e
outbox transacional. Escrita com resposta perdida fica em reconciliação, não em
reenvio automático cego. Uma revisão humana resolve ambiguidades irrecuperáveis.

Retenção dos novos dados e eventual cópia de identificadores ao CRM serão definidas
antes da ativação. Logs técnicos têm IDs internos, códigos e correlação, sem PII.

## Critérios de aceite

- Configuração integral pelo sistema, isolada por workspace, com segredo mascarado.
- Em fixtures, evento pago cria exatamente uma negociação e uma atividade mesmo
  com repetição, concorrência e reinício do processamento.
- Colisão de telefone ou múltiplos negócios candidatos exige resolução explícita.
- Movimento repetido não duplica histórico nem conversão; eventos atrasados não
  fazem o estado atual regredir.
- Lead, qualificação e venda têm regras independentes e não duplicam o sinal de
  entrada entre WhatsApp e CRM.
- Ganho sem atribuição permanece visível, com motivo de não envio. Perda não vira
  automaticamente uma conversão negativa nem apaga evento já entregue.
- Desativar a integração impede novos efeitos e preserva progresso/auditoria.
- Fluxo sintético funciona sem UAZAPI; homologação externa e do provedor recebem
  estados separados PASS/FAIL/BLOCKED, sem declarar operação real antes da prova.

Plano: `../plans/agendor-commercial-loop.md`. Decisões: `../adr/0004-agendor-commercial-loop.md`.
