// ── FOTOS LANDING ──
// Gestión de fotos para la landing: slots fijos (quiénes somos) + galería de obras.

let _flObras   = [];
let _flMediaMap = {};   // slot → { url, storage_path }

async function iniciarFotosLanding() {
  const cont = document.getElementById('fl-contenido');
  if (cont) cont.innerHTML = '<p class="empty-state">Cargando...</p>';

  // Verificar sesión antes de cualquier operación que requiera auth
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    if (cont) cont.innerHTML = '<p class="empty-state">Sesión expirada. Recargá la página e iniciá sesión nuevamente.</p>';
    toast('Sesión expirada, recargá la página', 'err');
    return;
  }

  const [obrasRes, mediaRes] = await Promise.all([
    sb.from('obras_portfolio').select('id, titulo, zona, tipo, imagen_url, imagen_storage_path').order('id'),
    sb.from('landing_media').select('*'),
  ]);

  if (mediaRes.error) {
    toast('Ejecutá primero la migración 002_landing_media.sql', 'err');
    return;
  }

  _flObras = obrasRes.data || [];
  _flMediaMap = {};
  (mediaRes.data || []).forEach(m => { _flMediaMap[m.slot] = m; });

  _flRender();
}

function _flRender() {
  const cont = document.getElementById('fl-contenido');
  if (!cont) return;
  cont.innerHTML = _flHtmlSlot('quienes', 'Foto · Quiénes somos', 'Se muestra en la sección Quiénes somos de la landing.') +
    '<div style="margin-top:24px">' + _flHtmlGaleria() + '</div>';
}

function _flHtmlSlot(slot, titulo, desc) {
  const m = _flMediaMap[slot] || {};
  const tieneImg = !!m.url;
  return `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-tit">${titulo}</div>
          <div class="card-sub">${desc}</div>
        </div>
      </div>
      <div style="padding:20px 24px">
        <div style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap">
          ${tieneImg ? `
            <img src="${m.url}" style="width:180px;height:135px;object-fit:cover;border-radius:4px;flex-shrink:0;background:#eee;display:block">
            <div style="display:flex;flex-direction:column;gap:8px;padding-top:4px">
              <p style="font-size:12px;color:var(--gm);font-weight:500;margin:0">Foto actual. Subir una nueva la reemplaza automáticamente.</p>
              <div style="display:flex;gap:8px">
                <label class="btn-add" style="cursor:pointer;font-size:11px;padding:8px 14px;display:inline-block">
                  Cambiar foto
                  <input type="file" accept="image/*" style="display:none" onchange="flSubirSlot('${slot}',this.files[0])">
                </label>
                <button class="btn-sm danger" onclick="flEliminarSlot('${slot}','${m.storage_path || ''}')">Quitar</button>
              </div>
            </div>
          ` : `
            <div class="fl-dropzone" id="fl-dz-${slot}"
              onclick="document.getElementById('fl-inp-${slot}').click()"
              ondragover="event.preventDefault();this.classList.add('drag')"
              ondragleave="this.classList.remove('drag')"
              ondrop="event.preventDefault();this.classList.remove('drag');flSubirSlot('${slot}',event.dataTransfer.files[0])">
              <div style="font-size:13px;font-weight:700;color:var(--tx);margin-bottom:6px">Arrastrá la foto acá o hacé clic para seleccionar</div>
              <div style="font-size:11px;color:var(--gm);font-weight:500">JPG · PNG · WEBP · Máx 10 MB · Se comprime automáticamente a 1600px</div>
              <input type="file" id="fl-inp-${slot}" accept="image/*" style="display:none" onchange="flSubirSlot('${slot}',this.files[0])">
            </div>
          `}
        </div>
      </div>
    </div>`;
}

function _flHtmlGaleria() {
  const filas = _flObras.length
    ? _flObras.map(o => `
        <tr id="fl-obra-${o.id}">
          <td style="padding:8px 12px;width:80px">
            ${o.imagen_url
              ? `<img src="${o.imagen_url}" style="width:64px;height:48px;object-fit:cover;border-radius:3px;display:block;background:#eee">`
              : `<div style="width:64px;height:48px;background:var(--gf);border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:9px;color:#bbb;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Sin foto</div>`
            }
          </td>
          <td>
            <div style="font-weight:700;font-size:13px;color:var(--tx)">${o.titulo || '—'}</div>
            <div style="font-size:11px;color:var(--gm);font-weight:500;margin-top:2px">${[o.tipo, o.zona].filter(Boolean).join(' · ') || '—'}</div>
          </td>
          <td style="padding:8px 12px;white-space:nowrap">
            <div style="display:flex;gap:6px;align-items:center">
              <label class="btn-sm prim" style="cursor:pointer;display:inline-block">
                ${o.imagen_url ? 'Cambiar' : 'Subir foto'}
                <input type="file" accept="image/*" style="display:none" onchange="flSubirFotoObra('${o.id}',this.files[0])">
              </label>
              ${o.imagen_url
                ? `<button class="btn-sm danger" onclick="flEliminarFotoObra('${o.id}','${o.imagen_storage_path || ''}')">Quitar</button>`
                : ''}
            </div>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="3" class="empty-state">No hay obras. Creá una desde "Obras / Galería" y volvé acá a subir la foto.</td></tr>`;

  return `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-tit">Galería de obras</div>
          <div class="card-sub">Las fotos aparecen en la sección Galería de la landing. Para agregar o editar obras, usá la sección "Obras / Galería".</div>
        </div>
        <button class="btn-sm" onclick="iniciarFotosLanding()">Actualizar</button>
      </div>
      <table>
        <thead><tr>
          <th style="width:80px">Foto</th>
          <th>Obra</th>
          <th style="width:160px"></th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;
}

// ── COMPRESIÓN ──

async function flComprimirImagen(file, maxW = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = reject;
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => {
        URL.revokeObjectURL(img.src);
        blob ? resolve(blob) : reject(new Error('Error al comprimir imagen'));
      }, 'image/jpeg', quality);
    };
    img.src = URL.createObjectURL(file);
  });
}

function _flEsErrorRLS(err) {
  if (!err) return false;
  const msg = (err.message || err.toString()).toLowerCase();
  return msg.includes('row-level') || msg.includes('row level') ||
         msg.includes('rls')      || err.statusCode === '403' || err.status === 403;
}

async function _flConRefresh(fn, descripcionError) {
  let res = await fn();
  if (res.error && _flEsErrorRLS(res.error)) {
    await sb.auth.refreshSession();
    res = await fn();
  }
  if (res.error) {
    throw new Error(`${descripcionError}: ${res.error.message}`);
  }
  return res;
}

async function _flSubir(storagePath, blob) {
  const res = await _flConRefresh(
    () => sb.storage.from('landing-fotos').upload(storagePath, blob, {
      contentType: 'image/jpeg',
      upsert: true,
    }),
    'Storage'
  );
  const { data: { publicUrl } } = sb.storage.from('landing-fotos').getPublicUrl(res.data.path);
  return { path: res.data.path, url: publicUrl };
}

// ── SLOTS FIJOS ──

async function flSubirSlot(slot, file) {
  if (!file) return;
  toast('Comprimiendo y subiendo imagen...');
  try {
    const blob = await flComprimirImagen(file);
    const path = `slots/${slot}-${Date.now()}.jpg`;
    const { path: storagePath, url } = await _flSubir(path, blob);

    await _flConRefresh(
      () => sb.from('landing_media').upsert(
        { slot, url, storage_path: storagePath, actualizado_en: new Date().toISOString() },
        { onConflict: 'slot' }
      ),
      'landing_media UPSERT'
    );

    _flMediaMap[slot] = { slot, url, storage_path: storagePath };
    toast('Foto guardada ✓');
    _flRender();
  } catch (e) {
    toast('Error: ' + e.message, 'err');
  }
}

async function flEliminarSlot(slot, storagePath) {
  if (!confirm('¿Eliminás esta foto?')) return;
  try {
    if (storagePath) {
      await _flConRefresh(
        () => sb.storage.from('landing-fotos').remove([storagePath]),
        'Storage delete'
      );
    }
    await _flConRefresh(
      () => sb.from('landing_media').delete().eq('slot', slot),
      'landing_media DELETE'
    );
    delete _flMediaMap[slot];
    toast('Foto eliminada');
    _flRender();
  } catch (e) {
    toast('Error: ' + e.message, 'err');
  }
}

// ── FOTOS DE OBRAS ──

async function flSubirFotoObra(obraId, file) {
  if (!file) return;
  toast('Comprimiendo y subiendo imagen...');
  try {
    const blob = await flComprimirImagen(file);
    const path = `obras/${obraId}.jpg`;
    const { path: storagePath, url } = await _flSubir(path, blob);

    await _flConRefresh(
      () => sb.from('obras_portfolio').update({
        imagen_url: url,
        imagen_storage_path: storagePath,
      }).eq('id', obraId),
      'obras UPDATE'
    );

    const obra = _flObras.find(o => o.id === obraId);
    if (obra) { obra.imagen_url = url; obra.imagen_storage_path = storagePath; }
    toast('Foto subida ✓');
    _flRender();
  } catch (e) {
    toast('Error: ' + e.message, 'err');
  }
}

async function flEliminarFotoObra(obraId, storagePath) {
  if (!confirm('¿Quitás la foto de esta obra?')) return;
  try {
    if (storagePath) {
      await _flConRefresh(
        () => sb.storage.from('landing-fotos').remove([storagePath]),
        'Storage delete'
      );
    }
    await _flConRefresh(
      () => sb.from('obras_portfolio').update({
        imagen_url: null,
        imagen_storage_path: null,
      }).eq('id', obraId),
      'obras UPDATE'
    );

    const obra = _flObras.find(o => o.id === obraId);
    if (obra) { obra.imagen_url = null; obra.imagen_storage_path = null; }
    toast('Foto eliminada');
    _flRender();
  } catch (e) {
    toast('Error: ' + e.message, 'err');
  }
}
