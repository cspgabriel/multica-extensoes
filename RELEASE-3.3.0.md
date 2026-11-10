Pacote público para Multica Desktop 0.7.2 no Windows x64. Atualiza a 3.2.0.

Novo:
- IAs de reserva por agente: no card Agente da sidebar do chat, até 3 IAs de reserva (runtime + modelo, ex.: Codex → Claude Code → Amazon Bedrock). Quando uma tarefa falha, o agente passa para a próxima IA, refaz a tarefa (issue) ou reenvia a mensagem (chat) e volta para a principal ao terminar. Funciona com o Multica Desktop aberto; a lista fica no PC em que foi configurada. Veja docs/ias-de-reserva.md.
- Status na lista de conversas: selo no avatar e etiqueta para respondendo, na fila, falhou e resposta nova; barra colorida na linha; filtro "Rodando"; novo visual dos filtros e das linhas.
- A troca nativa de modelo dentro da mesma IA (Claude Code e Bedrock) continua em "Avançado".

Baixe o ZIP, confira SHA256SUMS.txt, extraia e execute Instalar.cmd. Instalações anteriores são atualizadas na mesma pasta de extensões com o backup registrado. Builds desconhecidos são recusados.

Validação: deltas gerados sobre o ASAR original e conferidos byte a byte contra a instalação de referência; troca de IA testada com falha real (Codex com modelo inexistente → Claude Code respondeu → agente voltou ao Codex).
