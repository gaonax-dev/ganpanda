// 프로젝트가 쓰는 파일(에셋) 목록 (2026-11-04 사용자: "저장공간이 부족해 사진을 업로드 하지 못했는데 유료로 전환했을때 누락 업로드를 서버로 다시 업로드 필요해")
import { describe, expect, it } from 'vitest';
import { projectAssetIds } from '../../src/lib/core/projectAssets';

describe('projectAssetIds', () => {
  it('사진(조절 전 원본 포함)·디자인 소스 페이지·사인물 그림·대화 첨부의 에셋 id, 중복 없이', () => {
    const ids = projectAssetIds({
      photos: [{ assetId: 'p1' }, { assetId: 'p2', source: { assetId: 'p2orig' } }, { assetId: 'p1' }],
      sources: [{ pages: [{ assetId: 's1' }, { assetId: 's2' }] }],
      objects: [{ layers: [{ image: { assetId: 'img1' } }, { image: { sourceId: 'x', page: 0 } }, { children: [{ image: { assetId: 'img2' } }] }] }],
      messages: [{ attachments: [{ assetId: 'a1' }] }, {}],
    });
    expect(ids.sort()).toEqual(['a1', 'img1', 'img2', 'p1', 'p2', 'p2orig', 's1', 's2']);
  });
  it('비어 있어도 된다', () => {
    expect(projectAssetIds({ photos: [], sources: [], objects: [], messages: [] })).toEqual([]);
  });
});
