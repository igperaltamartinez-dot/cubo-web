// ── CATÁLOGO SISMAT ──
// Muestra los ~1856 ítems paginados (50 por página).
// Los overrides (nombre CUBO, visible, categoría) se guardan en sismat_catalog_overrides.

const _CS_PER_PAGE = 50;

let _csPage    = 0;
let _csTotal   = 0;
let _csFiltro  = { texto: '', tipo: '', cat_sismat: '', visibilidad: '' };
let _csOvMap   = {};   // sismat_id → override row (cargado al init)

async function iniciarCatalogoSismat() {
  _csPage   = 0;
  _csFiltro = { texto: '', tipo: '', cat_sismat: '', visibilidad: '' };

  document.getElementById('cs-tbody').innerHTML =
    '<tr><td colspan="6" class="empty-state">Cargando...</td></tr>';

  await Promise.all([_csRecargarOverrides(), _csPoblarCats()]);

  // Conectar filtros — un solo handler que reinicia a página 0
  ['cs-buscar','cs-tipo','cs-cat','cs-vis'].forEach(id => {
    const el = document.getElementById(id);
    const ev = id === 'cs-buscar' ? 'input' : 'change';
    el[`on${ev}`] = _csDebounce(() => { _csPage = 0; _csCargarPagina(); }, id === 'cs-buscar' ? 350 : 0);
  });

  await _csCargarPagina();
}

async function _csRecargarOverrides() {
  const { data } = await sb.from('sismat_catalog_overrides').select('*');
  _csOvMap = {};
  (data || []).forEach(r => { _csOvMap[r.sismat_id] = r; });
}

async function _csPoblarCats() {
  const { data } = await sb.from('sismat_catalog')
    .select('categoria_sismat, categoria_sismat_id')
    .limit(2000);

  const seen = new Set();
  const cats = [];
  (data || []).forEach(r => {
    if (!seen.has(r.categoria_sismat_id)) {
      seen.add(r.categoria_sismat_id);
      cats.push({ id: r.categoria_sismat_id, nombre: r.categoria_sismat });
    }
  });
  cats.sort((a, b) => a.nombre.localeCompare(b.nombre));

  document.getElementById('cs-cat').innerHTML =
    '<option value="">Todas las categorías</option>' +
    cats.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
}

async function _csCargarPagina() {
  const texto      = document.getElementById('cs-buscar').value.trim();
  const tipo       = document.getElementById('cs-tipo').value;
  const catSismat  = document.getElementById('cs-cat').value;
  const visibilidad = document.getElementById('cs-vis').value;
  _csFiltro = { texto, tipo, cat_sismat: catSismat, visibilidad };

  const from = _csPage * _CS_PER_PAGE;
  const to   = from + _CS_PER_PAGE - 1;

  let q = sb.from('sismat_catalog').select('*', { count: 'exact' });

  if (texto)     q = q.ilike('nombre_original', `%${texto}%`);
  if (tipo)      q = q.eq('tipo', tipo);
  if (catSismat) q = q.eq('categoria_sismat_id', parseInt(catSismat));

  if (visibilidad === 'visible') {
    const ids = Object.values(_csOvMap).filter(o => o.visible_en_cotizador).map(o => o.sismat_id);
    if (!ids.length) { _csRenderTabla([]); return; }
    q = q.in('sismat_id', ids);
  } else if (visibilidad === 'oculto') {
    const ids = Object.values(_csOvMap).filter(o => o.visible_en_cotizador).map(o => o.sismat_id);
    if (ids.length) q = q.not('sismat_id', 'in', `(${ids.join(',')})`);
  }

  q = q.order('categoria_sismat').order('nombre_original').range(from, to);

  const { data, count, error } = await q;
  if (error) { toast('Error al cargar catálogo: ' + error.message, 'err'); return; }

  _csTotal = count || 0;
  _csRenderTabla(data || []);
}

function _csRenderTabla(items) {
  const totalPags = Math.ceil(_csTotal / _CS_PER_PAGE) || 1;

  document.getElementById('cs-count').textContent =
    `${_csTotal.toLocaleString('es-AR')} ítems · página ${_csPage + 1} de ${totalPags}`;
  document.getElementById('cs-pag-prev').disabled = _csPage === 0;
  document.getElementById('cs-pag-next').disabled = _csPage >= totalPags - 1;

  if (!items.length) {
    document.getElementById('cs-tbody').innerHTML =
      '<tr><td colspan="6" class="empty-state">No hay ítems con esos filtros.</td></tr>';
    return;
  }

  // Opciones de categoría CUBO (usa el array global `categorias` de admin-app.js)
  const catCuboOpts = '<option value="">— Sin asignar —</option>' +
    categorias.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');

  document.getElementById('cs-tbody').innerHTML = items.map(item => {
    const ov      = _csOvMap[item.sismat_id] || {};
    const visible  = ov.visible_en_cotizador || false;
    const catCuboId = ov.categoria_cubo_id || '';

    const badge = item.tipo === 'material'
      ? '<span class="badge badge-nuevo">Mat</span>'
      : '<span class="badge badge-contactado">MO</span>';

    const catOpts = catCuboOpts.replace(
      `value="${catCuboId}"`, `value="${catCuboId}" selected`
    );

    return `<tr>
      <td>
        ${badge}
        <div style="font-size:10px;color:var(--gm);margin-top:3px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.categoria_sismat}</div>
      </td>
      <td>
        <div style="font-size:12px;font-weight:600;color:var(--tx);margin-bottom:3px">${_csEsc(item.nombre_original)}</div>
        <input class="cs-inp" placeholder="Sobrescribir nombre para el cliente..."
          value="${_csEsc(ov.nombre_cubo || '')}"
          onblur="csGuardarCampo(${item.sismat_id},'nombre_cubo',this.value)"
          onkeydown="if(event.key==='Enter')this.blur()">
      </td>
      <td style="font-size:12px;color:var(--gm)">${item.unidad}</td>
      <td style="font-weight:700;font-size:12px;white-space:nowrap">$${Math.round(item.precio_sismat).toLocaleString('es-AR')}</td>
      <td>
        <label class="toggle-switch">
          <input type="checkbox" ${visible ? 'checked' : ''}
            onchange="csToggleVisible(${item.sismat_id},this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </td>
      <td>
        <select class="cs-sel" onchange="csGuardarCampo(${item.sismat_id},'categoria_cubo_id',this.value||null)">
          ${catOpts}
        </select>
      </td>
    </tr>`;
  }).join('');
}

// ── ACCIONES ──

async function csToggleVisible(sismat_id, visible) {
  const { error } = await sb.from('sismat_catalog_overrides')
    .upsert({ sismat_id, visible_en_cotizador: visible }, { onConflict: 'sismat_id' });
  if (!error) {
    if (!_csOvMap[sismat_id]) _csOvMap[sismat_id] = { sismat_id };
    _csOvMap[sismat_id].visible_en_cotizador = visible;
    toast(visible ? 'Visible en cotizador ✓' : 'Oculto del cotizador');
  } else {
    toast('Error al guardar', 'err');
  }
}

async function csGuardarCampo(sismat_id, campo, valor) {
  const payload = {
    sismat_id,
    [campo]: valor || null,
    actualizado_en: new Date().toISOString(),
  };
  const { error } = await sb.from('sismat_catalog_overrides')
    .upsert(payload, { onConflict: 'sismat_id' });
  if (!error) {
    if (!_csOvMap[sismat_id]) _csOvMap[sismat_id] = { sismat_id };
    _csOvMap[sismat_id][campo] = valor || null;
  } else {
    toast('Error al guardar', 'err');
  }
}

function catPagAnterior()  { if (_csPage > 0) { _csPage--; _csCargarPagina(); } }
function catPagSiguiente() {
  if (_csPage < Math.ceil(_csTotal / _CS_PER_PAGE) - 1) { _csPage++; _csCargarPagina(); }
}

// ── UTILS ──

function _csEsc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}

function _csDebounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
