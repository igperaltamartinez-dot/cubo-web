-- ── MIGRACIÓN 003 — Fallback RLS Landing (correr SOLO si 002 sigue dando error) ──
-- Ejecutar en: Supabase Dashboard → SQL Editor
--
-- Las políticas con `TO authenticated` pueden no matchear cuando el cliente
-- usa las publishable keys nuevas (`sb_publishable_...`). Esta migración
-- las reemplaza por políticas que chequean `auth.uid() IS NOT NULL`, que
-- es más permisivo y funciona con cualquier sesión válida.

-- 1. Drop de las políticas viejas de storage
drop policy if exists "Auth sube landing-fotos"      on storage.objects;
drop policy if exists "Auth reemplaza landing-fotos" on storage.objects;
drop policy if exists "Auth borra landing-fotos"     on storage.objects;

-- 2. Políticas nuevas usando auth.uid() IS NOT NULL
create policy "Auth sube landing-fotos"
  on storage.objects for insert
  with check (bucket_id = 'landing-fotos' and auth.uid() is not null);

create policy "Auth reemplaza landing-fotos"
  on storage.objects for update
  using (bucket_id = 'landing-fotos' and auth.uid() is not null);

create policy "Auth borra landing-fotos"
  on storage.objects for delete
  using (bucket_id = 'landing-fotos' and auth.uid() is not null);

-- 3. Idem para landing_media
drop policy if exists "Auth gestiona landing_media" on landing_media;

create policy "Auth gestiona landing_media"
  on landing_media for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
