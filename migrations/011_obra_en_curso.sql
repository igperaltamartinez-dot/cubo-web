-- ── MIGRACIÓN 011 — Tercera fase de obra: "en curso" ──
-- Ejecutar en: Supabase Dashboard → SQL Editor
--
-- La landing hoy separa las obras en dos: realizadas y próximas. Falta el estado
-- del medio, que además es el que más confianza genera: la obra que se está
-- ejecutando ahora mismo.
--
-- OJO: esto toca `obras_portfolio` (la tabla del presupuestador / landing pública),
-- NO `obras`, que es la del gestor de obras y no se toca desde este proyecto.

-- 1. El check actual solo admite 'realizada' y 'proxima'. Se borra cualquier check
--    que exista sobre la columna `fase` (el nombre puede variar según cómo se creó)
--    y se recrea admitiendo los tres valores.
do $$
declare
  c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class    rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
     where ns.nspname = 'public'
       and rel.relname = 'obras_portfolio'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%fase%'
  loop
    execute format('alter table public.obras_portfolio drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.obras_portfolio
  add constraint obras_portfolio_fase_check
  check (fase in ('realizada', 'en_curso', 'proxima'));

-- 2. Índice para el filtro de la landing (no existía sobre esta tabla).
create index if not exists idx_obras_portfolio_fase on public.obras_portfolio(fase);


-- ── DATOS DE CONTACTO DE LA LANDING ──
-- `telefono` e `instagram` están cargados pero VACÍOS, así que el pie de la web
-- no muestra nada aunque se abra la lectura.

update configuracion set valor = '+54 9 11 7828-8632' where clave = 'telefono';
update configuracion set valor = 'cubo.proyectos'      where clave = 'instagram';

-- Y el rol anónimo no puede leer esa tabla, así que un visitante nunca ve el
-- teléfono ni el Instagram. Son los cuatro datos que justamente queremos publicar
-- (email, instagram, telefono, zona), así que se abre SOLO la lectura.
-- Escribir sigue siendo exclusivo de quien está logueado en el admin.
alter table configuracion enable row level security;

drop policy if exists "anon lee configuracion"  on configuracion;
drop policy if exists "auth gestiona configuracion" on configuracion;

create policy "anon lee configuracion"
  on configuracion for select to anon using (true);

create policy "auth gestiona configuracion"
  on configuracion for all to authenticated using (true) with check (true);
