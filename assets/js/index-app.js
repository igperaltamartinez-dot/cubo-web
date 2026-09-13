/* ============================================================
   INDEX-APP.JS — Lógica de la landing pública.
   - Carga foto hero desde landing_media (slot=hero)
   - Carga obras destacadas en bento grid
   - Carga datos de contacto en footer/drawer
   - Maneja el drawer mobile
   - Reveal-on-scroll
   ============================================================ */

const SUPABASE_URL = 'https://swxkfibuvbazvrclzxlx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Bma8p2yNKCQIMZTGu8fgiA_EPDGCi5y';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ── DRAWER MOBILE ── */
function abrirMenu() {
  document.getElementById('nav-drawer').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function cerrarMenu() {
  document.getElementById('nav-drawer').classList.remove('open');
  document.body.style.overflow = '';
}
window.abrirMenu = abrirMenu;
window.cerrarMenu = cerrarMenu;

/* ── REVEAL ON SCROLL ── */
(() => {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -10% 0px' });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
})();

/* ── HERO IMAGE ── */
async function cargarHero() {
  const { data } = await sb.from('landing_media').select('slot, url');
  if (!data) return;
  const hero = data.find(m => m.slot === 'hero' && m.url);
  if (hero) {
    document.getElementById('hero-img').src = hero.url;
  }
}

/* ── BENTO PROYECTOS ── */
/* El patrón de cuatro está pensado para grupos de 3 o más: la card grande ocupa
   dos filas y las chicas rellenan la columna de al lado. Con una o dos obras ese
   mismo patrón deja un hueco enorme a la derecha, así que esos casos tienen su
   propio reparto. */
const BENTO_LAYOUTS = ['big', 'med', 'small', 'wide'];

function layoutsDe(cantidad) {
  if (cantidad === 1) return ['wide'];
  if (cantidad === 2) return ['half', 'half'];
  return null;   // 3 o más: ciclo normal
}
let _obrasCache = {};

async function cargarBento() {
  const { data: obras } = await sb.from('obras_portfolio')
    .select('id, titulo, zona, tipo, imagen_url, descripcion, fase, fecha, fotos')
    .eq('activo', true)
    .not('imagen_url', 'is', null)
    .order('orden')
    .order('id', { ascending: false });

  _obrasCache = Object.fromEntries((obras || []).map(o => [o.id, o]));

  /* Cualquier fase desconocida cae en "realizada": si mañana alguien carga un
     valor nuevo desde el admin, la obra se sigue viendo en vez de desaparecer. */
  const enCurso  = (obras || []).filter(o => o.fase === 'en_curso');
  const proximas = (obras || []).filter(o => o.fase === 'proxima');
  const realizadas = (obras || []).filter(o => o.fase !== 'en_curso' && o.fase !== 'proxima');

  document.getElementById('bento-grid-realizadas').innerHTML = realizadas.length
    ? realizadas.map((o, i) => _bentoCard(o, i, layoutsDe(realizadas.length))).join('')
    : '<div class="bento-empty body-sm">Las fotos de obras realizadas van a aparecer acá pronto.</div>';

  _bloqueOpcional('en-curso-head', 'bento-grid-en-curso', enCurso);
  _bloqueOpcional('proximas-head', 'bento-grid-proximas', proximas);
}

/* Un bloque que solo existe si hay obras en esa fase: sin obras en curso, el
   título "Obras en curso." no tiene que aparecer vacío. */
function _bloqueOpcional(headId, gridId, obras) {
  const head = document.getElementById(headId);
  const grid = document.getElementById(gridId);
  if (!obras.length) { head.style.display = 'none'; grid.innerHTML = ''; return; }
  head.style.display = '';
  grid.innerHTML = obras.map((o, i) => _bentoCard(o, i, layoutsDe(obras.length))).join('');
}

function _bentoCard(o, i, layouts) {
  const clase = layouts ? layouts[i] : BENTO_LAYOUTS[i % BENTO_LAYOUTS.length];
  return `<button type="button" class="bento-card ${clase}" onclick="abrirProyModal('${o.id}')">
    <img src="${o.imagen_url}" alt="${o.titulo || 'Obra CUBO'}" loading="lazy">
    ${o.fase === 'en_curso'
      ? '<span class="bento-live"><span class="bento-live-dot"></span>En obra</span>' : ''}
    <div class="bento-info">
      ${o.tipo ? `<span class="bento-tipo">${o.tipo}</span>` : ''}
      <h4 class="bento-title">${o.titulo || 'Obra CUBO'}</h4>
      ${o.zona ? `<p class="bento-zona">${o.zona}</p>` : ''}
    </div>
  </button>`;
}

/* ── GALERÍA DEL MODAL ── */
let _gal = { fotos: [], idx: 0 };

function _galRender() {
  const track = document.getElementById('proy-gallery-track');
  const dots  = document.getElementById('proy-dots');
  const gallery = document.getElementById('proy-gallery');

  track.innerHTML = _gal.fotos.map((url, i) => `
    <div class="proy-gallery-slide">
      <img src="${url}" alt="" loading="${i === 0 ? 'eager' : 'lazy'}">
    </div>`).join('');
  dots.innerHTML = _gal.fotos.map((_, i) =>
    `<button type="button" class="proy-gallery-dot ${i === 0 ? 'active' : ''}" data-i="${i}" aria-label="Foto ${i+1}"></button>`
  ).join('');

  gallery.classList.toggle('multi', _gal.fotos.length > 1);
  _galGoTo(0, false);
}

function _galGoTo(i, animate = true) {
  if (!_gal.fotos.length) return;
  _gal.idx = Math.max(0, Math.min(_gal.fotos.length - 1, i));
  const track = document.getElementById('proy-gallery-track');
  track.style.transition = animate ? '' : 'none';
  track.style.transform = `translateX(${-_gal.idx * 100}%)`;
  if (!animate) requestAnimationFrame(() => { track.style.transition = ''; });
  document.getElementById('proy-counter').textContent = `${_gal.idx + 1} / ${_gal.fotos.length}`;
  document.querySelectorAll('.proy-gallery-dot').forEach((d, j) =>
    d.classList.toggle('active', j === _gal.idx)
  );
  document.getElementById('proy-prev').disabled = _gal.idx === 0;
  document.getElementById('proy-next').disabled = _gal.idx === _gal.fotos.length - 1;
}

function _galNext() { _galGoTo(_gal.idx + 1); }
function _galPrev() { _galGoTo(_gal.idx - 1); }

/* Swipe táctil */
(() => {
  let startX = 0, dx = 0, dragging = false;
  const viewport = () => document.querySelector('.proy-gallery-viewport');
  document.addEventListener('touchstart', (e) => {
    const vp = viewport();
    if (!vp || !vp.contains(e.target)) return;
    startX = e.touches[0].clientX; dx = 0; dragging = true;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    dx = e.touches[0].clientX - startX;
  }, { passive: true });
  document.addEventListener('touchend', () => {
    if (!dragging) return;
    if (Math.abs(dx) > 50) {
      if (dx < 0) _galNext(); else _galPrev();
    }
    dragging = false; dx = 0;
  });
})();

/* Teclado */
document.addEventListener('keydown', (e) => {
  const open = document.getElementById('proy-modal').classList.contains('open');
  if (!open) return;
  if (e.key === 'ArrowRight') _galNext();
  if (e.key === 'ArrowLeft')  _galPrev();
  if (e.key === 'Escape')     cerrarProyModal();
});

function abrirProyModal(id) {
  const o = _obrasCache[id];
  if (!o) return;

  const fotosExtra = Array.isArray(o.fotos) ? o.fotos.filter(Boolean) : [];
  _gal.fotos = [o.imagen_url, ...fotosExtra].filter(Boolean);
  _gal.idx = 0;
  _galRender();

  document.getElementById('proy-modal-titulo').textContent = o.titulo || '';
  document.getElementById('proy-modal-desc').textContent = o.descripcion || 'Pronto vamos a contar más sobre este proyecto.';

  const fase = document.getElementById('proy-modal-fase');
  const ETIQUETA_FASE = { proxima: 'Próxima obra', en_curso: 'Obra en curso' };
  if (ETIQUETA_FASE[o.fase]) { fase.textContent = ETIQUETA_FASE[o.fase]; fase.style.display = ''; }
  else { fase.style.display = 'none'; }

  const meta = [o.tipo, o.zona, o.fecha].filter(Boolean).join(' · ');
  document.getElementById('proy-modal-meta').textContent = meta;

  const modal = document.getElementById('proy-modal');
  const box = modal.querySelector('.proy-modal-box');
  box.scrollTop = 0;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function cerrarProyModal(e) {
  if (e && e.target.closest('.proy-modal-box') && !e.target.closest('.proy-modal-close')) return;
  document.getElementById('proy-modal').classList.remove('open');
  document.body.style.overflow = '';
}

document.getElementById('proy-prev').addEventListener('click', _galPrev);
document.getElementById('proy-next').addEventListener('click', _galNext);
document.getElementById('proy-dots').addEventListener('click', (e) => {
  const dot = e.target.closest('.proy-gallery-dot');
  if (dot) _galGoTo(+dot.dataset.i);
});

window.abrirProyModal = abrirProyModal;
window.cerrarProyModal = cerrarProyModal;

/* ── CONFIGURACIÓN (footer + drawer) ──
   La tabla `configuracion` no era legible por visitantes anónimos, así que el pie
   quedaba sin teléfono ni Instagram y nadie se enteraba: la consulta no falla,
   simplemente vuelve vacía. Ahora los datos de config.js son el piso, y lo que
   venga de la base los pisa. Así el footer funciona aunque la base no responda. */
async function cargarConfiguracion() {
  const local = (window.CUBO_CONFIG && window.CUBO_CONFIG.contacto) || {};
  const cfg = {
    email:     local.email     || null,
    telefono:  local.telefono  || null,
    instagram: local.instagram || null,
  };

  const { data } = await sb.from('configuracion').select('clave, valor');
  (data || []).forEach(r => { if (r.valor) cfg[r.clave] = r.valor; });

  document.querySelectorAll('.footer-email').forEach(el => {
    if (cfg.email) {
      el.href = 'mailto:' + cfg.email;
      el.textContent = cfg.email;
      el.style.display = '';
    }
  });
  /* Antes era un `tel:`, y el navegador preguntaba con qué aplicación abrirlo en vez
     de hacer nada útil. El número lo queremos para que escriban, no para que llamen:
     va directo a WhatsApp con el mensaje ya escrito. */
  document.querySelectorAll('.footer-tel').forEach(el => {
    if (!cfg.telefono) return;
    const numero = local.whatsapp || cfg.telefono.replace(/\D/g, '');
    el.href = `https://wa.me/${numero}?text=${encodeURIComponent(local.mensajeWhatsapp || '')}`;
    el.target = '_blank';
    el.rel = 'noopener';
    el.textContent = cfg.telefono;
    el.style.display = '';
  });
  document.querySelectorAll('.footer-instagram').forEach(el => {
    if (cfg.instagram) {
      const handle = cfg.instagram.startsWith('@') ? cfg.instagram : '@' + cfg.instagram;
      const user = handle.replace('@', '');
      el.href = 'https://instagram.com/' + user;
      el.textContent = handle;
      el.style.display = '';
    }
  });
}

/* ── INIT ── */
cargarHero();
cargarBento();
cargarConfiguracion();
