-- ============================================================
-- CUBO — Migración 001: Catálogo Sismat + Recetas
-- Ejecutar en Supabase SQL Editor (una sola vez)
-- ============================================================


-- ── 1. EXTENSIÓN UUID (ya viene en Supabase, pero por las dudas) ──
create extension if not exists "uuid-ossp";


-- ── 2. CATEGORIAS — agregar markup a la tabla existente ──
alter table categorias
  add column if not exists markup_porcentaje numeric(5,2) default 30;


-- ── 3. SISMAT_CATALOG — espejo del catálogo de Sismat ──
create table if not exists sismat_catalog (
  sismat_id       integer primary key,
  tipo            text not null check (tipo in ('material', 'mano_de_obra')),
  nombre_original text not null,
  unidad          text not null default 'U',
  unidad_nombre   text,
  categoria_sismat      text,
  categoria_sismat_id   integer,
  precio_sismat   numeric(12,2) not null default 0,
  detalle         text,
  raw_json        jsonb,
  actualizado_en  timestamptz not null default now()
);

create index if not exists idx_sismat_catalog_tipo     on sismat_catalog(tipo);
create index if not exists idx_sismat_catalog_categoria on sismat_catalog(categoria_sismat_id);


-- ── 4. SISMAT_CATALOG_OVERRIDES — personalizaciones CUBO por ítem ──
create table if not exists sismat_catalog_overrides (
  sismat_id           integer primary key references sismat_catalog(sismat_id) on delete cascade,
  nombre_cubo         text,
  descripcion_cubo    text,
  visible_en_cotizador boolean not null default false,
  categoria_cubo_id   uuid references categorias(id) on delete set null,
  markup_override     numeric(5,2),
  actualizado_en      timestamptz not null default now()
);

create index if not exists idx_overrides_visible   on sismat_catalog_overrides(visible_en_cotizador);
create index if not exists idx_overrides_categoria on sismat_catalog_overrides(categoria_cubo_id);


-- ── 5. RECETAS — ítems CUBO compuestos que el cliente agrega al cotizador ──
create table if not exists recetas (
  id              uuid primary key default uuid_generate_v4(),
  nombre          text not null,
  descripcion     text,
  unidad          text not null default 'm²',
  categoria_id    uuid references categorias(id) on delete set null,
  activo_publico  boolean not null default false,
  ajuste_porcentaje numeric(5,2) not null default 0,
  orden           integer not null default 99,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

create index if not exists idx_recetas_categoria on recetas(categoria_id);
create index if not exists idx_recetas_activo    on recetas(activo_publico);


-- ── 6. RECETA_COMPONENTES — ingredientes de cada receta ──
create table if not exists receta_componentes (
  id          uuid primary key default uuid_generate_v4(),
  receta_id   uuid not null references recetas(id) on delete cascade,
  sismat_id   integer not null references sismat_catalog(sismat_id) on delete restrict,
  cantidad    numeric(12,4) not null,
  tipo        text not null check (tipo in ('material', 'mano_de_obra'))
);

create index if not exists idx_componentes_receta  on receta_componentes(receta_id);
create index if not exists idx_componentes_sismat  on receta_componentes(sismat_id);


-- ── 7. PRECIO_HISTORICO — auditoría de cambios de precio de Sismat ──
create table if not exists precio_historico (
  id              uuid primary key default uuid_generate_v4(),
  sismat_id       integer not null references sismat_catalog(sismat_id) on delete cascade,
  precio_anterior numeric(12,2),
  precio_nuevo    numeric(12,2) not null,
  delta_porcentaje numeric(8,2),
  importado_en    timestamptz not null default now()
);

create index if not exists idx_historico_sismat on precio_historico(sismat_id);
create index if not exists idx_historico_fecha  on precio_historico(importado_en);


-- ── 8. RLS — Row Level Security ──
-- sismat_catalog: lectura pública (el cotizador necesita calcular precios)
alter table sismat_catalog            enable row level security;
alter table sismat_catalog_overrides  enable row level security;
alter table recetas                   enable row level security;
alter table receta_componentes        enable row level security;
alter table precio_historico          enable row level security;

-- Lectura pública para lo que el cotizador necesita
create policy "anon puede leer catalogo"
  on sismat_catalog for select to anon using (true);

create policy "anon puede leer overrides"
  on sismat_catalog_overrides for select to anon using (true);

create policy "anon puede leer recetas activas"
  on recetas for select to anon using (activo_publico = true);

create policy "anon puede leer componentes"
  on receta_componentes for select to anon using (true);

-- Escritura solo para usuarios autenticados (admin)
create policy "auth puede todo en catalogo"
  on sismat_catalog for all to authenticated using (true) with check (true);

create policy "auth puede todo en overrides"
  on sismat_catalog_overrides for all to authenticated using (true) with check (true);

create policy "auth puede todo en recetas"
  on recetas for all to authenticated using (true) with check (true);

create policy "auth puede todo en componentes"
  on receta_componentes for all to authenticated using (true) with check (true);

create policy "auth puede leer historico"
  on precio_historico for select to authenticated using (true);

create policy "auth puede insertar historico"
  on precio_historico for insert to authenticated with check (true);
