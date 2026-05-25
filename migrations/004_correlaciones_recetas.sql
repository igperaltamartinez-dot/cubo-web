-- ── MIGRACIÓN 004 — Correlaciones apuntan a recetas + flag obligatoria ──
-- Ejecutar en: Supabase Dashboard → SQL Editor
--
-- ATENCIÓN: si tenías correlaciones armadas sobre items viejos, esta
-- migración primero las borra (las FKs nuevas apuntan a recetas, no a items).
-- Si no querés perderlas comentar la línea de DELETE y migrarlas a mano.

-- 0. Limpiar correlaciones viejas (apuntaban a items.id)
delete from correlaciones;

-- 1. Renombrar columnas para reflejar que ahora apuntan a recetas
alter table correlaciones rename column item_disparador_id to receta_disparadora_id;
alter table correlaciones rename column item_sugerido_id   to receta_sugerida_id;

-- 2. Reapuntar las FKs a recetas
alter table correlaciones drop constraint if exists correlaciones_item_disparador_id_fkey;
alter table correlaciones drop constraint if exists correlaciones_item_sugerido_id_fkey;

alter table correlaciones
  add constraint correlaciones_receta_disp_fk
    foreign key (receta_disparadora_id) references recetas(id) on delete cascade;

alter table correlaciones
  add constraint correlaciones_receta_sug_fk
    foreign key (receta_sugerida_id) references recetas(id) on delete cascade;

-- 3. Nuevo flag obligatoria (true = se agrega automáticamente, false = se pregunta)
alter table correlaciones
  add column if not exists obligatoria boolean not null default false;

-- 4. RLS — anon lee activas (para el cotizador), auth gestiona
alter table correlaciones enable row level security;

drop policy if exists "anon lee correlaciones activas" on correlaciones;
drop policy if exists "auth gestiona correlaciones"    on correlaciones;

create policy "anon lee correlaciones activas"
  on correlaciones for select to anon using (activo = true);

create policy "auth gestiona correlaciones"
  on correlaciones for all to authenticated using (true) with check (true);
