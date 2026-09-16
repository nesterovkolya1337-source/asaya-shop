CREATE TABLE site_pages (
 id text PRIMARY KEY CHECK (id IN ('home','about','faq','delivery','support','where-to-buy')),
 revision integer NOT NULL CHECK (revision > 0),
 draft jsonb NOT NULL,
 published jsonb,
 published_at timestamptz,
 updated_by uuid NOT NULL REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((published IS NULL) = (published_at IS NULL))
);
