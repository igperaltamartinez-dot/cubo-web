/* ============================================================
   CONSULTA.JS — Cuestionario corto que deriva a WhatsApp.

   Mientras el cotizador completo no esté publicado, /presupuestador muestra tres
   preguntas y abre WhatsApp con el mensaje ya escrito. La apuesta: con pocas obras
   hechas, un total grande sin contexto asusta y el cliente no vuelve; una
   conversación con el pedido ya armado convierte mejor y llega calificada.

   TEMPORAL: cuando `presupuestadorEnConstruccion` pase a false, esta vista deja de
   mostrarse. Para borrarla del todo: este archivo, su <script>, la sección
   #view-consulta y el bloque CONSULTA de construccion.css.
   ============================================================ */

(function () {

const CFG = window.CUBO_CONFIG || {};
const C   = CFG.contacto || {};

/* Los valores salen del data-valor de cada botón, redactados para que el mensaje
   se lea como lo escribiría una persona, no como un formulario.

   `genero` existe por la concordancia: "una cocina mediano" está mal escrito, y un
   mensaje mal redactado en el primer contacto resta justo donde queremos sumar.
   Cada ambiente declara su género y cada tamaño su forma femenina. */
const respuestas = {
  ambiente: 'un baño', genero: 'm',
  tamano: 'mediano', tamanoF: 'mediana',
  plazo: 'Me gustaría arrancar lo antes posible.',
};

function mensaje() {
  const tam = respuestas.genero === 'f' ? (respuestas.tamanoF || respuestas.tamano) : respuestas.tamano;
  return `Hola CUBO, quiero reformar ${respuestas.ambiente} ${tam}. ${respuestas.plazo}`;
}

function refrescar() {
  const a = document.getElementById('consulta-wpp');
  if (a && C.whatsapp) a.href = `https://wa.me/${C.whatsapp}?text=${encodeURIComponent(mensaje())}`;

  // Mostrar el mensaje antes de enviarlo baja la desconfianza de "¿qué les llega?"
  const p = document.getElementById('consulta-preview');
  if (p) p.textContent = `Vamos a mandar: "${mensaje()}"`;
}

function elegir(grupo, btn) {
  grupo.querySelectorAll('.opt-mini').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');

  const campo = grupo.dataset.campo;
  respuestas[campo] = btn.dataset.valor;
  if (campo === 'ambiente') respuestas.genero = btn.dataset.genero || 'm';
  if (campo === 'tamano')   respuestas.tamanoF = btn.dataset.valorF || btn.dataset.valor;

  refrescar();
}

/* El lead se guarda sin datos de contacto: todavía no los tenemos. Sirve para saber
   cuánta gente consulta y qué pide, aunque después no escriba por WhatsApp.
   Nunca bloquea la apertura del chat: si falla, el cliente igual se va a WhatsApp. */
function registrar() {
  const sb = window.CuboEstado;
  if (!sb || !sb.guardarLeadParcial) return;
  try {
    sb.guardarLeadParcial({
      nombre:    'Consulta web',
      telefono:  null,
      tipo_obra: respuestas.ambiente,
      mensaje:   mensaje(),
    });
  } catch (e) { /* el chat es lo que importa */ }
}

function iniciar() {
  document.querySelectorAll('.consulta-opts').forEach(grupo => {
    grupo.addEventListener('click', e => {
      const btn = e.target.closest('.opt-mini');
      if (btn) elegir(grupo, btn);
    });
  });

  const ig = document.getElementById('consulta-ig');
  if (ig && C.instagram) ig.href = `https://instagram.com/${C.instagram}`;
  else if (ig) ig.style.display = 'none';

  const wpp = document.getElementById('consulta-wpp');
  if (wpp) wpp.addEventListener('click', registrar);

  refrescar();
}

window.CuboConsulta = { iniciar };
})();
