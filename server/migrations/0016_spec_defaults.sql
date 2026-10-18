-- 사양 글 전국 기본값 (2026-10-19 V2, docs/features/spec-vocabulary.md 3·4절): 같은 말의 여러 뜻 중 독립 계정 수가 가장 많은 뜻 (대세). 문턱: 5곳, 바뀌려면 3곳 차·30일
CREATE TABLE IF NOT EXISTS spec_defaults (
  phrase TEXT PRIMARY KEY,
  meaning_key TEXT NOT NULL,
  meaning TEXT NOT NULL,
  count INTEGER NOT NULL,
  since INTEGER NOT NULL
);
