const SB_URL = 'https://swxkfibuvbazvrclzxlx.supabase.co';
const SB_KEY = 'sb_publishable_Bma8p2yNKCQIMZTGu8fgiA_EPDGCi5y';
const sb = supabase.createClient(SB_URL, SB_KEY);

let categorias = [], todosLeads = [], todasCorrs = [], todasObras = [], todasRecetas = [];
let todosItems = []; // legacy compat — algunas funciones del importador Excel todavía la referencian
let editandoCat = null, editandoObra = null, leadActual = null;
let filtroLeads = 'todos';

const fmt = n => n > 0 ? '$' + Math.round(n).toLocaleString('es-AR') : '—';
const fechaCorta = s => s ? new Date(s).toLocaleDateString('es-AR', {day:'2-digit',month:'2-digit',year:'2-digit'}) : '—';

function toast(msg, tipo = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast ' + tipo + ' show';
  setTimeout(() => t.classList.remove('show'), 3000);
}

// Supabase corta cada request en ~1000 filas. Para tablas que superan ese tope
// (catálogo Sismat, overrides) hay que paginar o se pierden filas silenciosamente.
// buildQuery debe incluir un .order() estable para que el range sea consistente.
async function sbSelectAll(buildQuery, batch = 1000) {
  const out = [];
  let desde = 0;
  while (true) {
    const { data, error } = await buildQuery().range(desde, desde + batch - 1);
    if (error) throw error;
    if (!data || !data.length) break;
    out.push(...data);
    if (data.length < batch) break;
    desde += batch;
  }
  return out;
}

// ── AUTH ──
async function login() {
  const email = document.getElementById('l-email').value.trim();
  const pass = document.getElementById('l-pass').value;
  const btn = document.getElementById('l-btn');
  const err = document.getElementById('l-error');
  btn.disabled = true; btn.textContent = 'Ingresando...';
  err.style.display = 'none';
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) {
    err.style.display = 'block'; btn.disabled = false; btn.textContent = 'Entrar →';
  } else iniciarApp();
}

async function logout() {
  await sb.auth.signOut();
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-wrap').style.display = 'flex';
}

async function iniciarApp() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  document.getElementById('login-wrap').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('sb-user').textContent = user.email;
  await cargarTodo();
  cargarDashboard();
}

// ── CARGA DATOS ──
async function cargarTodo() {
  const [cats, leads, corrs, obras, recetas] = await Promise.all([
    sb.from('categorias').select('*').order('orden'),
    sb.from('leads').select('*').order('created_at', { ascending: false }),
    sb.from('correlaciones').select('*'),
    sb.from('obras').select('*').order('orden'),
    sb.from('recetas').select('id, nombre').order('nombre'),
  ]);
  categorias  = cats.data    || [];
  todosLeads  = leads.data   || [];
  todasCorrs  = corrs.data   || [];
  todasObras  = obras.data   || [];
  todasRecetas = recetas.data || [];
  poblarSelectsCats();
}

function poblarSelectsCats() {
  const selDis = document.getElementById('corr-disparador');
  const selSug = document.getElementById('corr-sugerido');
  if (selDis && selSug) {
    const opts = todasRecetas.map(r => `<option value="${r.id}">${r.nombre}</option>`).join('');
    selDis.innerHTML = opts;
    selSug.innerHTML = opts;
  }
}

// ── NAVEGACIÓN ──
function irA(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('act'));
  document.querySelectorAll('.sb-btn').forEach(b => b.classList.remove('act'));
  document.getElementById('page-' + page).classList.add('act');
  document.getElementById('sb-' + page).classList.add('act');
  const renders = { dashboard: cargarDashboard, leads: renderLeads, categorias: renderCats, recetas: iniciarRecetas, correlaciones: renderCorrs, obras: renderObras, fotos: iniciarFotosLanding, catalogo: iniciarCatalogoSismat, importar: iniciarImportarSismat, motor: iniciarMotor, configuracion: cargarConfiguracion };
  if (renders[page]) renders[page]();
}

// ── DASHBOARD ──
async function cargarDashboard() {
  const nuevos = todosLeads.filter(l => l.estado === 'nuevo').length;
  document.getElementById('st-leads').textContent = todosLeads.length;
  document.getElementById('st-leads-new').textContent = nuevos > 0 ? `${nuevos} nuevos` : '';
  document.getElementById('st-items').textContent = todasRecetas.length;
  document.getElementById('st-categorias').textContent = categorias.filter(c => c.activo).length;
  document.getElementById('st-obras').textContent = todasObras.filter(o => o.activo).length;
  const recientes = todosLeads.slice(0, 5);
  document.getElementById('dash-leads-body').innerHTML = recientes.length ?
    recientes.map(l => `<tr>
      <td><strong>${l.nombre}</strong></td>
      <td>${l.telefono}</td>
      <td>${l.tipo_obra ? tipoObra(l.tipo_obra) : '—'}</td>
      <td><span class="badge badge-${l.estado || 'nuevo'}">${l.estado || 'nuevo'}</span></td>
      <td>${fechaCorta(l.created_at)}</td>
    </tr>`).join('') :
    '<tr><td colspan="5" class="empty-state">Todavía no hay leads.</td></tr>';
}

function tipoObra(t) {
  const m = { baño:'Baño', cocina:'Cocina', reforma_integral:'Reforma integral', ampliacion:'Ampliación', pintura:'Pintura', pisos:'Pisos', instalaciones:'Instalaciones', otro:'Otro' };
  return m[t] || t;
}

// ── LEADS ──
function filtrarLeads(estado, btn) {
  filtroLeads = estado;
  document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('act'));
  btn.classList.add('act');
  renderLeads();
}

function renderLeads() {
  const lista = filtroLeads === 'todos' ? todosLeads : todosLeads.filter(l => l.estado === filtroLeads);
  document.getElementById('leads-body').innerHTML = lista.length ?
    lista.map(l => {
      const total = l.presupuesto_total;
      return `<tr>
        <td><strong>${l.nombre}</strong></td>
        <td>${l.telefono}<br><span style="font-size:11px;color:#aaa">${l.email}</span></td>
        <td>${l.tipo_obra ? tipoObra(l.tipo_obra) : '—'}</td>
        <td>${l.zona || '—'}</td>
        <td>${total ? fmt(total) : '—'}</td>
        <td><span class="badge badge-${l.estado || 'nuevo'}">${l.estado || 'nuevo'}</span></td>
        <td>${fechaCorta(l.created_at)}</td>
        <td><button class="btn-sm" onclick="verLead('${l.id}')">Ver</button></td>
      </tr>`;
    }).join('') :
    '<tr><td colspan="8" class="empty-state">No hay leads en esta categoría.</td></tr>';
}

function verLead(id) {
  leadActual = todosLeads.find(l => l.id === id);
  if (!leadActual) return;
  document.getElementById('modal-lead-tit').textContent = leadActual.nombre;
  document.getElementById('lead-estado').value = leadActual.estado || 'nuevo';
  document.getElementById('lead-detail-grid').innerHTML = [
    ['Teléfono', leadActual.telefono],
    ['Email', leadActual.email],
    ['Tipo de obra', leadActual.tipo_obra ? tipoObra(leadActual.tipo_obra) : '—'],
    ['Zona', leadActual.zona || '—'],
    ['Origen', leadActual.origen || '—'],
    ['Fecha', fechaCorta(leadActual.created_at)],
  ].map(([l, v]) => `<div class="ld-field"><div class="ld-lbl">${l}</div><div class="ld-val">${v}</div></div>`).join('');
  const items = leadActual.items_seleccionados;
  if (items && items.length) {
    const total = items.reduce((a, i) => a + (i.subtotal || 0), 0);
    document.getElementById('lead-items-cotizados').innerHTML =
      `<div class="ic-titulo">Lo que cotizó</div>` +
      items.map(i => `<div class="ic-item"><span>${i.nombre} × ${i.cantidad} ${i.unidad}</span><span>${fmt(i.subtotal)}</span></div>`).join('') +
      `<div class="ic-item"><span>Total orientativo</span><span>${fmt(total)}</span></div>`;
  } else {
    document.getElementById('lead-items-cotizados').innerHTML = '<div class="ic-titulo">No cotizó ítems específicos.</div>';
  }
  if (leadActual.mensaje) {
    document.getElementById('lead-items-cotizados').innerHTML += `<div style="margin-top:12px"><div class="ld-lbl">Mensaje</div><div class="ld-val" style="margin-top:4px">${leadActual.mensaje}</div></div>`;
  }
  document.getElementById('modal-lead').classList.add('open');
}

async function cambiarEstadoLead() {
  if (!leadActual) return;
  const nuevoEstado = document.getElementById('lead-estado').value;
  const { error } = await sb.from('leads').update({ estado: nuevoEstado }).eq('id', leadActual.id);
  if (!error) {
    leadActual.estado = nuevoEstado;
    const idx = todosLeads.findIndex(l => l.id === leadActual.id);
    if (idx >= 0) todosLeads[idx].estado = nuevoEstado;
    renderLeads();
    toast('Estado actualizado ✓');
  }
}

// ── CATEGORÍAS ──
function renderCats() {
  document.getElementById('cats-body').innerHTML = categorias.length ?
    categorias.map(c => {
      const markup = c.markup_porcentaje != null ? c.markup_porcentaje : 30;
      return `<tr>
        <td style="font-size:22px">${c.emoji || ''}</td>
        <td><strong>${c.nombre}</strong></td>
        <td>${c.orden}</td>
        <td>
          <span style="font-weight:800;font-size:13px">${markup}%</span>
        </td>
        <td style="max-width:240px">
          ${c.mensaje_alerta
            ? `<span style="font-size:11px;color:var(--gm);font-weight:500">${c.mensaje_alerta.slice(0,70)}${c.mensaje_alerta.length>70?'...':''}</span>`
            : `<span style="font-size:11px;color:#ccc;font-style:italic">Sin mensaje</span>`}
        </td>
        <td><label class="toggle-switch"><input type="checkbox" ${c.activo ? 'checked' : ''} onchange="toggleCat('${c.id}',this.checked)"><span class="toggle-slider"></span></label></td>
        <td>
          <button class="btn-sm" onclick="editarCat('${c.id}')">Editar</button>
          <button class="btn-sm danger" onclick="eliminarCat('${c.id}')">Borrar</button>
        </td>
      </tr>`;
    }).join('') :
    '<tr><td colspan="7" class="empty-state">No hay categorías.</td></tr>';
}

function abrirModalCat(id = null) {
  editandoCat = id;
  document.getElementById('modal-cat-tit').textContent = id ? 'Editar categoría' : 'Nueva categoría';
  if (id) {
    const c = categorias.find(c => c.id === id);
    document.getElementById('cat-emoji').value   = c.emoji || '';
    document.getElementById('cat-nombre').value  = c.nombre || '';
    document.getElementById('cat-orden').value   = c.orden || 0;
    document.getElementById('cat-markup').value  = c.markup_porcentaje != null ? c.markup_porcentaje : 30;
    document.getElementById('cat-alerta').value  = c.mensaje_alerta || '';
  } else {
    ['cat-emoji','cat-nombre','cat-orden','cat-alerta'].forEach(i => document.getElementById(i).value = '');
    document.getElementById('cat-markup').value = 30;
  }
  document.getElementById('modal-cat').classList.add('open');
}

function editarCat(id) { abrirModalCat(id); }

async function guardarCat() {
  const nombre = document.getElementById('cat-nombre').value.trim();
  if (!nombre) { toast('Completá el nombre', 'err'); return; }
  const data = {
    nombre,
    emoji: document.getElementById('cat-emoji').value || null,
    orden: parseInt(document.getElementById('cat-orden').value) || 0,
    markup_porcentaje: parseFloat(document.getElementById('cat-markup').value) || 30,
    mensaje_alerta: document.getElementById('cat-alerta').value.trim() || null
  };
  let error;
  if (editandoCat) {
    ({ error } = await sb.from('categorias').update(data).eq('id', editandoCat));
  } else {
    ({ error } = await sb.from('categorias').insert({ ...data, activo: true }));
  }
  if (!error) { cerrarModal('modal-cat'); await cargarTodo(); renderCats(); toast('Categoría guardada ✓'); }
  else toast('Error al guardar', 'err');
}

async function toggleCat(id, activo) {
  await sb.from('categorias').update({ activo }).eq('id', id);
  const idx = categorias.findIndex(c => c.id === id);
  if (idx >= 0) categorias[idx].activo = activo;
  toast(activo ? 'Categoría activada ✓' : 'Categoría desactivada');
}

async function eliminarCat(id) {
  const c = categorias.find(c => c.id === id);
  if (!c) return;
  if (!confirm(`¿Eliminar la categoría "${c.nombre}"?\n\nLas recetas y los ítems del catálogo que la tengan asignada quedarán sin categoría. No se puede deshacer.`)) return;
  const { error } = await sb.from('categorias').delete().eq('id', id);
  if (!error) { await cargarTodo(); renderCats(); toast('Categoría eliminada'); }
  else toast('Error al eliminar: ' + error.message, 'err');
}

// ── CORRELACIONES ──
function renderCorrs() {
  poblarSelectsCats();
  document.getElementById('corr-body').innerHTML = todasCorrs.length ?
    todasCorrs.map(c => {
      const dis = todasRecetas.find(r => r.id === c.receta_disparadora_id);
      const sug = todasRecetas.find(r => r.id === c.receta_sugerida_id);
      const tipo = c.obligatoria
        ? '<span class="badge badge-nuevo">Obligatoria</span>'
        : '<span class="badge badge-en_proceso">Sugerida</span>';
      return `<tr>
        <td>${dis ? dis.nombre : '—'}</td>
        <td>${sug ? sug.nombre : '—'}</td>
        <td>${tipo}</td>
        <td style="font-size:11px;color:var(--gm)">${c.mensaje || ''}</td>
        <td><label class="toggle-switch"><input type="checkbox" ${c.activo ? 'checked' : ''} onchange="toggleCorr('${c.id}',this.checked)"><span class="toggle-slider"></span></label></td>
        <td><button class="btn-sm danger" onclick="eliminarCorr('${c.id}')">Borrar</button></td>
      </tr>`;
    }).join('') :
    '<tr><td colspan="6" class="empty-state">No hay correlaciones.</td></tr>';
}

function abrirModalCorr() {
  document.getElementById('corr-mensaje').value = '';
  document.getElementById('corr-obligatoria').checked = false;
  document.getElementById('modal-corr').classList.add('open');
}

async function guardarCorr() {
  const dis = document.getElementById('corr-disparador').value;
  const sug = document.getElementById('corr-sugerido').value;
  const msg = document.getElementById('corr-mensaje').value.trim();
  const obligatoria = document.getElementById('corr-obligatoria').checked;
  if (!dis || !sug) { toast('Elegí ambas recetas', 'err'); return; }
  if (dis === sug)  { toast('No podés correlacionar una receta consigo misma', 'err'); return; }
  if (!obligatoria && !msg) { toast('Las sugeridas necesitan un mensaje para el cliente', 'err'); return; }
  const { error } = await sb.from('correlaciones').insert({
    receta_disparadora_id: dis,
    receta_sugerida_id:    sug,
    mensaje:               msg || null,
    obligatoria,
    activo:                true,
  });
  if (!error) { cerrarModal('modal-corr'); await cargarTodo(); renderCorrs(); toast('Correlación creada ✓'); }
  else toast('Error al guardar: ' + error.message, 'err');
}

async function toggleCorr(id, activo) {
  await sb.from('correlaciones').update({ activo }).eq('id', id);
  const idx = todasCorrs.findIndex(c => c.id === id);
  if (idx >= 0) todasCorrs[idx].activo = activo;
}

async function eliminarCorr(id) {
  if (!confirm('¿Eliminás esta correlación?')) return;
  await sb.from('correlaciones').delete().eq('id', id);
  todasCorrs = todasCorrs.filter(c => c.id !== id);
  renderCorrs(); toast('Correlación eliminada');
}

// ── OBRAS ──
function renderObras() {
  document.getElementById('obras-body').innerHTML = todasObras.length ?
    todasObras.map(o => `<tr>
      <td><strong>${o.titulo}</strong></td>
      <td>${o.tipo || '—'}</td>
      <td>${o.zona || '—'}</td>
      <td style="font-size:11px;color:#aaa;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.imagen_url || '—'}</td>
      <td><label class="toggle-switch"><input type="checkbox" ${o.activo ? 'checked' : ''} onchange="toggleObra('${o.id}',this.checked)"><span class="toggle-slider"></span></label></td>
      <td style="display:flex;gap:4px">
        <button class="btn-sm" onclick="editarObra('${o.id}')">Editar</button>
        <button class="btn-sm danger" onclick="eliminarObra('${o.id}')">Borrar</button>
      </td>
    </tr>`).join('') :
    '<tr><td colspan="6" class="empty-state">No hay obras cargadas.</td></tr>';
}

function abrirModalObra(id = null) {
  editandoObra = id;
  document.getElementById('modal-obra-tit').textContent = id ? 'Editar obra' : 'Nueva obra';
  if (id) {
    const o = todasObras.find(o => o.id === id);
    document.getElementById('obra-titulo').value = o.titulo || '';
    document.getElementById('obra-tipo').value = o.tipo || '';
    document.getElementById('obra-zona').value = o.zona || '';
    document.getElementById('obra-img').value = o.imagen_url || '';
    document.getElementById('obra-desc').value = o.descripcion || '';
  } else {
    ['obra-titulo','obra-tipo','obra-zona','obra-img','obra-desc'].forEach(i => document.getElementById(i).value = '');
  }
  document.getElementById('modal-obra').classList.add('open');
}

function editarObra(id) { abrirModalObra(id); }

async function guardarObra() {
  const titulo = document.getElementById('obra-titulo').value.trim();
  const img = document.getElementById('obra-img').value.trim();
  if (!titulo || !img) { toast('Completá título e imagen', 'err'); return; }
  const data = { titulo, tipo: document.getElementById('obra-tipo').value || null, zona: document.getElementById('obra-zona').value || null, imagen_url: img, descripcion: document.getElementById('obra-desc').value || null };
  let error;
  if (editandoObra) {
    ({ error } = await sb.from('obras').update(data).eq('id', editandoObra));
  } else {
    ({ error } = await sb.from('obras').insert({ ...data, activo: true }));
  }
  if (!error) { cerrarModal('modal-obra'); await cargarTodo(); renderObras(); toast('Obra guardada ✓'); }
  else toast('Error al guardar', 'err');
}

async function toggleObra(id, activo) {
  await sb.from('obras').update({ activo }).eq('id', id);
}

async function eliminarObra(id) {
  if (!confirm('¿Eliminás esta obra?')) return;
  await sb.from('obras').delete().eq('id', id);
  todasObras = todasObras.filter(o => o.id !== id);
  renderObras(); toast('Obra eliminada');
}

// ── UTILS ──
function cerrarModal(id) { document.getElementById(id).classList.remove('open'); }

// ── IMPORTAR EXCEL ──
function toSentenceCase(str) {
  if (!str) return str;
  const s = str.toString().trim();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

let datosImportar = null;

function iniciarModuloImportar() {
  document.getElementById('import-preview').style.display = 'none';
  document.getElementById('import-progress').style.display = 'none';
  document.getElementById('import-success').style.display = 'none';
  document.getElementById('drop-zone').style.display = 'block';

  const dropZone = document.getElementById('drop-zone');
  const input = document.getElementById('excel-input');

  dropZone.onclick = () => input.click();
  input.onchange = (e) => procesarArchivoExcel(e.target.files[0]);
  document.getElementById('btn-importar-confirmar').onclick = () => confirmarImportacion(false);
  document.getElementById('btn-reemplazar-todo').onclick = () => {
    if (confirm('⚠️ ¿Estás seguro? Esto va a BORRAR TODOS los ítems existentes y cargar solo los del Excel. Esta acción no se puede deshacer.')) {
      confirmarImportacion(true);
    }
  };
  document.getElementById('btn-cancelar-import').onclick = cancelarImport;

  dropZone.ondragover = (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--go)'; dropZone.style.background = 'var(--gf)'; };
  dropZone.ondragleave = () => { dropZone.style.borderColor = 'var(--gc)'; dropZone.style.background = '#fafafa'; };
  dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--gc)';
    dropZone.style.background = '#fafafa';
    const file = e.dataTransfer.files[0];
    if (file) procesarArchivoExcel(file);
  };
}

function cancelarImport() {
  document.getElementById('import-preview').style.display = 'none';
  document.getElementById('drop-zone').style.display = 'block';
  datosImportar = null;
}

async function procesarArchivoExcel(file) {
  if (!file) return;
  if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
    toast('El archivo debe ser .xlsx', 'err'); return;
  }

  if (!window.XLSX) {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    document.head.appendChild(script);
    await new Promise(r => script.onload = r);
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const workbook = XLSX.read(e.target.result, { type: 'array' });
      const items = [];

      const cubosheetName = workbook.SheetNames.find(n =>
        n.includes('Ítems') || n.includes('Items') || n.toLowerCase().includes('cubo')
      );

      if (cubosheetName) {
        const sheet = workbook.Sheets[cubosheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 1 });
        rows.forEach(row => {
          if (!row[0]) return;
          const precioMO = parseFloat(row[4]) || 0;
          const precioMat = parseFloat(row[5]) || 0;
          const ajuste = parseFloat(row[6]);
          const activoStr = (row[7] || '').toString().toLowerCase().trim();
          const activo = activoStr === 'si' || activoStr === 'sí' || activoStr === 'yes' || activoStr === '1' || activoStr === 'true';
          items.push({
            sismat_id: null,
            categoria_nombre: toSentenceCase(row[1]) || 'Sin categoría',
            nombre: toSentenceCase(row[0]),
            descripcion: row[2] ? toSentenceCase(row[2]) : '',
            unidad_nombre: (row[3] || 'unidad').toString().trim(),
            precio_mano_obra: precioMO,
            precio_materiales: precioMat,
            precio: precioMO + precioMat,
            ajuste_porcentaje: isNaN(ajuste) ? 10 : ajuste,
            activo_publico: activo,
            tipo: 'cubo_item'
          });
        });
      } else {
        if (workbook.SheetNames.includes('📦 Materiales') || workbook.SheetNames.some(n => n.includes('Materiales'))) {
          const sheetName = workbook.SheetNames.find(n => n.includes('Materiales'));
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 3 });
          rows.forEach(row => {
            if (!row[2] || row[2] === 'Material') return;
            const precio = parseFloat(row[4]) || 0;
            items.push({
              sismat_id: row[0] || null,
              categoria_nombre: toSentenceCase(row[1]) || 'Sin categoría',
              nombre: toSentenceCase(row[2]),
              unidad_nombre: row[3] || '',
              precio_materiales: precio,
              precio_mano_obra: 0,
              precio: precio,
              ajuste_porcentaje: 10,
              activo_publico: false,
              tipo: 'material'
            });
          });
        }

        if (workbook.SheetNames.some(n => n.includes('Mano'))) {
          const sheetName = workbook.SheetNames.find(n => n.includes('Mano'));
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 3 });
          rows.forEach(row => {
            if (!row[2] || row[2] === 'Tarea') return;
            const precio = parseFloat(row[5]) || 0;
            items.push({
              sismat_id: row[0] || null,
              categoria_nombre: toSentenceCase(row[1]) || 'Sin categoría',
              nombre: toSentenceCase(row[2]),
              descripcion: row[3] ? toSentenceCase(row[3]) : '',
              unidad_nombre: row[4] || '',
              precio_mano_obra: precio,
              precio_materiales: 0,
              precio: precio,
              ajuste_porcentaje: 10,
              activo_publico: false,
              tipo: 'mano_de_obra'
            });
          });
        }
      }

      if (items.length === 0) { toast('No se encontraron datos en el archivo', 'err'); return; }

      datosImportar = items;
      const cuboItems = items.filter(i => i.tipo === 'cubo_item').length;
      const mats = items.filter(i => i.tipo === 'material').length;
      const mo = items.filter(i => i.tipo === 'mano_de_obra').length;

      document.getElementById('imp-materiales').textContent = cuboItems > 0 ? cuboItems : mats;
      document.getElementById('imp-mo').textContent = cuboItems > 0 ? '—' : mo;
      document.getElementById('imp-total').textContent = items.length;
      document.getElementById('imp-materiales-lbl').textContent = cuboItems > 0 ? 'Ítems CUBO' : 'Materiales';
      document.getElementById('imp-mo-lbl').textContent = cuboItems > 0 ? 'Formato' : 'Mano de obra';
      if (cuboItems > 0) document.getElementById('imp-mo').textContent = 'CUBO';

      const tipoLabel = (i) => {
        if (i.tipo === 'cubo_item') return '<span class="badge badge-ok">Ítem CUBO</span>';
        if (i.tipo === 'material') return '<span class="badge badge-nuevo">Material</span>';
        return '<span class="badge badge-contactado">Mano de obra</span>';
      };

      document.getElementById('import-preview-body').innerHTML = items.slice(0, 10).map(i => `
        <tr>
          <td>${i.categoria_nombre}</td>
          <td>${i.nombre}</td>
          <td>${i.unidad_nombre}</td>
          <td>${fmt(i.precio)}</td>
          <td>${tipoLabel(i)}</td>
        </tr>`).join('');

      document.getElementById('drop-zone').style.display = 'none';
      document.getElementById('import-preview').style.display = 'block';
      const modoMsg = cuboItems > 0 ? `${cuboItems} ítems CUBO` : `${items.length} ítems Sysmat`;
      toast(`${modoMsg} listos para importar`, 'ok');

    } catch(err) {
      toast('Error al leer el archivo: ' + err.message, 'err');
    }
  };
  reader.readAsArrayBuffer(file);
}

async function confirmarImportacion(reemplazarTodo = false) {
  if (!datosImportar || datosImportar.length === 0) return;

  document.getElementById('import-preview').style.display = 'none';
  document.getElementById('import-progress').style.display = 'block';

  const setStatus = (msg) => document.getElementById('import-status').textContent = msg;
  const setBar = (pct) => document.getElementById('import-bar').style.width = pct + '%';
  const addLog = (msg) => { document.getElementById('import-log').textContent = msg; };

  let creados = 0, actualizados = 0, errores = 0;
  const total = datosImportar.length;

  if (reemplazarTodo) {
    setStatus('Eliminando ítems y correlaciones existentes...');
    addLog('Borrando base de datos...');
    const { error: errCorr } = await sb.from('correlaciones').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (errCorr) { toast('Error al borrar correlaciones: ' + errCorr.message, 'err'); return; }
    const { error } = await sb.from('items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) { toast('Error al borrar ítems: ' + error.message, 'err'); return; }
    todosItems = [];
    addLog('✓ Base limpia. Cargando nuevos ítems...');
  }

  setStatus('Verificando categorías...');
  const catNombres = [...new Set(datosImportar.map(i => i.categoria_nombre))];
  const catMap = {};

  const normCat = s => (s || '').trim().toLowerCase();
  for (const nombre of catNombres) {
    let cat = categorias.find(c => normCat(c.nombre) === normCat(nombre));
    if (!cat) {
      const { data } = await sb.from('categorias').insert({ nombre, activo: true, orden: 99 }).select().single();
      if (data) { categorias.push(data); cat = data; }
    }
    if (cat) catMap[nombre] = cat.id;
  }

  setStatus('Importando ítems...');

  const loteSize = 50;
  for (let i = 0; i < datosImportar.length; i += loteSize) {
    const lote = datosImportar.slice(i, i + loteSize);
    const pct = Math.round((i / total) * 100);
    setBar(pct);
    addLog(`Procesando ${i + 1} a ${Math.min(i + loteSize, total)} de ${total}...`);

    for (const item of lote) {
      const catId = catMap[item.categoria_nombre];
      if (!catId) { errores++; continue; }

      const unidadMap = {
        'Metro cuadrado': 'm²', 'Metro lineal': 'ml', 'Metro cúbico': 'm³',
        'Unidad': 'unidad', 'Litro': 'lt', 'Kilogramo': 'kg', 'Global': 'global'
      };
      const unidad = unidadMap[item.unidad_nombre] || item.unidad_nombre?.toLowerCase() || 'unidad';

      const data = {
        categoria_id: catId,
        nombre: item.nombre,
        descripcion: item.descripcion || null,
        unidad,
        precio: item.precio,
        precio_mano_obra: item.precio_mano_obra,
        precio_materiales: item.precio_materiales,
        ajuste_porcentaje: item.ajuste_porcentaje ?? 10,
        activo_publico: item.activo_publico ?? false,
        referencia_sismat: item.sismat_id ? String(item.sismat_id) : null,
      };

      if (reemplazarTodo) {
        const { error } = await sb.from('items').insert(data);
        if (!error) creados++; else errores++;
      } else {
        const existente = todosItems.find(ex => ex.nombre === item.nombre && ex.categoria_id === catId);
        if (existente) {
          const { error } = await sb.from('items').update({
            precio: item.precio,
            precio_mano_obra: item.precio_mano_obra,
            precio_materiales: item.precio_materiales
          }).eq('id', existente.id);
          if (!error) actualizados++; else errores++;
        } else {
          const { error } = await sb.from('items').insert(data);
          if (!error) creados++; else errores++;
        }
      }
    }
  }

  setBar(100);
  setStatus('¡Completado!');
  await cargarTodo();

  document.getElementById('import-progress').style.display = 'none';
  document.getElementById('import-success').style.display = 'block';
  document.getElementById('import-success-msg').textContent = reemplazarTodo
    ? `${creados} ítems cargados desde cero · ${errores} errores`
    : `${creados} ítems nuevos · ${actualizados} precios actualizados · ${errores} errores`;

  toast('Importación completa ✓', 'ok');
  datosImportar = null;
}

// ── CONFIGURACIÓN ──

async function cargarConfiguracion() {
  const { data, error } = await sb.from('configuracion').select('clave, valor');
  if (error) { toast('Error al cargar configuración', 'err'); return; }
  const cfg = Object.fromEntries((data || []).map(r => [r.clave, r.valor]));
  document.getElementById('cfg-email').value = cfg.email || '';
  document.getElementById('cfg-telefono').value = cfg.telefono || '';
  document.getElementById('cfg-instagram').value = cfg.instagram || '';
  document.getElementById('cfg-zona').value = cfg.zona || '';
}

async function guardarConfiguracion() {
  const btn = document.getElementById('cfg-guardar');
  btn.disabled = true; btn.textContent = 'Guardando...';
  const campos = [
    { clave: 'email', valor: document.getElementById('cfg-email').value.trim() },
    { clave: 'telefono', valor: document.getElementById('cfg-telefono').value.trim() },
    { clave: 'instagram', valor: document.getElementById('cfg-instagram').value.trim() },
    { clave: 'zona', valor: document.getElementById('cfg-zona').value.trim() },
  ];
  for (const campo of campos) {
    await sb.from('configuracion').upsert(campo, { onConflict: 'clave' });
  }
  btn.disabled = false; btn.textContent = 'Guardar cambios';
  toast('Configuración guardada ✓', 'ok');
}

// ── MOTOR DE PRECIOS ──

const RECETAS_DEFAULT = [
  // DEMOLICIÓN
  { id:'demo-revoques',      nombre:'Picado de revoques',                 categoria_nombre:'Demolición',              unidad:'m²',     mo:{tipo:'sismat',busqueda:'picado revoques',     precio_manual:45000}, materiales:[], colchon:15 },
  { id:'demo-revestimiento', nombre:'Picado de revestimientos',           categoria_nombre:'Demolición',              unidad:'m²',     mo:{tipo:'sismat',busqueda:'picado azulejos',      precio_manual:40000}, materiales:[], colchon:15 },
  { id:'demo-pisos',         nombre:'Demolición de pisos',                categoria_nombre:'Demolición',              unidad:'m²',     mo:{tipo:'sismat',busqueda:'demolición pisos',     precio_manual:35000}, materiales:[], colchon:15 },
  // ALBAÑILERÍA
  { id:'alba-tabique',       nombre:'Tabique de ladrillo',                categoria_nombre:'Albañilería',             unidad:'m²',     mo:{tipo:'sismat',busqueda:'tabique ladrillo',     precio_manual:80000}, materiales:[{nombre:'cemento albañilería',cantidad:3.5},{nombre:'arena',cantidad:0.025},{nombre:'ladrillo',cantidad:36}], colchon:15 },
  { id:'alba-contrapiso',    nombre:'Contrapiso',                         categoria_nombre:'Albañilería',             unidad:'m²',     mo:{tipo:'sismat',busqueda:'contrapiso',           precio_manual:55000}, materiales:[{nombre:'cemento albañilería',cantidad:6},{nombre:'cascote',cantidad:0.08},{nombre:'arena',cantidad:0.03}], colchon:15 },
  { id:'alba-carpeta',       nombre:'Carpeta',                            categoria_nombre:'Albañilería',             unidad:'m²',     mo:{tipo:'sismat',busqueda:'carpeta niveladora',   precio_manual:45000}, materiales:[{nombre:'cemento albañilería',cantidad:8},{nombre:'arena',cantidad:0.04}], colchon:15 },
  { id:'alba-carpeta-hidro', nombre:'Carpeta hidrófuga',                  categoria_nombre:'Albañilería',             unidad:'m²',     mo:{tipo:'sismat',busqueda:'carpeta hidrófuga',    precio_manual:50000}, materiales:[{nombre:'cemento albañilería',cantidad:8},{nombre:'arena',cantidad:0.04},{nombre:'hidrófugo',cantidad:0.5}], colchon:15 },
  { id:'alba-revoque',       nombre:'Revoque interior',                   categoria_nombre:'Albañilería',             unidad:'m²',     mo:{tipo:'sismat',busqueda:'revoque grueso fino',  precio_manual:65000}, materiales:[{nombre:'cemento albañilería',cantidad:2.52},{nombre:'arena',cantidad:0.028},{nombre:'cal hidratada',cantidad:4.52},{nombre:'cal aérea',cantidad:2.2}], colchon:15 },
  { id:'alba-revoque-banio', nombre:'Revoque en baño (con hidrófugo)',    categoria_nombre:'Albañilería',             unidad:'m²',     mo:{tipo:'sismat',busqueda:'revoque hidrófugo',    precio_manual:70000}, materiales:[{nombre:'cemento albañilería',cantidad:2.52},{nombre:'arena',cantidad:0.028},{nombre:'cal hidratada',cantidad:4.52},{nombre:'cal aérea',cantidad:2.2},{nombre:'hidrófugo',cantidad:0.3}], colchon:15 },
  { id:'alba-enlucido',      nombre:'Enlucido de yeso',                   categoria_nombre:'Albañilería',             unidad:'m²',     mo:{tipo:'sismat',busqueda:'enlucido yeso',         precio_manual:40000}, materiales:[{nombre:'yeso construcción',cantidad:2.5}], colchon:15 },
  // REVESTIMIENTOS Y PISOS
  { id:'rev-ceramica-piso',  nombre:'Cerámica en piso',                   categoria_nombre:'Revestimientos y pisos',  unidad:'m²',     mo:{tipo:'sismat',busqueda:'colocación cerámica piso',   precio_manual:55000}, materiales:[{nombre:'adhesivo cerámico',cantidad:5},{nombre:'pastina cerámica',cantidad:0.3}], colchon:15 },
  { id:'rev-ceramica-pared', nombre:'Cerámica en pared',                  categoria_nombre:'Revestimientos y pisos',  unidad:'m²',     mo:{tipo:'sismat',busqueda:'colocación cerámica pared',  precio_manual:60000}, materiales:[{nombre:'adhesivo cerámico',cantidad:5},{nombre:'pastina cerámica',cantidad:0.3}], colchon:15 },
  { id:'rev-porce-piso',     nombre:'Porcelanato en piso',                categoria_nombre:'Revestimientos y pisos',  unidad:'m²',     mo:{tipo:'sismat',busqueda:'colocación porcelanato piso', precio_manual:70000}, materiales:[{nombre:'adhesivo cerámico porcelanato',cantidad:5},{nombre:'pastina porcelanato',cantidad:0.3}], colchon:15 },
  { id:'rev-porce-pared',    nombre:'Porcelanato en pared',               categoria_nombre:'Revestimientos y pisos',  unidad:'m²',     mo:{tipo:'sismat',busqueda:'colocación porcelanato pared',precio_manual:75000}, materiales:[{nombre:'adhesivo cerámico porcelanato',cantidad:5},{nombre:'pastina porcelanato',cantidad:0.3}], colchon:15 },
  { id:'rev-microcemento',   nombre:'Microcemento',                       categoria_nombre:'Revestimientos y pisos',  unidad:'m²',     mo:{tipo:'sismat',busqueda:'microcemento',         precio_manual:90000}, materiales:[{nombre:'microcemento',cantidad:1.5}], colchon:15 },
  { id:'rev-texturado',      nombre:'Texturado',                          categoria_nombre:'Revestimientos y pisos',  unidad:'m²',     mo:{tipo:'sismat',busqueda:'texturado',             precio_manual:40000}, materiales:[{nombre:'revestimiento texturado',cantidad:2}], colchon:15 },
  // CONSTRUCCIÓN EN SECO
  { id:'seco-tabique',       nombre:'Tabique Durlock simple',             categoria_nombre:'Construcción en seco',    unidad:'m²',     mo:{tipo:'sismat',busqueda:'tabique placa de yeso', precio_manual:70000}, materiales:[{nombre:'placa durlock estándar',cantidad:2.1},{nombre:'perfil montante',cantidad:1.2},{nombre:'perfil solera',cantidad:0.5}], colchon:15 },
  { id:'seco-cielorraso',    nombre:'Cielorraso Durlock',                 categoria_nombre:'Construcción en seco',    unidad:'m²',     mo:{tipo:'sismat',busqueda:'cielorraso placa de yeso', precio_manual:65000}, materiales:[{nombre:'placa durlock estándar',cantidad:1.1},{nombre:'perfil montante',cantidad:0.8},{nombre:'perfil solera',cantidad:0.8}], colchon:15 },
  // INSTALACIONES SANITARIAS
  { id:'inst-agua-banio',    nombre:'Inst. agua fría y caliente (baño)',  categoria_nombre:'Instalaciones sanitarias', unidad:'unidad', mo:{tipo:'manual',busqueda:'',precio_manual:250000}, materiales:[], colchon:15 },
  { id:'inst-desague-banio', nombre:'Inst. desagüe (baño)',               categoria_nombre:'Instalaciones sanitarias', unidad:'unidad', mo:{tipo:'manual',busqueda:'',precio_manual:180000}, materiales:[], colchon:15 },
  { id:'inst-cocina',        nombre:'Inst. agua y desagüe (cocina)',      categoria_nombre:'Instalaciones sanitarias', unidad:'unidad', mo:{tipo:'manual',busqueda:'',precio_manual:300000}, materiales:[], colchon:15 },
  { id:'inst-artefactos-b',  nombre:'Colocación de artefactos (baño)',    categoria_nombre:'Instalaciones sanitarias', unidad:'unidad', mo:{tipo:'manual',busqueda:'',precio_manual:120000}, materiales:[], colchon:15 },
  { id:'inst-artefactos-c',  nombre:'Colocación de artefactos (cocina)', categoria_nombre:'Instalaciones sanitarias', unidad:'unidad', mo:{tipo:'manual',busqueda:'',precio_manual:80000},  materiales:[], colchon:15 },
  // ELECTRICIDAD
  { id:'elec-boca',          nombre:'Instalación eléctrica (por boca)',   categoria_nombre:'Electricidad',            unidad:'boca',   mo:{tipo:'manual',busqueda:'',precio_manual:47000},  materiales:[], colchon:15 },
  // CARPINTERÍA
  { id:'carp-vent-al-std',   nombre:'Ventana aluminio 1.50×1.10 m',      categoria_nombre:'Carpintería',             unidad:'unidad', mo:{tipo:'manual',busqueda:'',precio_manual:450000}, materiales:[], colchon:15 },
  { id:'carp-balcon-al',     nombre:'Puerta balcón aluminio',             categoria_nombre:'Carpintería',             unidad:'unidad', mo:{tipo:'manual',busqueda:'',precio_manual:700000}, materiales:[], colchon:15 },
  { id:'carp-balcon-pvc',    nombre:'Puerta balcón PVC',                  categoria_nombre:'Carpintería',             unidad:'unidad', mo:{tipo:'manual',busqueda:'',precio_manual:900000}, materiales:[], colchon:15 },
  // PINTURA
  { id:'pin-interior',       nombre:'Enduido + látex interior',           categoria_nombre:'Pintura',                 unidad:'m²',     mo:{tipo:'sismat',busqueda:'pintura interior látex',precio_manual:35000}, materiales:[{nombre:'enduido plástico',cantidad:0.3},{nombre:'látex interior',cantidad:0.15}], colchon:15 },
  { id:'pin-exterior',       nombre:'Látex exterior',                     categoria_nombre:'Pintura',                 unidad:'m²',     mo:{tipo:'sismat',busqueda:'pintura exterior látex',precio_manual:30000}, materiales:[{nombre:'látex exterior',cantidad:0.2}], colchon:15 },
  // ARTEFACTOS Y AMOBLAMIENTOS
  { id:'art-sanitarios',     nombre:'Artefactos sanitarios (baño completo)', categoria_nombre:'Artefactos y amoblamientos', unidad:'unidad', mo:{tipo:'manual',busqueda:'',precio_manual:1500000}, materiales:[], colchon:10 },
  { id:'amob-cocina',        nombre:'Amoblamiento de cocina',             categoria_nombre:'Artefactos y amoblamientos', unidad:'unidad', mo:{tipo:'manual',busqueda:'',precio_manual:796000},  materiales:[], colchon:10 },
];

let motorRecetas = [];
let sismatMotor = { materiales: [], mano_de_obra: [], cargado: false };
let recetaEditandoId = null;
let materialesEditando = [];

function iniciarMotor() {
  const saved = localStorage.getItem('cubo_motor_recetas');
  if (saved) {
    try { motorRecetas = JSON.parse(saved); }
    catch { motorRecetas = copiarRecetasDefault(); }
  } else {
    motorRecetas = copiarRecetasDefault();
  }
  renderMotorRecetas();
  actualizarBadgeSismat();
}

function copiarRecetasDefault() {
  return RECETAS_DEFAULT.map(r => ({
    ...r,
    mo: { ...r.mo, precio_calculado: null, fuente: null },
    materiales: r.materiales.map(m => ({ ...m })),
    precio_mo_calc: null,
    precio_mat_calc: null,
    precio_total_calc: null
  }));
}

function guardarRecetasLocal() {
  localStorage.setItem('cubo_motor_recetas', JSON.stringify(motorRecetas));
}

function actualizarBadgeSismat() {
  const badge = document.getElementById('motor-sismat-badge');
  const sub = document.getElementById('motor-sismat-sub');
  if (sismatMotor.cargado) {
    badge.style.display = 'inline';
    badge.textContent = `✅ ${sismatMotor.materiales.length} materiales · ${sismatMotor.mano_de_obra.length} MO`;
    sub.textContent = 'Datos cargados. Hacé clic en "Calcular precios" para usar los precios actualizados.';
  } else {
    badge.style.display = 'none';
    sub.textContent = 'Cargá el Excel de Sismat para actualizar precios automáticamente. Los servicios con precio manual no lo necesitan.';
  }
}

async function cargarSismatMotor(file) {
  if (!file) return;
  if (!window.XLSX) {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    document.head.appendChild(s);
    await new Promise(r => s.onload = r);
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const sheetMat = wb.SheetNames.find(n => n.toLowerCase().includes('material'));
      if (sheetMat) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetMat], { header: 1, range: 3 });
        sismatMotor.materiales = rows
          .filter(r => r[2] && r[2] !== 'Material')
          .map(r => ({ sismat_id: r[0], nombre: String(r[2]), unidad: r[3] || '', precio: parseFloat(r[4]) || 0 }))
          .filter(r => r.precio > 0);
      }
      const sheetMO = wb.SheetNames.find(n => n.toLowerCase().includes('mano') || n.toLowerCase().includes('obra'));
      if (sheetMO) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetMO], { header: 1, range: 3 });
        sismatMotor.mano_de_obra = rows
          .filter(r => r[2] && r[2] !== 'Tarea')
          .map(r => ({ sismat_id: r[0], nombre: String(r[2]), unidad: r[4] || '', precio: parseFloat(r[5]) || 0 }))
          .filter(r => r.precio > 0);
      }
      sismatMotor.cargado = true;
      actualizarBadgeSismat();
      toast(`Sismat cargado: ${sismatMotor.materiales.length} materiales, ${sismatMotor.mano_de_obra.length} tareas MO ✓`, 'ok');
    } catch (err) {
      toast('Error al leer el Excel: ' + err.message, 'err');
    }
  };
  reader.readAsArrayBuffer(file);
}

function normTexto(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function buscarSismat(tipo, busqueda) {
  const data = tipo === 'mo' ? sismatMotor.mano_de_obra : sismatMotor.materiales;
  const palabras = normTexto(busqueda).split(' ').filter(Boolean);
  if (!palabras.length || !data.length) return null;
  let matches = data.filter(d => {
    const n = normTexto(d.nombre);
    return palabras.every(p => n.includes(p));
  });
  if (!matches.length) {
    matches = data.filter(d => {
      const n = normTexto(d.nombre);
      const hits = palabras.filter(p => n.includes(p)).length;
      return hits >= Math.ceil(palabras.length * 0.6);
    });
  }
  if (!matches.length) return null;
  return matches.sort((a, b) => a.precio - b.precio)[0];
}

function calcularTodosPrecios() {
  motorRecetas.forEach(r => {
    if (r.mo.tipo === 'sismat' && sismatMotor.cargado && r.mo.busqueda) {
      const found = buscarSismat('mo', r.mo.busqueda);
      r.mo.precio_calculado = found ? found.precio : r.mo.precio_manual;
      r.mo.fuente = found ? found.nombre : null;
    } else {
      r.mo.precio_calculado = r.mo.precio_manual;
      r.mo.fuente = null;
    }
    r.precio_mo_calc = r.mo.precio_calculado || 0;
    r.precio_mat_calc = 0;
    r.materiales.forEach(m => {
      if (sismatMotor.cargado && m.nombre) {
        const found = buscarSismat('material', m.nombre);
        m.precio_calculado = found ? found.precio : 0;
        m.fuente = found ? found.nombre : null;
      } else {
        m.precio_calculado = 0;
        m.fuente = null;
      }
      r.precio_mat_calc += m.cantidad * (m.precio_calculado || 0);
    });
    r.precio_total_calc = (r.precio_mo_calc + r.precio_mat_calc) * (1 + r.colchon / 100);
  });
  guardarRecetasLocal();
  renderMotorRecetas();
  document.getElementById('motor-publish-area').style.display = 'block';
  toast('¡Precios calculados! Revisá la tabla y publicá cuando estés listo.', 'ok');
}

function renderMotorRecetas() {
  const tbody = document.getElementById('motor-recetas-body');
  let ultimaCat = '';
  tbody.innerHTML = motorRecetas.map((r, i) => {
    const catHeader = r.categoria_nombre !== ultimaCat
      ? `<tr style="background:var(--gf)"><td colspan="8" style="padding:8px 14px;font-size:10px;font-weight:800;color:var(--gm);text-transform:uppercase;letter-spacing:1px">${r.categoria_nombre}</td></tr>`
      : '';
    ultimaCat = r.categoria_nombre;

    const moDesc = r.mo.tipo === 'manual'
      ? `<span style="font-size:11px;color:var(--gm)">Manual</span>`
      : `<span style="font-size:11px;color:var(--gm)">Sismat: "${r.mo.busqueda || '—'}"</span>`;
    const moCalc = r.precio_mo_calc
      ? `<br><span style="font-size:10px;color:var(--ok);font-weight:700">→ ${fmt(r.precio_mo_calc)}/und</span>`
      : (r.mo.fuente === null && r.mo.tipo === 'sismat' ? '' : '');

    const matDesc = r.materiales.length === 0
      ? `<span style="color:#ccc;font-size:11px">—</span>`
      : `<span style="font-size:11px;color:var(--gm)">${r.materiales.length} ingrediente${r.materiales.length > 1 ? 's' : ''}</span>`;
    const matCalc = r.precio_mat_calc > 0
      ? `<br><span style="font-size:10px;color:var(--ok);font-weight:700">→ ${fmt(r.precio_mat_calc)}/und</span>`
      : '';

    const precioFinal = r.precio_total_calc > 0
      ? `<strong style="color:var(--go);font-size:13px">${fmt(r.precio_total_calc)}</strong><span style="font-size:10px;color:#bbb;display:block">${r.unidad}</span>`
      : `<span style="color:#ccc">—</span>`;

    return catHeader + `<tr>
      <td style="color:#bbb;font-size:11px;font-weight:600">${i + 1}</td>
      <td><strong style="font-size:12px">${r.nombre}</strong></td>
      <td style="font-size:12px;color:var(--gm)">${r.unidad}</td>
      <td>${moDesc}${moCalc}</td>
      <td>${matDesc}${matCalc}</td>
      <td><span style="font-size:12px;font-weight:700">${r.colchon}%</span></td>
      <td>${precioFinal}</td>
      <td><button class="btn-sm" onclick="abrirModalReceta('${r.id}')">Editar</button></td>
    </tr>`;
  }).join('');
}

function abrirModalReceta(id) {
  const r = motorRecetas.find(rec => rec.id === id);
  if (!r) return;
  recetaEditandoId = id;
  materialesEditando = r.materiales.map(m => ({ ...m }));

  document.getElementById('modal-receta-tit').textContent = r.nombre;

  const catSel = document.getElementById('receta-categoria');
  const catOpts = categorias.map(c => `<option value="${c.nombre}" ${c.nombre === r.categoria_nombre ? 'selected' : ''}>${c.emoji || ''} ${c.nombre}</option>`).join('');
  const catExiste = categorias.find(c => c.nombre === r.categoria_nombre);
  catSel.innerHTML = (catExiste ? '' : `<option value="${r.categoria_nombre}" selected>${r.categoria_nombre}</option>`) + catOpts;

  document.getElementById('receta-unidad').value = r.unidad;
  document.getElementById('receta-colchon').value = r.colchon;
  document.getElementById('mo-tipo-' + r.mo.tipo).checked = true;
  document.getElementById('receta-mo-busqueda').value = r.mo.busqueda || '';
  document.getElementById('receta-mo-manual').value = r.mo.precio_manual || 0;
  toggleMoTipo();
  renderMaterialesModal();
  document.getElementById('modal-receta').classList.add('open');
}

function toggleMoTipo() {
  const tipo = document.querySelector('input[name="mo-tipo"]:checked')?.value;
  document.getElementById('mo-sismat-section').style.display = tipo === 'sismat' ? 'block' : 'none';
  document.getElementById('mo-manual-section').style.display = tipo === 'manual' ? 'block' : 'none';
}

function renderMaterialesModal() {
  const container = document.getElementById('receta-materiales-list');
  document.getElementById('receta-mat-header').style.display = materialesEditando.length ? 'grid' : 'none';
  if (!materialesEditando.length) {
    container.innerHTML = '<p style="font-size:11px;color:#bbb;font-weight:500;margin:0">Sin materiales. Este servicio es solo mano de obra.</p>';
    return;
  }
  container.innerHTML = materialesEditando.map((m, i) => `
    <div class="receta-mat-row">
      <input class="receta-mat-inp" placeholder="Ej: cemento albañilería"
        value="${m.nombre || ''}" oninput="materialesEditando[${i}].nombre = this.value">
      <input class="receta-mat-inp" type="number" placeholder="cant." step="any"
        value="${m.cantidad || ''}" oninput="materialesEditando[${i}].cantidad = parseFloat(this.value)||0">
      <button onclick="quitarMaterialModal(${i})"
        style="background:#ffebee;border:none;border-radius:6px;cursor:pointer;color:var(--er);font-size:14px;font-weight:800;padding:2px 8px;line-height:1.6">×</button>
    </div>
  `).join('');
}

function agregarMaterialModal() {
  materialesEditando.push({ nombre: '', cantidad: 0 });
  renderMaterialesModal();
  const inputs = document.querySelectorAll('#receta-materiales-list .receta-mat-inp');
  if (inputs.length) inputs[inputs.length - 2].focus();
}

function quitarMaterialModal(i) {
  materialesEditando.splice(i, 1);
  renderMaterialesModal();
}

function guardarReceta() {
  const r = motorRecetas.find(rec => rec.id === recetaEditandoId);
  if (!r) return;
  r.categoria_nombre = document.getElementById('receta-categoria').value;
  r.unidad = document.getElementById('receta-unidad').value;
  r.colchon = parseFloat(document.getElementById('receta-colchon').value) || 15;
  const moTipo = document.querySelector('input[name="mo-tipo"]:checked')?.value || 'manual';
  r.mo.tipo = moTipo;
  r.mo.busqueda = document.getElementById('receta-mo-busqueda').value.trim();
  r.mo.precio_manual = parseFloat(document.getElementById('receta-mo-manual').value) || 0;
  r.materiales = materialesEditando.filter(m => m.nombre && m.nombre.trim());
  r.precio_mo_calc = null; r.precio_mat_calc = null; r.precio_total_calc = null;
  guardarRecetasLocal();
  renderMotorRecetas();
  cerrarModal('modal-receta');
  toast('Receta guardada ✓');
}

async function publicarPrecios() {
  const btn = document.getElementById('motor-pub-btn');
  btn.disabled = true;
  btn.textContent = 'Publicando...';
  let ok = 0, actualiz = 0, sinPrecio = 0, errores = 0;

  for (const r of motorRecetas) {
    const moVal = r.precio_mo_calc ?? r.mo.precio_manual ?? 0;
    const matVal = r.precio_mat_calc ?? 0;
    const totalBase = moVal + matVal;
    if (!totalBase) { sinPrecio++; continue; }

    let cat = categorias.find(c => c.nombre.toLowerCase() === r.categoria_nombre.toLowerCase());
    if (!cat) {
      const { data: newCat, error: catErr } = await sb.from('categorias').insert({ nombre: r.categoria_nombre, activo: true, orden: 99 }).select().single();
      if (catErr || !newCat) { errores++; continue; }
      categorias.push(newCat); cat = newCat;
    }

    const itemData = {
      categoria_id: cat.id,
      nombre: r.nombre,
      unidad: r.unidad,
      precio_mano_obra: Math.round(moVal),
      precio_materiales: Math.round(matVal),
      precio: Math.round(totalBase),
      ajuste_porcentaje: r.colchon,
      referencia_excel: 'motor:' + r.id
    };

    const existing = todosItems.find(i => i.referencia_excel === 'motor:' + r.id) ||
                     todosItems.find(i => i.nombre === r.nombre && i.categoria_id === cat.id);

    if (existing) {
      const { error } = await sb.from('items').update(itemData).eq('id', existing.id);
      if (!error) actualiz++; else errores++;
    } else {
      const { error } = await sb.from('items').insert({ ...itemData, activo_publico: false });
      if (!error) ok++; else errores++;
    }
  }

  await cargarTodo();
  btn.disabled = false;
  btn.textContent = '✅ Publicar todos los precios';

  const partes = [];
  if (ok) partes.push(`${ok} nuevos`);
  if (actualiz) partes.push(`${actualiz} actualizados`);
  if (sinPrecio) partes.push(`${sinPrecio} sin precio (saltados)`);
  if (errores) partes.push(`${errores} errores`);
  toast(partes.join(' · '), errores ? 'err' : 'ok');
}

// ── INIT ──
sb.auth.getSession().then(({ data: { session } }) => {
  if (session) iniciarApp();
});
