# Plugins no chat

## Começar pelo marketplace

Nos cards de integrações conectadas, nos detalhes da integração e em **Minhas conexões**, clique em **Conversar com agente**. Escolha um agente local e, quando houver mais de uma, a conta conectada desejada. **Abrir chat** inicia uma composição nova com esse agente e adiciona a integração e o ID da conta ao rascunho. A mensagem só é enviada quando você terminar o pedido e clicar em enviar. A ação não cria uma issue.

Conexões expiradas não oferecem esse botão. A indicação de conexão ativa vem do cadastro Composio; o acesso real é confirmado quando uma ferramenta é executada.

## Plugins da conversa

O botão **Plugins** aparece no compositor tanto do chat completo quanto do chat flutuante. A página mantém a conversa aberta e permite buscar em três grupos:

- **Plugins Multica:** instalações nativas deste workspace. Administradores e proprietários podem **Ativar no workspace**; **Configurar plugin** abre as configurações nativas. Habilitar um plugin vale para o workspace, e não somente para o chat atual. Ferramentas MCP continuam sujeitas à aprovação nativa.
- **Integrações Composio:** conexões da identidade configurada nesta instalação. **Usar na conversa** exige conexão ativa, servidor Composio atribuído e habilitado para o proprietário do agente e runtime compatível. Se o servidor ainda não foi registrado, abra o marketplace e configure o acesso na sessão do proprietário.
- **Servidores do Multica:** biblioteca MCP do workspace e atribuições do agente. O proprietário pode **Ativar neste agente**, sem alterar outros agentes ou substituir servidores existentes. A ativação vale para as próximas execuções do agente.

**Usar na conversa** acrescenta o contexto ao rascunho atual e preserva os anexos. Não executa a ferramenta nem envia a mensagem. Plugins que oferecem somente uma interface podem exigir a abertura de suas configurações; o agente deve verificar quais ferramentas estão disponíveis antes de agir.

Um erro de consulta é mostrado no grupo correspondente, com **Tentar novamente**. Ele não é apresentado como uma lista vazia ou como autenticação confirmada. Contas Composio, plugins nativos do Multica e plugins do runtime Codex/ChatGPT têm conexões independentes; esta página não importa nem reconecta os plugins do Codex/ChatGPT.

## Instalação

A integração com o compositor exige reinstalar a extensão a partir do build original verificado. Use o instalador manualmente na sessão do Windows. Uma tarefa de agente pode preparar e testar um pacote isolado, mas não instala o patch no aplicativo em uso. Builds desconhecidos continuam sendo recusados, sem ampliar a lista de hashes permitidos.
