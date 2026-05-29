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
const BENTO_LAYOUTS = ['big', 'med', 'small', 'wide'];
let _obrasCache = {};

async function cargarBento() {
  const gridReal = document.getElementById('bento-grid-realizadas');
  const gridProx = document.getElementById('bento-grid-proximas');
  const headProx = document.getElementById('proximas-head');

  const { data: obras } = await sb.from('obras')
    .select('id, titulo, zona, tipo, imagen_url, descripcion, fase, fecha')
    .eq('activo', true)
    .not('imagen_url', 'is', null)
    .order('orden')
    .order('id', { ascending: false });

  const realizadas = (obras || []).filter(o => o.fase !== 'proxima');
  const proximas   = (obras || []).filter(o => o.fase === 'proxima');

  _obrasCache = Object.fromEntries((obras || []).map(o => [o.id, o]));

  gridReal.innerHTML = realizadas.length
    ? realizadas.map((o, i) => _bentoCard(o, i)).join('')
    : '<div class="bento-empty body-sm">Las fotos de obras realizadas van a aparecer acá pronto.</div>';

  if (proximas.length) {
    headProx.style.display = '';
    gridProx.innerHTML = proximas.map((o, i) => _bentoCard(o, i)).join('');
  }
}

function _bentoCard(o, i) {
  return `<button type="button" class="bento-card ${BENTO_LAYOUTS[i % BENTO_LAYOUTS.length]}" onclick="abrirProyModal('${o.id}')">
    <img src="${o.imagen_url}" alt="${o.titulo || 'Obra CUBO'}" loading="lazy">
    <div class="bento-info">
      ${o.tipo ? `<span class="bento-tipo">${o.tipo}</span>` : ''}
      <h4 class="bento-title">${o.titulo || 'Obra CUBO'}</h4>
      ${o.zona ? `<p class="bento-zona">${o.zona}</p>` : ''}
    </div>
  </button>`;
}

function abrirProyModal(id) {
  const o = _obrasCache[id];
  if (!o) return;
  const modal = document.getElementById('proy-modal');
  document.getElementById('proy-modal-img').src = o.imagen_url;
  document.getElementById('proy-modal-img').alt = o.titulo || '';
  document.getElementById('proy-modal-titulo').textContent = o.titulo || '';
  document.getElementById('proy-modal-desc').textContent = o.descripcion || 'Pronto vamos a contar más sobre este proyecto.';

  const fase = document.getElementById('proy-modal-fase');
  if (o.fase === 'proxima') { fase.textContent = 'Próxima obra'; fase.style.display = ''; }
  else { fase.style.display = 'none'; }

  const meta = [o.tipo, o.zona, o.fecha].filter(Boolean).join(' · ');
  document.getElementById('proy-modal-meta').textContent = meta;

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function cerrarProyModal(e) {
  if (e && e.target.closest('.proy-modal-box') && !e.target.closest('.proy-modal-close')) return;
  document.getElementById('proy-modal').classList.remove('open');
  document.body.style.overflow = '';
}
window.abrirProyModal = abrirProyModal;
window.cerrarProyModal = cerrarProyModal;

/* ── CONFIGURACIÓN (footer + drawer) ── */
async function cargarConfiguracion() {
  const { data } = await sb.from('configuracion').select('clave, valor');
  if (!data) return;
  const cfg = Object.fromEntries(data.map(r => [r.clave, r.valor]));

  document.querySelectorAll('.footer-email').forEach(el => {
    if (cfg.email) {
      el.href = 'mailto:' + cfg.email;
      el.textContent = cfg.email;
      el.style.display = '';
    }
  });
  document.querySelectorAll('.footer-tel').forEach(el => {
    if (cfg.telefono) {
      el.href = 'tel:' + cfg.telefono.replace(/\s/g, '');
      el.textContent = cfg.telefono;
      el.style.display = '';
    }
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
