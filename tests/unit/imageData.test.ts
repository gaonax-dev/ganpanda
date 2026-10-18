import { describe, expect, it } from 'vitest';
import { imageDataUrl, sniffImageMime } from '../../src/lib/core/imageData';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);

describe('내보내기 그림 data URL (2026-10-18 일러스트 "연결 패널에서 일부 파일이 누락")', () => {
  it('바이트 머리로 그림 종류를 알아낸다', () => {
    expect(sniffImageMime(PNG)).toBe('image/png');
    expect(sniffImageMime(JPG)).toBe('image/jpeg');
    expect(sniffImageMime(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(sniffImageMime(new TextEncoder().encode('GIF89a'))).toBe('image/gif');
    expect(sniffImageMime(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe('image/svg+xml');
    expect(sniffImageMime(new TextEncoder().encode('%PDF-1.4'))).toBeUndefined();
  });
  it('blob 의 type 이 비어 있거나 octet-stream 이면 바이트로 정한 그림 MIME 으로 data URL 을 만든다', async () => {
    expect(await imageDataUrl(new Blob([PNG]))).toBe('data:image/png;base64,' + Buffer.from(PNG).toString('base64'));
    expect(await imageDataUrl(new Blob([JPG], { type: 'application/octet-stream' }))).toMatch(/^data:image\/jpeg;base64,/);
    expect(await imageDataUrl(new Blob([JPG], { type: 'image/jpeg' }))).toMatch(/^data:image\/jpeg;base64,/);
  });
  it('그림이 아니면 undefined (외부 주소를 남기지 않는다)', async () => {
    expect(await imageDataUrl(new Blob([new TextEncoder().encode('%PDF-1.4 ...')], { type: 'application/pdf' }))).toBeUndefined();
  });
});
