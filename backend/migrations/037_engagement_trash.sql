CREATE TABLE product_reviews (
 id uuid PRIMARY KEY, customer_id uuid NOT NULL REFERENCES customer_profiles(id), product_id uuid NOT NULL REFERENCES products(id),
 rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5), body text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','hidden','rejected')),
 rejection_reason text CHECK(rejection_reason IN ('spam','duplicate','abuse')), reply text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), moderated_by uuid REFERENCES users(id), UNIQUE(customer_id,product_id)
);
CREATE TABLE referral_codes (customer_id uuid PRIMARY KEY REFERENCES customer_profiles(id),code uuid NOT NULL UNIQUE);
CREATE TABLE customer_referrals (invitee_id uuid PRIMARY KEY REFERENCES customer_profiles(id),inviter_id uuid NOT NULL REFERENCES customer_profiles(id),created_at timestamptz NOT NULL DEFAULT now(),CHECK(invitee_id<>inviter_id));
ALTER TABLE products ADD COLUMN deleted_by uuid REFERENCES users(id);
ALTER TABLE products ADD COLUMN deleted_from text CHECK(deleted_from IN ('draft','unpublished','published'));
ALTER TABLE product_media ADD COLUMN deleted_at timestamptz;
ALTER TABLE product_media ADD COLUMN deleted_by uuid REFERENCES users(id);
CREATE INDEX product_trash_age ON products(archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX media_trash_age ON product_media(deleted_at) WHERE deleted_at IS NOT NULL;

-- Monotonic publication evidence: current visibility can never erase this history.
ALTER TABLE products ADD COLUMN ever_published boolean NOT NULL DEFAULT false;
UPDATE products p SET ever_published=true WHERE p.active
 OR EXISTS(SELECT 1 FROM product_editor e WHERE e.product_id=p.id AND (e.published_at IS NOT NULL OR e.published IS NOT NULL))
 OR EXISTS(SELECT 1 FROM audit_log a WHERE a.entity_id=p.id::text AND a.action='product.published');
CREATE FUNCTION preserve_product_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.ever_published THEN RAISE EXCEPTION 'PRODUCT_EVER_PUBLISHED'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN NEW.ever_published:=OLD.ever_published OR NEW.ever_published OR NEW.active;
 ELSE NEW.ever_published:=NEW.ever_published OR NEW.active; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER product_publication_history BEFORE INSERT OR UPDATE OR DELETE ON products FOR EACH ROW EXECUTE FUNCTION preserve_product_publication();
CREATE FUNCTION record_editor_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.published IS NOT NULL OR NEW.published_at IS NOT NULL THEN
  UPDATE products SET ever_published=true WHERE id=NEW.product_id AND NOT ever_published;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER editor_publication_history AFTER INSERT OR UPDATE ON product_editor FOR EACH ROW EXECUTE FUNCTION record_editor_publication();
