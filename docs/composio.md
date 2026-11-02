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

Clique em **Ativar nos meus agentes** para atribuir o MCP e a skill de prioridade aos seus agentes neste workspace. A ativação precisa da sessão do proprietário: o Multica não permite que tarefas de agentes modifiquem a biblioteca ou as atribuições MCP. O painel mostra pendências de runtime, falhas e sincronização automática. Copilot, Antigravity e agentes sem runtime não são apresentados como acesso nativo funcionando.

A sessão descobre as conexões ativas do mesmo ID de usuário sem fixar contas. Conexões novas ficam disponíveis pela descoberta de ferramentas. **Pedir tarefa à IA** cria uma solicitação com o toolkit e sua instrução; use o diagnóstico para verificar o acesso do runtime. Veja [Acesso dos agentes](agentes-composio.md).

## Referências

- [Catálogo de toolkits](https://docs.composio.dev/reference/api-reference/toolkits/getToolkits)
- [Ferramentas](https://docs.composio.dev/reference/api-reference/tools/getTools)
- [Connect Links](https://docs.composio.dev/reference/api-reference/connected-accounts/postConnectedAccountsLink)
