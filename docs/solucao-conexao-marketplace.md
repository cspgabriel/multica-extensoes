# Carregamento do marketplace

A versão 1.2.1 corrige um caso em que a tela atualizada mostrava **Conexão indisponível** quando o Multica continuava executando o backend anterior. O catálogo podia estar disponível e a chave válida; a diferença de formato da resposta era interpretada como falha.

A tela agora aceita os dois formatos. Em um backend antigo, consulta páginas adicionais pelo IPC do próprio Multica e aplica o filtro sem enviar credenciais ao frontend. A contagem usa **+** enquanto houver páginas não consultadas.

Depois da atualização dos arquivos locais, feche a aba Marketplace e abra novamente. Para falhas reais, o motivo aparece no catálogo e **Tentar novamente** refaz a consulta. Respostas de **Minhas conexões** não apagam esse diagnóstico.
