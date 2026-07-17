BEGIN;

UPDATE v1_tournaments
SET
  bank_name = 'ALPHA 테스트은행',
  bank_account = '000-0000-0000',
  bank_holder = 'ALPHA TEST · 실제 송금 금지'
WHERE entry_fee > 0
  AND bank_account IS NOT NULL;

COMMIT;
