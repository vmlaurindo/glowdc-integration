# Plano de construção — m.hub ↔ Agendor → Meta

Data: 2026-10-01. Status: proposta para revisão humana, não implementado.
Escopo: especificação `../specs/agendor-commercial-loop.md` e ADR 0004 proposto.
Método: Spec Kit (contratos/gates), Superpowers (TDD/evidência), Dark Factory
(fatias verticais/revisão congelada). Este plano não autoriza deploy ou envios reais.

## 1. Resultado esperado

```text
UAZAPI (a homologar) → evento normalizado → atribuição no m.hub
                                             │
                                             ▼
                              pessoa + negociação no Agendor
                                             │
                              evolução comercial / polling
                                             ▼
                         histórico e estado comercial no m.hub
                                             │
                                  regras de marcos comerciais
                                             ▼
                               ledger + fila Meta existentes
```

Sem UAZAPI: o mesmo núcleo recebe fixtures sintéticas em teste/local. A operação
comercial e a entrega Meta são testadas separadamente. Só ficará pendente o provedor
de entrada depois de também homologarmos Agendor e Meta; código local passando
não basta para afirmar que só falta conectar um token.

## 2. Base inspecionada e diferenças em relação à arquitetura original

| Existente em product | Tratamento planejado |
| --- | --- |
| `packages/contracts/src/index.ts`: `NormalizedInbound`, parser UAZAPI | Manter fronteira; completar contrato com evidência e testes |
| `ingest.ts`, RPC `ingest_whatsapp_event`, D1 e fila de ingresso | Acrescentar intenção Agendor após persistência, por outbox |
| Supabase: contacts, leads, attributions, conversion_events | Ampliar com negócios, movimentos, configuração e vínculos |
| `meta.ts`: payload fixo `LeadSubmitted` | Tornar tipos de marco explícitos após validar contrato Meta |
| SQL: CHECK de conversão permite só `LeadSubmitted` | Migração compatível, sem reescrever eventos já enviados |
| `meta-delivery.ts` e fila Meta | Reutilizar entrega e reforçar verificação da resposta |
| Env com envios Meta desligados e versão Graph placeholder | Validar versão/destino antes de habilitar; não assumir prontidão |
| Cron atual faz limpeza horária | Separar agendamento comercial e limpeza, preservando retenção |
| Admin, roles, mocks e sistema visual | Adicionar configuração/visibilidade seguindo os padrões atuais |

Os endpoints Agendor e limitações abaixo são evidência da sondagem local de
2026-09-30, não nova validação remota. Rever documentação oficial e executar provas
controladas antes de fechar clientes HTTP; nenhum segredo foi necessário ao plano.

## 3. Contrato de dados e persistência

Proposta de novas tabelas Supabase, todas com `workspace_id`, RLS e acessos pelo
Worker. FKs compostas/validações impedem vínculos cruzados entre workspaces:

| Entidade | Responsabilidade / unicidade |
| --- | --- |
| `agendor_integrations` | Conta externa validada, token cifrado, modos, configuração versionada; uma ativa por workspace na v1 |
| `agendor_contact_links` | Contato m.hub ↔ pessoa Agendor; unique integração + contato |
| `agendor_deals` | Negócio, lead, atribuição de abertura, etapa, status, valor/moeda, responsável, timestamps, link; unique integração + deal externo |
| `agendor_movements` | Histórico mínimo; unique integração + `audit_deal_id` |
| `agendor_sync_cursors` | Janela, cursor, páginas e último sucesso por integração |
| `integration_jobs` | Outbox, chave de operação, passo concluído, tentativa, lease, próximo retry e erro sanitizado |
| `commercial_conversion_rules` | Funil/etapa/marco → regra versionada, modo observação/ativo |

Ampliar `conversion_events` com referência ao negócio/marco, regra e valor/moeda
quando aplicável. Preservar contrato dos eventos existentes e tornar nova chave
lógica unique por workspace + integração + negócio + marco; versão de regra não
deve permitir reenviar o mesmo marco por simples edição de configuração.

Várias negociações podem existir para o mesmo lead. A v1 propõe uma aberta por
contato e funil gerenciado; a política precisa de aceite. Histórico não é sobrescrito.
Não guardar telefone cru em um índice paralelo: usar contato/HMAC e cifra existentes.

Outbox e mudança de negócio são gravadas na mesma transação Supabase. Publicação
na Queue ocorre depois; reconciliador reenfileira pendências. Duplicatas de fila
são esperadas. Mensagens carregam IDs internos, sem tokens ou dados de contato.

## 4. Fluxo m.hub → Agendor

1. Validar entrada normalizada, escopo, mensagem de contato recebida e elegibilidade.
   Exigir ID do anúncio e link para criação conforme spec; metadados opcionais
   ausentes ficam nulos. `source_type=post` não deve ser tratado como anúncio pago
   sem prova. Campos desconhecidos não ganham valores inventados.
2. Criar intenção transacional única por evento/operação. Adquirir claim persistente
   por integração + contato + funil; não manter transação SQL aberta durante HTTP.
3. Consultar vínculo; sem vínculo, buscar pessoas por telefone completo e percorrer
   paginação, validando igualdade nos campos de telefone de cada candidato.
4. Zero candidatos: criar pessoa. Um: vincular sem sobrescrever dados comerciais.
   Vários: marcar conflito, sem escolher automaticamente.
5. Consultar negócios da pessoa no escopo configurado, inclusive no primeiro vínculo.
   Não criar duplicata só porque o índice local está vazio. Um aberto inequívoco
   pode ser vinculado conforme política; vários exigem resolução. Negócio antigo
   com atribuição existente não recebe nova origem como se fosse a primeira.
6. Sem negócio aberto: criar negociação com campos mapeados; persistir ID obtido
   antes da atividade. Com negócio vinculado: adicionar novo toque, sem sobrescrever
   a atribuição inicial. Replay da mesma mensagem não gera outra atividade.
7. Registrar atividade concluída com metadados do anúncio e referência interna
   opaca da operação, se contrato permitir; não enviar conteúdo de conversa.

Retry: leituras com 429/5xx/rede usam backoff e jitter. 401/403 suspendem a integração;
erros de validação exigem correção. Em POST com timeout/5xx ambíguo, consultar estado
remoto e reconciliar referência antes de repetir. Persistir `outcome_unknown` se não
for possível provar o resultado; não prometer ausência de duplicação por mero retry.
Guardar somente código HTTP, código interno e `X-Request-Id` sanitizado nos logs.

## 5. Fluxo Agendor → m.hub

Proposta inicial: polling a cada 5 minutos, overlap de 10 minutos e limite de carga
compartilhado com as escritas. `/deals/movements_history` é a fonte incremental;
`GET /deals/{id}` e listagem incremental de negócios reconciliam snapshots e mudanças
de valor/responsável que podem não constar no histórico de etapas.

- Paginar por `links.next`, validando origem/caminho antes de seguir links autenticados.
- Respeitar janelas de no máximo 30 dias conforme sondagem; cursor só avança após
  persistência durável de todas as páginas. Reinício pode reler, não perder eventos.
- Deduplicar `audit_deal_id` por integração. Ordenar por timestamp e desempate estável.
- Só atualizar snapshot quando a versão temporal for mais nova. Guardar timestamp
  observado separadamente do momento efetivo de transição.
- `deal_status` pode faltar no histórico. Consultar detalhe para estado atual, mas
  não atribuir o estado atual a todos os movimentos passados. Transição ambígua
  fica pendente; usar `wonAt`/evidência consistente para ganho, quando disponível.
- Rastrear somente funis permitidos e negócios vinculados. Descobrir negócios
  preexistentes é tarefa controlada, sem criar atribuição por aproximação de telefone.
- Primeiro carregamento é baseline: não dispara conversões retroativas. Backfill
  de envio exige seleção de período, elegibilidade e aprovação próprias.
- Registro removido ou inacessível não vira automaticamente perdido.

Meta de aceite de latência: até 10 minutos em carga nominal de teste, medida e
documentada. Backlog, indisponibilidade e limites da API ficam visíveis na interface.

## 6. Marcos comerciais → Meta

Separar nomes internos de marcos de nomes de eventos aceitos pela Meta. Conferir
documentação oficial atual para o destino business messaging: nomes, campos,
identificadores, janelas de tempo, versão Graph e valor/moeda. Não presumir que
qualquer evento CAPI de site funciona no mesmo contrato de WhatsApp.

| Marco interno | Regra proposta |
| --- | --- |
| Entrada de lead | Preservar evento existente; criação espelhada no CRM não emite outro |
| Lead qualificado | Primeira passagem comprovada pela etapa escolhida, uma vez por negócio |
| Venda ganha | Ganho comprovado; valor e moeda válidos se o evento exigir |
| Perda/reabertura | Registrar no histórico; sem conversão negativa/reenvio automático |

Usar `event_id` determinístico do marco, preservado em retry; snapshot de regra e
atribuição anexado à intenção para impedir mudanças silenciosas entre tentativas.
O `ctwa_clid` é obtido no m.hub pelo vínculo da negociação, mesmo se não for
exportado ao CRM. Não derivá-lo de `source_id` nem de telefone.

Sem atribuição suficiente: histórico comercial funciona e envio fica bloqueado
com motivo. Identificador recebido tardiamente pode liberar intenção pendente
apenas se a janela do contrato ainda permitir; conservar o horário original.

Reutilizar outbox/Queue Meta e reconciliar falhas entre persistência e publicação.
Verificar resposta semântica da API, não somente HTTP 200; registrar resposta
minimizada, tentativas e resultado. Aceitação pela API não prova atribuição no Ads.
Novo contrato não deve ativar eventos antigos observados nem duplicar entrada.

## 7. Onboarding e telas

Fluxo dentro de Integrações → Agendor:

1. Salvar credencial com cifra e validar conta pelo servidor.
2. Descobrir e selecionar funil, etapa inicial, responsável e origem de lead.
3. Mapear campos reais retornados pela API, inclusive opção de seleção; nunca
   adivinhar identifier nem tipo de valor. Exibir instruções para criação manual
   dos campos ausentes, sem dizer que já estão prontos.
4. Configurar marco qualificado/ganho e visualizar dados que cada operação usará.
5. Testar leitura, observar intenções e ativar leitura/escrita/envio separadamente.

Lead mostra negócios vinculados, anúncio e links, etapa, responsável, valor,
histórico e estado da sincronização/conversão. Tela operacional mostra backlog,
conflitos, resultado desconhecido e retry auditado. Status de UAZAPI, CRM e Meta
são independentes. Falta de UAZAPI não bloqueia a configuração do CRM.

Endpoints propostos, sempre com autorização e validação de workspace:

- `GET/POST /api/agendor-integrations`;
- `POST /api/agendor-integrations/:id/test`;
- `GET /api/agendor-integrations/:id/catalog`;
- `PATCH /api/agendor-integrations/:id/config` e `/mode`;
- `POST /api/agendor-integrations/:id/sync`;
- `GET /api/leads/:id/commercial`;
- `GET /api/agendor-integrations/:id/operations`;
- `POST /api/agendor-operations/:id/retry`.

Catálogos retornam apenas campos necessários à configuração; tokens nunca retornam.
Modo demonstração/fixtures não tem caminho para despachar jobs reais em produção.

## 8. Fatias, arquivos e provas

Todos os caminhos abaixo são relativos a product. Novos nomes são propostas.
Antes de cada fatia: contrato/teste focado falhando, implementação, prova passando.

| # | Entrega e arquivos principais | Prova exigida |
| --- | --- | --- |
| 0 | Aprovar spec/ADR; validar contratos oficiais Agendor/Meta e compatibilidade do parser | Matriz de evidência, campos e limitações; divergências corrigidas na spec |
| 1 | Configuração Agendor e teste de leitura visível: `agendor/client.ts`, `agendor/routes.ts`, `agendor/dispatcher.ts`, `AgendorIntegration.tsx`, env/wrangler e primeira migração de configuração | Admin configura mock, testa conexão e vê catálogo; segredo não retorna; outro workspace é negado; 429 HTML tratado |
| 2 | Persistência/outbox e criação sintética: `agendor/jobs.ts`, `agendor/outbound.ts`, contratos/ingest e migração de vínculos/jobs | Evento normalizado gera uma pessoa/negociação/atividade; concorrência, falha parcial e resposta perdida |
| 3 | Histórico comercial: `agendor/sync.ts`, cursor/movimentos, cron/queue no index, `CommercialTimeline.tsx` | Etapa alterada no CRM simulado aparece no lead; paginação/replay/atraso não duplicam ou regridem |
| 4 | Marcos Meta: `commercial-conversions.ts`, meta/meta-delivery/supabase, migração de eventos/RPCs | Qualificação e ganho geram intenções estáveis; sem clique não envia; sem duplicar entrada; resposta inválida não marca sent |
| 5 | Operação e recuperação: painel, `mock-api.ts`, endpoints de retry e reconciliação | Operador resolve falha simulada; viewer não altera; modos isolados; fila sobrevive à falha após commit |
| 6 | Homologação Agendor + Meta e documentação operacional | Funil/teste sintético autorizado, prova de ida/volta, Meta Test Events, registros de teste removidos após confirmação |
| 7 | Homologação UAZAPI e ativação gradual | Mensagem controlada entra pelo webhook real e percorre CRM → marco → Meta, com dados minimizados |

A fatia 1 é visível e verificável mesmo com escrita desativada. O cliente/limitador
faz parte dela. Migrations existentes não são editadas: novas migrations aditivas.
Não introduzir novo framework visual nem copiar a arquitetura do Rastrack.

## 9. Matriz de testes e aceite

- Contratos: evento completo, sem referral, sem link, sem clique, sem título,
  source_type incompatível, telefone inválido e mensagem própria/grupo.
- Identidade: falso positivo de substring, colisão, negócio existente e vários
  negócios; mesmo telefone em dois workspaces não mistura dados.
- Concorrência: dois jobs do mesmo contato e dois workers usando a mesma conta;
  validar serialização global e uma criação no caminho determinístico.
- Resiliência: 429 HTML, credencial revogada, timeout antes/depois de commit remoto,
  persistência indisponível, retry de atividade, fila indisponível depois de commit.
- Sincronização: várias páginas, totalCount ausente, cursor após crash, overlap,
  histórico fora de ordem, status nulo, valor alterado, perda/ganho/reabertura,
  baseline sem disparo e janelas maiores que 30 dias divididas corretamente.
- Conversão: timestamp do marco, regra versionada, IDs estáveis, sem atribuição,
  clique tardio, destino inválido, evento expirado, retorno 200 semanticamente inválido.
- Segurança: roles, isolamento, cifra, logs sem PII, SSRF/paginação, payload excessivo
  e desativação durante execução. Em produção, envio verifica modo novamente antes HTTP.

Comandos locais em PowerShell integrado: `npm.cmd test`, `npm.cmd run typecheck`,
`npm.cmd run build`. Validar migrations e RPCs em banco de teste com fixtures,
incluindo concorrência real; mocks não provam locks ou RLS. Preparar runner de
integração específico com endpoint de teste explicitamente selecionado.

Qualquer fluxo de tela exige Playwright MCP headless (configurar → testar →
observar → consultar negócio/histórico → tratar pendência). Se indisponível,
marcar BLOCKED; `test:e2e` via CLI não substitui esse gate.

Revisar commit congelado e registrar `docs/reviews/agendor-commercial-loop-<sha>.md`
e `docs/qa/agendor-commercial-loop-<sha>.md`. Relatar PASS/FAIL/BLOCKED separadamente
para núcleo local, integração Agendor, integração Meta e entrada UAZAPI.

## 10. Decisões e ativação

Podemos aprovar a construção com configurações inicialmente não preenchidas;
nenhum ID comercial será inferido. Decisões de ativação:

| Decisão | Proposta / efeito enquanto pendente |
| --- | --- |
| Funil/etapa inicial e etapa qualificadora | Seleção pelo administrador; bloquear operação correspondente até configurar |
| Leads orgânicos | Não criar negócio automaticamente nesta versão |
| Responsável | Padrão da conta, se aprovado; sem round-robin nesta versão |
| Contatos/negócios ambíguos | Bloquear e mostrar conflito; escolha auditada |
| Nova venda após encerramento/reabertura | Novo negócio pode ser novo ciclo; reabrir o mesmo não reenvia venda automaticamente |
| Exportar ctwa_clid ao CRM | Desligado por padrão proposto; conservar cifrado no m.hub |
| Retenção de vínculos/movimentos/identificadores | Definir prazo e exclusão antes de ativar dados reais; não herdar 7 dias de payload bruto |
| Conta/destino e contratos Meta | Confirmar destino, permissão, nomes aceitos e modo teste antes de envio |
| Escrita externa | Confirmar conta, credencial, registros sintéticos, funil e limpeza antes da prova |

Rollback operacional: desligar escrita Agendor e envios Meta, pausar novos jobs e
manter leitura/auditoria conforme necessidade. Não apagar negócios nem eventos
entregues automaticamente. Migrações aditivas preservam o funcionamento anterior;
documentar reversão de bindings e flags antes de deploy.

## 11. Dependência restante da UAZAPI

O último encaixe comprova autenticação, instância/workspace, ID de mensagem,
telefone, direção e metadados reais. Fixar amostras sintéticas equivalentes e
ajustar somente o adaptador para o contrato compartilhado. ID do anúncio e clique
não são garantidos pelo simples cadastro do token. Se faltarem, o m.hub deve mostrar
a limitação e habilitar apenas capacidades sustentadas pelos dados observados.

Não expor simulador público nem criar um segundo parser para contornar essa prova.
