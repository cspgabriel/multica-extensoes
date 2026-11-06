Pacote público para Multica Desktop 0.7.2 no Windows x64. Atualiza a 3.0.0.

Novo: modelos de reserva por agente. No card Agente da sidebar do chat, cadastre até três modelos (2º, 3º e 4º) tentados em ordem quando o principal falha. Claude Code usa o fallback nativo (--fallback-model); runtimes Amazon Bedrock via pi usam a extensão opcional src/runtimes/amazon-bedrock/model-fallback.ts. Outros runtimes não suportam. Veja docs/modelos-de-reserva.md.

Também incluído desde a 3.0.0 na bancada: exibição do painel (ocultar cards, densidade, altura máxima) e plugins em blocos.

Baixe o ZIP, confira SHA256SUMS.txt, extraia e execute Instalar.cmd. Instalações anteriores são atualizadas na mesma pasta de extensões com o backup registrado. Builds desconhecidos são recusados.

Validação: deltas gerados sobre o ASAR original e conferidos byte a byte contra a instalação de referência; fallback testado com chamadas reais no Claude Code e no Bedrock.
