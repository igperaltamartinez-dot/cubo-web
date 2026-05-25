chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'extraer') {
    extraerTodo().then(datos => sendResponse({ success: true, datos }))
                 .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (msg.action === 'ping') {
    sendResponse({ success: true, logueado: estaLogueado() });
    return true;
  }
});

function estaLogueado() {
  return document.cookie.includes('sismat_backend_session') || document.cookie.includes('XSRF-TOKEN');
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
}

async function extraerTodo() {
  const resultado = {
    materiales: [],
    mano_de_obra: [],
    timestamp: new Date().toISOString(),
    errores: [],
    debug_raw_samples: {
      materiales_categorias_raw: [],
      mano_de_obra_categorias_raw: []
    }
  };
  const xsrfToken = getCookie('XSRF-TOKEN');
  const headers = { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
  if (xsrfToken) headers['X-XSRF-TOKEN'] = decodeURIComponent(xsrfToken);

  // ── MATERIALES ──
  try {
    chrome.runtime.sendMessage({ action: 'log', msg: 'Obteniendo materiales...', tipo: 'info' });
    const resp = await fetch('https://admin.sismat.com.ar/api/materials', { method: 'GET', credentials: 'include', headers });
    if (!resp.ok) throw new Error(`Error HTTP ${resp.status} — ¿Estás logueado en Sismat?`);
    const data = await resp.json();
    if (Array.isArray(data)) {
      resultado.debug_raw_samples.materiales_categorias_raw = data.slice(0, 2).map(cat => {
        const items = cat.materials || cat.items || [];
        return { ...cat, materials: undefined, items: items.slice(0, 3) };
      });
      data.forEach(cat => {
        const items = cat.materials || cat.items || [];
        items.forEach(mat => {
          if (mat.active === 0) return;
          resultado.materiales.push({
            sismat_id: mat.id,
            nombre: mat.name,
            precio: parseFloat(mat.cost) || 0,
            unidad: mat.unit?.symbol || 'U',
            unidad_nombre: mat.unit?.name || '',
            categoria: cat.name || 'Sin categoría',
            categoria_id: cat.id,
            tipo: 'material'
          });
        });
      });
    }
    chrome.runtime.sendMessage({ action: 'log', msg: `✓ ${resultado.materiales.length} materiales`, tipo: 'ok' });
    chrome.runtime.sendMessage({ action: 'progreso', valor: 50 });
  } catch (err) {
    resultado.errores.push({ tipo: 'materiales', error: err.message });
    chrome.runtime.sendMessage({ action: 'log', msg: `✗ ${err.message}`, tipo: 'err' });
  }

  // ── MANO DE OBRA ──
  try {
    chrome.runtime.sendMessage({ action: 'log', msg: 'Obteniendo mano de obra...', tipo: 'info' });
    const resp = await fetch('https://admin.sismat.com.ar/api/tasks', { method: 'GET', credentials: 'include', headers });
    if (!resp.ok) throw new Error(`Error HTTP ${resp.status}`);
    const data = await resp.json();
    if (Array.isArray(data)) {
      resultado.debug_raw_samples.mano_de_obra_categorias_raw = data.slice(0, 2).map(cat => {
        const tasks = cat.tasks || [];
        return { ...cat, tasks: tasks.slice(0, 3) };
      });
      data.forEach(cat => {
        const tasks = cat.tasks || [];
        tasks.forEach(task => {
          resultado.mano_de_obra.push({
            sismat_id: task.id,
            nombre: task.name,
            // campo correcto es manpower_cost
            precio: parseFloat(task.manpower_cost) || 0,
            unidad: task.unit?.symbol || 'U',
            unidad_nombre: task.unit?.name || '',
            categoria: cat.name || 'Sin categoría',
            categoria_id: cat.id,
            detalle: task.detail || '',
            tipo: 'mano_de_obra'
          });
        });
      });
    }
    chrome.runtime.sendMessage({ action: 'log', msg: `✓ ${resultado.mano_de_obra.length} tareas de mano de obra`, tipo: 'ok' });
    chrome.runtime.sendMessage({ action: 'progreso', valor: 100 });
  } catch (err) {
    resultado.errores.push({ tipo: 'mano_de_obra', error: err.message });
    chrome.runtime.sendMessage({ action: 'log', msg: `✗ ${err.message}`, tipo: 'err' });
  }

  return resultado;
}
