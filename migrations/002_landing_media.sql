-- ── MIGRACIÓN 002 — Fotos Landing ──
-- Ejecutar en: Supabase Dashboard → SQL Editor

-- 1. Bucket de Storage (público, 10MB max, solo imágenes)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'landing-fotos',
  'landing-fotos',
  true,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Políticas del bucket
CREATE POLICY "Anon lee landing-fotos"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'landing-fotos');

CREATE POLICY "Auth sube landing-fotos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'landing-fotos');

CREATE POLICY "Auth reemplaza landing-fotos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'landing-fotos');

CREATE POLICY "Auth borra landing-fotos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'landing-fotos');

-- 3. Columna de path en obras (para poder borrar el archivo del bucket)
ALTER TABLE obras
  ADD COLUMN IF NOT EXISTS imagen_storage_path text;

-- 4. Tabla para slots fijos de la landing
CREATE TABLE IF NOT EXISTS landing_media (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slot            text NOT NULL UNIQUE,   -- 'quienes', 'hero', etc.
  url             text,
  storage_path    text,
  alt             text,
  created_at      timestamptz DEFAULT now(),
  actualizado_en  timestamptz DEFAULT now()
);

ALTER TABLE landing_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon lee landing_media"
  ON landing_media FOR SELECT TO anon USING (true);

CREATE POLICY "Auth gestiona landing_media"
  ON landing_media FOR ALL TO authenticated USING (true);
