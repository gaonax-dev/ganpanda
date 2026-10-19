// 사진 이름 (2026-10-20 사용자: "이미지 이름이 모두 같아 사진 올리면 프로젝트면+_img_#으로 이름올려줘 #은 번호")
import { describe, expect, it } from 'vitest';
import { nextPhotoName } from '../../src/lib/core/photoName';

describe('nextPhotoName', () => {
  it('프로젝트 이름_img_번호, 첫 사진은 1', () => {
    expect(nextPhotoName('젠', [])).toBe('젠_img_1');
  });
  it('번호는 이미 있는 가장 큰 번호 다음 — 지운 사진 번호를 다시 쓰지 않는다', () => {
    expect(nextPhotoName('젠', ['젠_img_1', '젠_img_3'])).toBe('젠_img_4');
  });
  it('옛 이름(image.jpg 등)은 번호에 치지 않고, 프로젝트 이름을 바꿔도 번호는 이어진다', () => {
    expect(nextPhotoName('젠 카페', ['image.jpg', 'image.jpg', '젠_img_2'])).toBe('젠 카페_img_3');
  });
  it('프로젝트 이름이 비면 "사진", 앞뒤 공백은 뺀다', () => {
    expect(nextPhotoName('  ', [])).toBe('사진_img_1');
    expect(nextPhotoName(' 매장 ', [])).toBe('매장_img_1');
  });
});
