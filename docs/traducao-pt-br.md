# Português do Brasil

A extensão adiciona PT-BR aos idiomas nativos do Multica Desktop 0.7.2. São 25 catálogos com 6.942 entradas. O idioma é ativado localmente na primeira abertura após instalar; depois pode ser alterado em Configurações → Preferências → Idioma.

A tradução inclui navegação, formulários, mensagens da interface, preferências, tarefas, agentes, equipes, habilidades, automações, ambientes de execução, calendário e diálogos do desktop. Conversas, código, comandos, identificadores e nomes dos provedores não são reescritos.

O servidor 0.7.2 ainda não anuncia PT-BR. Por isso, essa escolha fica salva no desktop e não é enviada como idioma de conta ao servidor. Uma preferência antiga da conta não substitui o PT-BR local.

As variáveis como `{{count}}` são verificadas antes de preparar o pacote. Os idiomas existentes são preservados. Os catálogos são incorporados ao aplicativo: não há tradução de mensagens por API externa durante o uso.

O instalador usa o backup verificado e recusa builds incompatíveis. Alterações futuras devem atualizar os catálogos e o adaptador em `lib/pt-br.cjs`, executar os testes de paridade e validar a interface nativa. Créditos e licenças: `src/i18n/NOTICE.md`.
