# Marketplace Composio

O marketplace consulta o catálogo do seu projeto Composio. Há busca, categorias, paginação, detalhes e ferramentas por integração.

## Configurar

Clique em **Configurar Composio**. Informe sua chave de projeto e um **ID de usuário Composio**. Esse ID é a identidade das suas conexões no projeto, não necessariamente seu e-mail. Para encontrar contas existentes, use exatamente o mesmo ID usado ao conectá-las.

O módulo também pode usar COMPOSIO_API_KEY e COMPOSIO_USER_ID fornecidos no ambiente da interface. Não lê arquivos de ambiente de outros aplicativos e não inclui credenciais de terceiros.

A chave salva na interface é criptografada para o usuário atual do Windows. Ela não é enviada aos arquivos de documentação nem retornada ao painel.

## Conectar

Para OAuth gerenciado, **Conectar** localiza uma configuração habilitada ou cria uma para o app selecionado. O Composio fornece um Connect Link. Autorize a conta no navegador e volte para **Atualizar conexões**.

Apps que exigem configuração própria orientam a conclusão no dashboard Composio. Apps sem autenticação permitem **Usar com IA**.

Somente as conexões com o ID de usuário configurado são exibidas. Tokens OAuth e senhas não são retornados ao frontend.

## Pedir trabalho a um agente

**Pedir tarefa à IA** cria uma solicitação com o toolkit e sua instrução. O agente precisa ter acesso ao Composio no próprio runtime. O marketplace não instala automaticamente servidores MCP nem replica sua chave para todos os agentes.

## Referências

- [Catálogo de toolkits](https://docs.composio.dev/reference/api-reference/toolkits/getToolkits)
- [Ferramentas](https://docs.composio.dev/reference/api-reference/tools/getTools)
- [Connect Links](https://docs.composio.dev/reference/api-reference/connected-accounts/postConnectedAccountsLink)
