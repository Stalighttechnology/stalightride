-- Migration: Add trip_type to driver_bookings
ALTER TABLE public.driver_bookings
  ADD COLUMN IF NOT EXISTS trip_type text;
