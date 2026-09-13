/* ============================================================
   CONFIG.JS — Interruptores del sitio público.

   El presupuestador está terminándose mientras el Instagram ya está al aire, así
   que /presupuestador muestra una pantalla de obra en vez del cotizador a medio
   hacer. Para verlo funcionando sin publicarlo: agregá ?acceso=<clave> a la URL
   una sola vez y queda guardado en ese navegador.

   Esto NO es seguridad: la clave viaja en el JS y cualquiera que mire el código
   la encuentra. Solo evita que un lead se tope con algo incompleto.
   Para cerrar el presupuestador al público de verdad no alcanza con esto.
   ============================================================ */

window.CUBO_CONFIG = {
  presupuestadorEnConstruccion: true,
  claveAcceso: 'obra2026',

  /* La tabla `configuracion` de Supabase no es legible por visitantes anónimos,
     así que los datos de contacto del sitio público viven acá. Si algún día se
     abre esa tabla al rol anon, esto pasa a ser el fallback. */
  contacto: {
    whatsapp: '5491178288632',          // +54 9 11 7828-8632
    telefono: '+54 9 11 7828-8632',     // como se muestra en pantalla
    instagram: 'cubo.proyectos',
    email: 'infocuboproyectos@gmail.com',
    mensajeWhatsapp: 'Hola CUBO, quiero presupuestar una reforma.',
  },
};
