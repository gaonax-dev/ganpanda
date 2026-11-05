// 압축 없는 zip (2026-11-05 사용자: "5분정도 걸린다. 차라리 이미지들을 따로 폴더에 넣고 연결하는게 좋을 거 같은데") — 일러스트 대지 묶음(폴더째)
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { crc32, zipStore } from '../../src/lib/core/zip';

describe('zipStore', () => {
  it('crc32 (표준값)', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('풀린다 — 한글 경로·폴더·바이너리 그대로 (파이썬 zipfile 과 맥 ditto = Finder 방식)', () => {
    const bin = Uint8Array.from({ length: 1000 }, (_, i) => (i * 7) % 256);
    const z = zipStore([
      { name: '테스트 매장 일러스트 대지/간판다 대지.jsx', data: new TextEncoder().encode('alert("안녕");') },
      { name: '테스트 매장 일러스트 대지/images/a1-face.jpg', data: bin },
    ]);
    const dir = mkdtempSync(join(tmpdir(), 'zip-'));
    writeFileSync(join(dir, 'a.zip'), z);
    const list = execFileSync('python3', ['-c', 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); z.testzip(); print("\\n".join(z.namelist()))', join(dir, 'a.zip')]).toString('utf8').trim().split('\n');
    expect(list).toEqual(['테스트 매장 일러스트 대지/간판다 대지.jsx', '테스트 매장 일러스트 대지/images/a1-face.jpg']);
    execFileSync('ditto', ['-x', '-k', join(dir, 'a.zip'), join(dir, 'out')]);
    expect(readFileSync(join(dir, 'out', '테스트 매장 일러스트 대지', 'images', 'a1-face.jpg')).equals(Buffer.from(bin))).toBe(true);
    expect(readFileSync(join(dir, 'out', '테스트 매장 일러스트 대지', '간판다 대지.jsx'), 'utf8')).toBe('alert("안녕");');
  });
});
