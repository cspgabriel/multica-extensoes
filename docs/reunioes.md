# Reuniões

Menu **Reuniões** (novo na 3.2.0). Grava a reunião pelo microfone, transcreve no seu PC e entrega a transcrição a um agente seu para virar notas.

## Requisitos

- Python 3 no Windows com `pip install faster-whisper`.
- O modelo `small` (cerca de 480 MB) é baixado do Hugging Face no primeiro uso. Para usar um modelo já baixado, aponte `MC_MEETINGS_MODEL` para a pasta dele; para outro Python, use `MC_MEETINGS_PYTHON`.
- Se o download terminar com arquivos de 0 byte, rode o download com `HF_HUB_DISABLE_XET=1`; o módulo já define essa variável para o processo de transcrição.

## Como funciona

1. **Gravar** pede o microfone ao Windows e grava em trechos de 30 s. Cada trecho é um arquivo WebM completo.
2. Cada trecho vai para o processo principal do Multica (`src/main/meetings.cjs`), que o transcreve com um processo Python persistente (`src/main/meetings-transcriber.py`, CPU, int8). A transcrição aparece na tela a cada trecho.
3. Tudo fica em `%USERPROFILE%\Multica-Reunioes\<id>\`: `meta.json`, `trechos\*.webm` e, ao clicar em **Salvar .md**, `transcricao.md`.
4. **Gerar notas e itens de ação** cria uma conversa com o agente escolhido e envia a transcrição com um pedido de resumo, decisões, diagrama Mermaid, itens de ação (o quê, responsável, prazo) e dúvidas. O agente pergunta antes de criar tarefas.

Nenhum áudio sai do PC. Só o texto da transcrição vai para o agente, e só quando você clica no botão.

## Limites

- A fronteira de 30 s pode cortar uma palavra entre dois trechos; o pedido ao agente manda corrigir pelo contexto.
- A primeira transcrição depois de abrir o Multica espera o modelo carregar (cerca de 10 s).
- Não há separação de quem falou (diarização).
