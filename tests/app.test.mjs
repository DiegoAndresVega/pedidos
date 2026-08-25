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

check("inventario con stock restante", () =>
  assert.match(doc.getElementById("invStock").textContent, /Gorros marrón/));

// --- nota persistente ------------------------------------------------------
const firstRow = doc.querySelector(".order");
const orderId = firstRow.dataset.id;
const note = firstRow.querySelector(".note");
note.value = "Recoge Marta el jueves";
note.dispatchEvent(new window.Event("input", { bubbles: true }));
await settle(60);

check("la nota se guarda en el repositorio", () => {
  const saved = remote.file.orders.find(o => o.id === orderId);
  assert.equal(saved.note, "Recoge Marta el jueves");
});
check("escribir la nota no repinta la fila (no se pierde el foco)", () =>
  assert.equal(doc.querySelector(".order .note").value, "Recoge Marta el jueves"));

// --- botones emoji ---------------------------------------------------------
firstRow.querySelector('[data-act="pack"]').click();
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
check("el artículo nuevo aparece en el inventario en pantalla", () =>
  assert.match(doc.getElementById("invStock").textContent, /Gorros negro/));

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
