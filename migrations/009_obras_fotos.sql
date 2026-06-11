-- ============================================================
-- CUBO — Migración 009: galería multifoto por obra
-- ============================================================
-- Agrega una columna `fotos` (jsonb array de URLs) a la tabla
-- obras_portfolio. `imagen_url` queda como FOTO DE PORTADA (la
-- que se ve en el bento de la landing). `fotos` guarda 0–N URLs
-- extra que el modal de detalle muestra como carrusel.
--
-- IMPORTANTE: Esta migración toca `obras_portfolio` (galería
-- pública del presupuestador), NO `obras` (tabla interna del
-- gestor de obras cubo-obras.vercel.app). Son tablas distintas
-- en el mismo proyecto Supabase.
--
-- Ejemplo de uso desde SQL:
--   update obras_portfolio
--     set fotos = '["https://.../foto2.jpg","https://.../foto3.jpg"]'::jsonb
--   where titulo = 'Casa Benavides';
-- ============================================================

alter table obras_portfolio
  add column if not exists fotos jsonb not null default '[]'::jsonb;
