// ── RECETAS ──
// Servicios compuestos del cotizador. Cada receta combina ítems de sismat_catalog
// con cantidades. El precio se calcula con el markup de la categoría CUBO asignada.

let _recetas       = [];
let _recEditId     = null;   // id de la receta en edición (null = nueva)
let _compActuales  = [];     // [{ sismat_id, nombre, unidad, precio_sismat, cantidad, tipo }]
let _searchResults = [];
let _busqTimer     = null;
let _rcIniciado    = false;

async function iniciarRecetas() {
  if (!_rcIniciado) {
    // Cerrar dropdown al perder foco — timeout para que el click en el item se registre antes
    document.getElementById('rc-search').onblur = () =>
      setTimeout(() => { document.getElementById('rc-dropdown').style.display = 'none'; }, 150);
    _rcIniciado = true;
  }
  await _rcCargar();
}

async function _rcCargar() {
  const { data, error } = await sb.from('recetas')
    .select(`
      *,
      receta_componentes(
        sismat_id, cantidad, tipo,
        sismat_catalog(nombre_original, precio_sismat, unidad)
      )
    `)
    .order('orden')
    .order('nombre');
  if (error) { toast('Error al cargar recetas: ' + error.message, 'err'); return; }
  _recetas = data || [];
  _rcRenderLista();
}

function _rcRenderLista() {
  const tbody = document.getElementById('rc-tbody');
  if (!_recetas.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No hay recetas todavía. Creá la primera.</td></tr>';
    return;
  }
  tbody.innerHTML = _recetas.map(r => {
    const cat   = categorias.find(c => c.id === r.categoria_id);
    const nComp = r.receta_componentes?.length || 0;
    return `<tr>
      <td>
        <strong>${r.nombre}</strong>
        ${r.descripcion ? `<br><span style="font-size:11px;color:var(--gm);font-weight:500">${r.descripcion}</span>` : ''}
      </td>
      <td>${cat ? cat.nombre : '<span style="color:#ccc">—</span>'}</td>
      <td style="font-size:12px">${r.unidad}</td>
      <td style="font-size:12px;color:var(--gm)">${nComp} componente${nComp !== 1 ? 's' : ''}</td>
      <td>
        <label class="toggle-switch">
          <input type="checkbox" ${r.activo_publico ? 'checked' : ''} onchange="rcToggleActivo('${r.id}',this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </td>
      <td style="display:flex;gap:4px">
        <button class="btn-sm" onclick="rcAbrirEditar('${r.id}')">Editar</button>
        <button class="btn-sm danger" onclick="rcEliminar('${r.id}')">Borrar</button>
      </td>
    </tr>`;
  }).join('');
}

// ── ABRIR MODAL ──

function rcAbrirNueva() {
  _recEditId      = null;
  _compActuales   = [];
  _rcPoblarCatSelect('');
  document.getElementById('rc-nombre').value = '';
  document.getElementById('rc-desc').value   = '';
  document.getElementById('rc-unidad').value = 'm²';
  document.getElementById('rc-ajuste').value = '0';
  document.getElementById('rc-search').value = '';
  document.getElementById('rc-dropdown').style.display = 'none';
  _rcRenderComps();
  _rcPrecio();
  document.getElementById('modal-receta-editor-tit').textContent = 'Nueva receta';
  document.getElementById('modal-receta-editor').classList.add('open');
}

function rcAbrirEditar(id) {
  const r = _recetas.find(r => r.id === id);
  if (!r) return;
  _recEditId     = id;
  _compActuales  = (r.receta_componentes || []).map(c => ({
    sismat_id:    c.sismat_id,
    nombre:       c.sismat_catalog?.nombre_original || '—',
    unidad:       c.sismat_catalog?.unidad || '',
    precio_sismat: c.sismat_catalog?.precio_sismat || 0,
    cantidad:     c.cantidad,
    tipo:         c.tipo,
  }));
  _rcPoblarCatSelect(r.categoria_id || '');
  document.getElementById('rc-nombre').value = r.nombre || '';
  document.getElementById('rc-desc').value   = r.descripcion || '';
  document.getElementById('rc-unidad').value = r.unidad || 'm²';
  document.getElementById('rc-ajuste').value = r.ajuste_porcentaje ?? 0;
  document.getElementById('rc-search').value = '';
  document.getElementById('rc-dropdown').style.display = 'none';
  _rcRenderComps();
  _rcPrecio();
  document.getElementById('modal-receta-editor-tit').textContent = 'Editar receta';
  document.getElementById('modal-receta-editor').classList.add('open');
}

function _rcPoblarCatSelect(valorActual) {
  document.getElementById('rc-categoria').innerHTML =
    '<option value="">— Sin categoría —</option>' +
    categorias.map(c =>
      `<option value="${c.id}" ${c.id === valorActual ? 'selected' : ''}>` +
      `${c.nombre} (${c.markup_porcentaje ?? 30}%)</option>`
    ).join('');
}

// ── COMPONENTES ──

function _rcRenderComps() {
  const cont = document.getElementById('rc-comp-lista');
  if (!_compActuales.length) {
    cont.innerHTML = '<p style="font-size:12px;color:#bbb;font-weight:500;margin:0;padding:6px 0">Sin componentes. Buscá ítems de Sismat para agregar.</p>';
    return;
  }
  cont.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr style="border-bottom:1px solid var(--gc)">
      <th style="text-align:left;padding:4px 8px;font-size:10px;color:var(--gm);font-weight:700;text-transform:uppercase">Ítem</th>
      <th style="width:90px;padding:4px 8px;font-size:10px;color:var(--gm);font-weight:700;text-transform:uppercase">Cantidad</th>
      <th style="width:110px;text-align:right;padding:4px 8px;font-size:10px;color:var(--gm);font-weight:700;text-transform:uppercase">Subtotal</th>
      <th style="width:24px"></th>
    </tr></thead>
    <tbody>
      ${_compActuales.map((c, i) => `
        <tr style="border-bottom:1px solid var(--gf)">
          <td style="padding:6px 8px">
            <div style="font-weight:600;color:var(--tx)">${c.nombre}</div>
            <div style="font-size:10px;color:var(--gm)">${c.unidad} · $${Math.round(c.precio_sismat).toLocaleString('es-AR')}/und</div>
          </td>
          <td style="padding:6px 8px">
            <input type="number" value="${c.cantidad}" min="0.001" step="any"
              style="width:78px;border:1px solid var(--gc);border-radius:4px;padding:3px 6px;font-size:12px;font-family:inherit"
              oninput="_compActuales[${i}].cantidad=parseFloat(this.value)||0;_rcPrecio()">
          </td>
          <td style="padding:6px 8px;text-align:right;font-weight:700">
            ${c.precio_sismat * c.cantidad > 0 ? '$' + Math.round(c.precio_sismat * c.cantidad).toLocaleString('es-AR') : '—'}
          </td>
          <td style="padding:4px">
            <button onclick="rcQuitarComp(${i})"
              style="background:none;border:none;cursor:pointer;color:#ccc;font-size:18px;font-weight:700;line-height:1;padding:0 4px"
              title="Quitar">×</button>
          </td>
        </tr>`).join('')}
    </tbody>
  </table>`;
}

function rcQuitarComp(i) {
  _compActuales.splice(i, 1);
  _rcRenderComps();
  _rcPrecio();
}

// ── PRECIO EN VIVO ──

function _rcPrecio() {
  const catId  = document.getElementById('rc-categoria').value;
  const cat    = categorias.find(c => c.id === catId);
  const markup = cat?.markup_porcentaje != null ? cat.markup_porcentaje : 30;
  const ajuste = parseFloat(document.getElementById('rc-ajuste').value) || 0;

  const base  = _compActuales.reduce((s, c) => s + c.precio_sismat * c.cantidad, 0);
  const final = base * (1 + markup / 100) * (1 + ajuste / 100);

  document.getElementById('rc-precio-base').textContent  = base > 0 ? '$' + Math.round(base).toLocaleString('es-AR') : '—';
  document.getElementById('rc-precio-final').textContent = final > 0 ? '$' + Math.round(final).toLocaleString('es-AR') : '—';
  document.getElementById('rc-markup-lbl').textContent   = `markup ${markup}% + ajuste ${ajuste}%`;
}

// ── BUSCADOR ──

function rcOnBuscar() {
  clearTimeout(_busqTimer);
  _busqTimer = setTimeout(_rcBuscar, 300);
}

async function _rcBuscar() {
  const texto    = document.getElementById('rc-search').value.trim();
  const dropdown = document.getElementById('rc-dropdown');
  if (texto.length < 2) { dropdown.style.display = 'none'; return; }

  const { data } = await sb.from('sismat_catalog')
    .select('sismat_id, nombre_original, unidad, precio_sismat, tipo')
    .ilike('nombre_original', `%${texto}%`)
    .gt('precio_sismat', 0)
    .limit(8);

  _searchResults = data || [];
  if (!_searchResults.length) { dropdown.style.display = 'none'; return; }

  dropdown.innerHTML = _searchResults.map((item, i) =>
    `<div class="rc-dd-item" onmousedown="rcSeleccionar(${i})">
      <div>
        <div style="font-size:12px;font-weight:600;color:var(--tx)">${item.nombre_original}</div>
        <div style="font-size:10px;color:var(--gm)">${item.tipo === 'material' ? 'Material' : 'Mano de obra'} · ${item.unidad}</div>
      </div>
      <span style="font-size:12px;font-weight:700;color:var(--go);margin-left:auto;flex-shrink:0">$${Math.round(item.precio_sismat).toLocaleString('es-AR')}</span>
    </div>`
  ).join('');
  dropdown.style.display = 'block';
}

function rcSeleccionar(i) {
  const item = _searchResults[i];
  if (!item) return;
  if (_compActuales.find(c => c.sismat_id === item.sismat_id)) {
    toast('Ese ítem ya está en la receta', 'err'); return;
  }
  _compActuales.push({
    sismat_id:    item.sismat_id,
    nombre:       item.nombre_original,
    unidad:       item.unidad,
    precio_sismat: item.precio_sismat,
    cantidad:     1,
    tipo:         item.tipo,
  });
  document.getElementById('rc-search').value      = '';
  document.getElementById('rc-dropdown').style.display = 'none';
  _searchResults = [];
  _rcRenderComps();
  _rcPrecio();
}

// ── GUARDAR / BORRAR ──

async function rcGuardar() {
  const nombre = document.getElementById('rc-nombre').value.trim();
  if (!nombre) { toast('Completá el nombre', 'err'); return; }

  const payload = {
    nombre,
    descripcion:       document.getElementById('rc-desc').value.trim() || null,
    unidad:            document.getElementById('rc-unidad').value,
    categoria_id:      document.getElementById('rc-categoria').value || null,
    ajuste_porcentaje: parseFloat(document.getElementById('rc-ajuste').value) || 0,
  };

  let recetaId;
  if (_recEditId) {
    const { error } = await sb.from('recetas').update(payload).eq('id', _recEditId);
    if (error) { toast('Error al guardar: ' + error.message, 'err'); return; }
    recetaId = _recEditId;
  } else {
    const { data, error } = await sb.from('recetas')
      .insert({ ...payload, activo_publico: false })
      .select().single();
    if (error) { toast('Error al crear: ' + error.message, 'err'); return; }
    recetaId = data.id;
  }

  // Reemplazar componentes
  await sb.from('receta_componentes').delete().eq('receta_id', recetaId);
  if (_compActuales.length) {
    const { error } = await sb.from('receta_componentes').insert(
      _compActuales.map(c => ({
        receta_id: recetaId,
        sismat_id: c.sismat_id,
        cantidad:  c.cantidad,
        tipo:      c.tipo,
      }))
    );
    if (error) { toast('Error al guardar componentes: ' + error.message, 'err'); return; }
  }

  cerrarModal('modal-receta-editor');
  await _rcCargar();
  toast(_recEditId ? 'Receta actualizada ✓' : 'Receta creada ✓');
}

async function rcToggleActivo(id, activo) {
  const { error } = await sb.from('recetas').update({ activo_publico: activo }).eq('id', id);
  if (!error) {
    const r = _recetas.find(r => r.id === id);
    if (r) r.activo_publico = activo;
    toast(activo ? 'Visible en cotizador ✓' : 'Oculta del cotizador');
  } else toast('Error al guardar', 'err');
}

async function rcEliminar(id) {
  if (!confirm('¿Eliminás esta receta? También se borran sus componentes.')) return;
  const { error } = await sb.from('recetas').delete().eq('id', id);
  if (!error) {
    _recetas = _recetas.filter(r => r.id !== id);
    _rcRenderLista();
    toast('Receta eliminada');
  } else toast('Error al eliminar: ' + error.message, 'err');
}
