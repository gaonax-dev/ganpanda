import { readFileSync } from 'node:fs';
import { fontFromBuffer } from '../../src/lib/core/textShapes';
import type { SignSpec } from '../../src/lib/sim/types';

const buf = readFileSync(new URL('../../node_modules/pretendard/dist/public/static/Pretendard-Bold.otf', import.meta.url));
export const font = fontFromBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

export const channel = (over: Partial<SignSpec> = {}): SignSpec => ({
  id: 't', kind: 'channel', text: '간판다', heightMm: 600, widthMm: 0, depthMm: 80, letterSpacing: 0,
  lighting: 'front', faceColor: '#ff0000', sideColor: '#cccccc', textColor: '#ffffff', x: 0, y: 0, ...over,
});
