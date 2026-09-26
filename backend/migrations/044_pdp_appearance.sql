ALTER TABLE storefront_banner
 ADD COLUMN pdp_order jsonb NOT NULL DEFAULT '["reviews","richContent","recommendations"]'::jsonb,
 ADD COLUMN appearance_revision integer NOT NULL DEFAULT 0;
