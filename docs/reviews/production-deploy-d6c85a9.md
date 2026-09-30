# Revisão — provisionamento e deploy de produção

Commit implantado: `d6c85a9`  
Conta: `MAXIO COMUNICAÇÃO`  
Rota: `https://app.maxio.com.br/glowdc`

## Escopo implantado

- D1 dedicado `glowdc-integration-ops` com migração operacional;
- duas filas de processamento e duas dead-letter queues;
- cinco segredos do runtime enviados via stdin;
- frontend e Worker no mesmo deployment e nas rotas `/glowdc` e `/glowdc/*`;
- usuário Auth inicial confirmado e workspace `Glow DC` com papel owner;
- `workers.dev` e preview URLs desativados;
- envios Meta mantidos globalmente desativados.

## Evidências

- 6 arquivos de teste e 21 testes aprovados;
- typecheck aprovado para web, Worker e contratos;
- build Vite aprovado com 78 módulos e 57 assets finais;
- dry-run do Worker aprovado com D1, Assets e duas filas;
- D1 remoto: nenhuma migração pendente;
- Worker: os cinco nomes de segredo esperados estão presentes;
- deployment final ativo em 100% na rota customizada;
- smoke público: health, autenticação e workspace owner aprovados;
- busca no código versionável encontrou somente placeholders, sem valores reais.

## Segurança e efeitos externos

- senha administrativa gerada como 12 caracteres hexadecimais e salva apenas
  no `.env` operacional;
- nenhum valor sensível foi impresso ou versionado;
- nenhuma credencial UAZAPI ou Meta foi cadastrada;
- nenhuma chamada foi enviada a Meta, WhatsApp, Google ou Agendor;
- `META_SENDS_ENABLED=false` permanece como barreira global.

## Achados

- o primeiro deploy foi recusado pela Cloudflare por loop no `_redirects`;
- o arquivo redundante foi removido no commit `b8d570e`, pois o fallback SPA já
  é fornecido por `not_found_handling = "single-page-application"`;
- o deploy seguinte foi concluído com sucesso.

Resultado da revisão técnica: `PASS`.

