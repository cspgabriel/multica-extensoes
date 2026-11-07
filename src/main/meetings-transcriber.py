# Transcritor das Reuniões do Multica (src/main/meetings.cjs).
# Processo persistente: carrega o faster-whisper uma vez e lê pedidos JSON por
# linha no stdin ({"id", "path", "language"}), devolvendo {"id", "text"} ou
# {"id", "error"} no stdout. Roda só neste PC; nenhum áudio sai da máquina.
import json
import os
import sys

MODEL = os.environ.get("MC_MEETINGS_MODEL", "small")


def main():
    from faster_whisper import WhisperModel

    model = WhisperModel(MODEL, device="cpu", compute_type="int8")
    print(json.dumps({"ready": True, "model": MODEL}), flush=True)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        request = json.loads(line)
        try:
            segments, _info = model.transcribe(
                request["path"],
                language=request.get("language") or None,
                vad_filter=True,
                beam_size=1,
            )
            text = " ".join(segment.text.strip() for segment in segments).strip()
            print(json.dumps({"id": request["id"], "text": text}, ensure_ascii=False), flush=True)
        except Exception as error:  # noqa: BLE001 - reported back to the app
            print(json.dumps({"id": request.get("id"), "error": str(error)}), flush=True)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
