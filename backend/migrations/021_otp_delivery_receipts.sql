ALTER TABLE otp_challenges ADD COLUMN provider text;
ALTER TABLE otp_challenges ADD COLUMN provider_message_id text;
ALTER TABLE otp_challenges ADD COLUMN provider_status text;
-- Never persist the provider's complete response: it includes the OTP and phone.
