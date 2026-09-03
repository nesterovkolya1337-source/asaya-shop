# Security architecture for ASAYA

The GitHub Pages version is a static storefront prototype. It deliberately does not expose real customer authentication, order submission, payments, or catalog administration.

## Current public prototype

- Served over HTTPS by GitHub Pages.
- Stores cart quantities, favorite product IDs, the demo account email, submitted demo reviews/photos, and local catalog overrides in `localStorage` on that device.
- Does not use or store passwords, session tokens, payment details, or API keys.
- The `/admin` route is an intentionally unprotected local demo of product editing and review moderation. It is not a production administration system and its changes are visible only in the same browser.
- Checkout does not send an order to a server. The demo account email is retained only in that browser so the review flow can be tested.

## Requirements before production launch

- Server-side authentication with securely hashed passwords.
- Session IDs only in `HttpOnly`, `Secure`, `SameSite` cookies; never authentication tokens in `localStorage`.
- Email verification, secure password reset, rate limiting, brute-force protection, and 2FA for staff accounts.
- Explicit roles for customer, manager, and administrator, with server-side authorization on every protected action.
- CSRF, XSS, injection, request-forgery, and mass-assignment protections plus strict server validation.
- Private database access, encryption where appropriate, backups, restore tests, audit logs, and alerts.
- Product, price, inventory, order, and promotion changes through authenticated APIs only.
- Ozon, payment, email, and other credentials stored only in server-side secret storage.
- Payment card data handled by a certified payment provider and never stored by ASAYA.
- Privacy policy, consent records, data-retention rules, and collection of only the minimum necessary personal data.

## Intended topology

```text
Customer site -> protected API -> product/order database
                           ^
                           |
              staff-only admin panel (2FA + roles + audit log)
```

The production admin panel may use `/admin` or a dedicated subdomain, but it must not rely on a hidden URL for security and must not be linked from the customer-facing navigation.
