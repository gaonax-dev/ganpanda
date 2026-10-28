// 저장된 3D 그림 (2026-10-29 사용자: "사인물을 변경한 경우가 아니라면 기존의 저장된 이미지를 사용한다. 현젠는 계속 업데이트를 하고 있다")
// 사진마다 3D 합성 그림을 내용 키(app.stageKey — 사인물·카메라가 바뀌면 바뀐다)로 기기(IndexedDB)에 둔다. 키가 같으면 다시 만들지 않는다
import { getDerived, putDerived } from '../derivedImages';

const mem = new Map<string, string>();
const keyOf = (photoId: string, stageKey: string) => `s3|${photoId}|${stageKey}`;

/** 저장된 그림의 주소 (없으면 null) */
export async function loadSnapshot(photoId: string, stageKey: string): Promise<string | null> {
  const k = keyOf(photoId, stageKey);
  const have = mem.get(k);
  if (have) return have;
  const d = await getDerived(k);
  if (!d || !('blob' in d)) return null;
  const url = URL.createObjectURL(d.blob);
  mem.set(k, url);
  return url;
}
/** 그림을 저장하고 주소를 돌려준다 */
export async function saveSnapshot(photoId: string, stageKey: string, blob: Blob): Promise<string> {
  const k = keyOf(photoId, stageKey);
  await putDerived(k, { blob });
  const url = URL.createObjectURL(blob);
  mem.set(k, url);
  return url;
}
