Pacote público para Multica Desktop 0.7.2 no Windows x64. Atualiza a 3.1.0.

Novo:
- Painel de agentes: menu próprio com KPIs dos últimos 30 dias, mapa de calor por agente, tarefas ao vivo, agentes que pedem atenção e ranking de saúde, com os dados do próprio Multica.
- Reuniões: grava o microfone em trechos de 30 s, transcreve no seu PC com faster-whisper (o áudio não sai da máquina) e envia a transcrição a um agente seu para gerar resumo, decisões, diagrama Mermaid e itens de ação. Requer Python com faster-whisper. Veja docs/reunioes.md.
- Itens próprios do menu lateral mostram o rótulo certo (antes podiam aparecer como "nav.undefined").

Baixe o ZIP, confira SHA256SUMS.txt, extraia e execute Instalar.cmd. Instalações anteriores são atualizadas na mesma pasta de extensões com o backup registrado. Builds desconhecidos são recusados.

Validação: deltas gerados sobre o ASAR original e conferidos byte a byte contra a instalação de referência; Reuniões testadas de ponta a ponta (gravação por MediaRecorder, transcrição local e exibição na tela).
