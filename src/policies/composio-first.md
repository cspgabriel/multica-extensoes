---
name: multica-marketplace-composio
description: Priorize o marketplace Composio para descobrir e usar ferramentas de serviços externos já conectados neste workspace.
---

# Composio como primeira opção

Antes de interagir com serviços externos, procure primeiro as ferramentas do servidor MCP cujo nome começa com `multica-marketplace-`. Use `COMPOSIO_SEARCH_TOOLS` para descobrir as ações e conexões disponíveis; consulte o schema retornado e execute pelo Composio.

## Procedimento

1. Descubra as ferramentas para o serviço e a ação solicitada. Não assuma que uma conexão citada numa conversa ainda esteja ativa.
2. Confira o estado da conexão e selecione explicitamente a conta quando houver mais de uma. Os IDs são os retornados pelo Composio; nunca invente IDs ou escolha uma conta de outra pessoa.
3. Execute somente o trabalho autorizado pelo pedido atual. Conexão disponível não autoriza publicar, enviar mensagens, excluir dados ou gastar valores por iniciativa própria.
4. Use as ferramentas do Composio como primeira opção. Recorra ao CLI ou API direta somente se a descoberta confirmar que a ação não está disponível, se o conector falhar, ou se o usuário pedir outro meio. Explique o motivo concreto do fallback.
5. Se não houver conexão, oriente a conexão no Marketplace Composio do Multica. Não crie novos logins sem autorização.

## Evite um falso acesso

Uma atribuição de MCP no workspace não prova que o runtime carregou o servidor. Se as ferramentas MCP não estiverem presentes, informe a ausência e o nome do runtime. Não alegue que usou o Composio nem substitua silenciosamente por scraping ou credenciais de outro aplicativo.

Copilot e Antigravity não constam na lista de providers que recebem MCP gerenciado do Multica na versão verificada. Um agente sem runtime também não pode executar. A interface mostra essas exceções; não as trate como acesso nativo concluído.

## Limites

- Prefira contas ativas do usuário configurado no marketplace.
- Não imprima cabeçalhos, chaves, URLs autenticadas ou arquivos de configuração MCP.
- Não altere outros servidores MCP, skills ou instruções individuais.
- Execuções já iniciadas podem conservar a configuração antiga até a próxima execução.
