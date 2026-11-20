ALTER TABLE user_vehicles
    ADD COLUMN vehicle_category VARCHAR(16) NOT NULL DEFAULT 'M1',
    ADD COLUMN last_odometer_km NUMERIC(10,1);

ALTER TABLE expense_reports
    ADD COLUMN starting_odometer_km NUMERIC(10,1);

ALTER TABLE mileage_records
    ADD COLUMN round_trip BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN vehicle_category VARCHAR(16);
