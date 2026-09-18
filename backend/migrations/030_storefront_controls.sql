CREATE TABLE storefront_banner (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 enabled boolean NOT NULL DEFAULT false,
 message text NOT NULL DEFAULT '', button_text text NOT NULL DEFAULT '', button_url text NOT NULL DEFAULT '',
 revision integer NOT NULL DEFAULT 0
);
INSERT INTO storefront_banner(singleton) VALUES(true);
CREATE TABLE product_test_stock (
 product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false,
 quantity integer NOT NULL DEFAULT 0 CHECK(quantity BETWEEN 0 AND 1000000),
 revision integer NOT NULL DEFAULT 0
);
