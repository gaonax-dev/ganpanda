-- 사양 글 개인 사전 (2026-10-18 V1, docs/features/spec-vocabulary.md): 계정마다 "말 → 뜻(SpecItem[])". 같은 말에 여러 계정이 정한 뜻을 세어 추천(대세)에 쓴다
CREATE TABLE IF NOT EXISTS spec_rules (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  phrase TEXT NOT NULL,
  meaning TEXT NOT NULL,
  meaning_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (account_id, phrase)
);
CREATE INDEX IF NOT EXISTS spec_rules_phrase ON spec_rules (phrase);
