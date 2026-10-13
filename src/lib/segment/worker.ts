// SAM(SlimSAM) 분리 워커: 사진 임베딩(한 번) + 좌표별 마스크. 모델·런타임 파일은 우리 서버에서 받는다.
import { AutoProcessor, RawImage, SamModel, Tensor, env } from '@huggingface/transformers';
import { pickMask } from '../core/mask';

/** 타입 선언에 없는 SAM 전용 후처리 (런타임에는 존재) */
interface SamProcessorLike {
  (image: RawImage): Promise<{ pixel_values: Tensor; original_sizes: unknown; reshaped_input_sizes: unknown }>;
  post_process_masks(masks: unknown, originalSizes: unknown, reshapedSizes: unknown): Promise<{ dims: number[]; data: ArrayLike<number> }[]>;
}
const post = (msg: unknown, transfer?: Transferable[]) => (self.postMessage as (m: unknown, t?: Transferable[]) => void)(msg, transfer);

interface Embedded {
  inputs: { pixel_values: Tensor; original_sizes: unknown; reshaped_input_sizes: unknown };
  embeddings: Record<string, unknown>;
}

const MODEL = 'slimsam';
let model: SamModel | null = null;
let processor: SamProcessorLike | null = null;
const embedded = new Map<string, Embedded>();

async function load(serverUrl: string) {
  if (model && processor) return;
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.remoteHost = `${serverUrl}/api/models/`;
  env.remotePathTemplate = '{model}/';
  // onnxruntime wasm 도 우리 서버(R2)에서 — 정적 에셋 한도(25MiB)를 넘는 파일이 있어 모델과 같은 경로로 제공
  if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = `${serverUrl}/api/models/ort/`;
  model = (await SamModel.from_pretrained(MODEL, { dtype: 'q8' })) as SamModel;
  processor = (await AutoProcessor.from_pretrained(MODEL)) as unknown as SamProcessorLike;
}

async function embed(photoId: string, bitmap: ImageBitmap) {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  const image = new RawImage(data, width, height, 4);
  const inputs = await processor!(image);
  const embeddings = await model!.get_image_embeddings(inputs);
  embedded.set(photoId, { inputs, embeddings });
}

async function segment(photoId: string, x: number, y: number) {
  const e = embedded.get(photoId);
  if (!e) throw new Error('not embedded');
  // 모델은 축소된 입력(긴 변 1024px) 좌표를 받는다 → 원본 px 를 비율로 변환
  const [[oh, ow]] = e.inputs.original_sizes as [number, number][];
  const [[rh, rw]] = e.inputs.reshaped_input_sizes as [number, number][];
  const input_points = new Tensor('float32', [x * (rw / ow), y * (rh / oh)], [1, 1, 1, 2]);
  const input_labels = new Tensor('int64', [1n], [1, 1, 1]);
  const outputs = await model!({ ...e.embeddings, input_points, input_labels });
  const masks = await processor!.post_process_masks(outputs.pred_masks, e.inputs.original_sizes, e.inputs.reshaped_input_sizes);
  const scores = (outputs.iou_scores as { data: Float32Array }).data;
  // masks[0]: Tensor [1, 3, H, W] (bool) — 후보 3개를 data 에서 직접 잘라 쓴다
  const t = masks[0];
  const [, n, height, width] = t.dims;
  const size = height * width;
  const all = t.data;
  const cands = Array.from({ length: n }, (_, i) => {
    let on = 0;
    for (let k = i * size; k < (i + 1) * size; k++) if (all[k]) on++;
    return { cover: on / size, score: scores[i] };
  });
  // 사진 대부분을 덮는 후보(배경·벽 전체)는 간판이 아니므로 제외
  const idx = pickMask(cands);
  const data = new Uint8Array(size);
  for (let k = 0; k < size; k++) data[k] = all[idx * size + k] ? 1 : 0;
  return { width, height, data, score: scores[idx] };
}

self.onmessage = async (ev: MessageEvent) => {
  const msg = ev.data;
  try {
    if (msg.type === 'load') { await load(msg.serverUrl); post({ type: 'loaded' }); }
    else if (msg.type === 'embed') { await embed(msg.photoId, msg.bitmap); post({ type: 'embedded', photoId: msg.photoId }); }
    else if (msg.type === 'segment') {
      const r = await segment(msg.photoId, msg.x, msg.y);
      post({ type: 'mask', reqId: msg.reqId, photoId: msg.photoId, ...r }, [r.data.buffer]);
    } else if (msg.type === 'forget') embedded.delete(msg.photoId);
  } catch (e) {
    post({ type: 'error', reqId: msg.reqId, photoId: msg.photoId, message: e instanceof Error ? e.message : String(e) });
  }
};
