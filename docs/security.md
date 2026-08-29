# Security architecture for ASAYA

The GitHub Pages version is a static storefront prototype. It deliberately does not expose real customer authentication, order submission, payments, or catalog administration.

## Current public build

- Served over HTTPS by GitHub Pages.
- Stores only guest cart quantities and favorite product IDs in `localStorage`.
- Does not store names, phone numbers, email addresses, passwords, tokens, payment details, API keys, or administrator changes in the browser.
- The `/admin` route exposes no management controls. It is a locked placeholder until server-side authorization exists.
- Checkout and account forms do not send or persist entered data.

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
