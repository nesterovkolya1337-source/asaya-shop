# Packet 05 — guest cart to Yandex

Official custom-site button instruction rechecked 2026-09-17:
https://yandex.ru/support/merchants/ru/buy-button-site

Existing backend-catalog cart primary action requests a protected server checkout link and redirects to https://checkout.kit.yandex.ru/express. The server encodes canonical offer IDs, integer quantities and ruble prices in Base64 UTF-8 data.items; host comes from configuration. No stock snapshot is embedded. The documented server-side basket/check supplies current purchase limits. The cart survives failures and double clicks are guarded. Old /checkout bookmarks show the cart, not the former checkout form. No guest registration is required.

No unrelated cart/header/card redesign or duplicate implementation was needed. The already-built flow is guarded by NEXT_PUBLIC_YANDEX_BUTTON and backend button.enabled; this task does not turn on a production flag.

The pre-redirect attempt is persisted, but an immutable identifier passed in the redirect remains the precise contract gap documented in PACKET_04_YCP_SERVER.md. The official items-only schema provides no such field. Passing arbitrary order_id or matching by cart/phone/time would falsely claim correlation, so neither was added.

LOCAL validation uses frontend checkout tests plus browser scenarios at 1440/390 with the official destination intercepted (not a real payment). Backend feed tests verify exact quantities/prices, idempotency and persistence before redirect. GITHUB: working branch. PRODUCTION: unchanged. Real cart/payment acceptance requires release, positive source stock and packet 07; not yet proven.
