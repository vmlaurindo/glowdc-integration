# Especificação — diagnóstico e gestão de conexões UAZAPI

Status: aprovado em 2026-10-02.

## Problema e resultado esperado

O teste UAZAPI falha no runtime do Worker por usar `redirect: "error"`, embora
os testes unitários atuais substituam `fetch` e não detectem a incompatibilidade.
Os registros recebem `needs_attention`, mas a interface exibe um erro genérico.
O formulário rotulado como edição sempre cria outro registro e não oferece
suspensão, fazendo conexões distintas com o mesmo host parecerem duplicatas sem
gestão segura.

O resultado é um teste compatível com Workers, diagnósticos acionáveis e
persistentes, apresentação segura dos erros e gestão das conexões existentes sem
revelar tokens nem apagar histórico.

## Contrato de erro

O Worker classifica status HTTP em códigos estáveis e resumo em português:
401 credencial rejeitada; 403 permissão; 404 rota/instância; 408 e 504 timeout;
429 limite de requisições; 5xx indisponibilidade do provedor; 3xx redirecionamento
bloqueado; falha sem status em rede/configuração/erro inesperado.

Falhas retornam `error: "uazapi_connection_failed"` e `diagnostic` com `code`,
`category`, `httpStatus` e `summary`. `last_error_code` guarda o código estável;
`last_error_summary` guarda a legenda segura do painel. O histórico administrativo
recebe `diagnostic.detail` após sanitização; não se registra corpo bruto da
resposta, payload de conversa, token, cabeçalho de autorização, telefone ou e-mail.

O painel Conectar mostra a legenda da resposta; a Visão geral mostra código e
resumo por conexão. O erro é persistido antes de responder. Se a auditoria não
puder ser persistida, o Worker grava o detalhe sanitizado no log de runtime e
responde indicando que o histórico administrativo não foi atualizado.

## Gestão e segurança

Editar atualiza o mesmo `provider_connections.id`. Nome e URL são carregados;
token nunca é retornado. Token vazio preserva o valor cifrado e token informado
substitui-o. Alterar configurações retorna a conexão à observação e exige novo
teste antes de ativar Meta.

Suspender é reversível, grava `suspended_at`, bloqueia ingestão e mantém
atribuições e webhooks já registrados. Testar uma conexão suspensa não a reativa.
Reativar exige teste bem-sucedido após a suspensão e retorna a `observing` se o
webhook existe, caso contrário a `needs_webhook`; nunca ativa envios Meta.
Exclusão física fica fora do escopo porque chaves estrangeiras atuais apagam
eventos e atribuições em cascata.

## Critérios de aceite

1. Worker usa redirect manual e jamais encaminha o token em um redirect.
2. Respostas conhecidas e erros inesperados produzem código, resumo e histórico
   sanitizados, visíveis de imediato após a ação.
3. Editar não cria ID novo; campo de token vazio preserva segredo cifrado.
4. Suspensão bloqueia ingestão; teste não remove suspensão; reativação exige
   teste posterior e fica em observação.
5. Nenhum fluxo de validação instala webhook, envia conversão ou expõe token.
