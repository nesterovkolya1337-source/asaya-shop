# Release clarification: 2026-09-18

This supersedes conflicting correlation blockers in PACKET_04 through PACKET_07 and TASK_6.
ASAYA returns its stable order number to Yandex during server session creation. Yandex creates the CDEK shipment; ASAYA never creates it.
The authenticated ORDER_STATUS callback directly applies delivery events. attributes.number is matched exactly to ASAYA public_number within the configured YCP account/environment and placed CDEK orders. Missing numbers and unknown orders are not guessed. UUID/tracking are captured from the callback and immutable thereafter.
Production starts no delivery polling worker; viewing the account does not trigger GET. Manual operator diagnostics remain separate.
Duplicates are atomic; late events do not regress chronological state and older replays cannot undo a deletion. Inventory consumption is once-only. Delivery events never alter payment/refund facts.
Official source verified 2026-09-18: https://gateway.cdek.ru/api-cdek-docs/web/docs/merged?sectionId=api_v2_integration (common ORDER_STATUS section; attributes.number is optional).
Build and 23 CDEK/logistics tests passed, including new automatic binding, duplicate concurrency, mismatched identity, foreign scope and deleted/late events. No real payments or shipments.
Deployment retains integration gates and the existing storefront while the canonical published catalog is empty. Live subscription and end-to-end acceptance must be checked separately; deploying code alone is not evidence of live integration readiness.
