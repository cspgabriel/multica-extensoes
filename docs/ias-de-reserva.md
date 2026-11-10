# IAs de reserva por agente

Novo na 3.3.0. No card **Agente** da sidebar do chat, cadastre até três IAs de reserva (2ª, 3ª e 4ª). Cada uma é um runtime com modelo, por exemplo Codex → Claude Code → Amazon Bedrock. Também vale trocar só o modelo dentro da mesma IA.

## Como funciona

1. Um supervisor roda dentro do Multica Desktop e confere as tarefas dos agentes com reserva a cada 20 segundos.
2. Quando uma tarefa falha (qualquer motivo, exceto cancelamento), ele troca o agente para a próxima IA da lista e refaz o trabalho: numa issue, reexecuta a tarefa; numa conversa, reenvia a mesma mensagem.
3. Quando a reserva termina, o agente volta para a IA principal. Se a reserva também falhar, ele tenta a seguinte. Se todas falharem, o agente volta para a principal.
4. Se você mudar a IA do agente à mão enquanto uma reserva está ativa, o supervisor não desfaz a sua mudança.
5. As últimas trocas aparecem no próprio card ("2ª IA assumiu após falha…").

## Limites

- Só funciona com o Multica Desktop aberto, porque o supervisor roda nele.
- A lista de reservas fica salva no PC em que você a configurou (armazenamento local do Multica). Assim dois PCs abertos não refazem a mesma tarefa duas vezes. Em outro PC, configure de novo.
- No chat, a mensagem reenviada aparece duas vezes no histórico.
- Enquanto a reserva está ativa, outras tarefas do mesmo agente também usam a IA de reserva.
- Se uma reserva não terminar em 1 hora, o agente volta para a principal.

## Troca nativa de modelo

A troca de modelo feita pelo próprio runtime (Claude Code `--fallback-model` e a extensão do Bedrock) continua disponível em **Avançado** no mesmo card. Veja [Modelos de reserva](modelos-de-reserva.md).

## Validação

Testado com falha real: agente no Codex com modelo inexistente; a tarefa falhou, o Claude Code assumiu, respondeu e o agente voltou para o Codex sozinho.
