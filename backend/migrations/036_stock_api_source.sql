ALTER TABLE stock_sources ADD COLUMN source_kind text NOT NULL DEFAULT 'cdek_ff_yml'
 CHECK (source_kind IN ('cdek_ff_yml','cdek_ff_api'));
