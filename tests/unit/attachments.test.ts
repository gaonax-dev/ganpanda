import { describe, expect, it } from 'vitest';
import { describeAttachments, isImage } from '../../src/lib/core/attachments';

const img = { assetId: 'x', name: 'a.png', type: 'image/png', size: 10 };
const pdf = { assetId: 'y', name: 'b.pdf', type: 'application/pdf', size: 10 };

describe('첨부 요약', () => {
  it('사진·파일 개수를 글로', () => {
    expect(describeAttachments([img, img])).toBe('사진 2장');
    expect(describeAttachments([pdf])).toBe('파일 1개');
    expect(describeAttachments([img, pdf])).toBe('사진 1장 · 파일 1개');
    expect(describeAttachments([])).toBe('');
  });
  it('이미지 판별', () => {
    expect(isImage(img)).toBe(true);
    expect(isImage(pdf)).toBe(false);
  });
});
