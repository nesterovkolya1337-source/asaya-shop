-- Additive only: legacy content/URLs are not rewritten. 031 is reserved for the deferred PDP task.
CREATE TABLE product_media_masters (
 media_id uuid PRIMARY KEY REFERENCES product_media(id) ON DELETE CASCADE,
 content bytea NOT NULL CHECK(octet_length(content) BETWEEN 1 AND 20971520),
 width integer NOT NULL CHECK(width>0), height integer NOT NULL CHECK(height>0),
 has_alpha boolean NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE product_media_derivatives (
 media_id uuid NOT NULL REFERENCES product_media(id) ON DELETE CASCADE,
 variant_key text NOT NULL, content bytea NOT NULL, content_hash text NOT NULL,
 width integer NOT NULL, height integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(media_id,variant_key)
);
