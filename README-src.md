# Bondímetro v2

Versión nueva del Bondímetro, en paralelo a la v1 (`/workspace/bondimetro/public/`, que **no se tocó**).
Es de uso personal. Sigue siendo una PWA estática: un solo `index.html`, Leaflet local en `vendor/`, `sw.js` y el manifest.

## Qué cambia respecto de la v1

- **Bondis fluidos (interpolación).**
  - Cada unidad tiene un marcador fijo identificado por `tripId`. Se mueve, no se borra y se vuelve a crear.
  - Con cada posición GPS nueva, el marcador se desliza en unos 1 s. Si el salto pasa de 2 km, salta directo. Con `prefers-reduced-motion`, no hay animación.
- **Estimación entre consultas.**
  - Con las dos últimas posiciones, se calcula la velocidad sobre la polilínea del recorrido, o en línea recta si no hay polilínea.
  - Se extrapola hasta 30 s como máximo y nunca más allá de la parada.
  - Si el bondi se movió menos de 8 m, se toma como detenido y no se mueve.
  - Cuando la posición es estimada, el marcador se ve semitransparente (`.est`).
  - La distancia se muestra con "≈".
- **Cuentas regresivas.** El ETA y "GPS hace X s" avanzan cada segundo, a partir de `predictedArrivalTime` y `lastLocationUpdateTime`. No se inventan horarios.
- **Todos los bondis de una línea** (vista `#/route/<id>`):
  - Muestra **todas** las unidades de `trips-for-route` a la vez. El sentido elegido va opaco y el otro, atenuado (tooltip "otro sentido").
  - Chips: "Todas las unidades (N)" (por defecto, y se recuerda), "Solo este sentido (M)" y "🔍 Encuadrar bondis".
  - Se actualiza por polling cada *Refresco línea* (15 s por defecto), con la misma interpolación.
  - Cómo se llega a esa vista:
    - buscando la línea ("· ver todos los bondis");
    - desde una línea favorita;
    - desde una parada, con el chip **"🗺️ Todos los <línea>"**.
- **Una sola cabecera.** `Authorization: apiKey <clave>`, más `?key=` en la URL.
  - Es la que contestó 200 en las 2 llamadas reales de verificación del 30/10/2026 (`current-time` y `agencies-with-coverage`).
  - Se sacaron los demás formatos que la v1 probaba en cadena.
- **Tiempos de consulta configurables** en Ajustes:
  - parada 20 s y línea 15 s por defecto;
  - acepta de 1 a 600 s, sin mínimo obligatorio, pero muestra un aviso si es muy seguido (el feed se actualiza cada ~30 s).
- **Polling más prolijo.**
  - Se usa `setTimeout` con jitter de ±5% y un solo ciclo de consultas por vista, con `AbortController`.
  - Ante errores, el reintento espera cada vez más, hasta 2 min, con jitter de ±20%.
  - Con **401/403 se frena** y aparece el botón "Reintentar".
  - Con la pestaña oculta se pausa todo, GPS incluido, y al volver consulta enseguida.
- **Estado honesto.**
  - Barra "Actualizado hace… · próximo en…" o "⚠️ Sin conexión · último dato hace…".
  - Si el dato es viejo, no dice "en vivo". También avisa si la hora del servidor está corrida más de 10 min.
  - Hay un link a la grilla oficial como plan B.
- **Service worker** con caché propia (`bondimetro2-shell-3`):
  - guarda solo el shell (`r.ok` y del mismo origen) y la red tiene prioridad;
  - la API y el proxy no pasan por la caché;
  - solo borra cachés con su prefijo, así que no pisa la de la v1.
- **Convivencia con la v1 en el mismo origen.**
  - Usa localStorage con el prefijo `bondi2.`.
  - La primera vez copia favoritos y vista de `bondi.*` sin modificarlos.
- **Privacidad.** El GPS se activa solo al tocar el botón, o si ya tenía permiso y lo usaste antes. Usa `enableHighAccuracy:false` y las coordenadas van redondeadas a 3 decimales en las consultas.
- **Código y accesibilidad.**
  - Delegación de eventos con `data-go`, `data-act` y `data-arg`, sin `onclick` inline.
  - Enter y Espacio en los elementos que actúan como botón.
  - Etiquetas `aria`.
- **Íconos.** 192/512, maskable y apple-touch (`make-icons.py`). El nombre es "Bondímetro v2".

## Entrenamiento del interpolado ("🚌 Estoy en este bondi")

La idea: si vas arriba de un bondi, el GPS de tu celu es más rápido y preciso que el del feed. La app compara los dos y aprende qué tan rápido va realmente el bondi en cada tramo.

**Cómo se activa**
1. En una **parada**, tocá un arribo **en vivo** y después **🚌 Estoy en este bondi**.
2. O en la **vista de línea**, tocá el bondi (marcador en el mapa o fila de la lista). Aparece la tarjeta "Unidad seleccionada" con el mismo botón.
3. El navegador pide permiso de ubicación. Arriba aparece la barra **🎓 Entrenando · línea X → destino · GPS ±m · N tramo(s) · N par(es)** con **Ver** (vuelve a la línea), **Terminar** (guarda) y **Cancelar** (descarta todo lo de esa sesión).
4. Dejá la **pantalla prendida** y la app abierta: los navegadores móviles cortan el GPS en segundo plano. Si recargás, la sesión se retoma (máximo 3 h).

**Qué mide**
- Durante la sesión usa `watchPosition` con alta precisión (~1 fix/s). Cada fix se proyecta sobre el recorrido del sentido.
- **Tramo**: entre dos paradas consecutivas del sentido (`stops-for-route`). Si una polilínea no tiene paradas, cada 300 m.
- Velocidad de una pasada = distancia recorrida / tiempo. Se descartan:
  - fixes con precisión > 50 m;
  - saltos > 30 m/s;
  - fixes fuera del recorrido (> 60 m) o después de un corte > 20 s.
- Las **frenadas largas** (> 20 s, como semáforos o la parada) no suman al tiempo; las cortas sí.
- Una pasada cuenta si cubrió ≥ 40% del tramo, ≥ 60 m y ≥ 5 s, y dio entre 1 y 25 m/s. Por tramo se guardan las últimas 15 y se usa la **mediana**.
- En cada **fix nuevo del feed** de ese viaje se guarda un par `{t, pt, plat, plon, pacc, olat, olon, llu, trip, route, seg, sid, lag}`.
  - `lag` = `lastLocationUpdateTime` − el momento en que el celu pasó por ese mismo punto del recorrido.

**Cómo se usa**
- Fuera de la sesión (y para cualquier otro bondi de la línea), la extrapolación avanza cada tramo con su velocidad aprendida y suma el desfase típico del feed.
  - Con menos de 3 pasadas, la velocidad aprendida se mezcla con la de los fixes.
  - El desfase es la mediana de al menos 3 muestras, acotada a −30…+60 s.
- Sigue el tope de 30 s y el marcador semitransparente de "estimado".
- Sin datos, funciona igual que la 2.0. Se apaga en Ajustes → "Usar lo aprendido con “Estoy en este bondi”".
- El bondi que estás entrenando se muestra "en crudo", sin modelo, para no contaminar la medición.

**Privacidad / datos**: todo queda **solo en este dispositivo**, en `localStorage`. **No se sube a ningún servidor**: no hay POST, ni parámetros extra en las consultas, y lo verifican los tests.
- `bondi2.trainModel` = `{v:1, segs:{"<routeId>|<paradaA>><paradaB>": {len, p:[[m/s, metros, segundos, ts, sesión]]}}, lag:[[ms, ts, sesión]], sessions}`
- `bondi2.trainPairs` guarda hasta 1500 pares, con coordenadas a 5 decimales.
- `bondi2.trainSession` es la sesión en curso.
- Ajustes → "Entrenamiento del interpolado" muestra estadísticas, **Exportar (JSON)** (descarga local) y **Borrar lo aprendido**.

**Límites**
- Necesita la pantalla prendida.
- El tramo depende de que la línea tenga paradas por sentido en `stops-for-route`.
- La velocidad aprendida no distingue horario (hora pico vs. noche). Se puede agregar después: los pares guardan el timestamp.

## Cómo servirla

Es estática, así que alcanza con servir `public/` bajo `/bondimetro-v2/`. Por ejemplo, con nginx:

```nginx
location /bondimetro-v2/ { alias /ruta/a/bondimetro-v2/public/; }
```

El proxy sigue siendo el de la v1 (`/bondimetro/proxy/<path>.json?...&h=<Authorization>`), configurable en Ajustes.
Dentro de la app Android (UA `BondimetroApp`) usa el puente nativo `/oba`.

## Cómo probar (local, sin SUBE)

```bash
cd /workspace/bondimetro-v2/test
node server.js &     # mock en http://localhost:8766/bondimetro-v2/ (proxy y /api/where simulados)
node test.js         # 48 pruebas en Chrome headless (19 de entrenamiento); todo DNS salvo localhost bloqueado
```

- El mock tiene 5 unidades en 2 sentidos (una detenida), con `stops-for-route` y polilínea.
- Modos: `/__mode?m=ok|401|down`. Registro de pedidos: `/__log`.
- Las capturas quedan en `screenshots/`.

## Riesgos (conocidos y aceptados: uso personal)

- **`?api=`, `?key=`, `?mode=` y `?proxy=` por URL.** Se mantienen para pruebas.
  - Viven solo en memoria y no se guardan. En el inicio aparece el aviso "Modo prueba por URL".
  - Riesgo: un link armado puede apuntar la app a otro servidor y mandarle la clave.
- **JSONP** (`mode=jsonp`). Ejecuta como script lo que devuelva el servidor configurado. Con un `?api=` malicioso, eso es ejecución de código en el origen, que comparte localStorage con la v1. Usalo solo con servidores propios o de confianza.
- **Clave.** Es la clave pública del APK de CuándoSubo y va dentro del `index.html` y en cada pedido. Si la rotan, se cambia en Ajustes.
- **El proxy** reenvía la cabecera `h=` tal cual. Conviene que no sea un proxy abierto.

## Pendiente

- Del lado del servidor, en el proxy:
  - poner la clave ahí, para no mandarla desde el navegador;
  - limitar a qué rutas se puede acceder (allowlist);
  - cachear las respuestas 10–15 s (microcaché), para que varias pestañas no multipliquen pedidos.
- Un plan B más completo con la grilla, que muestre los horarios dentro de la app.
- Pedir acceso formal a la API.
- Entrenamiento: probarlo arriba de un bondi real (solo se probó con fixes simulados) y, más adelante, separar las velocidades por franja horaria.
- Probarla contra el servidor real. No se hizo, para no gastar más llamadas a SUBE: se usaron solo las 2 de verificación.
