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

async function cargarBento() {
  const grid = document.getElementById('bento-grid');
  const { data: obras } = await sb.from('obras')
    .select('id, titulo, zona, tipo, imagen_url')
    .not('imagen_url', 'is', null)
    .order('id', { ascending: false })
    .limit(4);

  if (!obras || !obras.length) {
    grid.innerHTML = '<div class="bento-empty body-sm">Las fotos de obras realizadas van a aparecer acá pronto.</div>';
    return;
  }

  grid.innerHTML = obras.map((o, i) => `
    <a class="bento-card ${BENTO_LAYOUTS[i % BENTO_LAYOUTS.length]}" href="presupuestador.html">
      <img src="${o.imagen_url}" alt="${o.titulo || 'Obra CUBO'}" loading="lazy">
      <div class="bento-info">
        ${o.tipo ? `<span class="bento-tipo">${o.tipo}</span>` : ''}
        <h4 class="bento-title">${o.titulo || 'Obra CUBO'}</h4>
        ${o.zona ? `<p class="bento-zona">${o.zona}</p>` : ''}
      </div>
    </a>
  `).join('');
}

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
