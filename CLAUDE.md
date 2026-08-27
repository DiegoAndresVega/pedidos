# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comandos

```bash
npm install     # solo jsdom, para los tests
npm test        # 142 pruebas: node tests/app.test.mjs && node tests/edge.test.mjs
npm run serve   # http://127.0.0.1:8777 (python3 http.server; hace falta un servidor por los ES modules)
```

No hay build, ni bundler, ni linter, ni transpilación: GitHub Pages sirve `index.html` y `js/` tal cual.

Los tests son scripts de Node planos (sin runner, sin `--filter`). Cada archivo acumula resultados en un array
`results` con un helper `check(nombre, fn)` y sale con código 1 si algo falla. Para ejecutar una sola prueba,
lanza el archivo suelto (`node tests/app.test.mjs`) y lee la línea `FAIL`; no existe filtrado por nombre.

## Arquitectura

**No hay backend.** La app es HTML + ES modules estáticos en un repo público; los datos viven en un
`datos.json` de un repo **privado** distinto y se leen/escriben con la API de contenidos de GitHub usando un
PAT que el usuario pega y que queda en `localStorage`. Sin token no se descarga nada: `gate.js` tapa la app.

```
index.html ──> js/app.js ──┬──> state.js        transformaciones puras (siempre copias nuevas)
                           ├──> render.js       innerHTML a partir de plantillas de texto
                           ├──> sync.js ──> github-store.js ──> api.github.com
                           ├──> settings.js     localStorage (token, remote, caché, filtro, blur)
                           └──> gate.js         pantalla de acceso
```

### Flujo de datos

`app.js` guarda **todo** el estado en un único objeto `ui` (`ui.data` = los datos; el resto son flags de UI:
`editingId`, `noteDraft`, `inventoryEdit`, `namingGroupId`, `draftItems`, `infoId`, `shipPromptOrder`, `filter`).

Todo cambio pasa por `apply(nextData)`, que hace tres cosas en orden: guarda la caché local, encola el guardado
en `sync`, y repinta. Las funciones de `state.js` nunca mutan: reciben `data` y devuelven un `data` nuevo.
No introduzcas mutación en `state.js`; los tests de conflicto y de caché dependen de ello.

### Eventos: delegación + atributos `data-*`

`render.js` reconstruye HTML como cadenas y `app.js` escucha en los contenedores (`#orders`, `#inventory`,
`#orderTabs`, `#draftItems`, `#shipPrompt`). Los handlers son mapas de objeto indexados por atributo:

| atributo | dónde | handler |
|---|---|---|
| `data-act` | fila de pedido | mapa `actions` en el listener `click` de `dom.orders` |
| `data-field` | panel de edición | listeners `change` / `input` de `dom.orders` |
| `data-ship` | campos de envío | listener `input` de `dom.orders` |
| `data-inv-act`, `data-inv-field` | inventario | mapa `actions` en el listener de `dom.inventory` |

Añadir una interacción = emitir el atributo en `render.js` + añadir una entrada al mapa correspondiente en `app.js`.

### Trampa del repintado

`renderAll()` sustituye el `innerHTML` entero, así que **pierde el foco y el cursor**. Por eso los campos de
texto llaman a `apply(..., { rerender: false })` (que solo actualiza pestañas y totales) y los avisos que sí
tienen que cambiar se parchean a mano sobre el DOM (`refreshShippingState`). Si tocas texto libre, mantén ese patrón.

### Frontera de validación y migraciones

`normalizeData()` en `state.js` es el único punto por el que entra cualquier JSON remoto: rellena campos que
falten, descarta artículos inexistentes y aplica las migraciones de datos viejos (`RENAMED_GROUPS`:
`RETIRADA` → `EN GRANERO`; `splitFullName`: `fullName` → `firstName` + `lastName`). Toda migración nueva va ahí.

### Sincronización (`sync.js`)

- Agrupa cambios con un debounce de `SAVE_DEBOUNCE_MS` (1200 ms) y guarda el `sha` del archivo.
- Concurrencia optimista: 409/422 → relee el `sha` remoto y reescribe **conservando los datos locales**.
- Error de red → estado `offline` y reintento cada `RETRY_DELAY_MS` (8 s); el trabajo sigue sobre la caché local.
- Error de autenticación → `onAuthError` reabre el gate.
- `github-store.js` traduce los códigos HTTP a `StoreError` con un `kind` de `ERROR_KINDS`; un 404 se
  desambigua consultando el repo, porque GitHub no distingue «no existe» de «tu token no lo ve».

### Conceptos del dominio que no se leen del código a simple vista

- `data.stock[key]` es el **total histórico**, no lo disponible. Disponible = `total - soldCount(data, key)`;
  `setItemQuantity` con `field: "available"` recalcula el total sumando lo ya vendido.
- `order.checked` significa «cuenta para stock y presupuesto». Desmarcar aparca el pedido sin borrarlo, y
  `computeTotals` / `soldCount` solo miran los marcados.
- La categoría manda sobre el envío: mover un pedido a `ENVÍOS` activa `shipping` (y su coste), sacarlo lo apaga
  (`moveOrderToGroup`). Los pedidos nuevos se insertan detrás del último de su bloque para que la lista quede agrupada.
- `order.pay` es ternario: `"paid"`, `"unpaid"` o `null` (sin marcar). La pestaña «No pagado» agrupa los dos últimos.
- Los botones 🎫 (`labelPrinted`) y 🧑🏻‍🌾 (`dropped`) solo se pintan en `ENVÍOS` y `EN GRANERO` respectivamente.

## Tests

`tests/harness.mjs` arranca `index.html` real en jsdom, sustituye `window.fetch` por un GitHub en memoria
(con `sha`, conflictos 409 y registro de `puts`) e importa `js/app.js` de verdad. Son tests de integración de
la app completa, no unitarios. `intercept` permite forzar respuestas concretas (ver `httpError`, `netFail`) y
`settle(n)` espera a que pasen los timers del debounce.

Al añadir una prueba, usa `check("descripción en español", fn)` en el archivo que toque:
`app.test.mjs` (camino feliz y UI) o `edge.test.mjs` (sin token, 401, red caída, conflictos, migraciones).

## Convenciones

- **Todo en español**: strings de UI, comentarios, nombres de las pruebas y mensajes de commit.
- Los comentarios explican el *porqué* de una decisión, no lo que hace la línea. Mantén ese registro.
- Constantes de configuración (claves de `localStorage`, tiempos, límites) en `js/config.js`, congeladas con
  `Object.freeze`. Nada de números mágicos repartidos.
- `esc()` en `render.js` escapa **todo** valor que entre en una plantilla; los datos son texto libre del usuario.
- Ni el token ni ningún dato real pueden acabar en este repositorio: solo código.
