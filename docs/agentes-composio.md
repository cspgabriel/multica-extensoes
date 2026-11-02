# Acesso dos agentes ao Composio

Conectar uma conta no marketplace e carregar ferramentas no runtime são duas etapas diferentes. Este recurso faz a atribuição do MCP aos agentes e instala a regra de descoberta prioritária.

## Ativar

1. Abra o Multica normalmente na sessão do proprietário do Windows. Se acabou de atualizar os fontes, reabra a interface.
2. No Marketplace, configure a chave do seu projeto e o ID de usuário das conexões desejadas.
3. Confira o diagnóstico e clique em **Ativar nos meus agentes**.
4. Confira atribuições, exceções e a confirmação de sincronização automática. **Verificar atribuições** refaz a auditoria e permite tentar novamente o registro do sincronizador.

O Multica bloqueia alterações de servidores e atribuições MCP feitas por agentes. Essa ativação só pode ser concluída pela sessão humana do proprietário. O código não contorna essa restrição.

## Comportamento

O servidor `multica-marketplace-*` é adicionado pela biblioteca MCP do workspace aos agentes pertencentes à conta autenticada. Os servidores existentes e as instruções individuais são preservados. A biblioteca é um recurso compartilhado do workspace: seus administradores controlam o acesso e as atribuições.

A skill `multica-marketplace-composio` e um bloco identificado no contexto do workspace orientam a descoberta por `COMPOSIO_SEARCH_TOOLS` antes de usar ferramentas externas alternativas. A política respeita preferências explícitas e falhas concretas. Conectar uma conta não autoriza mensagens, publicação, exclusão ou gastos por conta própria. Instruções orientam modelos; não são uma garantia de uso em todas as respostas.

Não é fixada uma lista de contas ou toolkits na sessão MCP. As ferramentas resolvem as contas ativas do ID de usuário configurado, incluindo novas conexões. Contas de outros IDs não são incorporadas. A seleção de conta é explícita quando há múltiplas contas.

Uma tarefa do Agendador do Windows procura novos agentes a cada minuto e audita atribuições existentes a cada cinco minutos. Requer este PC ligado, usuário conectado, internet e autenticação válida do Multica. Os agentes já configurados usam o MCP remoto diretamente, sem depender de o painel estar aberto. Execuções já em andamento precisam de nova execução para receber a configuração.

## Compatibilidade e diagnóstico

O painel separa o total atribuído dos agentes com runtime compatível. Copilot e Antigravity não recebem MCP gerenciado nesta versão do Multica. Agentes sem runtime aparecem como pendência. Para esses casos, vincule um runtime compatível e verifique novamente as atribuições. Não se promete acesso nativo só porque uma atribuição existe.

Falhas ficam visíveis por agente. Uma recusa ao registrar o servidor não é apresentada como ativação concluída. O sincronizador não substitui configurações MCP particulares nem controla o daemon.

## Credenciais e remoção

A chave fornecida no painel é protegida pelo usuário do Windows. Para a tarefa automática, uma cópia é protegida com DPAPI CurrentUser. A configuração MCP remota precisa da chave do projeto para autenticar no Composio; não atribua esse servidor a pessoas que não devam usar as conexões. A chave não aparece em argumentos de comandos, relatórios ou documentos.

A desinstalação remove a tarefa local. As atribuições remotas, a skill, o bloco de contexto e as conexões Composio são preservados. Para revogar, remova o servidor e suas atribuições no Multica, remova o bloco e a skill se desejado e revogue as contas/chave no Composio.

## Referências

- [Sessões MCP do Composio](https://docs.composio.dev/docs/sessions-via-mcp)
- [Resolução de contas em sessões](https://docs.composio.dev/kb/guide/mcp-tool-router-sessions)
- [Suporte MCP por runtime do Multica](https://github.com/multica-ai/multica/blob/main/packages/core/agents/mcp-support.ts)
