/* ============================================================
   PRESUPUESTADOR-APP.JS — Lógica del cotizador online.
   Flujo: lead → cotizador → form → gracias.
   ============================================================ */

const SUPABASE_URL = 'https://swxkfibuvbazvrclzxlx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Bma8p2yNKCQIMZTGu8fgiA_EPDGCi5y';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const fmt = n => n > 0 ? '$' + Math.round(n).toLocaleString('es-AR') : null;

function toast(msg) {
  let el = document.getElementById('cubo-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cubo-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 3500);
}

/* ── ESTADO ── */
let categorias = [], itemsPorCat = {}, correlaciones = [];
let catActiva = null, carrito = {}, cantidades = {};
let leadData = {};
let datosCargados = false;

/* ── NAVEGACIÓN ENTRE VISTAS ── */
const VIEWS = ['view-lead', 'view-cot', 'view-form', 'view-gracias'];
const STEP_LABELS = {
  'view-lead':    { text: 'Paso 1 de 3 · Tus datos',         pct: 33  },
  'view-cot':     { text: 'Paso 2 de 3 · Cotizador',         pct: 66  },
  'view-form':    { text: 'Paso 3 de 3 · Confirmación',      pct: 100 },
  'view-gracias': { text: 'Listo · Solicitud enviada',       pct: 100 },
};

function mostrarVista(id) {
  VIEWS.forEach(v => document.getElementById(v).classList.toggle('active', v === id));
  const step = STEP_LABELS[id];
  if (step) {
    document.getElementById('nav-step').textContent = step.text;
    document.getElementById('step-bar-fill').style.width = step.pct + '%';
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── VISTA 1: CAPTACIÓN DE LEAD ── */
async function guardarLead() {
  const nombre = document.getElementById('ml-nombre').value.trim();
  const tel    = document.getElementById('ml-tel').value.trim();
  const email  = document.getElementById('ml-email').value.trim();
  const tipo   = document.getElementById('ml-tipo').value;
  const zona   = document.getElementById('ml-zona').value.trim();

  if (!nombre || !tel || !email || !zona) {
    toast('Completá nombre, teléfono, email y zona.');
    return;
  }

  const btn = document.getElementById('ml-btn');
  btn.disabled = true;
  btn.innerHTML = 'Guardando…';

  const { error } = await sb.from('leads').insert({
    nombre, telefono: tel, email,
    tipo_obra: tipo || null,
    zona: zona || null,
    origen: 'cotizador'
  });

  if (error) console.error(error);

  leadData = { nombre, telefono: tel, email, tipo_obra: tipo, zona };

  if (!datosCargados) await cargarDatos();
  mostrarVista('view-cot');
  renderCot();
  actualizarBottomBar();
  document.getElementById('cot-bottombar').classList.add('visible');

  btn.disabled = false;
  btn.innerHTML = 'Ir al cotizador <span class="material-symbols-outlined">arrow_forward</span>';
}
window.guardarLead = guardarLead;

/* ── VISTA 2: COTIZADOR — CARGA DE DATOS ── */
async function cargarDatos() {
  const [catsRes, recsRes, corrsRes] = await Promise.all([
    sb.from('categorias').select('*').eq('activo', true).order('orden'),
    sb.from('recetas').select('*').eq('activo_publico', true).order('orden'),
    sb.from('correlaciones').select('*').eq('activo', true),
  ]);

  categorias    = catsRes.data || [];
  correlaciones = corrsRes.data || [];
  const recetas = recsRes.data || [];

  let precioPorReceta = {};
  if (recetas.length) {
    const recetaIds = recetas.map(r => r.id);
    const { data: comps } = await sb.from('receta_componentes')
      .select('receta_id, tipo, sismat_id, cantidad')
      .in('receta_id', recetaIds);

    // Agrupamos por tipo (PK compuesta en sismat_catalog)
    const idsPorTipo = { material: new Set(), mano_de_obra: new Set() };
    (comps || []).forEach(c => { idsPorTipo[c.tipo]?.add(c.sismat_id); });

    const partes = [];
    Object.entries(idsPorTipo).forEach(([t, set]) => {
      if (set.size) partes.push(`and(tipo.eq.${t},sismat_id.in.(${[...set].join(',')}))`);
    });

    let cat = [];
    if (partes.length) {
      const { data } = await sb.from('sismat_catalog')
        .select('tipo, sismat_id, precio_sismat')
        .or(partes.join(','));
      cat = data || [];
    }
    const precioSismat = Object.fromEntries(cat.map(s => [`${s.tipo}:${s.sismat_id}`, s.precio_sismat || 0]));
    (comps || []).forEach(c => {
      const sub = (precioSismat[`${c.tipo}:${c.sismat_id}`] || 0) * (c.cantidad || 0);
      precioPorReceta[c.receta_id] = (precioPorReceta[c.receta_id] || 0) + sub;
    });
  }

  const markupPorCat = Object.fromEntries(
    categorias.map(c => [c.id, c.markup_porcentaje != null ? c.markup_porcentaje : 30])
  );

  itemsPorCat = {};
  recetas.forEach(r => {
    const base   = precioPorReceta[r.id] || 0;
    const markup = markupPorCat[r.categoria_id] != null ? markupPorCat[r.categoria_id] : 30;
    const precio = base * (1 + markup / 100);
    const item = {
      id: r.id,
      nombre: r.nombre,
      descripcion: r.descripcion,
      unidad: r.unidad,
      precio,
      ajuste_porcentaje: r.ajuste_porcentaje || 0,
      categoria_id: r.categoria_id,
    };
    if (!itemsPorCat[r.categoria_id]) itemsPorCat[r.categoria_id] = [];
    itemsPorCat[r.categoria_id].push(item);
  });

  if (categorias.length > 0) catActiva = categorias[0].id;
  datosCargados = true;
}

/* ── VISTA 2: COTIZADOR — RENDER ── */
function renderCot() {
  if (!categorias.length) return;

  const sidebar = document.getElementById('cot-sidebar');
  const cuentaPorCat = {};
  Object.values(carrito).forEach(i => {
    cuentaPorCat[i.categoria_id] = (cuentaPorCat[i.categoria_id] || 0) + 1;
  });

  sidebar.innerHTML = categorias.map(c => {
    const count = cuentaPorCat[c.id] || 0;
    return `<button class="cat-btn ${c.id === catActiva ? 'active' : ''}" onclick="selCat('${c.id}')">
      <span>${c.nombre}</span>
      ${count > 0 ? `<span class="cat-btn-count">${count}</span>` : ''}
    </button>`;
  }).join('');

  renderItems();
  renderResumen();
}

function selCat(id) {
  catActiva = id;
  renderCot();
  if (window.innerWidth < 768) {
    document.getElementById('cot-items').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
window.selCat = selCat;

const ABREV_UNIDAD = { 'm²': 'm²', 'm2': 'm²', 'm³': 'm³', 'm3': 'm³', 'ml': 'ml', 'global': 'gl', 'unidad': 'un', 'un': 'un' };
function abrevUnidad(u) {
  const k = (u || '').trim().toLowerCase();
  return ABREV_UNIDAD[k] || (u || '').trim() || 'cant.';
}

function renderItems() {
  const cat   = categorias.find(c => c.id === catActiva);
  const items = itemsPorCat[catActiva] || [];
  const area  = document.getElementById('cot-items');

  const head = `<div class="cot-items-head">
    <h2>${cat.nombre}</h2>
    ${cat.descripcion ? `<p>${cat.descripcion}</p>` : ''}
  </div>`;

  if (items.length === 0) {
    area.innerHTML = head + '<p class="body-sm" style="color:var(--secondary);padding:20px 0">No hay trabajos en esta categoría todavía.</p>';
    return;
  }

  area.innerHTML = head + items.map(item => {
    const enc = carrito[item.id];
    const precioFinal = item.precio * (1 + (item.ajuste_porcentaje || 0) / 100);
    const precioStr   = fmt(precioFinal);
    return `<div class="item-card ${enc ? 'enc' : ''}">
      <div class="item-info">
        <p class="item-nom">${item.nombre}</p>
        ${item.descripcion ? `<p class="item-desc">${item.descripcion}</p>` : ''}
        ${precioStr
          ? `<p class="item-prec">${precioStr}<span>/ ${item.unidad}</span></p>`
          : `<p class="item-prec-cero">Precio a confirmar</p>`}
        ${enc ? `<p class="item-enc-lbl">
          <span class="material-symbols-outlined">check</span>
          ${enc.cantidad} ${item.unidad} · ${fmt(enc.subtotal) || 'a confirmar'}
        </p>` : ''}
      </div>
      <div class="item-ctrl">
        <input class="cant-inp" type="number" id="c-${item.id}" min="0.1"
          step="${item.unidad === 'unidad' ? '1' : '0.5'}"
          value="${cantidades[item.id] || ''}"
          placeholder="${abrevUnidad(item.unidad)}"
          oninput="cantidades['${item.id}']=this.value"
          inputmode="decimal">
        <button class="agr-btn" onclick="agregar('${item.id}')">${enc ? 'Sumar' : 'Agregar'}</button>
        ${enc ? `<button class="quit-btn" onclick="quitar('${item.id}')" aria-label="Quitar">
          <span class="material-symbols-outlined">close</span>
        </button>` : ''}
      </div>
    </div>`;
  }).join('');
}

function renderResumen() {
  const items = Object.values(carrito);
  const total = items.reduce((a, i) => a + i.subtotal, 0);
  const body  = document.getElementById('cot-resumen-body');

  if (!items.length) {
    body.innerHTML = '<p class="body-sm cot-vacio">Empezá seleccionando trabajos en cada categoría.</p>';
    return;
  }

  body.innerHTML = items.map(i => `
    <div class="res-item">
      <span class="res-item-nom">${i.nombre}<small>${i.cantidad} ${i.unidad}</small></span>
      <span class="res-item-prec">${fmt(i.subtotal) || 'A confirmar'}</span>
    </div>`).join('') +
    `<div class="res-total">
      <span class="res-total-lbl">Total</span>
      <span class="res-total-val">${total > 0 ? fmt(total) : 'A conf.'}</span>
    </div>
    <p class="res-acl">Precios referenciales. El valor final se confirma en visita técnica.</p>
    <button class="btn btn-primary sol-btn" onclick="mostrarForm()">
      Solicitar presupuesto
      <span class="material-symbols-outlined">arrow_forward</span>
    </button>`;
}

function actualizarBottomBar() {
  const items = Object.values(carrito);
  const total = items.reduce((a, i) => a + i.subtotal, 0);
  document.getElementById('cot-bb-total').textContent = total > 0 ? fmt(total) : '$0';
}

/* ── COTIZADOR — AGREGAR / QUITAR ── */
function getAllItems() { return Object.values(itemsPorCat).flat(); }

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
  actualizarBottomBar();
}

function agregar(id) {
  const allItems = getAllItems();
  const item = allItems.find(i => i.id === id);
  const cant = parseFloat(cantidades[id]) || 1;

  const corrs       = correlaciones.filter(c => c.receta_disparadora_id === id);
  const obligatorias = corrs.filter(c => c.obligatoria);
  const sugeridas    = corrs.filter(c => !c.obligatoria);

  const extrasObl = obligatorias
    .map(c => allItems.find(i => i.id === c.receta_sugerida_id))
    .filter(Boolean).filter(e => !carrito[e.id]);
  const extrasSug = sugeridas
    .map(c => ({ item: allItems.find(i => i.id === c.receta_sugerida_id), mensaje: c.mensaje }))
    .filter(p => p.item && !carrito[p.item.id]);

  if (extrasObl.length) {
    toast('Se agregó automáticamente: ' + extrasObl.map(e => e.nombre).join(', '));
  }

  if (extrasSug.length) {
    document.getElementById('corr-items').innerHTML = extrasSug
      .map(p => `<div class="corr-item">${p.item.nombre}</div>`).join('');
    document.getElementById('corr-msg').textContent = extrasSug
      .map(p => p.mensaje).filter(Boolean).join(' · ');
    document.getElementById('modal-corr').classList.add('open');
    document.getElementById('corr-ok').onclick = () => {
      ejecutar(item, cant, [...extrasObl, ...extrasSug.map(p => p.item)]);
      cerrarCorr();
    };
    document.getElementById('corr-skip').onclick = () => {
      ejecutar(item, cant, extrasObl);
      cerrarCorr();
    };
  } else {
    ejecutar(item, cant, extrasObl);
  }
}
window.agregar = agregar;

function quitar(id) {
  delete carrito[id];
  renderCot();
  actualizarBottomBar();
}
window.quitar = quitar;

function cerrarCorr() {
  document.getElementById('modal-corr').classList.remove('open');
}
window.cerrarCorr = cerrarCorr;

/* ── RESUMEN MOBILE (modal) ── */
function abrirResumenMobile() {
  const items = Object.values(carrito);
  const total = items.reduce((a, i) => a + i.subtotal, 0);
  const body = document.getElementById('modal-resumen-body');

  if (!items.length) {
    body.innerHTML = '<p class="body-md cot-vacio">Todavía no agregaste trabajos.</p>';
  } else {
    body.innerHTML = items.map(i => `
      <div class="res-item">
        <span class="res-item-nom">${i.nombre}<small>${i.cantidad} ${i.unidad}</small></span>
        <span class="res-item-prec">${fmt(i.subtotal) || 'A confirmar'}</span>
      </div>`).join('') +
      `<div class="res-total">
        <span class="res-total-lbl">Total orientativo</span>
        <span class="res-total-val">${total > 0 ? fmt(total) : 'A confirmar'}</span>
      </div>
      <p class="res-acl">Precios referenciales. El valor final se confirma en visita técnica.</p>
      <button class="btn btn-primary sol-btn" onclick="cerrarResumenMobile();mostrarForm()">
        Solicitar presupuesto
        <span class="material-symbols-outlined">arrow_forward</span>
      </button>`;
  }
  document.getElementById('modal-resumen-mobile').classList.add('open');
}
window.abrirResumenMobile = abrirResumenMobile;

function cerrarResumenMobile() {
  document.getElementById('modal-resumen-mobile').classList.remove('open');
}
window.cerrarResumenMobile = cerrarResumenMobile;

/* ── VISTA 3: FORM FINAL ── */
let catsPendientes = [];
let catPendienteIndex = 0;

function mostrarForm() {
  if (Object.keys(carrito).length === 0) {
    toast('Agregá al menos un trabajo antes de continuar.');
    return;
  }

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
window.mostrarForm = mostrarForm;

function mostrarAlertaCategoria() {
  if (catPendienteIndex >= catsPendientes.length) { irAFormulario(); return; }
  const cat = catsPendientes[catPendienteIndex];
  document.getElementById('alerta-nombre').textContent = cat.nombre;
  document.getElementById('alerta-mensaje').textContent = cat.mensaje_alerta;
  document.getElementById('alerta-contador').textContent =
    catsPendientes.length > 1 ? `Sugerencia ${catPendienteIndex + 1} de ${catsPendientes.length}` : '';
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
window.alertaContinuar = alertaContinuar;

function irAFormulario() {
  const items = Object.values(carrito);
  const total = items.reduce((a, i) => a + i.subtotal, 0);
  document.getElementById('form-resumen').innerHTML =
    items.map(i => `<div class="res-mini-item">
      <span>${i.nombre} · ${i.cantidad} ${i.unidad}</span>
      <span>${fmt(i.subtotal) || 'A confirmar'}</span>
    </div>`).join('') +
    `<div class="res-mini-tot">
      <span>Total orientativo</span>
      <span>${total > 0 ? fmt(total) : 'A confirmar'}</span>
    </div>`;
  document.getElementById('cot-bottombar').classList.remove('visible');
  mostrarVista('view-form');
}

function volverACotizador() {
  mostrarVista('view-cot');
  document.getElementById('cot-bottombar').classList.add('visible');
}
window.volverACotizador = volverACotizador;

async function enviar() {
  const msg = document.getElementById('f-msg').value.trim();
  const btn = document.getElementById('env-btn');
  btn.disabled = true;
  btn.innerHTML = 'Enviando…';

  const items = Object.values(carrito);
  const total = items.reduce((a, i) => a + i.subtotal, 0);

  await sb.from('leads').upsert({
    nombre: leadData.nombre,
    telefono: leadData.telefono,
    email: leadData.email,
    tipo_obra: leadData.tipo_obra || null,
    zona: leadData.zona || null,
    mensaje: msg || null,
    presupuesto_total: total || null,
    items_seleccionados: items.map(i => ({
      id: i.id, nombre: i.nombre, cantidad: i.cantidad, unidad: i.unidad, subtotal: i.subtotal
    })),
    estado: 'nuevo',
    origen: 'cotizador'
  }, { onConflict: 'email' });

  document.getElementById('grac-nombre').textContent = '¡Gracias, ' + leadData.nombre + '!';
  document.getElementById('grac-resumen').innerHTML =
    `<p class="label-caps">Tu selección</p>` +
    items.map(i => `<div class="res-mini-item">
      <span>${i.nombre} · ${i.cantidad} ${i.unidad}</span>
      <span>${fmt(i.subtotal) || 'A confirmar'}</span>
    </div>`).join('') +
    `<div class="res-mini-tot">
      <span>Total orientativo</span>
      <span>${total > 0 ? fmt(total) : 'A confirmar'}</span>
    </div>`;

  mostrarVista('view-gracias');
  btn.disabled = false;
  btn.innerHTML = 'Enviar solicitud <span class="material-symbols-outlined">arrow_forward</span>';
}
window.enviar = enviar;

function reiniciar() {
  carrito = {};
  cantidades = {};
  document.getElementById('f-msg').value = '';
  mostrarVista('view-cot');
  renderCot();
  actualizarBottomBar();
  document.getElementById('cot-bottombar').classList.add('visible');
}
window.reiniciar = reiniciar;

/* ── INIT ── */
document.getElementById('btn-alerta-ir').addEventListener('click', alertaIrACat);
document.getElementById('btn-alerta-skip').addEventListener('click', alertaContinuar);
