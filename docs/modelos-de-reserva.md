# Modelos de reserva por agente

> Desde a 3.3.0 a reserva principal é por IA (runtime + modelo): veja [IAs de reserva](ias-de-reserva.md). Esta página descreve a troca nativa de modelo dentro da mesma IA, que fica em **Avançado** no card Agente.

O Multica guarda um modelo por agente. A partir da versão 3.1.0, o card **Agente** da sidebar do chat permite cadastrar até três modelos de reserva (2º, 3º e 4º), tentados em ordem quando o principal falha. Cada nova mensagem volta a tentar o principal primeiro.

## Claude Code

Usa o fallback nativo do Claude Code. A sidebar grava `--fallback-model modelo2,modelo3` nos argumentos do agente (`custom_args`). O Claude Code troca de modelo quando o principal está sobrecarregado ou indisponível.

## Amazon Bedrock (runtime pi)

A sidebar grava a variável `MULTICA_MODEL_FALLBACKS` nas variáveis do agente (`custom_env`), por exemplo `amazon-bedrock/amazon.nova-lite-v1:0,zai.glm-5`. O runtime precisa carregar a extensão `src/runtimes/amazon-bedrock/model-fallback.ts`:

```powershell
pi --extension <pasta>\model-fallback.ts ...
```

A extensão envolve a chamada ao Bedrock (`BedrockRuntimeClient.send`). Quando a chamada ao principal falha antes de começar a responder (modelo inválido, sem acesso, cota, indisponível, erro 5xx), ela repete a mesma chamada com o próximo modelo da lista. Erros no meio de uma resposta já iniciada e cancelamentos não disparam a troca. A extensão espera o pi instalado pelo Bun (`%USERPROFILE%\.bun\install\global\node_modules`).

A sidebar só oferece o campo em runtimes do tipo pi cujo nome contém "Bedrock".

## Outros runtimes

Codex, OpenCode, Copilot, Hermes e os demais não têm troca automática de modelo. O card mostra "não suportado".

## Validação

Testado com chamadas reais: Claude Code com principal inexistente respondeu pelo primeiro modelo de reserva; Bedrock com principal inválido respondeu pelo `amazon.nova-lite-v1:0`; sem lista, o erro aparece normalmente; com o principal funcionando, nada muda.
