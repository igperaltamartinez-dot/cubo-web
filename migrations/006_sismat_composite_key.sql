-- ============================================================
-- CUBO — Migración 006: PK compuesta (tipo, sismat_id)
--
-- Bug: Sismat usa namespaces separados para materiales y mano de obra,
-- ambos arrancan en sismat_id=1. La PK simple (sismat_id) hacía que
-- al importar, la MO sobrescribiera materiales con el mismo ID (ej.
-- sismat_id 15: "Cemento Albañilería" pisado por "Excavación pozo").
--
-- Esta migración es DESTRUCTIVA: borra y recrea las tablas del catálogo.
-- Después hay que re-importar el JSON desde el admin.
-- ============================================================

-- ── 1. Drop en orden inverso a las FK ──
drop table if exists precio_historico         cascade;
drop table if exists receta_componentes       cascade;
drop table if exists sismat_catalog_overrides cascade;
drop table if exists sismat_catalog           cascade;
-- recetas (la tabla padre de receta_componentes) la mantenemos


-- ── 2. SISMAT_CATALOG con PK compuesta ──
create table sismat_catalog (
  tipo            text not null check (tipo in ('material', 'mano_de_obra')),
  sismat_id       integer not null,
  nombre_original text not null,
  unidad          text not null default 'U',
  unidad_nombre   text,
  categoria_sismat      text,
  categoria_sismat_id   integer,
  precio_sismat   numeric(12,2) not null default 0,
  detalle         text,
  raw_json        jsonb,
  actualizado_en  timestamptz not null default now(),
  primary key (tipo, sismat_id)
);

create index idx_sismat_catalog_tipo     on sismat_catalog(tipo);
create index idx_sismat_catalog_categoria on sismat_catalog(categoria_sismat_id);
create index idx_sismat_catalog_nombre   on sismat_catalog(nombre_original);


-- ── 3. SISMAT_CATALOG_OVERRIDES con PK compuesta ──
create table sismat_catalog_overrides (
  tipo                text not null,
  sismat_id           integer not null,
  nombre_cubo         text,
  descripcion_cubo    text,
  visible_en_cotizador boolean not null default false,
  categoria_cubo_id   uuid references categorias(id) on delete set null,
  markup_override     numeric(5,2),
  actualizado_en      timestamptz not null default now(),
  primary key (tipo, sismat_id),
  foreign key (tipo, sismat_id) references sismat_catalog(tipo, sismat_id) on delete cascade
);

create index idx_overrides_visible   on sismat_catalog_overrides(visible_en_cotizador);
create index idx_overrides_categoria on sismat_catalog_overrides(categoria_cubo_id);


-- ── 4. RECETA_COMPONENTES con FK compuesta ──
create table receta_componentes (
  id          uuid primary key default uuid_generate_v4(),
  receta_id   uuid not null references recetas(id) on delete cascade,
  tipo        text not null check (tipo in ('material', 'mano_de_obra')),
  sismat_id   integer not null,
  cantidad    numeric(12,4) not null,
  foreign key (tipo, sismat_id) references sismat_catalog(tipo, sismat_id) on delete restrict
);

create index idx_componentes_receta  on receta_componentes(receta_id);
create index idx_componentes_sismat  on receta_componentes(tipo, sismat_id);


-- ── 5. PRECIO_HISTORICO con FK compuesta ──
create table precio_historico (
  id              uuid primary key default uuid_generate_v4(),
  tipo            text not null,
  sismat_id       integer not null,
  precio_anterior numeric(12,2),
  precio_nuevo    numeric(12,2) not null,
  delta_porcentaje numeric(8,2),
  importado_en    timestamptz not null default now(),
  foreign key (tipo, sismat_id) references sismat_catalog(tipo, sismat_id) on delete cascade
);

create index idx_historico_sismat on precio_historico(tipo, sismat_id);
create index idx_historico_fecha  on precio_historico(importado_en);


-- ── 6. RLS — replicar políticas de la migración 001 ──
alter table sismat_catalog            enable row level security;
alter table sismat_catalog_overrides  enable row level security;
alter table receta_componentes        enable row level security;
alter table precio_historico          enable row level security;

create policy "anon puede leer catalogo"
  on sismat_catalog for select to anon using (true);

create policy "anon puede leer overrides"
  on sismat_catalog_overrides for select to anon using (true);

create policy "anon puede leer componentes"
  on receta_componentes for select to anon using (true);

create policy "auth puede todo en catalogo"
  on sismat_catalog for all to authenticated using (true) with check (true);

create policy "auth puede todo en overrides"
  on sismat_catalog_overrides for all to authenticated using (true) with check (true);

create policy "auth puede todo en componentes"
  on receta_componentes for all to authenticated using (true) with check (true);

create policy "auth puede leer historico"
  on precio_historico for select to authenticated using (true);

create policy "auth puede insertar historico"
  on precio_historico for insert to authenticated with check (true);
