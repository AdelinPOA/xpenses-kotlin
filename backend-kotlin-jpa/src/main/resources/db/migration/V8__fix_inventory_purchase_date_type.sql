-- Fix purchase_date column type: entity expects String, was DATE
ALTER TABLE inventory_items ALTER COLUMN purchase_date TYPE VARCHAR(255);
