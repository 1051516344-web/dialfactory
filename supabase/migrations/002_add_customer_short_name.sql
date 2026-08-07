-- ============================================================
-- DialFactory V1 · Migration 002
-- Add customer short_name for display alias support
-- ============================================================
-- Change Proposal: Phase 3-D Customer Display Alias
-- Freeze Impact: 58 → 59 fields
-- FK Impact: None
-- ADL Impact: None
-- ============================================================

-- Step 1: Add column
ALTER TABLE customers ADD COLUMN short_name TEXT;

-- Step 2: Populate short_name from existing code values
UPDATE customers SET short_name = 'ACC' WHERE code = 'ACC';
UPDATE customers SET short_name = 'ATT' WHERE code = 'ATT';
UPDATE customers SET short_name = 'FAF' WHERE code = 'FAF';
UPDATE customers SET short_name = 'REN' WHERE code = 'REN';
UPDATE customers SET short_name = 'OW'  WHERE code = 'OW';
UPDATE customers SET short_name = 'GQ'  WHERE code = 'GQ';
UPDATE customers SET short_name = 'TSI' WHERE code = 'TSI';
UPDATE customers SET short_name = 'TEL' WHERE code = 'TEL';
UPDATE customers SET short_name = 'WEL' WHERE code = 'WEL';
UPDATE customers SET short_name = 'THA' WHERE code = 'THA';
UPDATE customers SET short_name = 'GLB' WHERE code = 'GLB';
UPDATE customers SET short_name = 'PYX' WHERE code = 'PYX';
UPDATE customers SET short_name = 'APW' WHERE code = 'APW';
UPDATE customers SET short_name = 'JIP' WHERE code = 'JIP';
UPDATE customers SET short_name = 'CES' WHERE code = 'CES';
UPDATE customers SET short_name = 'HKG' WHERE code = 'HKG';

-- Step 3: Verify
-- SELECT code, name, short_name FROM customers ORDER BY code;
-- Expected: 16 rows, all with short_name populated
