CREATE TABLE product_media (
 id uuid PRIMARY KEY, uploader_id uuid NOT NULL REFERENCES users(id),
 source_hash text NOT NULL, content_hash text NOT NULL, content bytea NOT NULL,
 width integer NOT NULL CHECK(width BETWEEN 1 AND 2048), height integer NOT NULL CHECK(height BETWEEN 1 AND 2048),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(octet_length(content) BETWEEN 1 AND 6291456)
);

