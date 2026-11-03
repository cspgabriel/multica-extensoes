# Memória local de conversas

Complemento independente para Multica Desktop 0.7.2 Windows x64. Adiciona o botão **Memória local** à interface. Preserva temas, plugins e demais alterações do build verificado; não instala nem substitui o pacote completo de extensões.

## Instalar e ativar

1. Extraia o ZIP e execute **Instalar-Memoria.cmd** na sessão do Windows.
2. Salve seus rascunhos e confirme a reabertura da interface. O instalador verifica o PID do daemon e nunca o encerra pelo nome.
3. Abra o workspace desejado no Multica, clique em **Memória local** e depois **Ativar e exportar**.
4. Aguarde **Sincronização completa** e use **Abrir pasta**.

O CLI de tarefas não permite ler outros chats. Por isso a exportação acontece no aplicativo, após ativação pela pessoa autenticada, usando a mesma sessão que permite abrir seus chats. O complemento não procura tokens, não lê bancos privados e não amplia permissões. Um agente não pode executar este instalador fora do modo de preparação.

## Arquivos para os agentes

Pasta: `%USERPROFILE%\Multica-Memoria\<ID da sua conta>\<ID do workspace>\`. O caminho absoluto efetivo aparece no painel. O padrão fica diretamente no perfil do Windows, fora de Documentos e de seu possível redirecionamento ao OneDrive.

- `INDEX.md`: índice de conversas e data da sincronização completa.
- `conversas/<UUID>.md`: texto integral de cada conversa, em ordem cronológica, com IDs, autores e datas.
- `manifest.json`: cobertura, hashes, erro da última tentativa e data da última exportação de cada conversa.
- `LEIA-ME-AGENTE.md`: instruções para consulta segura e retomada.

Diga ao seu agente: **Leia INDEX.md e manifest.json na pasta mostrada no painel, pesquise o projeto em conversas e me diga onde parei. Confirme o estado atual das tarefas no Multica.** O Norte pode ter esse caminho registrado nas instruções permanentes. Outros computadores e runtimes remotos não recebem os arquivos automaticamente.

## Cobertura e atualização

Inclui todas as conversas **criadas pela conta autenticada neste workspace** retornadas pela listagem do Multica, ativas e arquivadas. Não exporta conversas privadas criadas por outros membros, ainda que o usuário seja administrador. Tarefas/comentários de issues continuam disponíveis pelo CLI e não são duplicados neste exportador. Não inclui rascunhos não enviados, raciocínio privado ou registros de ferramentas; inclui as mensagens do chat e referências de anexos, sem baixar binários nem gravar URLs temporárias de download.

Ao ativar, exporta imediatamente. Depois, relê todas as páginas a cada cinco minutos, inclusive mensagens antigas editadas. Só regrava um Markdown se o conteúdo mudou. Não depende apenas da data de atividade do chat. O processo continua ao fechar o painel, enquanto o workspace permanecer aberto e a sessão autenticada estiver ativa no Desktop. Ao trocar de workspace/conta, sair ou fechar o aplicativo, essa sincronização para. Voltar ao workspace reativa o ciclo se a opção estiver habilitada. Para atualizar outro workspace, abra-o e ative a opção nele.

Não há serviço nem tarefa agendada em segundo plano. O agente pode ler as cópias já existentes mesmo com o Desktop fechado, desde que tenha acesso à pasta no mesmo PC. A data no índice deve ser conferida antes de usar os dados.

## Falhas e privacidade

Uma conversa só substitui a cópia anterior quando todas as suas páginas foram recebidas e validadas. Falhas preservam a última cópia e não avançam a data de sincronização completa. Um lote pode ter algumas conversas atualizadas antes de falhar; consulte `exportedAt` e `error` no manifesto. Limites: 16 MB por página e 128 MB de texto por conversa; ao excedê-los, a exportação reporta erro, nunca sucesso parcial silencioso.

As mensagens ficam em texto legível no PC, incluindo dados sensíveis que tenham sido escritos no chat. Não publique esta pasta nem a coloque em um repositório. Os arquivos são separados por conta e workspace, mas essa separação não substitui permissões do Windows.

Chats apagados ou ausentes na próxima listagem não são removidos do disco: aparecem como cópia histórica ausente da última listagem. **Pausar atualização** mantém as cópias. Para eliminar os dados, pause a sincronização e apague a pasta específica pelo Explorador. Não edite os Markdown gerados; a próxima atualização pode substituí-los.

## Compatibilidade e remoção

Somente os hashes explicitamente verificados do Multica 0.7.2 são aceitos. Builds desconhecidos, validação de integridade ASAR embutida e alterações concorrentes são recusados; nenhum fuse, assinatura ou executável é alterado. Este complemento não é oficial.

Para remover apenas o complemento, execute na pasta extraída:

```powershell
.\Instalar-Memoria.ps1 -Restore
```

A restauração exige que o aplicativo ainda tenha o hash instalado por este complemento. Isso impede sobrescrever atualizações/personalizações posteriores. As conversas exportadas permanecem. Se você também usa o instalador geral de extensões, remova a memória primeiro, antes de atualizar ou remover o pacote geral.

Para verificar o pacote sem alterar o aplicativo: `Instalar-Memoria.ps1 -PrepareOnly -InstallRoot <pasta isolada>`. Nunca use uma pasta com instalação ativa para validações de desenvolvimento.
