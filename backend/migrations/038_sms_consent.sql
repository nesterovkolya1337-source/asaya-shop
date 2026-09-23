CREATE TABLE sms_consents (
 id uuid PRIMARY KEY,
 phone text NOT NULL CHECK(phone ~ '^\+7[0-9]{10}$'),
 customer_id uuid REFERENCES users(id),
 consent_type text NOT NULL DEFAULT 'sms_auth_service' CHECK(consent_type='sms_auth_service'),
 consent boolean NOT NULL DEFAULT true CHECK(consent),
 text_version text NOT NULL,
 document_url text NOT NULL,
 text_snapshot jsonb NOT NULL,
 source text NOT NULL DEFAULT 'customer_sms_login' CHECK(source='customer_sms_login'),
 action text NOT NULL DEFAULT 'checkbox_and_request_code',
 granted_at timestamptz NOT NULL,
 verified_at timestamptz,
 revoked_at timestamptz,
 revoked_by uuid REFERENCES users(id),
 revoke_reason text
);
CREATE UNIQUE INDEX sms_consents_active ON sms_consents(phone,text_version) WHERE revoked_at IS NULL;
CREATE INDEX sms_consents_phone_history ON sms_consents(phone,granted_at DESC);
