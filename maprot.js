/* Bondímetro v2.3 — rotación del mapa para Leaflet 1.9.x, sin dependencias (código propio, ~200 líneas).
   Por qué no leaflet-rotate: es GPL-3.0 (obligaría a distribuir toda la app bajo GPL) y parchea muchas
   partes internas de Leaflet. Acá la idea es más chica:
   - Con ángulo 0 NO se toca nada: el contenedor queda como siempre (position:fixed; inset:0).
   - Con ángulo ≠ 0 el contenedor de Leaflet pasa a ser un cuadrado de lado = diagonal de la pantalla,
     centrado en la pantalla y rotado con CSS (transform: rotate). Así siempre cubre toda la pantalla.
   - Se corrigen las coordenadas de entrada: map.mouseEventToContainerPoint (toques, clics, rueda, pellizco)
     y L.Draggable (arrastre) reciben el punto "des-rotado". El zoom por pellizco de Leaflet sigue andando
     y, como gira alrededor del centro de la pantalla, el punto bajo los dedos queda bajo los dedos.
   - Íconos con rumbo (bondis, flechas de parada) están DENTRO de la capa rotada: siguen apuntando bien sin
     recalcular nada (en pantalla apuntan a rumbo + giro del mapa). El texto se contra-rota con la variable
     CSS --mrot (ver index.html: .busmk .lb, .ttx).
   Gestos: dos dedos girando (umbral 12° para no pelear con el pellizco), Shift + arrastrar con mouse,
   botones ⟲ ⟳ y brújula (vuelve al norte). Ángulo en grados, sentido horario = positivo
   (0 = norte arriba; 90 = el norte queda a la derecha). */
(function () {
  "use strict";
  if (!window.L || !L.Draggable) return;
  const RAD = Math.PI / 180;
  let active = null;   // única instancia (una app = un mapa)

  // --- L.Draggable: con el mapa rotado, el arrastre se calcula en el marco del contenedor.
  // Leaflet divide el desplazamiento por la "escala" del contenedor (ancho del rectángulo envolvente / ancho
  // real); con rotación esa escala vale |cos|+|sen|, así que se la pre-multiplica para que se cancele.
  function rotEvent(e) {
    if (!active || !active.deg || !e) return e;
    const m = active._inMatrix();
    const tp = t => new Proxy(t, { get(o, k) {
      if (k === "clientX") return m.s * (m.c * o.clientX + m.n * o.clientY);
      if (k === "clientY") return m.s * (-m.n * o.clientX + m.c * o.clientY);
      const v = o[k]; return typeof v === "function" ? v.bind(o) : v; } });
    return new Proxy(e, { get(o, k) {
      if (k === "clientX" || k === "clientY") return tp(o)[k];
      if (k === "touches" && o.touches) return Array.prototype.map.call(o.touches, tp);
      const v = o[k]; return typeof v === "function" ? v.bind(o) : v; } });
  }
  const D = L.Draggable.prototype, onDown = D._onDown, onMove = D._onMove;
  D._onDown = function (e) { return onDown.call(this, rotEvent(e)); };
  D._onMove = function (e) { return onMove.call(this, rotEvent(e)); };

  const norm = a => { a = ((a % 360) + 540) % 360 - 180; return a === -180 ? 180 : a; };

  function MapRot(map, opts) {
    opts = opts || {};
    const el = map.getContainer(), root = document.documentElement;
    const R = { deg: 0, norm, onChange: opts.onChange || null, onManual: opts.onManual || null };
    active = R;
    let big = false, anim = null, holdBig = 0;
    const vw = () => window.innerWidth, vh = () => window.innerHeight;

    function layout(wantBig) {
      if (wantBig) {
        const D = Math.ceil(Math.hypot(vw(), vh())) + 2;
        Object.assign(el.style, { right: "auto", bottom: "auto", left: (vw() - D) / 2 + "px", top: (vh() - D) / 2 + "px", width: D + "px", height: D + "px" });
      } else Object.assign(el.style, { right: "", bottom: "", left: "", top: "", width: "", height: "" });
      if (big !== wantBig || wantBig) { big = wantBig; map.invalidateSize({ animate: false, pan: true }); }
    }
    function apply() {
      const want = R.deg !== 0 || holdBig > 0;
      if (want !== big) layout(want);
      el.style.transform = R.deg ? `rotate(${R.deg}deg)` : "";
      root.style.setProperty("--mrot", R.deg + "deg");
      root.classList.toggle("maprot", R.deg !== 0);
      // teclado: las flechas mueven el mapa en el sentido de la PANTALLA
      const kb = map.keyboard;
      if (kb && kb._setPanDelta) {
        kb._setPanDelta(map.options.keyboardPanDelta);
        if (R.deg) for (const k in kb._panKeys) { const p = kb._panKeys[k]; kb._panKeys[k] = R.screenToContainerVec(p[0], p[1]); }
      }
      if (R.onChange) R.onChange(R.deg);
    }
    R._inMatrix = () => { const a = R.deg * RAD, r = el.getBoundingClientRect(); return { c: Math.cos(a), n: Math.sin(a), s: el.offsetWidth ? r.width / el.offsetWidth : 1 }; };
    // vector en pantalla → vector en el contenedor (des-rotar) y al revés
    R.screenToContainerVec = (x, y) => { const a = R.deg * RAD, c = Math.cos(a), s = Math.sin(a); return [c * x + s * y, -s * x + c * y]; };
    R.containerToScreenVec = (x, y) => { const a = R.deg * RAD, c = Math.cos(a), s = Math.sin(a); return [c * x - s * y, s * x + c * y]; };
    // punto de pantalla (clientX/Y) → punto del contenedor de Leaflet
    R.toContainer = (x, y) => {
      if (!big) { const r = el.getBoundingClientRect(); return L.point(x - r.left - el.clientLeft, y - r.top - el.clientTop); }
      const sz = map.getSize(), v = R.screenToContainerVec(x - vw() / 2, y - vh() / 2);
      return L.point(v[0] + sz.x / 2, v[1] + sz.y / 2);
    };
    R.toScreen = p => {   // punto del contenedor → pantalla
      p = L.point(p);
      if (!big) { const r = el.getBoundingClientRect(); return L.point(p.x + r.left, p.y + r.top); }
      const sz = map.getSize(), v = R.containerToScreenVec(p.x - sz.x / 2, p.y - sz.y / 2);
      return L.point(v[0] + vw() / 2, v[1] + vh() / 2);
    };
    R.latLngToScreen = ll => R.toScreen(map.latLngToContainerPoint(ll));
    R.screenToLatLng = (x, y) => map.containerPointToLatLng(R.toContainer(x, y));
    map.mouseEventToContainerPoint = function (e) { return big ? R.toContainer(e.clientX, e.clientY) : L.Map.prototype.mouseEventToContainerPoint.call(this, e); };

    R.set = function (deg, o) {
      o = o || {};
      if (anim) { cancelAnimationFrame(anim); anim = null; holdBig = Math.max(0, holdBig - 1); }
      deg = norm(Math.round(deg * 10) / 10);
      if (Math.abs(deg) < 0.05) deg = 0;
      const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!o.animate || reduce || deg === R.deg) { R.deg = deg; apply(); return R; }
      const from = R.deg, d = norm(deg - from), t0 = performance.now(), T = 260;
      holdBig++;
      const step = t => {
        const k = Math.min(1, (t - t0) / T), e = 1 - Math.pow(1 - k, 3);
        R.deg = k < 1 ? norm(from + d * e) : deg;
        if (k < 1) { apply(); anim = requestAnimationFrame(step); } else { anim = null; holdBig--; apply(); }
      };
      anim = requestAnimationFrame(step);
      return R;
    };
    R.get = () => R.deg;
    R.rotateBy = (d, o) => R.set(R.deg + d, o);
    R.isBig = () => big;

    // Encuadrar con el mapa rotado: el rectángulo visible de la PANTALLA (sin barra ni hoja) tiene que contener
    // los puntos girados. Con 0° usa fitBounds de Leaflet tal cual.
    R.fitBounds = function (bounds, o) {
      bounds = L.latLngBounds(bounds); o = o || {};
      if (!R.deg) return map.fitBounds(bounds, o);
      const tl = L.point(o.paddingTopLeft || [0, 0]), br = L.point(o.paddingBottomRight || [0, 0]);
      const W = Math.max(20, vw() - tl.x - br.x), H = Math.max(20, vh() - tl.y - br.y);
      const z0 = map.getZoom();
      const pts = [bounds.getNorthWest(), bounds.getNorthEast(), bounds.getSouthWest(), bounds.getSouthEast()].map(ll => map.project(ll, z0));
      const scr = pts.map(p => R.containerToScreenVec(p.x, p.y));
      const xs = scr.map(p => p[0]), ys = scr.map(p => p[1]);
      const we = Math.max(...xs) - Math.min(...xs), he = Math.max(...ys) - Math.min(...ys);
      let z = (we < 1 && he < 1) ? Infinity : z0 + Math.log2(Math.min(W / Math.max(we, 1), H / Math.max(he, 1)));
      const snap = map.options.zoomSnap || 1;
      z = Math.min(z, o.maxZoom != null ? o.maxZoom : Infinity, map.getMaxZoom());
      z = Math.max(map.getMinZoom(), Math.floor(z / snap) * snap);
      // centro de la caja girada → latlng
      const mid = R.screenToContainerVec((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2);
      const cLL = map.unproject(L.point(mid[0], mid[1]), z0);
      // el centro del área visible está corrido respecto del centro de la pantalla
      const off = R.screenToContainerVec((tl.x - br.x) / 2, (tl.y - br.y) / 2);
      const center = map.unproject(map.project(cLL, z).subtract(off), z);
      map.setView(center, z, { animate: o.animate !== false && !!o.animate });
      return map;
    };

    // --- gestos ---
    const ptr = new Map();
    let g = null, md = null, swallowClick = false;
    const ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x) / RAD;
    el.addEventListener("pointerdown", e => {
      if (e.pointerType === "mouse") return;
      ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptr.size === 2) {
        const [a, b] = [...ptr.values()];
        g = { a0: ang(a, b), d0: R.deg, on: false };
        // Dos dedos: se pasa YA al contenedor grande (antes de que Leaflet arranque el pellizco), así si el gesto
        // termina girando no cambia el tamaño del contenedor a mitad del zoom.
        holdBig++; apply();
      }
    }, true);
    el.addEventListener("pointermove", e => {
      if (!ptr.has(e.pointerId)) return;
      ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!g || ptr.size !== 2) return;
      const [a, b] = [...ptr.values()], da = norm(ang(a, b) - g.a0);
      if (!g.on) { if (Math.abs(da) < 12) return; g.on = true; g.a0 = ang(a, b); g.d0 = R.deg; if (R.onManual) R.onManual(); return; }
      R.set(g.d0 + da);
    }, true);
    const up = e => {
      ptr.delete(e.pointerId);
      if (g && ptr.size < 2) {
        if (g.on && Math.abs(R.deg) < 7) R.set(0, { animate: true });
        g = null; setTimeout(() => { holdBig = Math.max(0, holdBig - 1); if (!anim) apply(); }, 400);
      }
    };
    el.addEventListener("pointerup", up, true);
    el.addEventListener("pointercancel", up, true);
    // Shift + arrastrar (mouse): gira alrededor del centro de la pantalla
    el.addEventListener("mousedown", e => {
      if (!e.shiftKey || e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      md = { a0: Math.atan2(e.clientY - vh() / 2, e.clientX - vw() / 2) / RAD, d0: R.deg, moved: false };
    }, true);
    window.addEventListener("mousemove", e => {
      if (!md) return;
      const da = norm(Math.atan2(e.clientY - vh() / 2, e.clientX - vw() / 2) / RAD - md.a0);
      if (!md.moved && Math.abs(da) < 2) return;
      if (!md.moved && R.onManual) R.onManual();
      md.moved = true; R.set(md.d0 + da);
    });
    window.addEventListener("mouseup", () => { if (md) { swallowClick = md.moved; md = null; if (Math.abs(R.deg) < 4 && R.deg) R.set(0, { animate: true }); } });
    el.addEventListener("click", e => { if (swallowClick) { swallowClick = false; e.stopPropagation(); e.preventDefault(); } }, true);
    if (map.boxZoom) map.boxZoom.disable();   // Shift + arrastrar ahora gira (antes era zoom de caja)
    window.addEventListener("resize", () => { if (big) layout(true); });
    return R;
  }
  window.MapRot = MapRot;
})();
