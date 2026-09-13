-- ── MIGRACIÓN 012 — Corregir el email de contacto ──
-- Ejecutar en: Supabase Dashboard → SQL Editor

update configuracion
   set valor = 'infocuboproyectos@gmail.com'
 where clave = 'email';

-- Verificación: debería devolver las cuatro claves con valor cargado.
select clave, valor from configuracion order by clave;
