-- Additive analytics only. No customer/order deletion or integration side effects.
CREATE TABLE product_analytics_events (
 event_id uuid PRIMARY KEY,
 anonymous_session_id uuid NOT NULL,
 event_type text NOT NULL CHECK(event_type IN ('product_impression','product_open','product_click','add_to_cart','checkout_started')),
 product_id uuid REFERENCES products(id) ON DELETE SET NULL,
 sku text NOT NULL,
 product_name text NOT NULL,
 category text CHECK(category IN ('hair','body','face','sets')),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(anonymous_session_id,event_type,sku)
);
CREATE INDEX product_analytics_period ON product_analytics_events(occurred_at,sku);
CREATE INDEX product_analytics_session ON product_analytics_events(anonymous_session_id,occurred_at);

ALTER TABLE order_items ADD COLUMN category_snapshot text CHECK(category_snapshot IN ('hair','body','face','sets'));
-- Existing rows have no historic category evidence: leave them NULL.
CREATE FUNCTION asaya_analytics_item_category() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 SELECT CASE WHEN published->'content'->>'category' IN ('hair','body','face','sets') THEN published->'content'->>'category' END
 INTO NEW.category_snapshot FROM product_editor WHERE product_id=NEW.product_id;
 RETURN NEW;
END $$;
CREATE TRIGGER analytics_item_category BEFORE INSERT ON order_items FOR EACH ROW EXECUTE FUNCTION asaya_analytics_item_category();

CREATE TABLE order_analytics_events (
 order_id uuid NOT NULL REFERENCES orders(id),
 event_type text NOT NULL CHECK(event_type IN ('order_created','order_paid','order_cancelled','refund_completed')),
 event_key text NOT NULL DEFAULT '',
 occurred_at timestamptz NOT NULL DEFAULT now(),
 historical boolean NOT NULL DEFAULT false,
 PRIMARY KEY(order_id,event_type,event_key)
);
CREATE INDEX order_analytics_period ON order_analytics_events(occurred_at,event_type);
CREATE FUNCTION asaya_analytics_order_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  INSERT INTO order_analytics_events(order_id,event_type,occurred_at) VALUES(NEW.id,'order_created',NEW.created_at) ON CONFLICT DO NOTHING;
 END IF;
 IF NEW.payment_status IN ('paid','partially_refunded','refunded') THEN
  INSERT INTO order_analytics_events(order_id,event_type) VALUES(NEW.id,'order_paid') ON CONFLICT DO NOTHING;
 END IF;
 IF NEW.status='cancelled' THEN
  INSERT INTO order_analytics_events(order_id,event_type) VALUES(NEW.id,'order_cancelled') ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER analytics_order_event AFTER INSERT OR UPDATE OF status,payment_status ON orders FOR EACH ROW EXECUTE FUNCTION asaya_analytics_order_event();
CREATE FUNCTION asaya_analytics_refund_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='succeeded' THEN
  INSERT INTO order_analytics_events(order_id,event_type,event_key)
  SELECT order_id,'refund_completed',NEW.id::text FROM payments WHERE id=NEW.payment_id ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER analytics_refund_event AFTER INSERT OR UPDATE OF status ON refunds FOR EACH ROW EXECUTE FUNCTION asaya_analytics_refund_event();

-- Backfill only states supported by existing records, marked as historical.
INSERT INTO order_analytics_events(order_id,event_type,occurred_at,historical)
 SELECT id,'order_created',created_at,true FROM orders;
INSERT INTO order_analytics_events(order_id,event_type,occurred_at,historical)
 SELECT id,'order_paid',COALESCE((SELECT min(h.occurred_at) FROM order_status_history h WHERE h.order_id=o.id AND h.kind='payment' AND h.status='paid'),o.created_at),true
 FROM orders o WHERE payment_status IN ('paid','partially_refunded','refunded')
 OR EXISTS(SELECT 1 FROM order_status_history h WHERE h.order_id=o.id AND h.kind='payment' AND h.status='paid')
 OR EXISTS(SELECT 1 FROM payments p WHERE p.order_id=o.id AND p.status='paid');
INSERT INTO order_analytics_events(order_id,event_type,occurred_at,historical)
 SELECT id,'order_cancelled',COALESCE((SELECT min(h.occurred_at) FROM order_status_history h WHERE h.order_id=o.id AND h.kind='order' AND h.status='cancelled'),o.updated_at),true
 FROM orders o WHERE status='cancelled';
INSERT INTO order_analytics_events(order_id,event_type,event_key,occurred_at,historical)
 SELECT p.order_id,'refund_completed',r.id::text,r.created_at,true FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE r.status='succeeded';
