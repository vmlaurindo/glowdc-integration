# Revisão — chaves Supabase e segredos internos

Commit revisado: `e8cc4db`

## Escopo

- adoção das chaves modernas `publishable` e `secret` emitidas pelo Supabase;
- remoção do uso da chave secreta como `Authorization: Bearer`;
- geração e documentação de três segredos internos independentes de 32 bytes;
- preenchimento local do `.env`, mantido fora do Git;
- automação administrativa que não imprime valores sensíveis.

## Evidências

- projeto validado antes da leitura das chaves: ref esperada e nome `Glow DC`;
- chaves `publishable` e `secret` confirmadas pela Management API sem registrar valores;
- `.env`: uma definição por variável, alias Vite idêntico à chave publishable e
  três chaves internas distintas, base64 válido, 32 bytes cada;
- `vitest run`: 6 arquivos e 21 testes aprovados;
- typecheck aprovado em web, Worker e contratos;
- build Vite aprovado, 78 módulos transformados;
- dry-run do Worker aprovado e 58 assets identificados. O Wrangler não pôde
  gravar seu log global por restrição do sandbox, mas concluiu com exit code 0;
- busca no código versionável encontrou apenas placeholders `sb_*` sintéticos.

## Revisão de segurança

- nenhum valor do `.env` foi impresso, documentado ou versionado;
- a chave `secret` existe somente no contrato do Worker;
- o frontend recebe apenas a chave publishable;
- cada finalidade criptográfica usa material independente;
- nenhuma chamada foi enviada a Meta, UAZAPI, Google ou WhatsApp.

## Resultado

`PASS`. Nenhum achado crítico ou alto no delta revisado.

