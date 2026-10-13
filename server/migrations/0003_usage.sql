-- 계정별 에셋 사용량 (1-2c). 같은 에셋은 계정당 한 번만 센다
CREATE TABLE account_assets (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  asset_id TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, asset_id)
);
