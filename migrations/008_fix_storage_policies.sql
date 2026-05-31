-- ============================================================
-- CUBO — Migración 008: re-aplicar policies del bucket landing-fotos
-- Las policies anteriores quedaron mal aplicadas (sin "to authenticated"
-- explícito), y storage.objects rechazaba los INSERT con
-- "new row violates row-level security policy" incluso con sesión
-- válida. Esto las recrea limpias.
-- ============================================================

drop policy if exists "Auth sube landing-fotos"      on storage.objects;
drop policy if exists "Auth reemplaza landing-fotos" on storage.objects;
drop policy if exists "Auth borra landing-fotos"     on storage.objects;
drop policy if exists "Anon lee landing-fotos"       on storage.objects;

create policy "Anon lee landing-fotos"
  on storage.objects for select
  using (bucket_id = 'landing-fotos');

create policy "Auth sube landing-fotos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'landing-fotos');

create policy "Auth reemplaza landing-fotos"
  on storage.objects for update to authenticated
  using (bucket_id = 'landing-fotos');

create policy "Auth borra landing-fotos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'landing-fotos');
