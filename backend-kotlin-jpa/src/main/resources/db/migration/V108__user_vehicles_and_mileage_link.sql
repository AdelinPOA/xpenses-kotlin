CREATE TABLE user_vehicles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plate_number VARCHAR(32) NOT NULL,
    make_model VARCHAR(120),
    fuel_type VARCHAR(20),
    fuel_consumption_l_per_100km NUMERIC(5,2),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_vehicles_user_id ON user_vehicles(user_id);
CREATE UNIQUE INDEX uq_user_vehicles_default ON user_vehicles(user_id) WHERE is_default = TRUE;

ALTER TABLE mileage_records
    ADD COLUMN vehicle_id INTEGER REFERENCES user_vehicles(id) ON DELETE SET NULL,
    ADD COLUMN vehicle_plate VARCHAR(32),
    ADD COLUMN vehicle_make_model VARCHAR(120),
    ADD COLUMN vehicle_fuel_type VARCHAR(20);

CREATE INDEX idx_mileage_records_vehicle_id ON mileage_records(vehicle_id);
