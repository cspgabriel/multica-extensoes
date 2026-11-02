# Estúdio de IA

A versão 2.0.0 adiciona dez painéis no item **Estúdio de IA**, abaixo de Ambientes de execução. Cadastre a pasta raiz do projeto; os arquivos continuam no local original. O cadastro é local a esta instalação do Windows. Não distribua a pasta de dados entre pessoas.

| Recurso | Ação disponível |
| --- | --- |
| Central de Ferramentas | Listar MCPs atribuídos, inicializar o endpoint Composio e consultar chamadas de ferramentas de uma execução |
| Projetos e Preview | Cadastrar pastas, servir build estático em 127.0.0.1, executar scripts existentes de package.json e consultar/parar os processos iniciados nesta sessão |
| Alterações e Revisão | Listar alterações Git, comparar HEAD com conteúdo atual e criar uma tarefa de revisão |
| Pontos de restauração | Preservar arquivos e hashes; restaurar somente o arquivo escolhido, com verificação de edição concorrente e cópia anterior |
| Contexto compartilhado | Editar decisões em Markdown e gerar um documento ou tarefa de continuidade para outra IA |
| Fluxos prontos | Desenvolver, testar e revisar; uma tarefa por vez, avançando somente depois do status Concluído |
| Teste visual | Abrir Chromium, registrar HTTP/console, verificar elementos de formulário e overflow, salvar screenshots desktop/mobile e relatório JSON |
| Uso e desempenho | Consultar tokens de runtime ou consumo e execuções de tarefa pelo CLI oficial |
| Comparar agentes | Criar dois ou três worktrees/branches a partir do mesmo commit e iniciar tarefas com o mesmo objetivo |
| Extensões | Consultar versão carregada e em disco, dependências, checksum instalado, atividade e releases |

**Primeiro uso:** cadastre um projeto. Para testes visuais clique em Preparar teste visual: instala Playwright 1.58.2 e Chromium em `data/studio`, usando cache e temporários nessa mesma pasta. Requer Node/npm e internet. Esse download é separado da instalação básica sem dependências. No PC onde este recurso foi desenvolvido o navegador foi instalado e testado.

Scripts npm executam código do projeto: revise-os antes de confirmar. A saída é limitada e passa por ocultação de credenciais comuns; não registre segredos em seus scripts. Os registros são locais. Prévia e scripts são controlados pelo processo do Desktop; ao sair, ele tenta parar os scripts que iniciou, protegendo o PID e a árvore do daemon. Não há retomada automática de processos após fechar o app.

O fluxo verifica status a cada 30 segundos enquanto o Desktop estiver aberto e retoma a verificação ao reabrir. Status Concluído é o critério de avanço; não representa aprovação humana nem garante a qualidade do código. Falha de resposta ao criar uma tarefa suspende o fluxo e exige conferir as tarefas existentes; a criação não é repetida automaticamente. Suspender próximas etapas não cancela uma tarefa já iniciada.

Comparações exigem Git limpo e um commit inicial. O diretório original é preservado. As branches e worktrees permanecem disponíveis para inspeção; não são removidos automaticamente. O isolamento do Git não é uma sandbox de execução: os agentes continuam tendo as permissões normais do runtime.

Os seletores de agentes aceitam somente agentes do usuário autenticado vinculados a runtimes deste PC. Ferramentas MCP dependem do provider e da ativação no Marketplace. Conectar não prova execução; use os registros de uma tarefa para verificar chamadas. A marca exibida no consentimento OAuth depende da configuração Composio e do aplicativo do provedor; instalar o Estúdio não altera essa marca.

Snapshots limitam-se a 100 MB, 5.000 arquivos e 10 MB por arquivo. Excluem `.git`, dependências e nomes comuns de credenciais, mas não substituem revisão do conteúdo, Git ou backup externo. Novos arquivos não são apagados durante restaurações. Comparações textuais limitam-se a 512 KB. Handoffs transferem instruções e contexto, sem exportar a sessão interna de outra IA.

Uso mostra somente dados informados pelo Multica; registros de tokens, custo e duração podem estar incompletos. O teste visual verifica carregamento e layout básico, sem executar todos os fluxos funcionais. Os screenshots e relatórios ficam em `data/studio/qa` e podem ser abertos pelo painel.

Validação: `npm test`; teste Electron explícito `node tests/studio-ui.cjs` com `MEXT_PLAYWRIGHT`, `MEXT_ELECTRON` e, opcionalmente, `MEXT_QA_PLAYWRIGHT` / `MEXT_BROWSER_CACHE` apontando para dependências instaladas. O teste usa projeto temporário e respostas simuladas do CLI, sem iniciar tarefas de agentes reais.
