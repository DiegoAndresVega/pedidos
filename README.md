# pedidos

Panel de pedidos e inventario de `_cabeza.rota_`.

Este repositorio contiene **solo el código**. Ningún nombre, pedido, precio ni cifra vive aquí:
todo eso está en un repositorio **privado** aparte y la página lo lee y lo escribe en directo con
tu token de GitHub. Sin token, quien abra la web solo ve la pantalla de acceso.

**Web:** https://diegoandresvega.github.io/pedidos/

---

## Cómo funciona

```
repo PÚBLICO  pedidos/         index.html + js/   →  GitHub Pages
repo PRIVADO  pedidos-datos/   datos.json         →  API de GitHub (con token)
```

Cada cambio (marcar pagado, escribir una nota, añadir un pedido) se guarda solo en
`datos.json` del repositorio privado, agrupando los cambios en un commit cada ~1,2 s.
Si se cae la red, se sigue trabajando sobre una copia local y se reintenta hasta que entra.

## Puesta en marcha

1. **Crear el repositorio privado de datos** con un `datos.json` dentro (ver `tests/fixtures/datos.json`
   como ejemplo de estructura; también sirve `{"version":1,"prices":{"envio":3},"items":{},"stock":{},"orders":[]}`).
2. **Activar GitHub Pages** en este repositorio: *Settings → Pages → Source: Deploy from a branch →
   `main` / `/ (root)`*.
3. **Crear el token**: https://github.com/settings/personal-access-tokens/new
   - *Repository access* → **Only select repositories** → el repositorio privado de datos, y solo ese.
   - *Permissions → Repository permissions → Contents* → **Read and write**.
   - Caducidad: la que prefieras (habrá que renovarlo al vencer).
4. **Entrar** en la web y pegar el token. Queda en el `localStorage` de ese navegador.

## Seguridad

- El token da acceso **solo** al repositorio privado de datos. Nunca le des permisos sobre toda la cuenta.
- El token no se sube nunca a ningún repositorio: vive únicamente en el navegador que lo escribió.
- «🔒 Salir» borra el token y la copia local del dispositivo.
- Si crees que el token se ha filtrado, revócalo en *Settings → Developer settings → Personal access tokens*.

## Uso

| Elemento | Qué hace |
|---|---|
| pestañas de **estado** (Todos · Pendiente · No pagado · Por empaquetar · Entregado) | Filtran la lista. **No pagado** son los que aún no llevan 💲, igual que la cifra «Pendiente» del presupuesto. Cada pestaña lleva su contador y la elegida se recuerda en ese navegador |
| pestañas de **categoría** (En mano · En granero · Envíos) | Enseñan solo esa categoría. Salen con borde discontinuo para distinguirlas de las de estado |
| ☑ casilla | Cuenta el pedido en stock y presupuesto (desmarcar lo aparca sin borrarlo) |
| 💲 / ❌ | Pagado / no pagado |
| 📦 / ✅ | Empaquetado / entregado. ✅ pide confirmación al marcar y al desmarcar |
| 🎫 | Solo en **ENVÍOS**: la etiqueta del paquete ya está impresa |
| 🧑🏻‍🌾 | Solo en **EN GRANERO**: el paquete ya está dejado en el local donde lo recogen |
| ✏️ | Abre el panel: nombre, descripción, categoría, artículos y borrar |
| desplegable *Bloque* | Mueve el pedido a otra categoría. Entrar en ENVÍOS activa el gasto y los datos de envío; salir de ENVÍOS los quita. «➕ Nueva categoría…» crea una escribiendo y pulsando Intro |
| 📝 / ✓ en la nota | La nota está bloqueada hasta pulsar 📝. ✓ o Intro la guardan, Escape descarta el cambio |
| 📮 en la fila | Solo en pedidos con envío: en rojo si falta algún dato obligatorio, en verde si está listo |
| 📋 Ver info | Abre la dirección en modo lectura, sin entrar en ✏️. Los obligatorios que falten salen en rojo |
| bloque *Datos de envío* | Dentro de ✏️ en los pedidos con envío, con los campos de la plataforma de envíos: nombre, apellido, dirección, código postal y ciudad (obligatorios) + piso/puerta, correo y móvil con prefijo (opcionales). Al crear un pedido en ENVÍOS se ofrece rellenarlos en el momento o dejarlo para luego |
| formulario superior | Alta de pedido: nombre + producto + categoría. **➕** apunta el producto elegido y deja el desplegable libre para el siguiente, así un pedido puede llevar varios artículos (hasta 4 unidades de cada uno). Los apuntados salen debajo; pulsar uno le quita una unidad. Sin apuntar nada, se crea con el producto del desplegable |
| inventario | Una sola lista ordenada por existencias: lo disponible arriba y lo agotado al final. `4/6` = quedan 4 de las 6 que había. Los agotados salen en gris y tachados en rojo |
| ✏️ en el inventario | Elige **Disponible** o **Total**, cambia el número y ✓ Guardar (Enter también vale). 🗑 Borrar elimina el artículo; si está en pedidos, avisa y lo quita de ellos |
| formulario del inventario | Alta de artículo; si ya existe, suma unidades a su stock |
| ↻ Recargar | Trae los últimos datos (útil si has editado desde otro dispositivo) |
| ⬇ Copia de seguridad | Descarga un `.json` suelto, por si acaso |
| ⚙ Ajustes | Cambiar token o repositorio de datos |

Los clics sobre un artículo en el panel de edición van sumando unidades (1 → 2 → 3 → 4 → 0).

> Los datos antiguos se migran solos al abrir la página: la categoría `RETIRADA` pasa a `EN GRANERO`
> y el antiguo `fullName` se parte en nombre + apellido (primera palabra / resto).

## Desarrollo

```bash
npm install     # jsdom, solo para los tests
npm test        # 142 pruebas
npm run serve   # http://127.0.0.1:8777
```

`js/` está dividido por responsabilidad: `state.js` (datos, todo inmutable), `render.js` (DOM),
`github-store.js` (API), `sync.js` (guardado y conflictos), `gate.js` (acceso), `app.js` (conexión).
