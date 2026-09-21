CREATE TABLE marketing_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 revision integer NOT NULL DEFAULT 0,
 defaults jsonb NOT NULL,
 draft jsonb NOT NULL,
 live jsonb NOT NULL
);
INSERT INTO marketing_settings(id,defaults,draft,live)
SELECT true, settings, settings, settings FROM
 (SELECT '{"twoPercent":5,"threePercent":10,"freeShippingMinor":100000}'::jsonb AS settings) seed;
