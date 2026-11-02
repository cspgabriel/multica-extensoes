# Multica Extensões

Instalador independente para adicionar **Docs**, **Editar com IA**, **Marketplace Composio** e **Pool de Contas IA** ao Multica Desktop no Windows.

**Primeira versão: Multica Desktop 0.7.2, Windows x64, build verificado.** Outras versões e pacotes modificados são recusados antes de alterar o aplicativo. Não distribui o Multica e não altera seu executável, assinatura ou fuses.

## Instalar

1. Instale o [Multica Desktop](https://multica.ai) normalmente.
2. Baixe `multica-extensoes-1.1.1-windows-x64.zip` na [release](https://github.com/cspgabriel/multica-extensoes/releases/latest).
3. Extraia o ZIP e execute **Instalar.cmd**.
4. Confirme a instalação. A interface será reaberta com os novos itens abaixo de Runtimes.

O pacote usa Node.js 22+ se estiver instalado. Caso contrário, usa o Node embutido no executável compatível do Multica. Não baixa runtimes ou dependências npm e não muda a política de execução permanente do PowerShell.

Como alternativa, baixe **Instalar-Multica-Extensoes.ps1** da mesma release. Esse script baixa uma versão fixa do ZIP e verifica seu SHA-256 antes de executá-la. Abra o PowerShell na pasta do download:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Instalar-Multica-Extensoes.ps1
```

Instalação personalizada pelo pacote extraído:

```powershell
.\Instalar.ps1 -MulticaPath 'C:\Minha pasta\Multica.exe'
```

Se o daemon usa outro perfil:

```powershell
.\Instalar.ps1 -Profile 'meu-perfil'
```

Os caminhos são detectados no computador de quem instala. A pasta padrão dos módulos é `%LOCALAPPDATA%\MulticaExtensoes`. Instalações por usuário não exigem administrador; instalações protegidas em Program Files podem exigir permissão de escrita.

## Recursos

- **Docs:** leitura, editor Markdown, histórico e proteção contra gravações concorrentes.
- **Editar com IA:** escolha um agente local e descreva uma alteração. O envio cria uma issue em todo no workspace atual e inicia trabalho real do agente selecionado.
- **Marketplace Composio:** catálogo dinâmico com busca, categorias, paginação e detalhes das ferramentas. A autorização OAuth termina no navegador.
- **Pool de Contas IA:** consulta os provedores locais suportados e oferece os controles dos respectivos CLIs. Provedores sem CLI ou login podem apresentar erro ou lista vazia.

Nenhuma conta ou credencial acompanha o pacote. Configure **sua própria chave Composio** e o **ID de usuário do seu projeto** no marketplace. Chaves fornecidas pela interface são protegidas pelo usuário atual do Windows. Conectar uma conta não instala automaticamente servidores MCP em todos os agentes.

## Acesso dos agentes ao marketplace

Depois de configurar o Composio, clique em **Ativar nos meus agentes**. A sessão do proprietário registra um servidor MCP na biblioteca do workspace, atribui esse servidor aos seus agentes e adiciona uma skill e contexto de prioridade: descobrir ferramentas com `COMPOSIO_SEARCH_TOOLS` antes de usar alternativas para serviços externos. Os demais servidores e instruções individuais são preservados.

As sessões resolvem as conexões ativas do mesmo ID de usuário, sem fixar uma lista de contas. Novas conexões passam a ser descobertas pelos agentes já configurados. Uma tarefa do Windows verifica novos agentes a cada minuto enquanto este usuário estiver conectado e o computador ligado; os agentes já atribuídos acessam o Composio diretamente, inclusive em outros computadores. Execuções em andamento recebem a configuração na próxima execução.

**A ativação exige um clique do proprietário no desktop.** O Multica recusa alterações da biblioteca e das atribuições MCP feitas por identidades de agentes. O painel respeita essa restrição. A chave do sincronizador é protegida com DPAPI para o usuário atual do Windows e não aparece nos argumentos de comandos ou no diagnóstico.

O painel separa atribuição de compatibilidade: **Copilot e Antigravity não carregam MCP gerenciado nesta versão do Multica**; agentes sem runtime também aparecem como pendência. Uma regra de prioridade orienta o uso, mas não garante obediência de todo modelo em toda resposta. Veja [Acesso dos agentes](docs/agentes-composio.md).

O instalador não instala os CLIs do Pool, não importa contas, não cria logins e não habilita tarefas de failover.

## Backup e desinstalação

O instalador verifica o hash do pacote original e preserva um backup antes de aplicar a adaptação. Para remover, execute **Desinstalar.cmd** do ZIP ou:

```powershell
& "$env:LOCALAPPDATA\MulticaExtensoes\Desinstalar.ps1"
```

Se o Multica foi atualizado depois da instalação, a desinstalação recusa sobrescrever a nova versão. Os documentos e configurações em `data` permanecem no PC.

A desinstalação remove a tarefa de sincronização local. As atribuições remotas, a skill e as conexões Composio permanecem: remova-as no Multica e no Composio se também quiser revogar esse acesso.

Salve rascunhos antes de instalar ou remover. Quando a interface está aberta, os scripts verificam o daemon e encerram somente o PID exato da interface. Se a verificação falhar, não encerram processos. Nunca executam `taskkill` por nome nem `multica daemon stop`.

## Compatibilidade e limites

- Compatibilidade explícita em [compatibility.json](compatibility.json). Não é um instalador universal para qualquer versão.
- Builds com validação embutida de ASAR são recusados, sem desativar essa proteção. Veja a [documentação de integridade do Electron](https://www.electronjs.org/docs/latest/tutorial/asar-integrity).
- Uma atualização oficial do Multica pode substituir a integração. Aguarde uma release compatível antes de reaplicar.
- O instalador foi feito para execução manual na sessão do Windows. Agentes podem preparar uma validação isolada com `-PrepareOnly`; não devem instalar usando credenciais de uma tarefa.
- A adaptação não é oficial ou homologada pelo Multica.

## Desenvolvimento e edição por IA

Não há dependências npm. Com Node.js 22+:

```powershell
npm test
npm run package
```

Os testes cobrem o formato ASAR, geração e validação do patch, instalação, reinstalação sem duplicação, reversão por hash, recusa de builds desconhecidos, documentos concorrentes e isolamento das conexões Composio.

O comando de empacotamento, executado no Windows, gera o ZIP, o bootstrap e `SHA256SUMS.txt` em `dist`.

Os fontes instalados ficam em `versions/1.1.1`. Edite a interface em `src/ui`, o backend em `src/main` e o Pool em `pool`. Os documentos ficam em `data/docs`. Alterar o backend exige reiniciar a interface; menu e rotas exigem gerar um novo patch a partir do backup verificado. Leia [Manutenção com IA](docs/manutencao-ia.md).

## Privacidade e distribuição

O repositório e os downloads contêm somente fontes e scripts da extensão. Não incluem ASARs, executáveis do Multica, bancos locais, screenshots de contas, chaves ou arquivos de ambiente. Leia [NOTICE.md](NOTICE.md).
Extensões locais para Multica Desktop no Windows: Docs, edição com IA, Marketplace Composio e Pool de Contas IA.
