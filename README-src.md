# Bondímetro v2

Versión nueva del Bondímetro, en paralelo a la v1 (`/workspace/bondimetro/public/`, que **no se tocó**).
Es de uso personal. Sigue siendo una PWA estática: un solo `index.html`, Leaflet local en `vendor/`, `sw.js` y el manifest.

## Novedades 2.3.1

- **Arreglo: los bondis en punteadito ya no se quedan quietos.** El GPS de Cuándo SUBO llega con ~1 min de
  atraso. Antes la estimación se cortaba a los 30 s de la hora del GPS, o sea antes de llegar. Ahora sigue
  avanzando hasta ~1,5 min después de cada lectura nueva:
  - va a la velocidad reciente (mediana de los últimos fixes) y espera unos segundos en las paradas;
  - nunca pasa la parada que estás mirando;
  - al llegar el dato real se corrige sin saltar para atrás.
- Si una unidad no manda GPS hace más de 5 min, queda **gris con "sin señal"** en vez de moverse.
- En la vista de parada el bondi se dibuja donde dice el GPS. Antes se dibujaba en la posición "según horario"
  que también manda el feed.
- Detalle en `CHANGELOG.md`. Pruebas nuevas: `node interp.js` (18).

## Novedades 2.3.0

- **El mapa se puede rotar.**
  - En el celu se gira con dos dedos. El giro arranca recién pasados 12°, así no se confunde con el pellizco.
  - En la compu se gira con **Shift + arrastrar** o con los botones ⟲ ⟳ (15° por toque), que solo aparecen
    con mouse o trackpad.
  - La **brújula** muestra hacia dónde queda el norte. Al tocarla, el mapa **vuelve al norte**.
  - **Rumbo arriba** (opcional, apagado por defecto: Ajustes → "Brújula: permitir rumbo arriba"):
    - Con el mapa al norte, tocar la brújula hace que el mapa siga hacia dónde mirás.
    - Usa la brújula del teléfono y, si no hay, el rumbo del GPS mientras te movés a más de 1,5 m/s.
    - Tocar la brújula otra vez lo apaga y vuelve al norte.
  - Los bondis y las flechas de sentido de las paradas siguen apuntando bien. Los números, las etiquetas y
    los tooltips se contra-rotan para que se lean derechos.
  - "Mi ubicación", "Encuadrar bondis", la hoja inferior y el zoom/pan con pellizco funcionan igual con el
    mapa rotado.
  - **No se usó leaflet-rotate.** Es GPL-3.0 (obligaría a licenciar toda la app así) y parchea muchas
    partes internas de Leaflet. En su lugar hay código propio sin dependencias, `maprot.js` (~200 líneas).
    Con ángulo 0 no cambia nada; con otro ángulo, rota el contenedor con CSS y corrige las coordenadas de
    los toques.
- **Modelo del servidor (aprendido solo)** — ver `/workspace/bondimetro-autotrain/`.
  - La app baja `model.json` (misma carpeta, `/bondimetro-v2/model.json`) al abrir y cada 6 h, y revalida
    por ETag.
  - El modelo sabe la velocidad típica por **tramo de calle × franja horaria × tipo de día**, cuánto se
    detienen los bondis en cada **parada**, y dónde hay **"demoras habituales"**. Una demora habitual es un
    lugar donde los bondis suelen quedarse quietos fuera de parada; **no es un semáforo confirmado**.
  - Se usa para interpolar entre lecturas. El bondi espera en paradas y demoras, y nunca pasa la parada
    siguiente.
  - **Lo que entrenaste vos en el celu manda** en esos tramos. El modelo del servidor es el punto de partida
    en el resto.
  - Si no hay modelo (404), falla la red o CORS lo bloquea, la app sigue igual que en la 2.2.
  - En Ajustes se ven la versión, la fecha, los días de datos, el error medio contra "sin modelo" y las
    demoras habituales, y hay un interruptor para no usarlo.
- **Service worker** `bondimetro2-shell-5` (en la 2.3.1: `-6`). Agrega `maprot.js` y `srvmodel.js` al shell. **No** guarda
  `model.json` ni la API.

Capturas (390×844): `screenshots/v23-rot-0.png`, `v23-rot-90.png`, `v23-rot-180.png`, `v23-rot-90-mi-ubicacion.png`,
`v23-ajustes-modelo-servidor.png`.

## Novedades 2.2.0

- **Mapa en vivo (inicio).** Te centra y muestra **todos los bondis que están circulando** (de `vehicles-for-agency`), con chips por línea, un radio de 500 m y la lista "Más cercanos a vos".
  - La lista da la distancia, el rumbo y si **viene hacia vos / se aleja / pasa de costado**.
  - El "≈ N min" es una **estimación en línea recta** y así se rotula. No es el ETA del servidor; ese está en la vista de parada.
  - Las paradas aparecen recién con zoom ≥ 16.
- **Bondis con forma de bondi** apuntando a donde van, con el número de línea; el tooltip muestra el destino.
- **Paradas con sentido.** Muestran una flechita y "sentido ← oeste". Usan el `direction` del servidor o lo infieren del recorrido (y lo aclaran). La "vereda probable" se deduce de la mano de circulación, porque el servidor no la informa.
- **Líneas agrupadas por número.** "21" junta ida y vuelta; "50" junta 50A, 50B y 50C.
  - La vista de línea muestra **todas las unidades** de todos esos routeIds. "Solo este sentido" es opcional.
  - Cada unidad se identifica por su interno (`vehicleId`), así que dos bondis en el mismo viaje no se pisan.
- **Hoja inferior** con 3 alturas (máximo 68%), botón "Bajar/Subir" siempre visible y gesto de deslizar. "Mi ubicación" centra en la parte visible del mapa.

Capturas (390×844): `screenshots/v22-mapa-en-vivo.png`, `v22-linea-21.png`, `v22-linea-50.png`, `v22-parada-sentido.png`, `v22-mi-ubicacion.png`.

## Qué cambia respecto de la v1

- **Bondis fluidos (interpolación).**
  - Cada unidad tiene un marcador fijo identificado por su interno (`vehicleId`, o `tripId` si no viene). Se mueve, no se borra y se vuelve a crear.
  - Con cada posición GPS nueva, el marcador se desliza en unos 1,5 s (2.3.1). Si la nueva estimación queda un poco atrás (< 300 m), espera ahí en vez de retroceder. Si el salto pasa de 2 km, salta directo. Con `prefers-reduced-motion`, no hay animación.
- **Estimación entre consultas.**
  - El sentido sale de las dos últimas posiciones. La velocidad (2.3.1) es la mediana de los tramos en marcha recientes, sobre la polilínea del recorrido o en línea recta si no hay polilínea. Sin modelo espera 7 s en cada parada.
  - Se extrapola hasta ~90 s después de recibir cada lectura nueva, más el atraso con que llegó el fix (hasta 120 s). Tope de 1500 m y nunca más allá de la parada consultada. Antes de la 2.3.1 eran 30 s desde la hora del fix, que con el atraso real de Cuándo SUBO dejaba el bondi quieto.
  - Si el GPS tiene más de 5 min, el bondi queda gris con "sin señal" (`.nosig`) y no se mueve.
  - Si el bondi se movió menos de 8 m, se toma como detenido y no se mueve.
  - Cuando la posición es estimada, el marcador se ve semitransparente (`.est`).
  - La distancia se muestra con "≈".
- **Cuentas regresivas.** El ETA y "GPS hace X s" avanzan cada segundo, a partir de `predictedArrivalTime` y `lastLocationUpdateTime`. No se inventan horarios.
- **Todos los bondis de una línea** (vista `#/route/<id>`):
  - Muestra **todas** las unidades de todos los routeIds de la línea (`vehicles-for-agency`, o `trips-for-route` como plan B) a la vez. El sentido elegido va opaco y el otro, atenuado (tooltip "otro sentido").
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
- **Service worker** con caché propia (`bondimetro2-shell-4`):
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
- Sigue el tope de la extrapolación (desde la 2.3.1, medido desde la lectura nueva) y el marcador semitransparente de "estimado".
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
- La velocidad aprendida en el celu no distingue horario (hora pico vs. noche). El modelo del servidor sí lo hace (2.3.0).

## Cómo servirla

Es estática, así que alcanza con servir `public/` bajo `/bondimetro-v2/`. Por ejemplo, con nginx:

```nginx
location /bondimetro-v2/ { alias /ruta/a/bondimetro-v2/public/; }
```

`model.json` y `metrics.json` (opcionales) van en la misma carpeta pública, o en un `location =` propio. Ver
`/workspace/bondimetro-autotrain/INSTALL.md`.

El proxy sigue siendo el de la v1 (`/bondimetro/proxy/<path>.json?...&h=<Authorization>`), configurable en Ajustes.
Dentro de la app Android (UA `BondimetroApp`) usa el puente nativo `/oba`.

## Cómo probar (local, sin SUBE)

```bash
cd /workspace/bondimetro-v2.3/test
node server.js &           # mock en http://localhost:8766/bondimetro-v2/ (proxy y /api/where simulados)
node test.js               # 83 pruebas en Chrome headless; todo DNS salvo localhost bloqueado
node rot.js                # 38 pruebas de rotación + capturas v23-rot-*.png
PORT=8767 node server.js & # (segunda instancia para srv.js)
PORT=8767 node srv.js      # 21 pruebas del modelo del servidor (404, CORS, schema malo, espera en parada, local manda)
PORT=8767 node interp.js   # 18 pruebas del interpolado con el feed real (fix con ~1 min de atraso, modo `sube` del mock)
python3 /workspace/bondimetro-autotrain/tests/gen_parity.py /tmp/parity.json
node parity.js /tmp/parity.json   # paridad JS↔Python del predictor (1204 comprobaciones)
node shots.js              # capturas 390x844 con teselas reales de OSM
```

- El mock tiene la línea 20 (5 unidades, una detenida), la 21 (ida y vuelta, 4 unidades, dos en el mismo viaje) y la 50 (50A/B/C), más una unidad estacionada y otra sin reportar hace 2 h.
- Modos: `/__mode?m=ok|401|down|novfa`. Registro de pedidos: `/__log`.
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
- Probarla a fondo contra el servidor real. Para la 2.2 solo se hicieron unas pocas lecturas (rutas, `vehicles-for-agency` y `trips-for-route` de la 21) para entender la forma de los datos.
- Mapa en vivo:
  - el "≈ min" es en línea recta y no sigue el recorrido;
  - `vehicles-for-agency` pesa unos 68 KB por consulta;
  - el feed llega con ~1 min de atraso.
- Vereda de la parada: es una inferencia. Una parada sin `direction` en una calle doble mano queda "sin dato".
