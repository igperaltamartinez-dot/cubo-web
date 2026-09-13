/* ============================================================
   GUIADO.JS — Flujo por preguntas del presupuestador, multi-ambiente.

   La idea de fondo: el cotizador viejo arrancaba con el carrito vacío y le pedía
   al cliente que adivinara el alcance de su propia obra. Acá el cliente elige qué
   ambientes quiere reformar, contesta preguntas sobre su casa, y la plantilla
   deduce los trabajos.

   El modelo es una cadena de obra: sacar → mover instalaciones → reparar →
   cubrir → colocar → terminar. Nada se toca en un eslabón sin arrastrar los
   anteriores. Por eso las respuestas no agregan ítems sueltos: encienden
   PAQUETES, y un paquete arrastra otros con `implica`. La consecuencia se
   escribe una sola vez, en el paquete donde vive.
   ============================================================ */

/* IIFE: este archivo y presupuestador-app.js son scripts clásicos y comparten el
   scope global. Sin este envoltorio, las funciones homónimas (renderResumen,
   quitar) se pisan entre sí y el archivo que carga último gana. Todo lo que el
   resto de la app necesita sale por window.CuboGuiado. */
(function () {


const RANGO = 0.15;      // el total se muestra como ±15%: es una estimación, no un precio cerrado
const MAX_PASADAS = 5;   // tope del punto fijo de paquetes activos

let compartidos = null;  // paquetes.json — el catálogo que se reusa entre ambientes
let plantillas  = {};    // ambienteId → plantilla
let ambientes   = [];    // ids elegidos, en orden de recorrido
let estados     = {};    // ambienteId → { respuestas, dimensiones, manuales, removidos }
let extraCatalogo = {};  // recetaId → cantidad, sumado desde el modo experto (no es de ningún ambiente)
let pasoActual  = 0;     // índice en la secuencia plana de pasos
let resolCache  = {};    // ambienteId → { visibles, activos }

const M = () => window.CuboMedidas;
const E = () => window.CuboEstado;

/* El nombre de la receta viene de la base y termina dentro de innerHTML. */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function invalidar() { resolCache = {}; }


/* ── CARGA ──
   El id del ambiente ya viene sin acentos ni ñ, así que la URL no depende de
   cómo el server maneje los caracteres no ASCII. */
async function cargarJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar ${url}`);
  return res.json();
}

async function cargarCompartidos() {
  if (!compartidos) compartidos = await cargarJSON('assets/data/paquetes.json');
  return compartidos;
}

async function cargarPlantilla(id) {
  if (!plantillas[id]) plantillas[id] = await cargarJSON(`assets/data/plantilla-${id}.json`);
  return plantillas[id];
}

/* Un ambiente sin plantilla todavía no puede tumbar a los que sí la tienen: si el
   cliente elige baño y cocina y solo existe la del baño, contesta las del baño. */
async function cargarVarias(lista) {
  await Promise.all(lista.map(id => cargarPlantilla(id).catch(e => {
    console.warn(`[guiado] no hay plantilla para "${id}": ${e.message}`);
  })));
  return lista.filter(id => plantillas[id]);
}

async function iniciar(ids) {
  const lista = Array.isArray(ids) ? ids : [ids];
  await cargarCompartidos();
  ambientes = await cargarVarias(lista);
  if (!ambientes.length) throw new Error('Ninguno de los ambientes elegidos tiene plantilla');
  ambientes.forEach(id => { if (!estados[id]) estados[id] = defaultsDe(id); });
  invalidar();
  pasoActual = 0;
  render();
}

/* Un cliente que acepta todos los defaults tiene que llegar a un presupuesto
   realista, no a uno vacío: por eso cada paso arranca con la respuesta puesta. */
function defaultsDe(id) {
  const pl = plantillas[id];
  const st = { respuestas: {}, dimensiones: {}, manuales: {}, removidos: {} };

  const pr = ((pl.medidas || {}).presets || []).find(x => x.default) || ((pl.medidas || {}).presets || [])[0];
  st.dimensiones = pr ? { largo: pr.largo, ancho: pr.ancho, alto: pr.alto, altura_revest: null }
                      : { largo: 2, ancho: 2, alto: 2.5, altura_revest: null };
  ((pl.medidas || {}).extra || []).forEach(e => {
    st.dimensiones[e.id] = M().evalFormula(e.sugerido, M().calcularVars(st.dimensiones)) || e.valor || 1;
  });

  pl.pasos.forEach(p => {
    if (p.tipo === 'opcion' || p.tipo === 'producto') {
      const d = (p.opciones || []).find(o => o.default) || (p.opciones || [])[0];
      if (d) { st.respuestas[p.id] = d.id; aplicarSeteaVar(st, d); }
    }
    if (p.tipo === 'si_no')     st.respuestas[p.id] = p.defaultSi ? 'si' : 'no';
    if (p.tipo === 'checklist') st.respuestas[p.id] = (p.items || []).filter(i => i.default).map(i => i.id);
  });
  return st;
}

function aplicarSeteaVar(st, opcion) {
  if (!opcion || !opcion.seteaVar) return;
  Object.entries(opcion.seteaVar).forEach(([k, v]) => { st.dimensiones[k] = v; });
}

function paquetesDe(id) {
  return { ...compartidos.paquetes, ...(plantillas[id].paquetes || {}) };
}

/* `area_revest` es geometría pura: perímetro × altura. En un baño revestido hasta
   el techo coincide con lo que efectivamente se azuleja, pero en una cocina solo
   se reviste el frente entre bajo mesada y alacena, y en un living no se reviste
   nada. Cada plantilla declara sus variables derivadas para que un paquete
   compartido como la pintura no descuente superficie que sí hay que pintar.
   Se evalúan en orden: una derivada puede usar a la anterior. */
function varsDe(id) {
  const vars = M().calcularVars(estados[id].dimensiones);
  Object.entries((plantillas[id].medidas || {}).derivadas || {}).forEach(([k, f]) => {
    const v = M().evalFormula(f, vars);
    if (v != null) vars[k] = v;
    else console.warn(`[guiado] ${id}: no se pudo evaluar la variable derivada "${k}" = "${f}".`);
  });
  return vars;
}


/* ── RESOLUCIÓN: qué pasos se ven y qué paquetes están encendidos ──
   Las dos cosas se necesitan mutuamente: un paso puede depender de que un
   paquete esté activo (`dependeDe.paquete`), y un paquete se enciende desde la
   respuesta de un paso visible. Se resuelve por punto fijo: se itera hasta que
   el conjunto de paquetes deja de cambiar. En la práctica converge en 3 vueltas
   — el tope existe para que una plantilla mal escrita no cuelgue el navegador. */
function resolver(id) {
  if (resolCache[id]) return resolCache[id];

  const pl = plantillas[id], st = estados[id], pqs = paquetesDe(id);
  let activos = new Set(), visibles = [], firma = null;

  for (let i = 0; i < MAX_PASADAS; i++) {
    visibles = pl.pasos.filter(p => pasoVisible(p, st, activos, pqs));
    activos  = encender(visibles, st, pqs);
    const f  = [...activos].sort().join('|');
    if (f === firma) break;
    firma = f;
  }
  visibles = pl.pasos.filter(p => pasoVisible(p, st, activos, pqs));

  return (resolCache[id] = { visibles, activos });
}

function pasoVisible(p, st, activos, pqs) {
  const dep = p.dependeDe;
  if (dep) {
    if (dep.paquete && !activos.has(dep.paquete)) return false;
    if (dep.paso) {
      const r = st.respuestas[dep.paso];
      if (dep.distintoDe && dep.distintoDe.includes(r)) return false;
      if (dep.igualA && !dep.igualA.includes(r)) return false;
    }
  }
  /* Una pregunta de producto ("¿qué ponés en la pared?") no se muestra porque sí:
     aparece sola cuando algún paquete encendido necesita esa elección. */
  if (p.autoConvocado) {
    return [...activos].some(n => ((pqs[n] || {}).items || []).some(i => i.segun === p.id));
  }
  return true;
}

function encender(visibles, st, pqs) {
  const activos = new Set();
  const on = (nombre) => {
    if (activos.has(nombre)) return;          // deduplica y corta ciclos de `implica`
    if (!pqs[nombre]) {
      console.warn(`[guiado] El paquete "${nombre}" no existe en la plantilla ni en paquetes.json.`);
      return;
    }
    activos.add(nombre);
    (pqs[nombre].implica || []).forEach(on);  // la cascada
  };

  visibles.forEach(p => {
    const r = st.respuestas[p.id];
    if (p.tipo === 'opcion' || p.tipo === 'producto') {
      const o = (p.opciones || []).find(x => x.id === r);
      if (o) (o.aplica || []).forEach(on);
    }
    if (p.tipo === 'si_no' && (r === 'si' || r === 'no_se')) (p.aplicaSi || []).forEach(on);
    if (p.tipo === 'checklist') {
      (p.items || []).filter(i => (r || []).includes(i.id))
                     .forEach(i => (i.aplica || []).forEach(on));
    }
  });
  return activos;
}

/* Un ítem puede no saber todavía qué receta es: `segun` la resuelve leyendo la
   respuesta de otra pregunta. Con `recetas` el ítem trae su propio mapa
   (grifería económica/estándar/premium); sin él, la receta la aporta la opción
   elegida (el porcelanato que el cliente eligió para la pared). */
function recetaDe(it, id) {
  if (it.receta) return it.receta;
  if (!it.segun) return null;

  const pl = plantillas[id];
  const paso = pl.pasos.find(p => p.id === it.segun);
  if (!paso) {
    console.warn(`[guiado] segun apunta al paso "${it.segun}", que no existe en ${id}.`);
    return null;
  }
  let r = estados[id].respuestas[it.segun];
  if (r == null) {
    const d = (paso.opciones || []).find(o => o.default) || (paso.opciones || [])[0];
    r = d && d.id;
  }
  if (it.recetas) return it.recetas[r] || null;
  const op = (paso.opciones || []).find(o => o.id === r);
  return op ? op.receta : null;
}


/* ── CONSTRUCCIÓN DEL PRESUPUESTO ── */
function lineasDe(id) {
  const pl   = plantillas[id], st = estados[id], pqs = paquetesDe(id);
  const { activos } = resolver(id);
  const vars = varsDe(id);
  const cat  = window.CuboCatalogo || { itemsPorId: {} };

  const acum = {}, pendientes = [];

  activos.forEach(nombre => {
    (pqs[nombre].items || []).forEach(it => {
      // Recetas que Nacho todavía no creó en admin: se listan como "a confirmar"
      // en vez de desaparecer del presupuesto sin que nadie se entere.
      if (it.pendiente) {
        if (!pendientes.some(p => p.nombre === it.pendiente)) {
          pendientes.push({ nombre: it.pendiente, etapa: it.etapa || 'demolicion' });
        }
        return;
      }

      const rid = recetaDe(it, id);
      if (!rid) return;
      const item = cat.itemsPorId[rid];
      if (!item) {
        console.warn(`[guiado] La receta ${rid} (${it._n || nombre}) no está disponible en el cotizador. ` +
                     `Revisá que tenga activo_publico = true.`);
        return;
      }
      if (st.removidos[rid]) return;

      const bruto = M().evalFormula(it.formula, vars);
      if (bruto == null || bruto <= 0) return;
      const cant = M().redondearCantidad(bruto, item.unidad);

      if (!acum[rid]) acum[rid] = { id: rid, item, cantidad: 0, etapa: it.etapa || 'terminaciones', origenes: [], amb: id };
      acum[rid].cantidad += cant;
      acum[rid].origenes.push({ explicacion: M().explicarCantidad(it.formula, st.dimensiones, it.nota) });
    });
  });

  const lineas = Object.values(acum).map(l =>
    st.manuales[l.id] != null ? { ...l, cantidad: st.manuales[l.id], manual: true } : l);
  lineas.forEach(l => { l.subtotal = l.cantidad * E().precioFinal(l.item); });

  return { lineas, pendientes };
}

/* Los trabajos sumados a mano desde el catálogo no pertenecen a ningún ambiente:
   van a su propia sección al final del resumen. */
function lineasExtra() {
  const cat = window.CuboCatalogo || { itemsPorId: {} };
  return Object.entries(extraCatalogo).map(([id, cantidad]) => {
    const item = cat.itemsPorId[id];
    if (!item) return null;
    return { id, item, cantidad, etapa: 'otros', amb: '_otros', origenes: [], manualCatalogo: true,
             subtotal: cantidad * E().precioFinal(item) };
  }).filter(Boolean);
}

function construirTodo() {
  const porAmbiente = ambientes.map(id => ({ id, nombre: plantillas[id].nombre, ...lineasDe(id) }));
  const extra = lineasExtra();
  const lineas = porAmbiente.flatMap(a => a.lineas).concat(extra);
  return { porAmbiente, extra, lineas, total: lineas.reduce((a, l) => a + l.subtotal, 0) };
}


/* ── SECUENCIA DE PASOS ──
   Los pasos de todos los ambientes se aplanan en una sola lista para que avanzar,
   retroceder y la barra de progreso sigan siendo un índice y nada más. */
function secuencia() {
  const out = [];
  ambientes.forEach(id => resolver(id).visibles.forEach(paso => out.push({ amb: id, paso })));
  return out;
}


/* ── RENDER ── */
function render() {
  const seq = secuencia();
  if (pasoActual >= seq.length) return renderResumen();

  const { amb, paso } = seq[pasoActual];
  const pl   = plantillas[amb];
  const n    = seq.length + 1;   // +1 por el resumen
  const cont = document.getElementById('guia-body');

  document.getElementById('nav-step').textContent =
    ambientes.length > 1 ? `${pl.nombre} · Paso ${pasoActual + 1} de ${n}`
                         : `Paso ${pasoActual + 1} de ${n}`;
  document.getElementById('step-bar-fill').style.width = `${((pasoActual + 1) / n) * 100}%`;

  let html = `<div class="guia-head">
      ${ambientes.length > 1 ? `<p class="label-caps guia-amb">${esc(pl.nombre)}</p>` : ''}
      <h2 class="display-md">${paso.titulo}</h2>
      ${paso.bajada ? `<p class="body-md guia-bajada">${paso.bajada}</p>` : ''}
    </div>`;

  if (paso.tipo === 'dimensiones')                     html += renderDimensiones(pl, amb, paso);
  if (paso.tipo === 'opcion' || paso.tipo === 'producto') html += renderOpciones(amb, paso);
  if (paso.tipo === 'si_no')                           html += renderSiNo(amb, paso);
  if (paso.tipo === 'checklist')                       html += renderChecklist(amb, paso);

  cont.innerHTML = html;
  document.getElementById('guia-back').style.visibility = pasoActual === 0 ? 'hidden' : 'visible';
  document.getElementById('guia-next').innerHTML =
    `${pasoActual === seq.length - 1 ? 'Ver mi presupuesto' : 'Continuar'} <span class="material-symbols-outlined">arrow_forward</span>`;

  /* Atajo al resumen: el que se cansa a mitad del cuestionario igual llega a un
     número, porque el resto de las preguntas ya tienen respuesta por default. */
  const skip = document.getElementById('guia-skip');
  if (skip) skip.style.display = (pasoActual >= 2 && pasoActual < seq.length - 1) ? '' : 'none';

  window.scrollTo({ top: 0, behavior: 'smooth' });
  E().guardarEstado();
}

function renderDimensiones(pl, amb, paso) {
  const d = estados[amb].dimensiones;
  const presets = (pl.medidas || {}).presets || [];
  const extra   = (pl.medidas || {}).extra   || [];
  const libre   = !presets.some(pr => pr.largo === d.largo && pr.ancho === d.ancho);

  return `<div class="guia-opts">
      ${presets.map((pr, i) => `
        <button class="opt-card ${pr.largo === d.largo && pr.ancho === d.ancho ? 'sel' : ''}"
                onclick="CuboGuiado.setPreset('${amb}',${i})">
          <span class="opt-label">${pr.label}</span>
          <span class="opt-desc">${pr.detalle}</span>
        </button>`).join('')}
    </div>
    <details class="guia-medidas" ${libre ? 'open' : ''}>
      <summary>Prefiero cargar las medidas exactas</summary>
      <div class="med-grid">
        ${['largo', 'ancho', 'alto'].map(k => `
          <div class="field">
            <label for="med-${k}">${k[0].toUpperCase() + k.slice(1)} (m)</label>
            <input class="input" id="med-${k}" type="number" inputmode="decimal" min="0.5" step="0.1"
                   value="${d[k]}" oninput="CuboGuiado.setMedida('${amb}','${k}',this.value)">
          </div>`).join('')}
      </div>
    </details>
    ${extra.map(e => `
      <div class="field guia-extra">
        <label for="ex-${e.id}">${e.label}</label>
        <input class="input" id="ex-${e.id}" type="number" inputmode="decimal" min="0" step="0.5"
               value="${d[e.id] != null ? d[e.id] : ''}"
               oninput="CuboGuiado.setMedida('${amb}','${e.id}',this.value)">
        ${e.ayuda ? `<p class="body-sm guia-ayuda">${e.ayuda}</p>` : ''}
      </div>`).join('')}
    <p class="guia-calc">
      <span class="material-symbols-outlined">calculate</span>
      Piso <strong>${M().fmtNum(d.largo * d.ancho)} m²</strong> ·
      Paredes <strong>${M().fmtNum(M().calcularVars(d).area_paredes)} m²</strong>
    </p>`;
}

function renderOpciones(amb, paso) {
  const r = estados[amb].respuestas[paso.id];
  return `<div class="guia-opts">
    ${(paso.opciones || []).map(o => `
      <button class="opt-card ${r === o.id ? 'sel' : ''}" onclick="CuboGuiado.setOpcion('${amb}','${paso.id}','${o.id}')">
        <span class="opt-label">${o.label}</span>
        ${o.descripcion ? `<span class="opt-desc">${o.descripcion}</span>` : ''}
      </button>`).join('')}
  </div>`;
}

function renderSiNo(amb, paso) {
  const r  = estados[amb].respuestas[paso.id];
  const op = [['si', 'Sí'], ['no', 'No']];
  if (paso.permiteNoSe) op.push(['no_se', 'No estoy seguro']);
  return `<div class="guia-opts">
      ${op.map(([v, l]) => `
        <button class="opt-card ${r === v ? 'sel' : ''}" onclick="CuboGuiado.setOpcion('${amb}','${paso.id}','${v}')">
          <span class="opt-label">${l}</span>
        </button>`).join('')}
    </div>
    ${r === 'no_se' && paso.notaNoSe
      ? `<p class="guia-nota"><span class="material-symbols-outlined">info</span>${paso.notaNoSe}</p>` : ''}`;
}

function renderChecklist(amb, paso) {
  const sel = estados[amb].respuestas[paso.id] || [];
  return `<div class="guia-checks">
    ${(paso.items || []).map(i => `
      <label class="chk-row ${sel.includes(i.id) ? 'sel' : ''}">
        <input type="checkbox" ${sel.includes(i.id) ? 'checked' : ''}
               onchange="CuboGuiado.toggleCheck('${amb}','${paso.id}','${i.id}')">
        <span class="chk-box"><span class="material-symbols-outlined">check</span></span>
        <span class="chk-label">${i.label}</span>
      </label>`).join('')}
  </div>`;
}


/* ── RESUMEN ──
   Es la pantalla que construye confianza: cada línea dice de dónde salió la
   cantidad, para que el número no parezca inventado. */
function renderResumen() {
  const { porAmbiente, extra, total } = construirTodo();
  const n = secuencia().length + 1;

  document.getElementById('nav-step').textContent = `Paso ${n} de ${n}`;
  document.getElementById('step-bar-fill').style.width = '100%';

  const etapas = compartidos.etapas;
  const bloques = porAmbiente.map(a => {
    const grupos = etapas
      .map(e => ({ ...e, lineas: a.lineas.filter(l => l.etapa === e.id), pend: a.pendientes.filter(p => p.etapa === e.id) }))
      .filter(g => g.lineas.length || g.pend.length);
    const sub = a.lineas.reduce((s, l) => s + l.subtotal, 0);
    return { ...a, grupos, sub };
  }).filter(b => b.grupos.length);

  document.getElementById('guia-body').innerHTML = `
    <div class="guia-head">
      <h2 class="display-md">Tu presupuesto orientativo</h2>
      <p class="body-md guia-bajada">${descripcionMedidas()} Podés ajustar cualquier cantidad.</p>
    </div>

    <div class="res-total-box">
      <p class="label-caps">Estimación</p>
      <p class="res-rango">${E().fmt(total * (1 - RANGO)) || '$0'} <span>–</span> ${E().fmt(total * (1 + RANGO)) || '$0'}</p>
      <p class="body-sm">Precios referenciales. El valor final se confirma en la visita técnica.</p>
    </div>

    ${bloques.map(b => `
      <section class="res-amb">
        ${bloques.length > 1 ? `<header class="res-amb-head">
          <h3 class="headline-md">${esc(b.nombre)}</h3>
          <span class="res-amb-sub">${E().fmt(b.sub) || '—'}</span>
        </header>` : ''}
        ${b.grupos.map(g => `
          <div class="res-etapa">
            <h4 class="label-caps res-etapa-tit">${esc(g.nombre)}</h4>
            ${g.lineas.map(l => renderLinea(l)).join('')}
            ${g.pend.map(p => `
              <div class="res-linea res-linea-pend">
                <div class="res-linea-info">
                  <p class="res-linea-nom">${esc(p.nombre)}</p>
                  <p class="res-linea-org">Se cotiza en la visita técnica</p>
                </div>
                <span class="res-linea-prec">A confirmar</span>
              </div>`).join('')}
          </div>`).join('')}
      </section>`).join('')}

    ${extra.length ? `<section class="res-amb">
      <header class="res-amb-head"><h3 class="headline-md">Otros trabajos</h3></header>
      <div class="res-etapa">${extra.map(l => renderLinea(l)).join('')}</div>
    </section>` : ''}

    <button class="btn btn-ghost guia-add" onclick="CuboGuiado.abrirCatalogo()">
      <span class="material-symbols-outlined">add</span> Agregar otro trabajo
    </button>`;

  document.getElementById('guia-back').style.visibility = 'visible';
  document.getElementById('guia-next').innerHTML =
    'Solicitar presupuesto <span class="material-symbols-outlined">arrow_forward</span>';
  const skip = document.getElementById('guia-skip');
  if (skip) skip.style.display = 'none';

  window.scrollTo({ top: 0, behavior: 'smooth' });
  E().guardarEstado();
}

function descripcionMedidas() {
  return ambientes.map(id => {
    const d = estados[id].dimensiones;
    return `${plantillas[id].nombre} de ${M().fmtNum(d.largo)} × ${M().fmtNum(d.ancho)} m`;
  }).join(' · ') + '.';
}

/* Un "global" es un trabajo que se cotiza entero (rehacer la instalación
   sanitaria del baño): dejar que el cliente escriba 99 ahí no significa nada. */
function esGlobal(item) { return (item.unidad || '').trim().toLowerCase() === 'global'; }

function pasoDe(unidad) {
  const u = (unidad || '').trim().toLowerCase();
  return (u === 'unidad' || u === 'un' || u === 'boca') ? '1' : '0.5';
}

function renderLinea(l) {
  const org = l.manual
    ? 'Cantidad ajustada por vos'
    : (l.origenes.map(o => o.explicacion).filter(Boolean).join(' + ') || null);
  return `<div class="res-linea">
    <div class="res-linea-info">
      <p class="res-linea-nom">${esc(l.item.nombre)}</p>
      ${org ? `<p class="res-linea-org">${esc(org)}</p>` : ''}
      <div class="res-linea-cant">
        ${esGlobal(l.item)
          ? `<span class="cant-fija">Trabajo completo</span>`
          : `<input class="cant-mini" type="number" min="0" step="${pasoDe(l.item.unidad)}" value="${l.cantidad}"
                    inputmode="decimal" onchange="CuboGuiado.setCantidad('${l.amb}','${l.id}',this.value)">
             <span>${esc(l.item.unidad)}</span>`}
        <button class="res-linea-quit" onclick="CuboGuiado.quitar('${l.amb}','${l.id}')" aria-label="Quitar">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
    </div>
    <span class="res-linea-prec">${E().fmt(l.subtotal) || 'A confirmar'}</span>
  </div>`;
}


/* ── INTERACCIÓN ── */
function setPreset(amb, i) {
  const pr = ((plantillas[amb].medidas || {}).presets || [])[i];
  if (!pr) return;
  Object.assign(estados[amb].dimensiones, { largo: pr.largo, ancho: pr.ancho, alto: pr.alto });
  invalidar();
  render();
}

function setMedida(amb, k, v) {
  const n = parseFloat(v);
  if (Number.isFinite(n) && n > 0) estados[amb].dimensiones[k] = n;
  invalidar();

  // No re-renderizamos entero para no robarle el foco al input que está tipeando
  const d  = estados[amb].dimensiones;
  const el = document.querySelector('.guia-calc');
  if (el) el.innerHTML = `<span class="material-symbols-outlined">calculate</span>
    Piso <strong>${M().fmtNum(d.largo * d.ancho)} m²</strong> ·
    Paredes <strong>${M().fmtNum(M().calcularVars(d).area_paredes)} m²</strong>`;
  E().guardarEstado();
}

/* Una respuesta puede hacer aparecer o desaparecer OTROS pasos, y entonces el
   índice deja de apuntar a la pregunta que el cliente está mirando. Guardamos qué
   paso era y lo volvemos a buscar después del cambio; sin esto, destildar algo en
   el checklist podía expulsarte al resumen a mitad del cuestionario. */
function conservandoPaso(cambio) {
  const actual = secuencia()[pasoActual];
  cambio();
  invalidar();
  if (!actual) return;                     // estábamos en el resumen: ahí nos quedamos
  const nueva = secuencia();
  const i = nueva.findIndex(x => x.amb === actual.amb && x.paso.id === actual.paso.id);
  pasoActual = i >= 0 ? i : Math.min(pasoActual, nueva.length);
}

function setOpcion(amb, pasoId, valor) {
  conservandoPaso(() => {
    const st = estados[amb];
    st.respuestas[pasoId] = valor;
    const paso = plantillas[amb].pasos.find(p => p.id === pasoId);
    if (paso && (paso.tipo === 'opcion' || paso.tipo === 'producto')) {
      aplicarSeteaVar(st, (paso.opciones || []).find(o => o.id === valor));
    }
  });
  render();
}

function toggleCheck(amb, pasoId, itemId) {
  conservandoPaso(() => {
    const paso = plantillas[amb].pasos.find(p => p.id === pasoId);
    const sel  = new Set(estados[amb].respuestas[pasoId] || []);
    const item = (paso.items || []).find(i => i.id === itemId);

    if (sel.has(itemId)) sel.delete(itemId);
    else {
      sel.add(itemId);
      // Ducha y bañera se excluyen: tildar una destilda la otra.
      (item.excluye || []).forEach(x => sel.delete(x));
    }
    estados[amb].respuestas[pasoId] = [...sel];
  });
  render();
}

function setCantidad(amb, id, valor) {
  const n = parseFloat(valor);
  if (!Number.isFinite(n) || n <= 0) { quitar(amb, id); return; }
  if (amb === '_otros') extraCatalogo[id] = n;
  else estados[amb].manuales[id] = n;
  renderResumen();
}

function quitar(amb, id) {
  if (amb === '_otros') { delete extraCatalogo[id]; }
  else {
    estados[amb].removidos[id] = true;
    delete estados[amb].manuales[id];
  }
  invalidar();
  renderResumen();
}

function avanzar() {
  const seq = secuencia();
  if (pasoActual >= seq.length) return irAConfirmacion();
  pasoActual++;
  render();
}

function retroceder() {
  if (pasoActual === 0) return;
  pasoActual--;
  render();
}

function irAlResumen() {
  pasoActual = secuencia().length;
  render();
}


/* ── SALIDA HACIA EL RESTO DE LA APP ──
   El carrito se indexa por receta: si el mismo porcelanato va en el baño y en la
   cocina, las cantidades se suman (que es lo correcto para comprarlo). El detalle
   por ambiente viaja aparte, en el desglose que se guarda con el lead. */
function sincronizarCarrito() {
  const { lineas } = construirTodo();
  const carrito = {};
  lineas.forEach(l => {
    const prev = carrito[l.id];
    const cantidad = (prev ? prev.cantidad : 0) + l.cantidad;
    carrito[l.id] = { ...l.item, cantidad, subtotal: cantidad * E().precioFinal(l.item) };
  });
  E().setCarrito(carrito);
  return lineas;
}

function irAConfirmacion() {
  const lineas = sincronizarCarrito();
  if (!lineas.length) { E().toast('Tu presupuesto está vacío. Volvé y elegí al menos un trabajo.'); return; }
  window.irAFormularioGuiado();
}

function abrirCatalogo() {
  sincronizarCarrito();
  window.abrirModoExperto();
}

/* El modo experto devuelve lo que el cliente sumó a mano desde el catálogo.
   Solo se marca como "ajustada por vos" la línea cuya cantidad realmente cambió:
   si marcáramos todas, un simple ida y vuelta al catálogo congelaría el
   presupuesto entero y cambiar las medidas ya no recalcularía nada. */
function absorberCarrito(carrito) {
  const { lineas } = construirTodo();
  const calculado = new Map();
  const ambDe     = new Map();
  lineas.forEach(l => {
    calculado.set(l.id, (calculado.get(l.id) || 0) + l.cantidad);
    if (!ambDe.has(l.id)) ambDe.set(l.id, l.amb);
  });

  Object.values(carrito).forEach(i => {
    if (calculado.has(i.id)) {
      if (i.cantidad !== calculado.get(i.id)) {
        const amb = ambDe.get(i.id);
        if (amb === '_otros') extraCatalogo[i.id] = i.cantidad;
        else estados[amb].manuales[i.id] = i.cantidad;
      }
      return;
    }
    extraCatalogo[i.id] = i.cantidad;
    ambientes.forEach(a => { delete estados[a].removidos[i.id]; });
  });
  invalidar();
  // Volvemos del catálogo al resumen: el índice tiene que quedar ahí, o el botón
  // "Solicitar presupuesto" mandaría a la pregunta siguiente en vez del formulario.
  pasoActual = secuencia().length;
  renderResumen();
}


/* ── PERSISTENCIA ── */
function serializar() {
  return { ambientes, pasoActual, extraCatalogo, estados };
}

async function restaurar(st) {
  if (!st || !Array.isArray(st.ambientes) || !st.ambientes.length) return false;
  await cargarCompartidos();
  ambientes = await cargarVarias(st.ambientes);
  if (!ambientes.length) return false;
  estados       = st.estados || {};
  ambientes.forEach(id => { if (!estados[id]) estados[id] = defaultsDe(id); });
  extraCatalogo = st.extraCatalogo || {};
  pasoActual    = st.pasoActual || 0;
  invalidar();
  render();
  return true;
}

/* Resumen legible de las respuestas, para que al llamar al cliente se sepa que
   dijo "baño de 2×2, muevo el inodoro" y no solo la lista de ítems. */
function respuestasParaLead() {
  if (!ambientes.length) return null;
  const out = { ambientes: {} };

  ambientes.forEach(id => {
    const pl = plantillas[id], st = estados[id];
    const det = { medidas: { ...st.dimensiones } };
    resolver(id).visibles.forEach(p => {
      const r = st.respuestas[p.id];
      if (r == null) return;
      if (p.tipo === 'checklist') {
        det[p.id] = (p.items || []).filter(i => r.includes(i.id)).map(i => i.label);
      } else if (p.tipo === 'opcion' || p.tipo === 'producto') {
        const o = (p.opciones || []).find(x => x.id === r);
        det[p.id] = o ? o.label : r;
      } else if (p.tipo === 'si_no') {
        det[p.id] = { si: 'Sí', no: 'No', no_se: 'No está seguro' }[r] || r;
      }
    });
    out.ambientes[pl.nombre] = det;
  });

  const { porAmbiente } = construirTodo();
  out.totales = Object.fromEntries(
    porAmbiente.map(a => [a.nombre, Math.round(a.lineas.reduce((s, l) => s + l.subtotal, 0))]));
  return out;
}

/* Desglose por ambiente para guardar junto al lead: en el CRM importa saber que
   los 12 m² de porcelanato son de la cocina y no del baño. */
function itemsParaLead() {
  const { lineas } = construirTodo();
  return lineas.map(l => ({
    id: l.id, nombre: l.item.nombre, cantidad: l.cantidad, unidad: l.item.unidad,
    subtotal: l.subtotal,
    ambiente: l.amb === '_otros' ? 'Otros' : plantillas[l.amb].nombre,
  }));
}

window.CuboGuiado = {
  iniciar, render, avanzar, retroceder, irAlResumen,
  setPreset, setMedida, setOpcion, toggleCheck, setCantidad, quitar,
  abrirCatalogo, absorberCarrito, sincronizarCarrito,
  construirTodo, serializar, restaurar, respuestasParaLead, itemsParaLead,
  get ambientes() { return ambientes.slice(); },
  get RANGO() { return RANGO; },
};
})();
