-- ── MIGRACIÓN 010 — Separar "usable por el motor" de "visible en el catálogo" ──
-- Ejecutar en: Supabase Dashboard → SQL Editor
--
-- PROBLEMA QUE RESUELVE
-- `activo_publico` cumplía dos roles a la vez: "la receta participa del cotizador"
-- y "la receta se muestra como card en el catálogo". Las recetas de preparación
-- (picado de revoque, carpeta de nivelación) no deben listarse como card, así que
-- estaban en activo_publico = false — y eso las volvía invisibles también para el
-- motor de correlaciones, que las descartaba en silencio con un .filter(Boolean).
-- Resultado: las 17 correlaciones cargadas nunca se ejecutaron en producción.
--
-- A partir de acá:
--   activo_publico      = la receta participa del cotizador (motor + plantillas)
--   visible_en_catalogo = además se muestra como card en el modo experto

-- 1. Nueva columna de visibilidad
alter table recetas
  add column if not exists visible_en_catalogo boolean not null default true;

-- 2. Backfill: lo que hoy es público sigue siendo visible; lo oculto sigue oculto
update recetas set visible_en_catalogo = activo_publico;

-- 3. Las recetas destino de una correlación activa tienen que participar del motor,
--    pero sin aparecer como card suelta en el catálogo.
update recetas r
   set activo_publico = true,
       visible_en_catalogo = false
 where r.activo_publico = false
   and exists (
     select 1 from correlaciones c
      where c.receta_sugerida_id = r.id
        and c.activo = true
   );

-- 4. Ídem para las disparadoras: si una correlación se dispara desde una receta,
--    esa receta tiene que ser alcanzable por el motor.
update recetas r
   set activo_publico = true
 where r.activo_publico = false
   and exists (
     select 1 from correlaciones c
      where c.receta_disparadora_id = r.id
        and c.activo = true
   );

create index if not exists idx_recetas_visible on recetas(visible_en_catalogo);

-- 5. RLS — anon lee todo lo que participa del cotizador (ya no filtra por visibilidad).
--    El filtro de qué se muestra como card pasó a ser del cliente.
alter table recetas enable row level security;

drop policy if exists "anon lee recetas publicas"  on recetas;
drop policy if exists "anon lee recetas activas"   on recetas;
drop policy if exists "auth gestiona recetas"      on recetas;

create policy "anon lee recetas activas"
  on recetas for select to anon using (activo_publico = true);

create policy "auth gestiona recetas"
  on recetas for all to authenticated using (true) with check (true);

-- 6. receta_componentes: anon necesita leer los componentes de toda receta activa
--    para poder calcular el precio.
alter table receta_componentes enable row level security;

drop policy if exists "anon lee componentes"     on receta_componentes;
drop policy if exists "auth gestiona componentes" on receta_componentes;

create policy "anon lee componentes"
  on receta_componentes for select to anon using (
    exists (select 1 from recetas r where r.id = receta_id and r.activo_publico = true)
  );

create policy "auth gestiona componentes"
  on receta_componentes for all to authenticated using (true) with check (true);

-- 7. Guardar las respuestas del cuestionario junto al lead. Al llamar al cliente,
--    saber "baño de 2x2, mueve el inodoro" vale más que la lista de ítems.
alter table leads
  add column if not exists respuestas jsonb;

-- 8. El lead ahora se captura en dos tiempos: nombre + WhatsApp al entrar (para no
--    perder al que abandona) y email + zona al confirmar. Con email NOT NULL la
--    primera escritura era imposible.
alter table leads alter column email drop not null;

-- 9. anon no puede leer la fila que acaba de insertar (y está bien que así sea),
--    así que el id se genera en el cliente y después se actualiza por id.
--    Solo hace falta que exista el default para los inserts del admin.
alter table leads alter column id set default uuid_generate_v4();
