-- Additive only. Existing records remain NULL: do not infer a method from an old hash.
ALTER TABLE ycp_sessions ADD COLUMN online_payment_method text
 CHECK (online_payment_method IN ('card','sbp','split','split_sbp'));
