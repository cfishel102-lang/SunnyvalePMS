-- The database itself refuses two active reservations on the same site for
-- overlapping nights, no matter which screen, API call or channel created them.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_no_overlap"
  EXCLUDE USING gist ("siteId" WITH =, daterange("checkIn", "checkOut") WITH &&)
  WHERE (status <> 'CANCELLED');
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_dates_ok" CHECK ("checkOut" > "checkIn");
