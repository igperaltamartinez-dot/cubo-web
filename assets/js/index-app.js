const SUPABASE_URL = 'https://swxkfibuvbazvrclzxlx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Bma8p2yNKCQIMZTGu8fgiA_EPDGCi5y';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const fmt = n => n > 0 ? '$' + Math.round(n).toLocaleString('es-AR') : null;

let categorias = [], itemsPorCat = {}, correlaciones = [];
let catActiva = null, carrito = {}, cantidades = {};
let leadGuardado = false, leadData = {};

// ── NAVEGACIÓN ──
function ir(sec) {
  document.querySelectorAll('section').forEach(s => s.classList.remove('act'));
  document.getElementById(sec).classList.add('act');
  document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('act'));
  const nl = document.getElementById('nl-' + sec);
  if (nl) nl.classList.add('act');
  window.scrollTo(0, 0);
  if (sec === 'cotizador') renderCot();
  if (sec === 'galeria') cargarGaleria();
}

// ── MODAL LEAD ──
function abrirModalLead() {
  if (leadGuardado) { ir('cotizador'); return; }
  document.getElementById('modal-lead').classList.add('open');
}

async function guardarLead() {
  const nombre = document.getElementById('ml-nombre').value.trim();
  const tel = document.getElementById('ml-tel').value.trim();
  const email = document.getElementById('ml-email').value.trim();
  const tipo = document.getElementById('ml-tipo').value;
  const zona = document.getElementById('ml-zona').value.trim();
  if (!nombre || !tel || !email || !zona) {
    alert('Por favor completá nombre, teléfono, email y zona.');
    return;
  }
  const btn = document.getElementById('ml-btn');
  btn.disabled = true; btn.textContent = 'Guardando...';
  const { error } = await sb.from('leads').insert({
    nombre, telefono: tel, email, tipo_obra: tipo || null, zona: zona || null, origen: 'cotizador'
  });
  if (error) console.error(error);
  leadGuardado = true;
  leadData = { nombre, telefono: tel, email, tipo_obra: tipo, zona };
  document.getElementById('modal-lead').classList.remove('open');
  document.getElementById('f-nombre').value = nombre;
  document.getElementById('f-tel').value = tel;
  document.getElementById('f-email').value = email;
  ir('cotizador');
}

// ── CARGA DATOS ──
async function cargarDatos() {
  const { data: cats } = await sb.from('categorias').select('*').eq('activo', true).order('orden');
  const { data: items } = await sb.from('items').select('*').eq('activo_publico', true).order('orden');
  const { data: corrs } = await sb.from('correlaciones').select('*').eq('activo', true);
  categorias = cats || [];
  correlaciones = corrs || [];
  itemsPorCat = {};
  (items || []).forEach(item => {
    if (!itemsPorCat[item.categoria_id]) itemsPorCat[item.categoria_id] = [];
    itemsPorCat[item.categoria_id].push(item);
  });
  if (categorias.length > 0) catActiva = categorias[0].id;
}

// ── RENDER COTIZADOR ──
function renderCot() {
  if (!categorias.length) { cargarDatos().then(renderCot); return; }
  const sb2 = document.getElementById('cot-sidebar');
  sb2.innerHTML = categorias.map(c => `
    <button class="cat-btn${c.id === catActiva ? ' act' : ''}" onclick="selCat('${c.id}')">
      <span>${c.emoji || ''}</span><span>${c.nombre}</span>
    </button>`).join('');
  renderItems(); renderResumen();
}

function selCat(id) { catActiva = id; renderCot(); }

function renderItems() {
  const cat = categorias.find(c => c.id === catActiva);
  const items = itemsPorCat[catActiva] || [];
  const area = document.getElementById('items-area');
  area.innerHTML = `<h2 class="items-titulo">${cat.emoji || ''} ${cat.nombre}</h2>` +
    (items.length === 0 ? '<p style="color:#bbb;font-size:13px;font-weight:600">No hay ítems en esta categoría todavía.</p>' :
    items.map(item => {
      const enc = carrito[item.id];
      const precioFinal = item.precio * (1 + (item.ajuste_porcentaje || 0) / 100);
      const precioStr = fmt(precioFinal);
      return `<div class="item-card${enc ? ' enc' : ''}">
        <div class="item-info">
          <p class="item-nom">${item.nombre}</p>
          ${item.descripcion ? `<p class="item-desc">${item.descripcion}</p>` : ''}
          ${precioStr
            ? `<p class="item-prec">${precioStr} <span>/ ${item.unidad}</span></p>`
            : `<p class="item-prec-cero">Precio a confirmar</p>`}
          ${enc ? `<p class="item-enc-lbl">✓ ${enc.cantidad} ${item.unidad} en presupuesto → ${fmt(enc.subtotal) || 'a confirmar'}</p>` : ''}
        </div>
        <div class="item-ctrl">
          <input class="cant-inp" type="number" id="c-${item.id}" min="0.1"
            step="${item.unidad === 'unidad' ? '1' : '0.5'}"
            value="${cantidades[item.id] || ''}"
            placeholder="${item.unidad === 'unidad' ? '1' : 'm²'}"
            oninput="cantidades['${item.id}']=this.value">
          <button class="agr-btn" onclick="agregar('${item.id}')">+ Agregar</button>
          ${enc ? `<button class="quit-btn" onclick="quitar('${item.id}')">×</button>` : ''}
        </div>
      </div>`;
    }).join(''));
}

function renderResumen() {
  const items = Object.values(carrito);
  const total = items.reduce((a, i) => a + i.subtotal, 0);
  const body = document.getElementById('res-body');
  if (!items.length) {
    body.innerHTML = '<p class="res-vacio">Todavía no agregaste ningún trabajo.<br>¡Empezá seleccionando ítems!</p>';
    return;
  }
  body.innerHTML = items.map(i => `
    <div class="res-item">
      <span class="res-item-nom">${i.nombre}<br>
        <span style="font-size:10px;color:#aaa;font-weight:500">${i.cantidad} ${i.unidad}</span>
      </span>
      <span class="res-item-prec">${fmt(i.subtotal) || 'A confirmar'}</span>
    </div>`).join('') +
    `<div class="res-total">
      <span class="res-total-lbl">Total orientativo</span>
      <span class="res-total-val">${total > 0 ? fmt(total) : 'A confirmar'}</span>
    </div>
    <p class="res-acl">* Precios referenciales. El valor final se confirma en visita técnica.</p>
    <button class="sol-btn" onclick="mostrarForm()">Solicitar presupuesto →</button>`;
}

// ── AGREGAR / QUITAR ──
function getAllItems() {
  return Object.values(itemsPorCat).flat();
}

function ejecutar(item, cant, extras) {
  const cA = carrito[item.id]?.cantidad || 0;
  const nC = cA + cant;
  const precioFinal = item.precio * (1 + (item.ajuste_porcentaje || 0) / 100);
  carrito[item.id] = { ...item, cantidad: nC, subtotal: nC * precioFinal };
  extras.forEach(e => {
    if (!carrito[e.id]) {
      const pf = e.precio * (1 + (e.ajuste_porcentaje || 0) / 100);
      carrito[e.id] = { ...e, cantidad: cant, subtotal: cant * pf };
    }
  });
  renderCot();
}

function agregar(id) {
  const allItems = getAllItems();
  const item = allItems.find(i => i.id === id);
  const cant = parseFloat(cantidades[id]) || 1;
  const corrs = correlaciones.filter(c => c.item_disparador_id === id);
  const extras = corrs.map(c => allItems.find(i => i.id === c.item_sugerido_id))
    .filter(Boolean).filter(e => !carrito[e.id]);
  if (extras.length && corrs.length) {
    document.getElementById('corr-items').innerHTML = extras.map(e =>
      `<div class="modal-corr-item">${e.nombre}</div>`).join('');
    document.getElementById('corr-msg').textContent = corrs[0].mensaje || '';
    document.getElementById('modal-corr').classList.add('open');
    document.getElementById('corr-ok').onclick = () => {
      ejecutar(item, cant, extras);
      document.getElementById('modal-corr').classList.remove('open');
    };
    document.getElementById('corr-skip').onclick = () => {
      ejecutar(item, cant, []);
      document.getElementById('modal-corr').classList.remove('open');
    };
  } else ejecutar(item, cant, []);
}

function quitar(id) { delete carrito[id]; renderCot(); }

// ── FORMULARIO FINAL ──
let catsPendientes = [];
let catPendienteIndex = 0;

function mostrarForm() {
  if (!leadGuardado) { abrirModalLead(); return; }
  if (Object.keys(carrito).length === 0) return;

  const catsConItems = new Set(Object.values(carrito).map(i => i.categoria_id));
  catsPendientes = categorias.filter(c =>
    c.activo && c.mensaje_alerta && !catsConItems.has(c.id)
  );
  catPendienteIndex = 0;

  if (catsPendientes.length > 0) {
    mostrarAlertaCategoria();
  } else {
    irAFormulario();
  }
}

function mostrarAlertaCategoria() {
  if (catPendienteIndex >= catsPendientes.length) { irAFormulario(); return; }
  const cat = catsPendientes[catPendienteIndex];
  document.getElementById('alerta-emoji').textContent = cat.emoji || '💡';
  document.getElementById('alerta-nombre').textContent = cat.nombre;
  document.getElementById('alerta-mensaje').textContent = cat.mensaje_alerta;
  document.getElementById('alerta-contador').textContent =
    catsPendientes.length > 1 ? `${catPendienteIndex + 1} de ${catsPendientes.length}` : '';
  document.getElementById('modal-alerta').classList.add('open');
}

function alertaIrACat() {
  const cat = catsPendientes[catPendienteIndex];
  document.getElementById('modal-alerta').classList.remove('open');
  catActiva = cat.id;
  renderCot();
}

function alertaContinuar() {
  document.getElementById('modal-alerta').classList.remove('open');
  catPendienteIndex++;
  if (catPendienteIndex < catsPendientes.length) {
    setTimeout(mostrarAlertaCategoria, 200);
  } else {
    irAFormulario();
  }
}

function irAFormulario() {
  document.getElementById('cot-main-view').style.display = 'none';
  document.getElementById('cot-form-view').style.display = 'block';
  const items = Object.values(carrito);
  const total = items.reduce((a, i) => a + i.subtotal, 0);
  document.getElementById('form-resumen').innerHTML =
    items.map(i => `<div class="res-mini-item">
      <span>${i.nombre} × ${i.cantidad} ${i.unidad}</span>
      <span>${fmt(i.subtotal) || 'A confirmar'}</span>
    </div>`).join('') +
    `<div class="res-mini-tot">
      <span>Total orientativo</span>
      <span>${total > 0 ? fmt(total) : 'A confirmar'}</span>
    </div>`;
}

function mostrarCot() {
  document.getElementById('cot-main-view').style.display = 'block';
  document.getElementById('cot-form-view').style.display = 'none';
  document.getElementById('cot-gracias-view').style.display = 'none';
}

async function enviar() {
  const nombre = document.getElementById('f-nombre').value.trim();
  const tel = document.getElementById('f-tel').value.trim();
  const email = document.getElementById('f-email').value.trim();
  const msg = document.getElementById('f-msg').value.trim();
  if (!nombre || !tel || !email) return;
  const btn = document.getElementById('env-btn');
  btn.disabled = true; btn.textContent = 'Enviando...';
  const items = Object.values(carrito);
  const total = items.reduce((a, i) => a + i.subtotal, 0);
  await sb.from('leads').upsert({
    nombre, telefono: tel, email,
    tipo_obra: leadData.tipo_obra || null,
    zona: leadData.zona || null,
    mensaje: msg || null,
    presupuesto_total: total || null,
    items_seleccionados: items.map(i => ({ id: i.id, nombre: i.nombre, cantidad: i.cantidad, unidad: i.unidad, subtotal: i.subtotal })),
    estado: 'nuevo', origen: 'cotizador'
  }, { onConflict: 'email' });
  document.getElementById('cot-form-view').style.display = 'none';
  document.getElementById('cot-gracias-view').style.display = 'block';
  document.getElementById('grac-nombre').textContent = '¡Gracias, ' + nombre + '!';
  document.getElementById('grac-res').innerHTML =
    `<p style="font-weight:800;margin-bottom:8px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--gris-oscuro)">Tu selección:</p>` +
    items.map(i => `<div style="display:flex;justify-content:space-between;margin-bottom:4px;color:#555;font-size:12px;font-weight:600">
      <span>${i.nombre} × ${i.cantidad} ${i.unidad}</span>
      <span>${fmt(i.subtotal) || 'A confirmar'}</span>
    </div>`).join('') +
    `<div style="display:flex;justify-content:space-between;font-weight:900;margin-top:10px;padding-top:8px;border-top:1px solid var(--gris-claro);font-size:13px">
      <span>Total orientativo</span>
      <span>${total > 0 ? fmt(total) : 'A confirmar'}</span>
    </div>`;
}

function reiniciar() {
  carrito = {}; cantidades = {};
  ['f-nombre','f-tel','f-email','f-msg'].forEach(id => document.getElementById(id).value = '');
  const btn = document.getElementById('env-btn');
  btn.disabled = false; btn.textContent = 'Solicitar presupuesto →';
  mostrarCot(); renderCot();
}

// ── GALERÍA DE OBRAS ──

let _galeriaCargada = false;

async function cargarGaleria() {
  if (_galeriaCargada) return;
  const grid = document.getElementById('galeria-grid');
  if (!grid) return;

  const { data: obras } = await sb.from('obras')
    .select('id, titulo, zona, tipo, imagen_url')
    .not('imagen_url', 'is', null)
    .order('id', { ascending: false })
    .limit(9);

  if (!obras || !obras.length) {
    grid.innerHTML = '<div class="galeria-empty">Las fotos de obras realizadas aparecerán acá.</div>';
    return;
  }

  grid.innerHTML = obras.map(o => `
    <div class="obra-card">
      <img class="obra-img" src="${o.imagen_url}" alt="${o.titulo || 'Obra CUBO'}" loading="lazy">
      <div class="obra-overlay"></div>
      <div class="obra-info">
        ${o.tipo ? `<p class="obra-tipo">${o.tipo}</p>` : ''}
        <p class="obra-titulo">${o.titulo || 'Obra CUBO'}</p>
        ${o.zona ? `<p class="obra-zona">${o.zona}</p>` : ''}
      </div>
    </div>`).join('');

  _galeriaCargada = true;
}

async function cargarFotosLanding() {
  const { data } = await sb.from('landing_media').select('slot, url');
  if (!data) return;
  data.forEach(m => {
    if (m.slot === 'quienes' && m.url) {
      const wrap = document.getElementById('quienes-foto-wrap');
      const img  = document.getElementById('quienes-foto');
      if (wrap && img) { img.src = m.url; wrap.classList.add('visible'); }
    }
  });
}

async function cargarCtaNum() {
  const el = document.getElementById('cta-num');
  if (!el) return;
  const { count } = await sb.from('items')
    .select('id', { count: 'exact', head: true })
    .eq('activo_publico', true);
  if (count > 0) el.textContent = count;
}

// ── CONFIGURACIÓN / FOOTER ──
async function cargarConfiguracion() {
  const { data } = await sb.from('configuracion').select('clave, valor');
  if (!data) return;
  const cfg = Object.fromEntries(data.map(r => [r.clave, r.valor]));

  document.querySelectorAll('.footer-email').forEach(el => {
    if (cfg.email) { el.href = 'mailto:' + cfg.email; el.textContent = cfg.email; el.style.display = ''; }
  });
  document.querySelectorAll('.footer-tel').forEach(el => {
    if (cfg.telefono) { el.href = 'tel:' + cfg.telefono.replace(/\s/g, ''); el.textContent = cfg.telefono; el.style.display = ''; }
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
  document.querySelectorAll('.footer-zona').forEach(el => {
    if (cfg.zona) { el.textContent = cfg.zona; el.style.display = ''; }
  });
}

// ── INIT ──
cargarDatos().then(() => {
  if (document.getElementById('cotizador').classList.contains('act')) renderCot();
  document.getElementById('btn-alerta-ir').addEventListener('click', alertaIrACat);
  document.getElementById('btn-alerta-skip').addEventListener('click', alertaContinuar);
});
cargarConfiguracion();
cargarCtaNum();
cargarFotosLanding();
