// 내보내기(SVG)에 묻을 그림의 data URL (2026-10-18 사용자: "svg를 내보내기하고 나면 일러스트에서 [연결 패널에서 일부 파일이 누락되거나 수정되었습니다] 안내가 나온다").
// 일러스트레이터는 <image> 의 그림이 외부 주소(blob:·http)거나 MIME 이 그림이 아니면(octet-stream) 연결 파일로 보고 "누락"이라 한다 → 항상 그림 MIME 의 data URL 로, 못 만들면 묻지 않는다.

const ascii = (u8: Uint8Array, from: number, to: number) => String.fromCharCode(...u8.subarray(from, to));

/** 바이트 머리(매직 넘버)로 그림 MIME 을 알아낸다. 그림이 아니면 undefined */
export function sniffImageMime(u8: Uint8Array): string | undefined {
  if (u8.length >= 8 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) return 'image/png';
  if (u8.length >= 3 && u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) return 'image/jpeg';
  if (u8.length >= 12 && ascii(u8, 0, 4) === 'RIFF' && ascii(u8, 8, 12) === 'WEBP') return 'image/webp';
  if (u8.length >= 6 && (ascii(u8, 0, 6) === 'GIF87a' || ascii(u8, 0, 6) === 'GIF89a')) return 'image/gif';
  if (u8.length >= 2 && u8[0] === 0x42 && u8[1] === 0x4d) return 'image/bmp';
  const head = ascii(u8, 0, Math.min(u8.length, 256)).trimStart();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';
  return undefined;
}

export function base64Of(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

/** blob → 그림 data URL. MIME 은 바이트로 정하고(blob.type 이 비거나 octet-stream 이어도), 그림이 아니면 undefined */
export async function imageDataUrl(blob: Blob): Promise<string | undefined> {
  const u8 = new Uint8Array(await blob.arrayBuffer());
  const mime = sniffImageMime(u8) ?? (blob.type.startsWith('image/') ? blob.type : undefined);
  if (!mime) return undefined;
  return `data:${mime};base64,${base64Of(u8)}`;
}
