import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// Modelos de reserva por agente (patch "chat-workbench" do Multica).
// A lista vem de MULTICA_MODEL_FALLBACKS, gravada no custom_env do agente pela
// sidebar do chat: "amazon-bedrock/modelo" ou só "modelo", separados por
// vírgula, na ordem secundário, terciário...
//
// Como funciona: envolve BedrockRuntimeClient.send. Se a chamada ao modelo
// principal falhar antes de começar a responder (modelo inválido, sem acesso,
// cota/throttling, indisponível, erro 5xx), a mesma chamada é repetida com o
// próximo modelo da lista. O pi recebe a resposta normalmente. Cada novo
// pedido volta a tentar o principal primeiro. Erros no meio da resposta e
// cancelamentos não disparam a troca. Logs vão para stderr (o stdout do pi é
// o stream JSON lido pelo daemon).
// O pi roda em Bun e o SDK tem builds ESM e CJS; os dois são corrigidos para
// não depender de qual o pi carregou.
const SDK_DIR = join(homedir(), ".bun/install/global/node_modules/@aws-sdk/client-bedrock-runtime");
const NO_FALLBACK = new Set(["AbortError", "UnrecognizedClientException"]);
const PATCHED = Symbol.for("multica.modelFallback");

function fallbackIds(): string[] {
  return (process.env.MULTICA_MODEL_FALLBACKS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.startsWith("amazon-bedrock/") ? s.slice("amazon-bedrock/".length) : s))
    .filter((s) => !s.includes("/"));
}

function shouldFallback(error: any): boolean {
  if (!error || NO_FALLBACK.has(error.name)) return false;
  const status = error.$metadata?.httpStatusCode;
  return status !== 401;
}

function patch(sdk: any, chain: string[]) {
  const Client = sdk?.BedrockRuntimeClient;
  const Command = sdk?.ConverseStreamCommand;
  if (!Client || !Command || Client.prototype[PATCHED]) return;
  const original = Client.prototype.send;
  Client.prototype[PATCHED] = true;
  Client.prototype.send = async function (command: any, ...rest: any[]) {
    if (command?.constructor?.name !== "ConverseStreamCommand" || !command.input?.modelId) {
      return original.call(this, command, ...rest);
    }
    const primary = command.input.modelId;
    const candidates = [primary, ...chain.filter((id) => id !== primary)];
    let lastError: unknown;
    for (let i = 0; i < candidates.length; i++) {
      const attempt = i === 0 ? command : new Command({ ...command.input, modelId: candidates[i], additionalModelRequestFields: undefined });
      try {
        const response = await original.call(this, attempt, ...rest);
        if (i > 0) console.error(`[model-fallback] respondido por ${candidates[i]} (principal ${primary} falhou)`);
        return response;
      } catch (error: any) {
        if (!shouldFallback(error) || i === candidates.length - 1) throw error;
        lastError = error;
        console.error(`[model-fallback] ${candidates[i]} falhou (${error?.name ?? "erro"}: ${error?.message ?? ""}); tentando ${candidates[i + 1]}`);
      }
    }
    throw lastError;
  };
}

export default async function (_pi: ExtensionAPI) {
  const chain = fallbackIds();
  if (chain.length === 0) return;
  const pkg = JSON.parse(readFileSync(join(SDK_DIR, "package.json"), "utf8"));
  for (const entry of new Set([pkg.module, pkg.main].filter(Boolean))) {
    try {
      patch(await import(pathToFileURL(join(SDK_DIR, entry)).href), chain);
    } catch (error: any) {
      console.error(`[model-fallback] não consegui carregar ${entry}: ${error?.message ?? error}`);
    }
  }
}
