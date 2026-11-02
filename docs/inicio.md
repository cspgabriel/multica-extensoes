# Multica Extensões

Esta instalação adiciona **Pool de Contas IA**, **Marketplace Composio** e **Docs** ao seu Multica Desktop no Windows.

## Documentação editável

Clique em **Editar documento** para alterar esta página em Markdown. **Salvar alterações** mantém uma cópia da versão anterior em **Histórico**. Restaurar uma versão abre o conteúdo no editor; salve para confirmar.

Cada gravação verifica se outra janela ou uma IA mudou o documento. Havendo conflito, recarregue a página e reúna as alterações antes de salvar.

## Editar com IA

Clique em **Editar com IA**, escolha um agente deste PC e descreva o pedido. **Criar tarefa para IA** cria uma issue em todo no workspace atual. Isso inicia uma execução real do agente selecionado. O pedido inclui o documento e as instruções de manutenção.

Exemplo: “Adicione uma busca por e-mail no Pool, atualize os docs e teste sem parar o daemon”.

## Configuração pessoal

Nenhuma conta acompanha este pacote. No Marketplace, informe sua própria chave Composio e o ID de usuário usado no seu projeto. Os provedores do Pool dependem dos CLIs e logins já existentes neste PC.

## Onde ficam os arquivos

Por padrão, a pasta é `%LOCALAPPDATA%\MulticaExtensoes`.

- `data/docs`: documentos e histórico.
- `data/composio.json`: configuração local; chaves fornecidas pela interface são protegidas pelo Windows.
- `versions`: fontes editáveis da versão instalada.
- `backups`: pacote original verificado.
- `installation.json`: caminhos e hashes usados para instalação e reversão.

Esta é uma extensão independente. Atualizações do Multica podem substituir a integração. O instalador recusa builds que ainda não foram verificados.
