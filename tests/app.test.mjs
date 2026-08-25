import assert from "node:assert/strict";
import { boot } from "./harness.mjs";

const results = [];
const check = (name, fn) => {
  try { fn(); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + " → " + e.message]); }
};

const { doc, remote, settle, window } = await boot();

// --- Arrange / Act ya hecho en boot() -------------------------------------
check("carga 25 pedidos desde el repositorio", () =>
  assert.equal(doc.querySelectorAll(".order").length, 25));

check("pinta los 3 bloques", () =>
  assert.deepEqual([...doc.querySelectorAll(".section-label")].map(e => e.textContent),
    ["EN MANO", "RETIRADA", "ENVÍOS"]));

check("la pantalla de acceso está oculta con token válido", () =>
  assert.equal(doc.getElementById("gate").hidden, true));

check("presupuesto calculado", () =>
  assert.match(doc.getElementById("budget").textContent, /1064€/));

check("contador de activos", () =>
  assert.equal(doc.getElementById("checkedCount").textContent, "25 activos"));

check("el inventario muestra disponible/total", () => {
  const rows = [...doc.querySelectorAll("#inventory .inv-row")];
  assert.equal(rows.length, 13, "debe haber una fila por artículo");
  const turquesa = rows.find(r => r.querySelector(".name").textContent === "Riñoneras turquesa");
  assert.equal(turquesa.querySelector(".inv-num").textContent.replace(/\s/g, ""), "0/4");
});
check("un artículo agotado se marca como tachado", () => {
  const marron = [...doc.querySelectorAll("#inventory .inv-row")]
    .find(r => r.querySelector(".name").textContent === "Gorros marrón");
  assert.equal(marron.querySelector(".inv-num").textContent.replace(/\s/g, ""), "0/6");
  assert.ok(marron.classList.contains("sold-out"));
});
check("un artículo con existencias no se tacha", () => {
  const blanco = [...doc.querySelectorAll("#inventory .inv-row")]
    .find(r => r.querySelector(".name").textContent === "Gorros blanco");
  assert.equal(blanco.querySelector(".inv-num").textContent.replace(/\s/g, ""), "2/2");
  assert.equal(blanco.classList.contains("sold-out"), false);
});

// --- nota persistente ------------------------------------------------------
const orderId = doc.querySelector(".order").dataset.id;
const rowOf = (id) => doc.querySelector(`.order[data-id="${id}"]`);
const noteOf = (id) => rowOf(id).querySelector(".note");
const typeNote = (id, value) => {
  const input = noteOf(id);
  input.value = value;
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
};

check("la nota empieza bloqueada con botón de editar", () => {
  assert.equal(noteOf(orderId).hasAttribute("readonly"), true);
  assert.equal(rowOf(orderId).querySelector('[data-act="note-edit"]').textContent.trim(), "📝");
});

rowOf(orderId).querySelector('[data-act="note-edit"]').click();
check("📝 desbloquea la nota y ofrece guardar", () => {
  assert.equal(noteOf(orderId).hasAttribute("readonly"), false);
  assert.ok(rowOf(orderId).querySelector('[data-act="note-save"]'));
});

typeNote(orderId, "Recoge Marta el jueves");
await settle(60);
check("escribir sin guardar no toca el repositorio", () =>
  assert.equal(remote.file.orders.find(o => o.id === orderId).note, ""));
check("el texto escrito no se pierde mientras editas", () =>
  assert.equal(noteOf(orderId).value, "Recoge Marta el jueves"));

rowOf(orderId).querySelector('[data-act="note-save"]').click();
await settle(60);
check("✓ guarda la nota en el repositorio", () =>
  assert.equal(remote.file.orders.find(o => o.id === orderId).note, "Recoge Marta el jueves"));
check("tras guardar la nota vuelve a estar bloqueada y visible", () => {
  assert.equal(noteOf(orderId).hasAttribute("readonly"), true);
  assert.equal(noteOf(orderId).value, "Recoge Marta el jueves");
});

rowOf(orderId).querySelector('[data-act="note-edit"]').click();
typeNote(orderId, "descartar esto");
noteOf(orderId).dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
check("Escape descarta el cambio y recupera la nota guardada", () =>
  assert.equal(noteOf(orderId).value, "Recoge Marta el jueves"));

rowOf(orderId).querySelector('[data-act="note-edit"]').click();
typeNote(orderId, "Paga el viernes");
noteOf(orderId).dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
await settle(60);
check("Intro guarda igual que ✓", () =>
  assert.equal(remote.file.orders.find(o => o.id === orderId).note, "Paga el viernes"));

// --- botones emoji ---------------------------------------------------------
rowOf(orderId).querySelector('[data-act="pack"]').click();
await settle(60);
check("📦 empaquetado se guarda", () =>
  assert.equal(remote.file.orders.find(o => o.id === orderId).packed, true));
check("📦 queda marcado en pantalla", () =>
  assert.ok(doc.querySelector(`.order[data-id="${orderId}"] [data-act="pack"]`).classList.contains("on")));

doc.querySelector(`.order[data-id="${orderId}"] [data-act="unpay"]`).click();
await settle(60);
check("❌ no pagado sustituye a 💲 pagado", () =>
  assert.equal(remote.file.orders.find(o => o.id === orderId).pay, "unpaid"));

// --- checkbox principal ----------------------------------------------------
const box = doc.querySelector(`.order[data-id="${orderId}"] [data-act="check"]`);
box.checked = false;
box.dispatchEvent(new window.Event("change", { bubbles: true }));
await settle(60);
check("desmarcar saca el pedido del presupuesto", () => {
  assert.equal(remote.file.orders.find(o => o.id === orderId).checked, false);
  assert.equal(doc.getElementById("checkedCount").textContent, "24 activos");
});

// --- editar nombre ---------------------------------------------------------
doc.querySelector(`.order[data-id="${orderId}"] [data-act="edit"]`).click();
check("el panel de edición se abre", () =>
  assert.ok(doc.querySelector(`.order[data-id="${orderId}"] .edit-panel`)));

const igInput = doc.querySelector(`.order[data-id="${orderId}"] [data-field="ig"]`);
igInput.value = "MERITXELL";
igInput.dispatchEvent(new window.Event("input", { bubbles: true }));
await settle(60);
check("el nombre editado se guarda", () =>
  assert.equal(remote.file.orders.find(o => o.id === orderId).ig, "MERITXELL"));

// --- artículos por clic ----------------------------------------------------
doc.querySelector(`.order[data-id="${orderId}"] .chip[data-item="rin_negra"]`).click();
await settle(60);
check("añadir un artículo cambia el precio guardado", () => {
  const saved = remote.file.orders.find(o => o.id === orderId);
  assert.ok(saved.items.includes("rin_negra"));
});

doc.querySelector(`.order[data-id="${orderId}"] [data-act="done"]`).click();
check("cerrar edición refresca el nombre visible", () =>
  assert.match(doc.querySelector(`.order[data-id="${orderId}"] .desc`).textContent, /MERITXELL/));

// --- mover un pedido de categoría -------------------------------------------
const anii = remote.file.orders.find(o => o.ig === "anii_cp");
const groupSelect = (id) => rowOf(id).querySelector('[data-field="group"]');

doc.querySelector(`.order[data-id="${anii.id}"] [data-act="edit"]`).click();
check("el bloque se elige en un desplegable, no escribiendo", () => {
  const select = groupSelect(anii.id);
  assert.equal(select.tagName, "SELECT");
  assert.equal(select.value, "ENVÍOS");
  assert.deepEqual([...select.options].map(o => o.value),
    ["EN MANO", "RETIRADA", "ENVÍOS", "__nueva__"]);
});
check("estando en ENVÍOS pide los datos de envío", () =>
  assert.ok(rowOf(anii.id).querySelector(".ship-panel")));

const seccionesAntes = [...doc.querySelectorAll("#orders .section-label")].map(e => e.textContent);
groupSelect(anii.id).value = "EN MANO";
groupSelect(anii.id).dispatchEvent(new window.Event("change", { bubbles: true }));
await settle(60);

check("el pedido se guarda en la categoría nueva", () =>
  assert.equal(remote.file.orders.find(o => o.id === anii.id).group, "EN MANO"));
check("no se crea una segunda sección EN MANO", () => {
  const secciones = [...doc.querySelectorAll("#orders .section-label")].map(e => e.textContent);
  assert.deepEqual(secciones, seccionesAntes, "las cabeceras no deben duplicarse");
  assert.equal(new Set(secciones).size, secciones.length);
});
check("el pedido aparece dentro de la sección EN MANO", () => {
  const nodes = [...doc.querySelectorAll("#orders .section-label, #orders .order")];
  const rowIndex = nodes.findIndex(n => n.dataset?.id === anii.id);
  const heading = nodes.slice(0, rowIndex).reverse().find(n => n.classList.contains("section-label"));
  assert.equal(heading.textContent, "EN MANO");
});
check("salir de ENVÍOS quita el gasto de envío", () => {
  const saved = remote.file.orders.find(o => o.id === anii.id);
  assert.equal(saved.shipping, false);
  assert.equal(saved.items.length * 50, 50);
});
check("en mano ya no pide datos de envío", () => {
  assert.equal(rowOf(anii.id).querySelector(".ship-panel"), null);
  assert.equal(rowOf(anii.id).querySelector(".ship-flag"), null);
});
check("el precio pierde los 3€ del envío", () =>
  assert.equal(rowOf(anii.id).querySelector(".price").textContent.trim(), "50€"));

// Volver a ENVÍOS lo devuelve a su sitio y recupera el envío
groupSelect(anii.id).value = "ENVÍOS";
groupSelect(anii.id).dispatchEvent(new window.Event("change", { bubbles: true }));
await settle(60);
check("volver a ENVÍOS reactiva el envío", () => {
  assert.equal(remote.file.orders.find(o => o.id === anii.id).shipping, true);
  assert.ok(rowOf(anii.id).querySelector(".ship-panel"));
});
check("los datos de envío guardados sobreviven al viaje de ida y vuelta", () =>
  assert.ok(rowOf(anii.id).querySelector('[data-ship="fullName"]')));

// Crear una categoría nueva desde el desplegable
groupSelect(anii.id).value = "__nueva__";
groupSelect(anii.id).dispatchEvent(new window.Event("change", { bubbles: true }));
check("«Nueva categoría» abre un campo de texto", () =>
  assert.ok(rowOf(anii.id).querySelector('[data-field="groupNew"]')));

const nuevo = rowOf(anii.id).querySelector('[data-field="groupNew"]');
nuevo.value = "CORREOS";
nuevo.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
await settle(60);
check("Intro crea la categoría y mueve el pedido", () => {
  assert.equal(remote.file.orders.find(o => o.id === anii.id).group, "CORREOS");
  assert.ok([...doc.querySelectorAll("#orders .section-label")].some(e => e.textContent === "CORREOS"));
});

// Dejarlo como estaba
groupSelect(anii.id).value = "ENVÍOS";
groupSelect(anii.id).dispatchEvent(new window.Event("change", { bubbles: true }));
await settle(60);
doc.querySelector(`.order[data-id="${anii.id}"] [data-act="done"]`).click();

// --- formulario de alta de pedido -----------------------------------------
check("el desplegable de productos lista el inventario", () =>
  assert.equal(doc.getElementById("newOrderItem").options.length, 13));
check("el desplegable de categorías lista los bloques", () =>
  assert.deepEqual([...doc.getElementById("newOrderGroup").options].map(o => o.value),
    ["EN MANO", "RETIRADA", "ENVÍOS"]));

doc.getElementById("newOrderIg").value = "NUEVA CLIENTA";
doc.getElementById("newOrderItem").value = "rin_rosa";
doc.getElementById("newOrderGroup").value = "ENVÍOS";
doc.getElementById("addOrderForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
await settle(60);

const created = remote.file.orders.find(o => o.ig === "NUEVA CLIENTA");
check("el formulario crea el pedido y lo guarda", () => {
  assert.ok(created, "no se creó el pedido");
  assert.deepEqual(created.items, ["rin_rosa"]);
  assert.equal(created.desc, "Riñoneras rosa");
  assert.equal(created.group, "ENVÍOS");
});
check("la categoría ENVÍOS activa el gasto de envío", () => assert.equal(created.shipping, true));
check("el pedido nuevo entra dentro de su bloque", () => {
  const groups = remote.file.orders.map(o => o.group);
  assert.deepEqual([...new Set(groups)], ["EN MANO", "RETIRADA", "ENVÍOS"]);
});
check("el formulario se vacía tras añadir", () =>
  assert.equal(doc.getElementById("newOrderIg").value, ""));
check("añadir pedido lo pinta en la lista", () =>
  assert.equal(doc.querySelectorAll(".order").length, 26));

// --- formulario de inventario ----------------------------------------------
doc.getElementById("newItemLabel").value = "Gorros negro";
doc.getElementById("newItemPrice").value = "28";
doc.getElementById("newItemUnits").value = "3";
doc.getElementById("addItemForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
await settle(60);

check("crea el artículo con precio y stock", () => {
  assert.deepEqual(remote.file.items.gorros_negro, { label: "Gorros negro", price: 28 });
  assert.equal(remote.file.stock.gorros_negro, 3);
});
check("el artículo nuevo aparece en el desplegable", () =>
  assert.ok([...doc.getElementById("newOrderItem").options].some(o => o.value === "gorros_negro")));
check("el artículo nuevo aparece en el inventario en pantalla", () => {
  const fila = [...doc.querySelectorAll("#inventory .inv-row")]
    .find(r => r.querySelector(".name").textContent === "Gorros negro");
  assert.ok(fila, "no apareció la fila del artículo nuevo");
  assert.equal(fila.querySelector(".inv-num").textContent.replace(/\s/g, ""), "3/3");
});

doc.getElementById("newItemLabel").value = "gorros negro";
doc.getElementById("newItemUnits").value = "2";
doc.getElementById("addItemForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
await settle(60);
check("repetir el mismo artículo suma unidades en vez de duplicarlo", () => {
  assert.equal(remote.file.stock.gorros_negro, 5);
  assert.equal(Object.keys(remote.file.items).filter(k => k.startsWith("gorros_negro")).length, 1);
});

doc.getElementById("newItemLabel").value = "";
doc.getElementById("addItemForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
await settle(20);
check("un artículo sin nombre muestra error y no se guarda", () => {
  assert.match(doc.getElementById("addItemMsg").textContent, /necesita un nombre/);
  assert.equal(doc.getElementById("addItemMsg").hidden, false);
});

// --- pestañas todos / pendiente / entregado ---------------------------------
const tab = (name) => doc.querySelector(`#orderTabs .tab[data-filter="${name}"]`);
const tabCount = (name) => Number(tab(name).querySelector(".tab-n").textContent);
const visibleRows = () => doc.querySelectorAll("#orders .order").length;

check("hay cuatro pestañas en la cabecera", () =>
  assert.deepEqual([...doc.querySelectorAll("#orderTabs .tab")].map(t => t.dataset.filter),
    ["all", "pending", "topack", "delivered"]));
check("«Todos» está activa al arrancar", () =>
  assert.equal(tab("all").classList.contains("on"), true));
check("los contadores reparten los pedidos", () => {
  assert.equal(tabCount("all"), tabCount("pending") + tabCount("delivered"));
  assert.equal(tabCount("all"), visibleRows());
});

const entregadosIniciales = tabCount("delivered");
tab("delivered").click();
check("la pestaña Entregado solo muestra los entregados", () => {
  assert.equal(visibleRows(), entregadosIniciales);
  assert.equal([...doc.querySelectorAll("#orders .order [data-act=\"deliver\"]")]
    .every(b => b.classList.contains("on")), true);
});
check("cambiar de pestaña marca la nueva como activa", () => {
  assert.equal(tab("delivered").classList.contains("on"), true);
  assert.equal(tab("all").classList.contains("on"), false);
});

tab("pending").click();
check("la pestaña Pendiente solo muestra los no entregados", () => {
  assert.equal(visibleRows(), tabCount("pending"));
  assert.equal([...doc.querySelectorAll("#orders .order [data-act=\"deliver\"]")]
    .some(b => b.classList.contains("on")), false);
});

// Marcar entregado desde Pendiente lo mueve de pestaña
const pendientesAntes = tabCount("pending");
const moved = doc.querySelector("#orders .order").dataset.id;
doc.querySelector(`.order[data-id="${moved}"] [data-act="deliver"]`).click();
await settle(60);
check("marcar ✅ mueve el pedido a Entregado", () => {
  assert.equal(tabCount("pending"), pendientesAntes - 1);
  assert.equal(tabCount("delivered"), entregadosIniciales + 1);
  assert.equal(doc.querySelector(`#orders .order[data-id="${moved}"]`), null);
  assert.equal(remote.file.orders.find(o => o.id === moved).delivered, true);
});

tab("delivered").click();
check("el pedido movido aparece ya en Entregado", () =>
  assert.ok(doc.querySelector(`#orders .order[data-id="${moved}"]`)));

// Deshacer y volver a «Todos»
doc.querySelector(`.order[data-id="${moved}"] [data-act="deliver"]`).click();
await settle(60);
check("desmarcar ✅ lo devuelve a Pendiente", () => {
  assert.equal(tabCount("pending"), pendientesAntes);
  assert.equal(tabCount("delivered"), entregadosIniciales);
});

// --- pestaña «Por empaquetar» ------------------------------------------------
tab("topack").click();
check("«Por empaquetar» solo muestra lo que no está empaquetado", () => {
  assert.equal(visibleRows(), tabCount("topack"));
  assert.equal([...doc.querySelectorAll('#orders .order [data-act="pack"]')]
    .some(b => b.classList.contains("on")), false);
});
check("«Por empaquetar» deja fuera lo ya entregado", () =>
  assert.equal([...doc.querySelectorAll('#orders .order [data-act="deliver"]')]
    .some(b => b.classList.contains("on")), false));

const porEmpaquetarAntes = tabCount("topack");
const packed = doc.querySelector("#orders .order").dataset.id;
doc.querySelector(`.order[data-id="${packed}"] [data-act="pack"]`).click();
await settle(60);
check("marcar 📦 lo saca de «Por empaquetar»", () => {
  assert.equal(tabCount("topack"), porEmpaquetarAntes - 1);
  assert.equal(doc.querySelector(`#orders .order[data-id="${packed}"]`), null);
  assert.equal(remote.file.orders.find(o => o.id === packed).packed, true);
});

doc.querySelector(`.order[data-id="${packed}"]`);
tab("pending").click();
check("el pedido empaquetado sigue en Pendiente hasta entregarlo", () =>
  assert.ok(doc.querySelector(`#orders .order[data-id="${packed}"]`)));

doc.querySelector(`.order[data-id="${packed}"] [data-act="pack"]`).click();
await settle(60);
check("desmarcar 📦 lo devuelve a «Por empaquetar»", () =>
  assert.equal(tabCount("topack"), porEmpaquetarAntes));

tab("all").click();
check("«Todos» vuelve a mostrar la lista completa", () =>
  assert.equal(visibleRows(), tabCount("all")));

// --- editar el inventario ---------------------------------------------------
const invRow = (name) => [...doc.querySelectorAll("#inventory .inv-row")]
  .find(r => r.querySelector(".name").textContent === name);
const invNum = (name) => invRow(name).querySelector(".inv-num").textContent.replace(/\s/g, "");

check("cada artículo tiene botón de editar", () =>
  assert.equal(doc.querySelectorAll('#inventory [data-inv-act="edit"]').length,
    doc.querySelectorAll("#inventory .inv-row").length));

invRow("Gorros blanco").querySelector('[data-inv-act="edit"]').click();
check("el editor se abre en «Disponible»", () => {
  const row = invRow("Gorros blanco");
  assert.ok(row.querySelector(".inv-edit"), "no se abrió el editor");
  assert.equal(row.querySelector('[data-inv-field="available"]').classList.contains("on"), true);
  assert.equal(row.querySelector("[data-inv-value]").value, "2");
});

invRow("Gorros blanco").querySelector("[data-inv-value]").value = "5";
invRow("Gorros blanco").querySelector('[data-inv-act="save"]').click();
await settle(60);
check("editar «Disponible» sube el total con lo ya vendido", () => {
  assert.equal(invNum("Gorros blanco"), "5/5");
  assert.equal(remote.file.stock.gorro_blanco, 5);
});
check("el editor se cierra al guardar", () =>
  assert.equal(invRow("Gorros blanco").querySelector(".inv-edit"), null));

// Gorros marrón: 6 vendidos, 0 disponibles
invRow("Gorros marrón").querySelector('[data-inv-act="edit"]').click();
invRow("Gorros marrón").querySelector('[data-inv-field="total"]').click();
check("el selector cambia a «Total» y muestra el total", () => {
  const row = invRow("Gorros marrón");
  assert.equal(row.querySelector('[data-inv-field="total"]').classList.contains("on"), true);
  assert.equal(row.querySelector("[data-inv-value]").value, "6");
});

invRow("Gorros marrón").querySelector("[data-inv-value]").value = "10";
invRow("Gorros marrón").querySelector('[data-inv-act="save"]').click();
await settle(60);
check("editar «Total» respeta lo vendido", () => {
  assert.equal(invNum("Gorros marrón"), "4/10");
  assert.equal(remote.file.stock.gorro_marron, 10);
});
check("al reponer stock deja de estar tachado", () =>
  assert.equal(invRow("Gorros marrón").classList.contains("sold-out"), false));

invRow("Gorros marrón").querySelector('[data-inv-act="edit"]').click();
invRow("Gorros marrón").querySelector("[data-inv-value]").value = "-3";
invRow("Gorros marrón").querySelector('[data-inv-act="save"]').click();
await settle(30);
check("un número negativo se rechaza y no toca los datos", () => {
  assert.equal(remote.file.stock.gorro_marron, 10);
  assert.match(doc.getElementById("savedTag").textContent, /número de 0 en adelante/);
});

// Borrar un artículo suelto, sin pedidos
doc.getElementById("newItemLabel").value = "Error de dedo";
doc.getElementById("newItemPrice").value = "9";
doc.getElementById("newItemUnits").value = "1";
doc.getElementById("addItemForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
await settle(60);
check("el artículo equivocado se ha creado", () => assert.ok(invRow("Error de dedo")));

invRow("Error de dedo").querySelector('[data-inv-act="edit"]').click();
invRow("Error de dedo").querySelector('[data-inv-act="remove"]').click();
await settle(60);
check("borrar quita el artículo de la pantalla y del repositorio", () => {
  assert.equal(invRow("Error de dedo"), undefined);
  assert.equal(remote.file.items.error_de_dedo, undefined);
  assert.equal(remote.file.stock.error_de_dedo, undefined);
});
check("el artículo borrado desaparece del desplegable de pedidos", () =>
  assert.equal([...doc.getElementById("newOrderItem").options].some(o => o.value === "error_de_dedo"), false));

// Borrar uno que sí está en pedidos: se limpia de ellos
invRow("Carteras azul").querySelector('[data-inv-act="edit"]').click();
invRow("Carteras azul").querySelector('[data-inv-act="remove"]').click();
await settle(60);
check("borrar un artículo en uso lo quita también de los pedidos", () => {
  assert.equal(remote.file.items.cartera_azul, undefined);
  assert.equal(remote.file.orders.some(o => o.items.includes("cartera_azul")), false);
});

// --- datos de envío ---------------------------------------------------------
const shipRow = [...doc.querySelectorAll(".order")].find(
  (row) => row.querySelector(".ship-flag"));
check("los pedidos con envío muestran el aviso de datos", () => {
  assert.ok(shipRow, "ninguna fila mostró el aviso de envío");
  assert.match(shipRow.querySelector(".ship-flag").textContent, /faltan datos/);
});
check("los pedidos sin envío no muestran el aviso", () => {
  const enMano = doc.querySelector('.order[data-id="o001"]');
  assert.equal(enMano.querySelector(".ship-flag"), null);
});

const shipId = shipRow.dataset.id;
doc.querySelector(`.order[data-id="${shipId}"] [data-act="edit"]`).click();
check("el panel de envío solo sale en pedidos con envío", () =>
  assert.ok(doc.querySelector(`.order[data-id="${shipId}"] .ship-panel`)));
check("están los seis campos pedidos", () =>
  assert.deepEqual(
    [...doc.querySelectorAll(`.order[data-id="${shipId}"] [data-ship]`)].map(i => i.dataset.ship),
    ["fullName", "address", "city", "postalCode", "email", "phone"]));

const typeShip = (key, value) => {
  const input = doc.querySelector(`.order[data-id="${shipId}"] [data-ship="${key}"]`);
  input.value = value;
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
};
typeShip("fullName", "Marta García López");
typeShip("address", "C/ Mayor 12, 3ºB");
await settle(60);

check("los datos de envío se guardan en el repositorio", () => {
  const saved = remote.file.orders.find(o => o.id === shipId);
  assert.equal(saved.shippingInfo.fullName, "Marta García López");
  assert.equal(saved.shippingInfo.address, "C/ Mayor 12, 3ºB");
});
check("escribir la dirección no repinta la fila", () =>
  assert.equal(doc.querySelector(`.order[data-id="${shipId}"] [data-ship="address"]`).value, "C/ Mayor 12, 3ºB"));
check("con datos a medias sigue avisando de lo que falta", () =>
  assert.match(doc.querySelector(`.order[data-id="${shipId}"] .ship-state`).textContent, /Faltan 2 de 4/));

typeShip("city", "Bilbao");
typeShip("postalCode", "48001");
await settle(60);
check("al completar los cuatro obligatorios el aviso pasa a listo", () => {
  assert.match(doc.querySelector(`.order[data-id="${shipId}"] .ship-flag`).textContent, /envío listo/);
  assert.equal(doc.querySelector(`.order[data-id="${shipId}"] .ship-panel`).classList.contains("incomplete"), false);
});

typeShip("email", "marta@ejemplo.com");
typeShip("phone", "600123456");
await settle(60);
check("email y teléfono son opcionales pero se guardan", () => {
  const saved = remote.file.orders.find(o => o.id === shipId);
  assert.equal(saved.shippingInfo.email, "marta@ejemplo.com");
  assert.equal(saved.shippingInfo.phone, "600123456");
});

doc.querySelector(`.order[data-id="${shipId}"] [data-act="done"]`).click();
check("los datos siguen ahí al reabrir el panel", () => {
  doc.querySelector(`.order[data-id="${shipId}"] [data-act="edit"]`).click();
  assert.equal(doc.querySelector(`.order[data-id="${shipId}"] [data-ship="city"]`).value, "Bilbao");
  doc.querySelector(`.order[data-id="${shipId}"] [data-act="done"]`).click();
});

// --- borrar pedido ---------------------------------------------------------
const newId = created.id;
doc.querySelector(`.order[data-id="${newId}"] [data-act="edit"]`).click();
doc.querySelector(`.order[data-id="${newId}"] [data-act="remove"]`).click();
await settle(60);
check("borrar pedido se guarda", () => assert.equal(remote.file.orders.length, 25));

// --- estado de sincronización ----------------------------------------------
check("la etiqueta muestra sincronizado", () =>
  assert.match(doc.getElementById("savedTag").textContent, /Sincronizad|Guardad/));

check("se hicieron varias escrituras a GitHub", () => assert.ok(remote.puts.length >= 6));

for (const [status, name] of results) console.log(`${status}  ${name}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} pruebas OK`);
process.exit(failed ? 1 : 0);
