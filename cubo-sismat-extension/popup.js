// popup.js — sin onclick inline, todo por addEventListener

let datosExtraidos = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Asignar eventos por JS (requerido por Chrome Extensions CSP)
  document.getElementById('btn-extraer').addEventListener('click', iniciarExtraccion);
  document.getElementById('btn-descargar').addEventListener('click', descargarJSON);
  document.getElementById('btn-importar').addEventListener('click', abrirImportador);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.url.includes('sismat.com.ar')) {
    document.getElementById('not-sismat').style.display = 'block';
    document.getElementById('main-content').style.display = 'none';
    return;
  }

  // Verificar login
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
    if (!resp?.logueado) {
      document.getElementById('warning-not-logged').style.display = 'block';
    }
  } catch(e) {}

  // Cargar datos previos
  const guardado = await chrome.storage.local.get(['sismat_data']);
  if (guardado.sismat_data) {
    datosExtraidos = guardado.sismat_data;
    const fecha = new Date(datosExtraidos.timestamp).toLocaleDateString('es-AR');
    actualizarStats();
    setEstado(`Última extracción: ${fecha}`, 'ok');
    document.getElementById('btn-descargar').style.display = 'block';
    document.getElementById('btn-importar').style.display = 'block';
  }

  // Escuchar mensajes del content script
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'log') agregarLog(msg.msg, msg.tipo);
    if (msg.action === 'progreso') actualizarProgreso(msg.valor);
  });
});

async function iniciarExtraccion() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const btn = document.getElementById('btn-extraer');
  const log = document.getElementById('log');
  const progressWrap = document.getElementById('progress-wrap');

  btn.disabled = true;
  btn.textContent = '⏳ Extrayendo...';
  log.style.display = 'block';
  log.innerHTML = '';
  progressWrap.style.display = 'block';
  document.getElementById('progress-fill').style.width = '0%';
  document.getElementById('progress-pct').textContent = '0%';
  document.getElementById('btn-descargar').style.display = 'none';
  document.getElementById('btn-importar').style.display = 'none';
  setEstado('Extrayendo...', '');

  try {
    agregarLog('Conectando con Sismat...', 'info');
    const resp = await chrome.tabs.sendMessage(tab.id, { action: 'extraer' });

    if (!resp?.success) throw new Error(resp?.error || 'Error desconocido');

    datosExtraidos = resp.datos;
    await chrome.storage.local.set({ sismat_data: datosExtraidos });

    actualizarStats();
    setEstado('¡Extracción completa! ✓', 'ok');
    agregarLog(`Total: ${datosExtraidos.materiales.length} materiales + ${datosExtraidos.mano_de_obra.length} mano de obra`, 'ok');

    if (datosExtraidos.errores?.length > 0) {
      datosExtraidos.errores.forEach(e => agregarLog(`⚠ ${e.tipo}: ${e.error}`, 'err'));
    }

    document.getElementById('btn-descargar').style.display = 'block';
    document.getElementById('btn-importar').style.display = 'block';

  } catch (err) {
    setEstado('Error', 'err');
    agregarLog(`✗ ${err.message}`, 'err');
    agregarLog('Asegurate de estar logueado en Sismat y recargá la página.', 'warn');
  }

  btn.disabled = false;
  btn.textContent = '🔄 Volver a extraer';
}

function descargarJSON() {
  if (!datosExtraidos) return;
  const blob = new Blob([JSON.stringify(datosExtraidos, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const fecha = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `sismat-precios-${fecha}.json`;
  a.click();
  URL.revokeObjectURL(url);
  agregarLog('Archivo descargado ✓', 'ok');
}

function abrirImportador() {
  if (!datosExtraidos) return;
  chrome.storage.local.set({ sismat_para_importar: datosExtraidos }, () => {
    chrome.tabs.create({ url: 'https://cubo-web.vercel.app/admin#importar-sismat' });
  });
}

function actualizarStats() {
  if (!datosExtraidos) return;
  document.getElementById('st-mats').textContent = datosExtraidos.materiales.length + ' ítems';
  document.getElementById('st-mo').textContent = datosExtraidos.mano_de_obra.length + ' ítems';
  const cats = [...new Set(datosExtraidos.materiales.map(m => m.categoria))];
  document.getElementById('st-cats').textContent = cats.length + ' categorías';
}

function actualizarProgreso(valor) {
  document.getElementById('progress-fill').style.width = valor + '%';
  document.getElementById('progress-pct').textContent = valor + '%';
  if (valor === 50) document.getElementById('current-cat').textContent = 'Materiales ✓ — Obteniendo mano de obra...';
  if (valor === 100) document.getElementById('current-cat').textContent = '¡Todo listo!';
}

function setEstado(texto, tipo) {
  const el = document.getElementById('st-estado');
  el.textContent = texto;
  el.className = 'status-val' + (tipo ? ' ' + tipo : '');
}

function agregarLog(msg, tipo = '') {
  const log = document.getElementById('log');
  log.style.display = 'block';
  const div = document.createElement('div');
  div.className = 'log-line ' + tipo;
  div.textContent = msg;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}
