-- ============================================================
-- CUBO — Migración 007: agregar fase y fecha a obras
-- Permite distinguir entre obras realizadas y proyectos próximos
-- en la landing, y mostrar una fecha (mes/año) en el modal.
-- ============================================================

alter table obras
  add column if not exists fase  text not null default 'realizada'
    check (fase in ('realizada', 'proxima')),
  add column if not exists fecha text;

create index if not exists idx_obras_fase on obras(fase);
