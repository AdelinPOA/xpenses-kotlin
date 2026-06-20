-- Link approved inventory items back to the request that created them
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS request_id INTEGER REFERENCES inventory_requests(id) ON DELETE SET NULL;
