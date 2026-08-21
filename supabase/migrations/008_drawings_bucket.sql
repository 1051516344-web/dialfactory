-- ============================================================
-- DialFactory V1 · Migration 008
-- Bring the 'drawings' storage bucket + minimal policies into
-- version control. Previously the bucket had to be created by hand.
-- ============================================================

-- Private bucket (public=false) — access only via policies below.
INSERT INTO storage.buckets (id, name, public)
VALUES ('drawings', 'drawings', false)
ON CONFLICT (id) DO NOTHING;

-- Only authenticated users may read/upload/delete drawings.
-- (anon has zero access — prevents anonymous enumeration/deletion of all files.)
DROP POLICY IF EXISTS "drawings_auth_read" ON storage.objects;
DROP POLICY IF EXISTS "drawings_auth_write" ON storage.objects;

CREATE POLICY "drawings_auth_read" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'drawings');

CREATE POLICY "drawings_auth_write" ON storage.objects
    FOR ALL TO authenticated
    USING (bucket_id = 'drawings')
    WITH CHECK (bucket_id = 'drawings');

NOTIFY pgrst, 'reload schema';
