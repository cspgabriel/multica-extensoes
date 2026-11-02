# Pool de Contas IA

O Pool consulta as contas, cotas e configurações locais dos provedores suportados. Nada é importado do computador de quem publicou a extensão.

## Provedores opcionais

- Claude: cswap e Claude Code.
- Codex: codex-auth e Codex CLI.
- Antigravity: Antigravity CLI e gerenciador local de contas.
- Copilot: GitHub Copilot CLI.
- Hermes: Hermes CLI.
- OpenCode: OpenCode CLI e seu banco local.

É normal um provedor sem CLI ou sem login apresentar erro ou lista vazia. O instalador não instala CLIs, não cria logins e não altera o rodízio de contas.

## Ações

O painel oferece controles de conta ativa, adição e renovação de login, terminais, failover e logs conforme as ferramentas de origem. Trocar uma conta altera o estado local do respectivo CLI. Use as confirmações exibidas para ações destrutivas ou resgate de cotas.

Os botões **Docs** e **Editar com IA** abrem esta documentação ou uma solicitação ao agente escolhido.

## Fontes

O código do Pool está na pasta pool da versão instalada. A interface fica em pool/renderer e os adaptadores dos CLIs em pool/src. O namespace IPC é pool-contas-ia:. A página principal do Multica é verificada antes de encaminhar operações locais.
