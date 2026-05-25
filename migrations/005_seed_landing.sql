-- ── MIGRACIÓN 005 — Seed visual con Unsplash ──
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- Carga 1 foto de "Quiénes somos" + 6 obras placeholder con URLs curadas
-- que matchean la estética CUBO (minimalista, blanco/charcoal, arquitectónico).
-- Nacho puede reemplazar cada foto subiendo desde el admin (Fotos Landing).

-- 1. Foto "Quiénes somos" (slot fijo, 3:4 portrait)
insert into landing_media (slot, url, alt)
values (
  'quienes',
  'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=1200&q=85',
  'Equipo CUBO en obra'
)
on conflict (slot) do update
  set url = excluded.url,
      alt = excluded.alt,
      actualizado_en = now();

-- 2. Galería de obras placeholder (4:3 landscape)
insert into obras (titulo, zona, tipo, imagen_url, orden) values
  ('Reforma integral Palermo',         'Palermo · CABA',        'Reforma integral',
   'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1600&q=85', 1),
  ('Cocina contemporánea Belgrano',    'Belgrano · CABA',       'Cocina',
   'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1600&q=85', 2),
  ('Living en Núñez',                  'Núñez · CABA',          'Living comedor',
   'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1600&q=85', 3),
  ('Baño en suite Recoleta',           'Recoleta · CABA',       'Baño',
   'https://images.unsplash.com/photo-1620626011761-996317b8d101?w=1600&q=85', 4),
  ('Loft minimalista Caballito',       'Caballito · CABA',      'Loft',
   'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1600&q=85', 5),
  ('Duplex Villa Urquiza',             'Villa Urquiza · CABA',  'Duplex',
   'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1600&q=85', 6)
on conflict do nothing;
