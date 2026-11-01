/* Bondímetro v2.3 — modelo del SERVIDOR (autotrain) para el interpolado. Código propio, sin dependencias.
   Lee el model.json que genera bondimetro-autotrain/train.py (schema "bondimetro-autotrain/1") y avanza un bondi
   sobre su polilínea con el MISMO algoritmo que bondimodel.advance() (Python): velocidad de marcha por tramo físico
   × franja horaria × tipo de día × ajuste de la línea, espera esperada en paradas (dwell) y en "demoras habituales"
   (puntos donde los bondis suelen quedarse quietos fuera de una parada: NO son semáforos confirmados), sin pasar
   nunca `maxAhead`. Si el usuario entrenó un tramo en ESTE celu ("Estoy en este bondi"), en ese tramo manda lo local.
   Solo posiciones de colectivos: el modelo no tiene ni pide datos personales.
   Funciona en el navegador (window.SrvModel) y en Node (module.exports) para la prueba de paridad con Python. */
(function (root) {
  "use strict";
  const SCHEMA = "bondimetro-autotrain/1", CHUNK = 300, MAX_SPEED = 22;
  const DAYS = ["dom", "lab", "lab", "lab", "lab", "lab", "sab"];   // getUTCDay(): 0 = domingo

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function bisectRight(a, x) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (x < a[m]) hi = m; else lo = m + 1; } return lo; }

  function SrvModel(d) {
    if (!(this instanceof SrvModel)) return new SrvModel(d);
    if (!d || d.schema !== SCHEMA) throw new Error("model.json incompatible (schema " + (d && d.schema) + ")");
    this.d = d;
    this.version = d.version || "";
    this.tz = Number.isFinite(d.tz) ? d.tz : -180;
    this.bands = Array.isArray(d.bands) && d.bands.length ? d.bands : [0, 6, 7, 9, 12, 14, 17, 19, 22];
    this.holidays = new Set(d.holidays || []);
    this.pieces = d.pieces || {}; this.lineAdj = d.lineAdj || {}; this.stopMap = d.stops || {};
    this.dwellTab = d.dwell || {}; this.dwellLine = d.dwellLine || {}; this.delayTab = d.delays || {};
    this.polys = d.polys || {}; this.cellRatio = d.cellRatio || {}; this.dwellRatio = d.dwellRatio || {};
    this.minDelayN = (d.params && d.params.minDelayN) || 6;
  }
  const P = SrvModel.prototype;

  // Celda "lab3" = tipo de día + índice de franja, en la hora local del modelo (tz en minutos, AR = −180).
  P.cell = function (tsMs) {
    const t = new Date(tsMs + this.tz * 60000), day = t.getUTCFullYear() + "-" + pad(t.getUTCMonth() + 1) + "-" + pad(t.getUTCDate());
    const dt = this.holidays.has(day) ? "fer" : DAYS[t.getUTCDay()];
    return dt + Math.max(0, bisectRight(this.bands, t.getUTCHours()) - 1);
  };
  P.bandName = function (cell) { const i = +String(cell).slice(3); return (this.d.bandNames || [])[i] || ""; };

  P.speed = function (pid, cell, line) {
    const s = this.pieces[String(pid)]; if (!s) return null;
    const c = s.c && s.c[cell]; let v;
    if (c) v = c[0]; else if (cell in this.cellRatio) v = s.v * this.cellRatio[cell]; else return null;   // franja nunca vista: no inventar
    const adj = (this.lineAdj[line || ""] || {})[String(pid)];
    return adj ? v * adj[0] : v;
  };
  P.physStop = function (id) { return this.stopMap[id] || id; };
  P.dwell = function (stopId, cell, line) {
    const ph = this.physStop(stopId);
    for (const s of [this.dwellLine[line + "|" + ph], this.dwellTab[ph]]) {
      if (!s) continue;
      const c = s.c && s.c[cell]; if (c) return [c[0], c[1]];
      const r = this.dwellRatio[cell] || [1, 1];
      return [Math.min(1, s.p * r[0]), s.d * r[1]];
    }
    return null;
  };
  P.delays = function (pid, cell) {
    const out = [];
    for (const pt of this.delayTab[String(pid)] || []) {
      if ((pt.n || 0) < this.minDelayN) continue;
      const c = pt.c && pt.c[cell];
      out.push([pt.o, c ? c[0] : pt.p, c ? c[1] : pt.d]);
    }
    return out;
  };
  // Intervalos de tramo físico de una polilínea de la app ("routeId#idx", mismo orden que storeRoutePolys y el
  // recolector). Si el largo no coincide (±2 m) el recorrido cambió: no se usa el modelo en esa polilínea.
  P.attach = function (poly) {
    if (poly._sm && poly._sm.v === this.version) return poly._sm.iv;
    const e = this.polys[poly.routeId + "#" + poly.idx];
    let iv = null;
    if (e && Math.abs(e.L - poly.len) <= 2 && Array.isArray(e.iv) && e.iv.length) {
      const st = e.iv.map(x => x[0]);
      iv = e.iv.map((x, i) => [x[0], i + 1 < e.iv.length ? st[i + 1] : poly.len, x[1], x[2]]); iv.starts = st;
    }
    poly._sm = { v: this.version, iv }; return iv;
  };
  function pieceAt(iv, along) { return iv[Math.max(0, bisectRight(iv.starts, along) - 1)]; }
  function nextStop(poly, along) { const s = poly.stops || []; let i = 0; while (i < s.length && s[i].along <= along) i++; return i; }

  /* Posición (along) tras `dt` s. o = { fallbackV, stoppedAt: ["stop"|"delay", d], stoppedFor, maxAhead (absoluto),
     useSpeed, useDwell, useDelay, local(pos) → {v, a1} | null }. Devuelve { along, used, local }. */
  P.advance = function (poly, along, dt, cell, line, o) {
    o = o || {};
    const useSpeed = o.useSpeed !== false, useDwell = o.useDwell !== false, useDelay = o.useDelay !== false, maxA = o.maxAhead;
    let pos = along, left = +dt, used = false, usedLocal = false;
    if (o.stoppedAt) { const wait = Math.max(0, o.stoppedAt[1] - (o.stoppedFor || 0)); used = true; if (left <= wait) return { along: pos, used, local: false }; left -= wait; }
    const iv = this.attach(poly);
    for (let k = 0; k < 120; k++) {
      if (left <= 1e-6 || pos >= poly.len - 0.5) break;
      let a0, a1, pid = null, off0 = 0;
      const pc = iv ? pieceAt(iv, pos + 0.01) : null;
      if (pc) [a0, a1, pid, off0] = pc; else { a0 = pos; a1 = Math.min(poly.len, pos + CHUNK); }
      if (a1 <= pos + 0.01) a1 = Math.min(poly.len, pos + CHUNK);
      const loc = o.local ? o.local(pos) : null;
      let v = null, events = [];
      if (loc) { v = loc.v; a1 = Math.min(a1, Math.max(pos + 0.5, loc.a1)); usedLocal = true; }   // tramo entrenado en este celu: manda lo local
      else {
        if (useSpeed && pid != null) { v = this.speed(pid, cell, line); if (v != null) used = true; }
        if (useDwell) {
          const j = nextStop(poly, pos + 1), s = poly.stops || [];
          if (j < s.length && s[j].along <= a1 + 0.01) { const dw = this.dwell(s[j].id, cell, line); if (dw) { events.push([s[j].along, dw[0] * dw[1]]); used = true; } }
        }
        if (useDelay && pid != null) for (const [off, p, d] of this.delays(pid, cell)) { const a = a0 + (off - off0); if (pos + 1 < a && a <= a1) { events.push([a, p * d]); used = true; } }
        events.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
      }
      if (v == null) v = o.fallbackV;
      v = Math.min(MAX_SPEED, Math.max(0.5, v || 0.5));
      let target = events.length ? events[0][0] : a1;
      if (maxA != null) target = Math.min(target, maxA);
      const need = Math.max(0, target - pos) / v;
      if (left <= need) { pos += v * left; left = 0; break; }
      pos = target; left -= need;
      if (maxA != null && pos >= maxA - 1e-6) break;
      if (events.length && Math.abs(events[0][0] - target) < 1e-6) { const w = events[0][1]; if (left <= w) break; left -= w; }
    }
    pos = Math.min(pos, poly.len); if (maxA != null) pos = Math.min(pos, maxA);
    return { along: pos, used, local: usedLocal };
  };
  // Bondi detenido en una parada o demora habitual conocida → ["stop"|"delay", duración típica].
  P.stoppedContext = function (poly, along, cell, line, stopR, delayR) {
    stopR = stopR == null ? 35 : stopR; delayR = delayR == null ? 25 : delayR;
    const s = poly.stops || [], j = nextStop(poly, along - stopR);
    if (j < s.length && Math.abs(s[j].along - along) <= stopR) { const dw = this.dwell(s[j].id, cell, line); if (dw) return ["stop", dw[1], s[j].id]; }
    const iv = this.attach(poly), pc = iv ? pieceAt(iv, along + 0.01) : null;
    if (pc) for (const [off, , d] of this.delays(pc[2], cell)) if (Math.abs(pc[0] + (off - pc[3]) - along) <= delayR) return ["delay", d];
    return null;
  };
  P.summary = function () {
    const d = this.d, e = d.eval || {};
    return { version: this.version, created: d.created || null, days: d.trainedDays || null, nDays: d.nDays || 0,
      mae: Number.isFinite(e.mae) ? e.mae : null, base: Number.isFinite(e.base) ? e.base : null, n: e.n || 0,
      lines: d.lines || [], pieces: Object.keys(this.pieces).length,
      delays: Object.values(this.delayTab).reduce((a, l) => a + l.filter(x => (x.n || 0) >= this.minDelayN).length, 0) };
  };
  SrvModel.SCHEMA = SCHEMA;
  if (typeof module === "object" && module.exports) module.exports = SrvModel; else root.SrvModel = SrvModel;
})(typeof self !== "undefined" ? self : this);
