/* ============================================================
   MEDIDAS.JS — Motor de cantidades derivadas de dimensiones.

   El cliente no sabe cuántos m² tiene la pared de su baño: escribía "4" donde
   iban 19 y el presupuesto salía por el piso. Acá se pregunta una sola vez
   cuánto mide el ambiente y cada ítem saca su cantidad de una fórmula.
   ============================================================ */

/* IIFE: este archivo y presupuestador-app.js son scripts clásicos y comparten el
   scope global. Sin este envoltorio, las funciones homónimas (renderResumen,
   quitar) se pisan entre sí y el archivo que carga último gana. Todo lo que el
   resto de la app necesita sale por window.CuboMedidas. */
(function () {


/* Descuento por aberturas: en un baño típico la puerta (0,80 × 2,00) y una
   ventana chica se comen cerca del 10% de la superficie de pared. Preferimos
   subestimar el descuento antes que subcotizar el revestimiento. */
const FACTOR_ABERTURAS = 0.9;

function calcularVars(dim) {
  const largo = num(dim.largo);
  const ancho = num(dim.ancho);
  const alto  = num(dim.alto) || 2.5;
  const hRev  = num(dim.altura_revest) || alto;

  const perimetro = 2 * (largo + ancho);
  const area_piso = largo * ancho;

  const base = {
    largo, ancho, alto,
    altura_revest: hRev,
    perimetro,
    area_piso,
    area_paredes: perimetro * alto * FACTOR_ABERTURAS,
    area_revest:  perimetro * hRev * FACTOR_ABERTURAS,
    area_cielorraso: area_piso,
    unidad: 1,
  };

  /* Cada ambiente tiene su variable dominante: en un baño manda el m² de pared,
     en una cocina los metros lineales de mesada y muebles. La plantilla declara
     las suyas en medidas.extra y acá pasan a ser usables en cualquier fórmula. */
  Object.keys(dim).forEach(k => {
    if (k in base) return;
    const v = num(dim[k]);
    if (v) base[k] = v;
  });

  return base;
}

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/* ── EVALUADOR ACOTADO ──
   Nada de eval() sobre texto de una plantilla. Se tokeniza y se valida que cada
   token sea un número, una variable conocida o un operador permitido; recién ahí
   se arma la función. Un token desconocido devuelve null y el ítem se descarta
   con un warning, en vez de romper el cotizador entero. */
const TOKEN_RE = /\s*([A-Za-z_][A-Za-z0-9_]*|\d+\.?\d*|[+\-*/().])/g;
const OPERADORES = new Set(['+', '-', '*', '/', '(', ')', '.']);

function evalFormula(formula, vars) {
  if (formula == null || formula === '') return null;
  if (typeof formula === 'number') return formula;

  const src = String(formula);
  const nombres = Object.keys(vars);
  let m, consumido = 0;
  TOKEN_RE.lastIndex = 0;

  while ((m = TOKEN_RE.exec(src)) !== null) {
    consumido = TOKEN_RE.lastIndex;
    const t = m[1];
    if (OPERADORES.has(t)) continue;
    if (/^\d/.test(t)) continue;
    if (!nombres.includes(t)) {
      console.warn(`[medidas] Fórmula "${formula}": variable desconocida "${t}".`);
      return null;
    }
  }

  // Si quedó texto sin tokenizar hay un caracter prohibido (";", "[", una comilla…)
  if (consumido !== src.length) {
    console.warn(`[medidas] Fórmula "${formula}": caracteres no permitidos.`);
    return null;
  }

  try {
    const fn = new Function(...nombres, `"use strict"; return (${src});`);
    const r  = fn(...nombres.map(k => vars[k]));
    return Number.isFinite(r) ? r : null;
  } catch (e) {
    console.warn(`[medidas] Fórmula "${formula}" no se pudo evaluar:`, e.message);
    return null;
  }
}

/* ── REDONDEO ──
   Siempre hacia arriba. El desperdicio de material es real y un presupuesto
   orientativo que se queda corto es peor que uno que se pasa un poco. */
function redondearCantidad(n, unidad) {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const u = (unidad || '').trim().toLowerCase();
  if (u === 'unidad' || u === 'un' || u === 'boca' || u === 'global') {
    return Math.max(1, Math.ceil(n));
  }
  return Math.ceil(n * 2) / 2;   // al 0,5 más cercano hacia arriba
}

/* Texto que explica de dónde salió la cantidad. Es lo que convierte el resumen
   en algo creíble: "19,2 m² · paredes revestidas hasta 2,5 m".
   `nota` permite que la plantilla escriba la explicación a mano cuando la
   fórmula es compuesta y describirla automáticamente quedaría confuso. */
function explicarCantidad(formula, dim, nota) {
  if (nota) return nota;

  const f = String(formula || '').trim();
  // Una cantidad fija (1 unidad, 2 bocas) no se "calcula sobre" nada.
  if (!/[a-z_]/i.test(f)) return null;

  const planta = `${fmtNum(dim.largo)} × ${fmtNum(dim.ancho)} m`;
  const FRASES = {
    area_revest:     `paredes revestidas hasta ${fmtNum(dim.altura_revest || dim.alto)} m`,
    area_paredes:    `superficie de paredes de ${planta} × ${fmtNum(dim.alto)} m`,
    area_cielorraso: `cielorraso de ${planta}`,
    area_piso:       `piso de ${planta}`,
    perimetro:       `perímetro de ${planta}`,
  };

  const usadas = [...new Set(f.match(/[a-z_][a-z0-9_]*/gi) || [])].filter(v => FRASES[v]);
  if (usadas.length === 1) return FRASES[usadas[0]];
  if (usadas.length === 0) return null;
  return `calculado sobre las medidas del ambiente (${planta})`;
}

function fmtNum(n) {
  const v = parseFloat(n);
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

window.CuboMedidas = {
  calcularVars, evalFormula, redondearCantidad, explicarCantidad, fmtNum,
  FACTOR_ABERTURAS,
};
})();
