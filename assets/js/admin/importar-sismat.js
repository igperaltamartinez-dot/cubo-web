// ── IMPORTAR SISMAT ──
// Carga el JSON exportado por la extensión Chrome, calcula el diff
// contra sismat_catalog en Supabase y sincroniza con un UPSERT.

let _datosPendientes = null; // items del JSON listos para sincronizar
let _catalogoExistente = [];  // snapshot de sismat_catalog antes de sincronizar

function iniciarImportarSismat() {
  _datosPendientes = null;
  _catalogoExistente = [];

  const ui = {
    dropZone:    document.getElementById('is-drop-zone'),
    input:       document.getElementById('is-json-input'),
    preview:     document.getElementById('is-preview'),
    progress:    document.getElementById('is-progress'),
    success:     document.getElementById('is-success'),
  };

  ui.dropZone.style.display = 'block';
  ui.preview.style.display  = 'none';
  ui.progress.style.display = 'none';
  ui.success.style.display  = 'none';

  ui.dropZone.onclick   = () => ui.input.click();
  ui.input.onchange     = (e) => _procesarJson(e.target.files[0]);
  ui.dropZone.ondragover  = (e) => { e.preventDefault(); ui.dropZone.classList.add('drag'); };
  ui.dropZone.ondragleave = ()  => ui.dropZone.classList.remove('drag');
  ui.dropZone.ondrop      = (e) => {
    e.preventDefault();
    ui.dropZone.classList.remove('drag');
    if (e.dataTransfer.files[0]) _procesarJson(e.dataTransfer.files[0]);
  };

  document.getElementById('is-btn-sync').onclick    = _confirmarSincronizacion;
  document.getElementById('is-btn-cancelar').onclick = () => {
    _datosPendientes = null;
    ui.dropZone.style.display = 'block';
    ui.preview.style.display  = 'none';
    ui.input.value = '';
  };
}

async function _procesarJson(file) {
  if (!file) return;
  if (!file.name.endsWith('.json')) {
    toast('El archivo debe ser .json (el que exporta la extensión)', 'err'); return;
  }

  let datos;
  try {
    const texto = await file.text();
    datos = JSON.parse(texto);
  } catch {
    toast('El archivo no es JSON válido', 'err'); return;
  }

  // Sismat usa namespaces separados para materiales y MO (ambos arrancan en id=1),
  // por eso la clave compuesta es (tipo, sismat_id).
  const itemsRaw = [
    ...(datos.materiales || []).map(i => ({ ...i, tipo: i.tipo || 'material' })),
    ...(datos.mano_de_obra || []).map(i => ({ ...i, tipo: i.tipo || 'mano_de_obra' })),
  ].filter(i => i.precio > 0);

  const keyOf = i => `${i.tipo}:${i.sismat_id}`;

  // Deduplicar por (tipo, sismat_id) — el JSON a veces repite entradas
  const itemsMap = new Map();
  itemsRaw.forEach(i => itemsMap.set(keyOf(i), i));
  const items = Array.from(itemsMap.values());

  if (!items.length) {
    toast('No se encontraron ítems con precio en el JSON', 'err'); return;
  }

  // Traer el catálogo existente para calcular el diff.
  // Paginado: el catálogo supera las ~1000 filas y truncarlo haría que los
  // ítems de filas tardías se cuenten como "nuevos" y no se registre su histórico.
  try {
    _catalogoExistente = await sbSelectAll(() => sb.from('sismat_catalog')
      .select('tipo, sismat_id, precio_sismat, nombre_original').order('sismat_id'));
  } catch (error) {
    toast('Error al leer catálogo actual: ' + error.message, 'err'); return;
  }

  const mapaExistente = Object.fromEntries(_catalogoExistente.map(r => [keyOf(r), r]));
  const idsNuevoJson  = new Set(items.map(keyOf));

  const nuevos      = items.filter(i => !mapaExistente[keyOf(i)]);
  const actualizados = items.filter(i => {
    const ex = mapaExistente[keyOf(i)];
    return ex && ex.precio_sismat !== i.precio;
  });
  const alertas = actualizados.filter(i => {
    const ex = mapaExistente[keyOf(i)];
    return ex && ex.precio_sismat > 0 && Math.abs((i.precio - ex.precio_sismat) / ex.precio_sismat) > 0.20;
  });
  const eliminados = _catalogoExistente.filter(r => !idsNuevoJson.has(keyOf(r)));

  _datosPendientes = items;

  // Estadísticas
  document.getElementById('is-stat-nuevos').textContent     = nuevos.length;
  document.getElementById('is-stat-actualiz').textContent   = actualizados.length;
  document.getElementById('is-stat-eliminados').textContent = eliminados.length;
  document.getElementById('is-stat-alertas').textContent    = alertas.length;

  const alertaBox = document.getElementById('is-alerta-precios');
  if (alertas.length) {
    alertaBox.style.display = 'block';
    document.getElementById('is-alerta-lista').innerHTML = alertas.slice(0, 5).map(i => {
      const ex   = mapaExistente[keyOf(i)];
      const delta = ((i.precio - ex.precio_sismat) / ex.precio_sismat * 100).toFixed(1);
      const signo = delta > 0 ? '+' : '';
      return `<div>${i.nombre}: $${Math.round(ex.precio_sismat).toLocaleString('es-AR')} → $${Math.round(i.precio).toLocaleString('es-AR')} (${signo}${delta}%)</div>`;
    }).join('');
  } else {
    alertaBox.style.display = 'none';
  }

  // Preview primeros 10
  document.getElementById('is-preview-body').innerHTML = items.slice(0, 10).map(i => {
    const ex = mapaExistente[keyOf(i)];
    let estado = '<span class="badge badge-ok">Nuevo</span>';
    if (ex) {
      const delta = ex.precio_sismat > 0
        ? ((i.precio - ex.precio_sismat) / ex.precio_sismat * 100).toFixed(1)
        : 0;
      const color = delta > 20 ? 'badge-nuevo' : delta < -5 ? 'badge-contactado' : 'badge-en_proceso';
      estado = ex.precio_sismat === i.precio
        ? '<span class="badge badge-ok">Sin cambio</span>'
        : `<span class="badge ${color}">${delta > 0 ? '+' : ''}${delta}%</span>`;
    }
    return `<tr>
      <td>${i.categoria}</td>
      <td>${i.nombre}</td>
      <td>${i.unidad}</td>
      <td>$${Math.round(i.precio).toLocaleString('es-AR')}</td>
      <td>${estado}</td>
    </tr>`;
  }).join('');

  document.getElementById('is-drop-zone').style.display = 'none';
  document.getElementById('is-preview').style.display   = 'block';
}

async function _confirmarSincronizacion() {
  if (!_datosPendientes?.length) return;

  const progress = document.getElementById('is-progress');
  const preview  = document.getElementById('is-preview');
  preview.style.display  = 'none';
  progress.style.display = 'block';

  const setStatus = msg => document.getElementById('is-prog-status').textContent = msg;
  const setBar    = pct => document.getElementById('is-prog-bar').style.width = pct + '%';
  const setLog    = msg => document.getElementById('is-prog-log').textContent = msg;

  const keyOf = i => `${i.tipo}:${i.sismat_id}`;
  const mapaExistente = Object.fromEntries(_catalogoExistente.map(r => [keyOf(r), r]));
  const historial = [];

  const rowOf = item => ({
    tipo:               item.tipo,
    sismat_id:          item.sismat_id,
    nombre_original:    item.nombre,
    unidad:             item.unidad,
    unidad_nombre:      item.unidad_nombre || '',
    categoria_sismat:   item.categoria,
    categoria_sismat_id: item.categoria_id,
    precio_sismat:      item.precio,
    detalle:            item.detalle || null,
    raw_json:           item,
    actualizado_en:     new Date().toISOString(),
  });

  // Split: nuevos (insert) vs existentes (update). Evitamos upsert porque
  // PostgREST a veces no detecta el constraint compuesto en su cache.
  const nuevos      = _datosPendientes.filter(i => !mapaExistente[keyOf(i)]);
  const aActualizar = _datosPendientes.filter(i => mapaExistente[keyOf(i)]);
  const total = _datosPendientes.length;
  let procesados = 0;

  // ── INSERT en lotes de 100 ──
  setStatus(`Insertando ${nuevos.length} ítems nuevos...`);
  const LOTE_INS = 100;
  for (let i = 0; i < nuevos.length; i += LOTE_INS) {
    const lote = nuevos.slice(i, i + LOTE_INS);
    setBar(Math.round(((procesados + i) / total) * 90));
    setLog(`Nuevos: ${i + 1} – ${Math.min(i + LOTE_INS, nuevos.length)} de ${nuevos.length}`);
    const { error } = await sb.from('sismat_catalog').insert(lote.map(rowOf));
    if (error) { toast('Error al insertar: ' + error.message, 'err'); return; }
  }
  procesados += nuevos.length;

  // ── UPDATE en paralelo, lotes de 20 (cada uno es un request a la API) ──
  setStatus(`Actualizando ${aActualizar.length} ítems existentes...`);
  const LOTE_UPD = 20;
  for (let i = 0; i < aActualizar.length; i += LOTE_UPD) {
    const lote = aActualizar.slice(i, i + LOTE_UPD);
    setBar(Math.round(((procesados + i) / total) * 90));
    setLog(`Actualizados: ${i + 1} – ${Math.min(i + LOTE_UPD, aActualizar.length)} de ${aActualizar.length}`);

    const results = await Promise.all(lote.map(item => {
      const row = rowOf(item);
      delete row.tipo; delete row.sismat_id; // no se actualizan, son la PK
      return sb.from('sismat_catalog').update(row)
        .eq('tipo', item.tipo).eq('sismat_id', item.sismat_id);
    }));
    const err = results.find(r => r.error);
    if (err) { toast('Error al actualizar: ' + err.error.message, 'err'); return; }

    // Historial sólo de cambios de precio reales
    lote.forEach(item => {
      const ex = mapaExistente[keyOf(item)];
      if (ex && ex.precio_sismat !== item.precio) {
        const delta = ex.precio_sismat > 0
          ? ((item.precio - ex.precio_sismat) / ex.precio_sismat * 100)
          : null;
        historial.push({
          tipo:            item.tipo,
          sismat_id:       item.sismat_id,
          precio_anterior: ex.precio_sismat,
          precio_nuevo:    item.precio,
          delta_porcentaje: delta ? parseFloat(delta.toFixed(2)) : null,
        });
      }
    });
  }
  procesados += aActualizar.length;

  setBar(95);
  setStatus('Guardando historial de precios...');

  if (historial.length) {
    const LOTE_H = 200;
    for (let i = 0; i < historial.length; i += LOTE_H) {
      await sb.from('precio_historico').insert(historial.slice(i, i + LOTE_H));
    }
  }

  setBar(100);
  setStatus('¡Completado!');

  progress.style.display = 'none';
  document.getElementById('is-success').style.display = 'block';
  document.getElementById('is-success-msg').textContent =
    `${procesados.toLocaleString('es-AR')} ítems sincronizados · ${historial.length} cambios de precio registrados`;

  toast('Catálogo Sismat actualizado ✓', 'ok');
  _datosPendientes   = null;
  _catalogoExistente = [];
}
