# Filtros do marketplace

O seletor **Como conectar** abre sempre em **Sem painel Composio**. Essa opção mostra apps sem autenticação e apps que oferecem OAuth gerenciado, conforme os metadados do catálogo Composio. O login e o consentimento da conta podem abrir no navegador do provedor.

Use **Todas as integrações** para consultar o catálogo inteiro ou **Exigem configuração no painel** para ver as demais integrações. Os cards indicam **Sem autenticação**, **Conexão pelo marketplace** ou **Configuração no painel**. Apps sem informação suficiente de autenticação ficam no grupo de configuração no painel.

O filtro é combinado com a busca e a categoria. A paginação é aplicada depois de filtrar o catálogo completo, preservando os resultados e a contagem. O catálogo fica em cache por cinco minutos. Uma página antiga não pode ser reutilizada depois de trocar o filtro ou a busca.

Se a interface for atualizada enquanto um backend antigo ainda estiver aberto, o filtro também funciona por compatibilidade com o IPC anterior. Nesse caso, a contagem pode aparecer com **+** enquanto outras páginas ainda não foram consultadas. O número passa a ser exato quando a consulta termina. Feche e reabra a aba Marketplace para carregar os novos arquivos da tela.

Falhas de carregamento mostram o motivo e o botão **Tentar novamente**. O aviso de conexão não é usado para diferenças entre versões. A atualização de **Minhas conexões** preserva a mensagem de erro do catálogo para permitir o diagnóstico.
