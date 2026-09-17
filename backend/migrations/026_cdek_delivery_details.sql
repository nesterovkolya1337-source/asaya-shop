-- Task 6: only documented, non-contact delivery fields from authenticated CDEK GET.
ALTER TABLE order_logistics
 ADD COLUMN delivery_pickup_point text CHECK (length(delivery_pickup_point) BETWEEN 1 AND 255),
 ADD COLUMN delivery_planned_date date;
