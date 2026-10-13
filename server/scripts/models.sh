#!/usr/bin/env bash
# SlimSAM 모델 파일을 R2 (models/ 접두사) 에 올린다. 사용: scripts/models.sh --local | --remote
# 파일은 Hugging Face Xenova/slimsam-77-uniform 에서 내려받는다 (양자화 버전, 약 14MB).
set -euo pipefail
MODE="${1:---local}"
case "$MODE" in --local) FLAG="--local" ;; --remote) FLAG="--remote" ;; *) echo "usage: $0 --local|--remote"; exit 1 ;; esac
DIR="$(mktemp -d)"
B="https://huggingface.co/Xenova/slimsam-77-uniform/resolve/main"
FILES="config.json preprocessor_config.json onnx/vision_encoder_quantized.onnx onnx/prompt_encoder_mask_decoder_quantized.onnx"
mkdir -p "$DIR/onnx"
for f in $FILES; do
  echo "다운로드 $f"; curl -sL -o "$DIR/$f" "$B/$f"
done
for f in $FILES; do
  case "$f" in *.json) CT="application/json" ;; *) CT="application/octet-stream" ;; esac
  echo "업로드 models/slimsam/$f ($MODE)"
  npx wrangler r2 object put "ganpanda-assets/models/slimsam/$f" --file "$DIR/$f" --content-type "$CT" $FLAG >/dev/null
done
rm -rf "$DIR"
echo "완료"

# onnxruntime-web 런타임(wasm·mjs)도 같은 곳에 (정적 에셋 25MiB 한도 때문에 앱에 넣지 않는다)
ORT="$(dirname "$0")/../../node_modules/onnxruntime-web/dist"
for f in $(ls "$ORT" | grep -E "^ort-wasm-simd-threaded.*\.(wasm|mjs)$"); do
  case "$f" in *.mjs) CT="text/javascript" ;; *) CT="application/wasm" ;; esac
  echo "업로드 models/ort/$f ($MODE)"
  npx wrangler r2 object put "ganpanda-assets/models/ort/$f" --file "$ORT/$f" --content-type "$CT" $FLAG >/dev/null
done
echo "런타임 완료"
