-- Expand document identifiers only; existing drafts, revisions and publications are preserved.
ALTER TABLE site_pages DROP CONSTRAINT site_pages_id_check;
ALTER TABLE site_pages ADD CONSTRAINT site_pages_id_check CHECK (
 id IN ('home','about','faq','delivery','support','where-to-buy','header','footer',
        'returns','requisites','instructions','privacy','personal-data','offer','cookies')
);
