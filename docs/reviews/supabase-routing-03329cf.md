# Revisão — Supabase Glow DC e rota pública

Commit revisado: `03329cf` (`product/cloudflare-v1`).

## Evidência de infraestrutura

- alvo confirmado antes da mutação: projeto `Glow DC`, referência
  `pafyvmfvprcfzaycpwgm`, região `us-west-2`, estado `ACTIVE_HEALTHY`;
- estado inicial: nenhuma tabela pública;
- migração aplicada por Management API, SHA-256
  `fe9143b2e289973db3d81e5f645aeed2d12148514184b53889baba04c3a2b1ce`;
- estado final: 10 tabelas, todas com RLS ativo;
- três funções de domínio presentes e nenhum grant para `PUBLIC`, `anon` ou
  `authenticated`;
- Auth: cadastro público desabilitado, Site URL e allowlist apontando para
  `/glowdc/login`.

## Revisão de aplicação

- Vite usa base `/glowdc/`;
- usuários sem sessão são normalizados para `/glowdc/login` e usuários com
  sessão para `/glowdc/dashboard`;
- o Worker remove apenas o segmento exato `/glowdc`, sem consumir prefixos
  semelhantes;
- API, webhook e assets continuam no mesmo Worker;
- as rotas Cloudflare não abrangem outros clientes do domínio;
- nenhum segredo foi incluído no diff ou na configuração versionada.

## Observação operacional

A migração foi aplicada como baseline pela Management API e não foi gravada no
histórico do Supabase CLI. Antes de executar `db push` nesse projeto, marque
`202609290001` como aplicada com o mecanismo de repair do CLI.

O `.env` do projeto ainda não contém anon/publishable key nem service role key.
Isso não afeta o schema remoto, mas bloqueia autenticação real e runtime do
Worker até que as credenciais sejam cadastradas sem versionamento.

## Resultado

Nenhum achado crítico ou alto no commit. Schema e configuração Auth: `PASS`.
Deploy e aceite visual continuam fora deste commit.

