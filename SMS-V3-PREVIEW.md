# SMS account foundation — v3

The accepted login method is phone + SMS, not a local email or localStorage identity. The public AccountView now uses the server account view. There is no automatic fallback to a fake login.

Implemented locally: +7 normalization, configurable expiry/cooldown/attempt/send limits, single-use challenges, hashed codes, separate customer/staff sessions, origin/CSRF protection, and an explicit SMS-only API mode. That mode opens only request/verify/logout; local checkout, payment and order mutations remain gated in production YCP mode. A prior email challenge or email-only session does not qualify as SMS login.

`buildApp({customerSmsEnabled:true,otpSender:...})` requires a real configured sender or an injected in-memory sender in isolated tests. The production `server.ts` still uses DisabledOtpSender and does not enable SMS. The provider has not been selected or connected; there is no fictional SMS API or publicly available test code. The UI reads `/auth/methods` and disables sending when SMS is not advertised.

Server limits: OTP_TTL_SECONDS, OTP_MAX_ATTEMPTS, OTP_RESEND_SECONDS, OTP_SEND_PER_IP_PER_HOUR, OTP_SEND_PER_PHONE_PER_HOUR, OTP_VERIFY_PER_IP_PER_FIVE_MINUTES. Values are validated before startup. Changing limits does not enable a provider, YCP purchase button, or shipping.

Remaining before full v3 customer acceptance: a documented provider adapter and protected server credentials, consent/version recording where required, editable optional profile, verified-phone attachment of previous guest orders, repeat order at current prices/availability, return/help context and full order timeline. Existing ownership checks have not been relaxed to approximate these features.

Verification: on 2026-09-13 the owner ran `outputs/Test-ASAYA-TZ-v3.ps1` on a disposable local PostgreSQL database: 168 tests passed, zero failures or skips, including the SMS database tests. Codex verified the saved `outputs/ASAYA-TZ-v3-tests.log`. No real SMS, payments or publication occurred. The script must run in ordinary owner PowerShell because PostgreSQL initdb cannot run under the agent's restricted Windows token. `-SmsOnly` selects seven SMS/legal checks. Pure policy/text checks, builds and browser checks with a mock API also passed; provider delivery remains unverified.
