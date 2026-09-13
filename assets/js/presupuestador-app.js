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

/* ── ESTADO ──
   itemsPorId  → todas las recetas del cotizador. Es lo que consultan el motor de
                 correlaciones y las plantillas del flujo guiado.
   itemsPorCat → solo las que además se muestran como card en el modo experto.
   La distinción existe porque recetas como "carpeta de nivelación" tienen que
   poder entrar por correlación sin figurar como card suelta en el catálogo. */
let categorias = [], itemsPorCat = {}, itemsPorId = {}, correlaciones = [];
let catActiva = null, carrito = {}, cantidades = {};
let leadData = {};
let leadId = null;
let datosCargados = false;

/* ── NAVEGACIÓN ENTRE VISTAS ──
   modo 'guiado'  → flujo por preguntas (baño). El catálogo es el modo experto.
   modo 'catalogo'→ cotizador por ítems directo (resto de los tipos de obra). */
const VIEWS = ['view-consulta', 'view-inicio', 'view-guia', 'view-cot', 'view-form', 'view-gracias'];
let modo = 'guiado';

/* ── MODO OBRA ──
   El cotizador se está terminando mientras el Instagram ya está al aire. Con el
   interruptor puesto, /presupuestador muestra la pantalla de obra y el flujo real
   queda accesible con ?acceso=<clave>, que se recuerda en ese navegador.
   Ojo: la clave está en el JS. No es una barrera de seguridad, es un cartel. */
const CFG = window.CUBO_CONFIG || {};
const EN_OBRA = (() => {
  if (!CFG.presupuestadorEnConstruccion) return false;
  try {
    const q = new URLSearchParams(location.search).get('acceso');
    if (q) localStorage.setItem('cubo_acceso', q);
    return localStorage.getItem('cubo_acceso') !== CFG.claveAcceso;
  } catch (e) {
    return true;   // sin storage no hay forma de recordar el acceso: se ve la obra
  }
})();

/* Mientras el cotizador esté en obra, el único que llega hasta acá es quien tiene
   la clave — o sea, nosotros probando. Esos leads se marcan aparte para que no se
   mezclen con los reales en el CRM. */
const ORIGEN_LEAD = CFG.presupuestadorEnConstruccion ? 'prueba' : 'cotizador';

const STEP_LABELS = {
  'view-inicio':  { text: 'Empecemos',                       pct: 8   },
  'view-cot':     { text: 'Elegí los trabajos',              pct: 60  },
  'view-form':    { text: 'Confirmación',                    pct: 92  },
  'view-gracias': { text: 'Listo · Solicitud enviada',       pct: 100 },
  // view-guia maneja su propio label y barra: los pasos son dinámicos
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

/* ── PERSISTENCIA DEL LEAD ──
   Se guarda apenas tenemos nombre y teléfono, para no perder al que abandona a
   mitad de camino, y después se completa la MISMA fila por id. Antes el cierre
   hacía upsert por email: dos personas con el mismo mail se pisaban entre sí. */
let leadPersistido = false;

async function guardarLeadParcial(datos) {
  // El id se genera acá porque la política RLS no deja leer de vuelta la fila
  // recién insertada — y está bien que no deje: los leads no son públicos.
  leadId = (crypto.randomUUID ? crypto.randomUUID() : null);
  if (!leadId) return null;

  const { error } = await sb.from('leads').insert({
    id:        leadId,
    nombre:    datos.nombre,
    telefono:  datos.telefono,
    email:     datos.email || null,
    tipo_obra: datos.tipo_obra || null,
    zona:      datos.zona || null,
    estado:    'nuevo',
    origen:    ORIGEN_LEAD
  });

  if (error) {
    // Antes de la migración 010, leads.email es NOT NULL y esto falla. No es
    // bloqueante: se guarda todo junto al confirmar.
    console.warn('[leads] no se pudo guardar el lead inicial:', error.message);
    leadPersistido = false;
    return null;
  }
  leadPersistido = true;
  guardarEstado();
  return leadId;
}

function escribirLead(payload) {
  return leadPersistido && leadId
    ? sb.from('leads').update(payload).eq('id', leadId)
    : sb.from('leads').insert({ id: leadId || undefined, ...payload });
}

async function guardarLeadFinal(extra) {
  const payload = {
    nombre:    leadData.nombre,
    telefono:  leadData.telefono,
    email:     leadData.email || null,
    tipo_obra: leadData.tipo_obra || null,
    zona:      leadData.zona || null,
    estado:    'nuevo',
    origen:    ORIGEN_LEAD,
    ...extra,
  };

  let { error } = await escribirLead(payload);

  /* 42703 = la columna no existe. Pasa si la migración 010 no corrió todavía:
     antes el lead entero se perdía y el cliente igual veía "¡Gracias!". Ahora se
     reintenta sin el detalle del cuestionario: mejor un lead incompleto que ninguno. */
  if (error && error.code === '42703' && payload.respuestas !== undefined) {
    console.warn('[leads] la base no tiene la columna respuestas (¿falta correr la migración 010?). ' +
                 'Guardo el lead sin el detalle del cuestionario.');
    delete payload.respuestas;
    ({ error } = await escribirLead(payload));
  }

  if (error) console.error('[leads] no se pudo guardar la solicitud:', error);
  else leadPersistido = true;
  return !error;
}

/* ── PERSISTENCIA LOCAL ──
   Un F5 perdía el lead y el carrito completo. */
const LS_KEY = 'cubo_presupuesto_v1';

function guardarEstado() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      leadData, leadId, carrito, cantidades,
      guiado: window.CuboGuiado ? window.CuboGuiado.serializar() : null,
      ts: Date.now(),
    }));
  } catch (e) { /* modo privado o storage lleno: seguir sin persistir */ }
}

function leerEstado() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const st = JSON.parse(raw);
    // Los precios cambian: después de una semana conviene recotizar de cero.
    if (!st.ts || Date.now() - st.ts > 7 * 24 * 3600 * 1000) return null;
    return st;
  } catch (e) { return null; }
}

function limpiarEstado() {
  try { localStorage.removeItem(LS_KEY); } catch (e) {}
}

window.CuboEstado = { guardarEstado, leerEstado, limpiarEstado,
                      guardarLeadParcial, guardarLeadFinal,
                      get leadId() { return leadId; },
                      get leadData() { return leadData; },
                      setLeadData(d) { leadData = { ...leadData, ...d }; },
                      get carrito() { return carrito; },
                      setCarrito(c) { carrito = c; },
                      precioFinal: it => it.precio * (1 + (it.ajuste_porcentaje || 0) / 100),
                      fmt, toast, mostrarVista };

/* ── VISTA 1: ENTRADA ──
   La selección es múltiple: el cliente que reforma baño y cocina contesta las
   preguntas de los dos y recibe un solo presupuesto. */
let ambElegidos = ['bano'], modoElegido = 'guiado';
const NOMBRE_AMB = { bano: 'Baño', cocina: 'Cocina', living: 'Living o dormitorio' };

function toggleAmbiente(btn) {
  const id  = btn.dataset.amb;
  const i   = ambElegidos.indexOf(id);
  if (i >= 0) ambElegidos.splice(i, 1); else ambElegidos.push(id);

  const puesto = ambElegidos.includes(id);
  btn.classList.toggle('sel', puesto);
  btn.setAttribute('aria-pressed', String(puesto));

  modoElegido = 'guiado';
  document.getElementById('tipo-otro').classList.remove('sel');
}

/* "Mi obra no es ninguna de estas" manda al cotizador por ítems y es excluyente:
   no tiene sentido mezclar el flujo guiado con una obra que no tiene plantilla. */
function elegirOtraObra() {
  ambElegidos = [];
  document.querySelectorAll('#tipo-grid .tipo-card').forEach(b => {
    b.classList.remove('sel');
    b.setAttribute('aria-pressed', 'false');
  });
  document.getElementById('tipo-otro').classList.add('sel');
  modoElegido = 'catalogo';
}
window.elegirOtraObra = elegirOtraObra;

async function empezar() {
  const nombre = document.getElementById('ml-nombre').value.trim();
  const tel    = document.getElementById('ml-tel').value.trim();

  if (!nombre || !tel) {
    toast('Completá tu nombre y tu WhatsApp para continuar.');
    return;
  }
  if (modoElegido === 'guiado' && !ambElegidos.length) {
    toast('Elegí al menos un ambiente para reformar.');
    return;
  }

  const btn = document.getElementById('ml-btn');
  btn.disabled = true;
  btn.innerHTML = 'Un momento…';

  const tipoObra = modoElegido === 'catalogo'
    ? 'otro'
    : ambElegidos.map(a => NOMBRE_AMB[a] || a).join(' + ');

  leadData = { nombre, telefono: tel, tipo_obra: tipoObra };
  await guardarLeadParcial(leadData);
  if (!datosCargados) await cargarDatos();

  modo = modoElegido;
  if (modo === 'guiado') {
    try {
      mostrarVista('view-guia');
      await window.CuboGuiado.iniciar(ambElegidos);
    } catch (e) {
      // Si ninguna plantilla carga, el cliente igual puede cotizar por catálogo.
      console.error('[guiado] no se pudo iniciar el flujo:', e);
      modo = 'catalogo';
      entrarAlCatalogo();
    }
  } else {
    entrarAlCatalogo();
  }

  btn.disabled = false;
  btn.innerHTML = 'Empezar <span class="material-symbols-outlined">arrow_forward</span>';
}
window.empezar = empezar;

/* ── MODO EXPERTO (catálogo por categorías) ── */
function entrarAlCatalogo() {
  mostrarVista('view-cot');
  renderCot();
  actualizarBottomBar();
  document.getElementById('cot-bottombar').classList.add('visible');
  document.getElementById('cot-volver').style.display = modo === 'guiado' ? '' : 'none';
}

function abrirModoExperto() { entrarAlCatalogo(); }
window.abrirModoExperto = abrirModoExperto;

/* Al salir del catálogo, lo que el cliente sumó a mano vuelve al resumen guiado. */
function volverAlResumen() {
  document.getElementById('cot-bottombar').classList.remove('visible');
  mostrarVista('view-guia');
  window.CuboGuiado.absorberCarrito(carrito);
}
window.volverAlResumen = volverAlResumen;

function volverDesdeForm() {
  if (modo === 'guiado') { mostrarVista('view-guia'); window.CuboGuiado.render(); }
  else volverACotizador();
}
window.volverDesdeForm = volverDesdeForm;

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
  itemsPorId  = {};
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
    itemsPorId[r.id] = item;

    // visible_en_catalogo puede no existir todavía si no se corrió la migración 010
    const visible = r.visible_en_catalogo !== false;
    if (visible) {
      if (!itemsPorCat[r.categoria_id]) itemsPorCat[r.categoria_id] = [];
      itemsPorCat[r.categoria_id].push(item);
    }
  });

  if (categorias.length > 0) catActiva = categorias[0].id;
  datosCargados = true;
  window.CuboCatalogo = { itemsPorId, categorias, correlaciones };
}
window.cargarDatos = cargarDatos;

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
function getAllItems() { return Object.values(itemsPorId); }

/* Resuelve el destino de una correlación. Antes esto era un .filter(Boolean) que
   descartaba en silencio las recetas que el cotizador no podía ver — y por eso
   ninguna correlación llegó nunca a ejecutarse en producción. Ahora avisa. */
function resolverReceta(id, contexto) {
  const item = itemsPorId[id];
  if (!item) {
    console.warn(`[correlaciones] ${contexto}: la receta ${id} no está disponible en el cotizador. ` +
                 `Revisá que tenga activo_publico = true (migración 010).`);
    return null;
  }
  return item;
}

function ejecutar(item, cant, extras) {
  const cA = carrito[item.id]?.cantidad || 0;
  const nC = cA + cant;
  const precioFinal = item.precio * (1 + (item.ajuste_porcentaje || 0) / 100);
  carrito[item.id] = { ...item, cantidad: nC, subtotal: nC * precioFinal };
  extras.forEach(e => {
    const eA = carrito[e.id]?.cantidad || 0;
    const nE = eA + cant;
    const pf = e.precio * (1 + (e.ajuste_porcentaje || 0) / 100);
    carrito[e.id] = { ...e, cantidad: nE, subtotal: nE * pf };
  });
  renderCot();
  actualizarBottomBar();
}

function agregar(id) {
  const item = itemsPorId[id];
  if (!item) return;
  const cant = parseFloat(cantidades[id]) || 1;

  const corrs       = correlaciones.filter(c => c.receta_disparadora_id === id);
  const obligatorias = corrs.filter(c => c.obligatoria);
  const sugeridas    = corrs.filter(c => !c.obligatoria);

  const extrasObl = obligatorias
    .map(c => resolverReceta(c.receta_sugerida_id, `obligatoria de "${item.nombre}"`))
    .filter(Boolean);
  const extrasSug = sugeridas
    .map(c => ({ item: resolverReceta(c.receta_sugerida_id, `sugerida de "${item.nombre}"`), mensaje: c.mensaje }))
    .filter(p => p.item);

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

function resumenHTML() {
  const items = Object.values(carrito);
  const total = items.reduce((a, i) => a + i.subtotal, 0);
  const r = window.CuboGuiado ? window.CuboGuiado.RANGO : 0.15;
  return items.map(i => `<div class="res-mini-item">
      <span>${i.nombre} · ${i.cantidad} ${i.unidad}</span>
      <span>${fmt(i.subtotal) || 'A confirmar'}</span>
    </div>`).join('') +
    (modo === 'guiado' && total > 0
      ? `<div class="res-mini-tot">
           <span>Estimación</span>
           <span>${fmt(total * (1 - r))} – ${fmt(total * (1 + r))}</span>
         </div>`
      : `<div class="res-mini-tot">
           <span>Total orientativo</span>
           <span>${total > 0 ? fmt(total) : 'A confirmar'}</span>
         </div>`);
}

function irAFormulario() {
  document.getElementById('form-resumen').innerHTML = resumenHTML();
  document.getElementById('cot-bottombar').classList.remove('visible');
  mostrarVista('view-form');
}

/* El flujo guiado ya sincronizó el carrito antes de llegar acá. */
function irAFormularioGuiado() { irAFormulario(); }
window.irAFormularioGuiado = irAFormularioGuiado;

function volverACotizador() {
  mostrarVista('view-cot');
  document.getElementById('cot-bottombar').classList.add('visible');
}
window.volverACotizador = volverACotizador;

async function enviar() {
  const msg   = document.getElementById('f-msg').value.trim();
  const email = document.getElementById('f-email').value.trim();
  const zona  = document.getElementById('f-zona').value.trim();

  if (!email || !zona) { toast('Completá tu email y tu zona para que podamos contactarte.'); return; }
  if (!/^\S+@\S+\.\S+$/.test(email)) { toast('Revisá el email: parece incompleto.'); return; }

  const btn = document.getElementById('env-btn');
  btn.disabled = true;
  btn.innerHTML = 'Enviando…';

  leadData = { ...leadData, email, zona };
  const items = Object.values(carrito);
  const total = items.reduce((a, i) => a + i.subtotal, 0);

  // En modo guiado el desglose lleva el ambiente de cada trabajo: en el CRM importa
  // saber que los 12 m² de porcelanato son de la cocina y no del baño.
  const detalle = (modo === 'guiado' && window.CuboGuiado)
    ? window.CuboGuiado.itemsParaLead()
    : items.map(i => ({ id: i.id, nombre: i.nombre, cantidad: i.cantidad, unidad: i.unidad, subtotal: i.subtotal }));

  await guardarLeadFinal({
    mensaje: msg || null,
    presupuesto_total: total || null,
    items_seleccionados: detalle,
    respuestas: window.CuboGuiado && modo === 'guiado'
      ? window.CuboGuiado.respuestasParaLead() : null,
  });
  limpiarEstado();

  document.getElementById('grac-nombre').textContent = '¡Gracias, ' + leadData.nombre + '!';
  document.getElementById('grac-resumen').innerHTML =
    `<p class="label-caps">Tu selección</p>` + resumenHTML();

  mostrarVista('view-gracias');
  btn.disabled = false;
  btn.innerHTML = 'Enviar solicitud <span class="material-symbols-outlined">arrow_forward</span>';
}
window.enviar = enviar;

function reiniciar() {
  carrito = {};
  cantidades = {};
  leadId = null;
  document.getElementById('f-msg').value = '';
  document.getElementById('f-email').value = '';
  document.getElementById('f-zona').value = '';
  limpiarEstado();
  mostrarVista('view-inicio');
}
window.reiniciar = reiniciar;

/* ── INIT ── */
document.getElementById('btn-alerta-ir').addEventListener('click', alertaIrACat);
document.getElementById('btn-alerta-skip').addEventListener('click', alertaContinuar);

document.querySelectorAll('#tipo-grid .tipo-card').forEach(btn => {
  btn.addEventListener('click', () => toggleAmbiente(btn));
});

/* ── ARRANQUE ──
   En modo obra no se carga nada del cotizador: solo se arman los links de contacto. */
(function arrancar() {
  // mostrarVista apaga las demás: si entrara solo por classList.add, la consulta
  // rápida (que viene con `active` en el HTML) quedaría visible arriba del form.
  if (!EN_OBRA) { mostrarVista('view-inicio'); return; }

  document.body.classList.add('en-obra');
  mostrarVista('view-consulta');
  // consulta.js se carga DESPUÉS de este archivo, así que todavía no existe.
  // Los <script> del final del body terminan antes de DOMContentLoaded.
  document.addEventListener('DOMContentLoaded', () => {
    if (window.CuboConsulta) window.CuboConsulta.iniciar();
  });
})();

/* Rehidratar un presupuesto a medio hacer. Antes un F5 perdía todo. */
(async function restaurarSesion() {
  if (EN_OBRA) return;
  const st = leerEstado();
  if (!st || !st.guiado || !(st.guiado.ambientes || []).length) return;

  leadData   = st.leadData || {};
  leadId     = st.leadId || null;
  carrito    = st.carrito || {};
  cantidades = st.cantidades || {};
  modo       = 'guiado';

  if (!datosCargados) await cargarDatos();
  mostrarVista('view-guia');
  const ok = await window.CuboGuiado.restaurar(st.guiado);
  if (!ok) mostrarVista('view-inicio');
  else toast('Retomamos tu presupuesto donde lo dejaste.');
})();
