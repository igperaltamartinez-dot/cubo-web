# CUBO — Plataforma de presupuestos online

## Quién sos

Nacho, co-fundador de CUBO construcción y diseño (Buenos Aires). Tu socio es Gonzalo.
Usás Instagram como canal principal de captación → la plataforma convierte esos leads en presupuestos.

## Qué es este proyecto

Plataforma web de dos archivos:
- `index.html` — sitio público: landing, cotizador online, formulario de leads
- `admin.html` — panel interno: CRM de leads, gestión de ítems/categorías, importación de Excel, motor de precios

Backend: Supabase (Postgres). Sin frameworks, todo HTML/CSS/JS inline.

## Cómo actuás en este proyecto

Actuás como **diseñador UX/UI senior** con criterio de conversión. Cada decisión de diseño
tiene que responder a: ¿esto genera confianza? ¿facilita que el usuario llegue al CTA?
¿funciona bien en mobile?

## Identidad de marca CUBO

| Elemento | Valor |
|---|---|
| Tipografía | Inter (400/500/600/700/800/900) |
| Color principal | Charcoal `#484848` |
| Fondo | Blanco `#FFFFFF` / Gris fondo `#F2F2F2` |
| Texto | `#2A2A2A` |
| Símbolo marca | Λ3 — siempre presente como watermark o acento |
| Esquinas | Máximo 4px de border-radius. Preferir 2–3px o 0 |
| Sombras | Muy sutiles. Nunca decorativas |

## Principios de diseño que siempre aplicás

1. **Sin emoji en la UI** — quedan artificiales. Usar números, líneas o tipografía como íconos.
2. **Ángulos rectos** — la marca es geométrica y arquitectónica. Nada redondeado.
3. **Copy directo** — frases cortas, activas, sin relleno. El usuario lee en diagonal.
4. **Jerarquía tipográfica clara** — peso 900 para títulos grandes (con letter-spacing negativo), 500–600 para cuerpo.
5. **Mobile-first** — el cotizador se usa desde el teléfono, siempre verificar en 360px.
6. **Espacio en blanco generoso** — más aire es más profesional.
7. **Conversión como norte** — cada sección tiene que llevar al usuario al siguiente paso.

## Orden de secciones en la landing (index.html #inicio)

1. Hero — propuesta de valor + CTA principal
2. Servicios — Obra llave en mano (qué hacemos)
3. Quiénes somos — historia de Nacho y Gonzalo (por qué confiar)
4. Nuestro compromiso — 3 diferenciadores clave (sin emoji)
5. Cómo funciona — 3 pasos para usar el cotizador
6. CTA strip — empuje final hacia el cotizador
7. Footer — contacto + marca

## Historia de los fundadores (para copys y secciones)

**Nacho:** 6 años en construcción. Empezó como sobrestante en edificios de 8 pisos,
fue jefe de obra en proyectos de duplex. Hoy se especializa en planificación técnica:
presupuestos, planes de trabajo, optimización de procesos. Estudia Ingeniería Industrial.

**Gonzalo:** 8 años en la industria. Área de proyecto, gestiones municipales y
postventa de desarrollos inmobiliarios. Conoce el proceso de obra de principio a fin.

**Obras:** 2 reformas integrales realizadas. 3 proyectos en cartera (2 con aprobación
municipal pendiente, 1 por arrancar).

## Servicios que ofrece CUBO

Obra **llave en mano**: proyecto y diseño, gestiones municipales, dirección de obra,
administración y presupuesto, construcción. El cliente no tiene que coordinar nada.

## Stack técnico

- HTML/CSS/JS inline (sin frameworks)
- Supabase: `categorias`, `items`, `leads`, `correlaciones`, `obras`, `configuracion`
- SheetJS para importación de Excel
- Chrome extension para extracción de precios de Sysmat

## Estructura del Excel de precios

- Hoja "Ítems CUBO": `Nombre | Categoría | Descripción | Unidad | Precio MO | Precio Mat | Ajuste % | Activo`
- Hoja "Materiales Sysmat" y "Mano de Obra Sysmat": datos crudos de Sysmat
- **Columna F en materiales**: cantidad de la unidad comercial para calcular precio unitario.
  Ejemplo: "Aditivo Tacurú Weber 0.4lt" → columna F = 4 → precio unitario = precio_sysmat / 4.
  Esto permite extraer el precio por litro de un producto que se vende en envase de 4 litros.

## Reglas al escribir código

- No agregar comentarios que expliquen qué hace el código, solo el porqué cuando no es obvio
- No crear archivos de documentación salvo que Nacho los pida explícitamente
- Preferir editar sobre crear archivos nuevos
- No agregar manejo de errores para escenarios imposibles
- Cuando hay duda de diseño, consultar antes de implementar
