# Product Editor history response regression

Production baseline: API/Admin/storefront `c67258a93f6b6f25e95aac0a2c62a6e2cbe9def3`.

Price-only PUT `/manage/api/admin/v1/products/:id/` succeeds (HTTP 200,
`{id, revision: 10}`, input revision 9, finalMinor 52400). API request ID:
`ab427276-504e-4510-89a9-f8555377412e`. The price was restored without publishing.

The subsequent GET `products/:id/history` also returns HTTP 200, but contains
legitimate system audit events (`product.publication_restored`,
`product.draft_reconciled`) with `actor_id: null`. Migration 007 makes actor_id
nullable. The Admin client rejected null as INVALID_RESPONSE, and the editor
reported the whole Save/reload action as failed despite the saved draft.

Accept only UUID or explicit null for history actors; label null as “Система”.
Missing/malformed actors remain rejected. No backend, pricing, revision,
Rich Content, publication, stock or integration changes.

Validation: regression reproduced before fix; all six admin-client tests pass
after fix. Admin webpack production build and typecheck pass. Local Turbopack
cannot follow this worktree's external node_modules junction; production uses
its normal isolated Docker build. Deploy only Admin; no migrations.
