/* Construcción del DOM. No modifica datos: solo los pinta. */

import { PAY_STATES } from "./config.js";
import { computeTotals, listGroups, missingShippingFields, orderPrice, SHIPPING_FIELDS } from "./state.js";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function statusButtons(order) {
  const on = (isOn) => (isOn ? " on" : "");
  return `
    <div class="status">
      <button type="button" data-act="pay" class="${on(order.pay === PAY_STATES.paid).trim()}" title="Pagado"><span class="dollar">$</span></button>
      <button type="button" data-act="pack" class="${on(order.packed).trim()}" title="Empaquetado">📦</button>
      <button type="button" data-act="deliver" class="${on(order.delivered).trim()}" title="Entregado">✅</button>
      <button type="button" data-act="unpay" class="${on(order.pay === PAY_STATES.unpaid).trim()}" title="No pagado">❌</button>
      <button type="button" data-act="edit" class="edit" title="Editar pedido">✏️</button>
    </div>`;
}

function itemChips(data, order) {
  return Object.entries(data.items)
    .map(([key, item]) => {
      const count = order.items.filter((entry) => entry === key).length;
      const label = count > 1 ? `${esc(item.label)} ×${count}` : esc(item.label);
      return `<button type="button" class="chip${count ? " on" : ""}" data-act="item" data-item="${esc(key)}">${label}</button>`;
    })
    .join("");
}

function shippingFieldset(order) {
  if (!order.shipping) return "";
  const missing = missingShippingFields(order).length;
  const state = missing ? `Faltan ${missing} de 4 obligatorios` : "Datos completos";
  const inputs = SHIPPING_FIELDS.map((field) => `
        <label class="${field.required ? "req" : ""}">${esc(field.label)}${field.required ? " *" : ""}
          <input type="${field.type}" data-ship="${esc(field.key)}"
                 value="${esc(order.shippingInfo?.[field.key] ?? "")}"
                 placeholder="${esc(field.placeholder)}" autocomplete="off">
        </label>`).join("");
  return `
      <div class="ship-panel${missing ? " incomplete" : ""}">
        <div class="ship-head">📮 Datos de envío <span class="ship-state">${esc(state)}</span></div>
        <div class="ship-grid">${inputs}</div>
      </div>`;
}

function editPanel(data, order) {
  const groups = listGroups(data)
    .map((group) => `<option value="${esc(group)}"></option>`)
    .join("");
  return `
    <div class="edit-panel">
      <div class="edit-grid">
        <label>Nombre / IG
          <input type="text" data-field="ig" value="${esc(order.ig)}" placeholder="nombre o @usuario">
        </label>
        <label>Descripción
          <input type="text" data-field="desc" value="${esc(order.desc)}" placeholder="Gorro azul // Riñonera negra">
        </label>
        <label>Bloque
          <input type="text" data-field="group" value="${esc(order.group)}" list="grupos-lista" placeholder="EN MANO">
        </label>
      </div>
      <datalist id="grupos-lista">${groups}</datalist>
      <div class="chips">${itemChips(data, order)}</div>
      ${shippingFieldset(order)}
      <div class="edit-actions">
        <label class="ship-toggle">
          <input type="checkbox" data-field="shipping" ${order.shipping ? "checked" : ""}>
          Envío (+${data.prices.envio}€)
        </label>
        <button type="button" class="tbtn" data-act="done">✓ Listo</button>
        <button type="button" class="tbtn danger" data-act="remove">🗑 Borrar pedido</button>
      </div>
    </div>`;
}

function shippingFlag(order) {
  if (!order.shipping) return "";
  return missingShippingFields(order).length
    ? `<span class="ship-flag missing">📮 faltan datos de envío</span>`
    : `<span class="ship-flag ok">📮 envío listo</span>`;
}

function orderRow(data, order, isEditing) {
  const price = orderPrice(data, order);
  const title = order.desc || "(sin descripción)";
  const handle = order.ig || "(sin nombre)";
  return `
    <div class="order${order.checked ? " checked" : ""}${isEditing ? " editing" : ""}" data-id="${esc(order.id)}">
      <input type="checkbox" data-act="check" ${order.checked ? "checked" : ""} title="Cuenta para stock y presupuesto">
      <div class="body">
        <div class="desc">${esc(title)} — <span class="handle">${esc(handle)}</span></div>
        <div class="meta">
          <input class="note" data-act="note" placeholder="nombre / nota…" value="${esc(order.note)}">
          ${statusButtons(order)}
        </div>
        <div class="price">${price}€${order.shipping ? ` (incl. envío ${data.prices.envio}€)` : ""}${shippingFlag(order)}</div>
        ${isEditing ? editPanel(data, order) : ""}
      </div>
    </div>`;
}

export function renderOrders(container, data, editingId) {
  if (!data.orders.length) {
    container.innerHTML = `<div class="empty">Todavía no hay pedidos. Pulsa «+ Nuevo pedido».</div>`;
    return;
  }

  let lastGroup = null;
  const html = data.orders
    .map((order) => {
      const heading = order.group && order.group !== lastGroup
        ? `<div class="section-label">${esc(order.group)}</div>`
        : "";
      lastGroup = order.group || lastGroup;
      return heading + orderRow(data, order, order.id === editingId);
    })
    .join("");
  container.innerHTML = html;
}

/* Editor de un artículo: elegir "disponible" o "total", cambiar el número o borrarlo. */
function inventoryEditor(row, field) {
  const current = field === "total" ? row.total : row.remaining;
  const seg = [
    { value: "available", label: "Disponible" },
    { value: "total", label: "Total" },
  ]
    .map((option) => `<button type="button" data-inv-field="${option.value}" class="${field === option.value ? "on" : ""}">${option.label}</button>`)
    .join("");
  return `
      <div class="inv-edit">
        <div class="seg">${seg}</div>
        <input type="number" min="0" step="1" data-inv-value value="${current}" aria-label="Unidades">
        <button type="button" class="tbtn" data-inv-act="save">✓ Guardar</button>
        <button type="button" class="tbtn danger" data-inv-act="remove">🗑 Borrar</button>
      </div>`;
}

/* Una fila por artículo: "Riñoneras turquesa  4/6" = quedan 4 de las 6 que había. */
function inventoryRow(row, edit) {
  const { key, label, remaining, total } = row;
  const isEditing = edit?.key === key;
  const classes = [
    "inv-row",
    remaining <= 0 ? "sold-out" : "",
    remaining < 0 ? "neg" : "",
    isEditing ? "editing" : "",
  ].filter(Boolean).join(" ");
  return `<div class="${classes}" data-key="${esc(key)}">
      <span class="name">${esc(label)}</span>
      <span class="inv-num"><b>${remaining}</b><span class="sep">/</span><span class="total">${total}</span></span>
      <button type="button" class="inv-edit-btn" data-inv-act="edit" title="Editar o borrar">✏️</button>
      ${isEditing ? inventoryEditor(row, edit.field) : ""}
    </div>`;
}

function emptyInventoryRow(text) {
  return `<div class="inv-row zero"><span class="name">${esc(text)}</span><span class="inv-num">—</span></div>`;
}

export function renderTotals(data, elements, inventoryEdit = null) {
  const { activeCount, inventory, budget } = computeTotals(data);

  elements.inventory.innerHTML = inventory.length
    ? inventory.map((row) => inventoryRow(row, inventoryEdit)).join("")
    : emptyInventoryRow("Sin artículos todavía");

  elements.budget.innerHTML = `
    <div class="b-row"><span>Total esperado</span><span class="amt">${budget.expected}€</span></div>
    <div class="b-row collected"><span>Recaudado (pagado 💲)</span><span class="amt">${budget.collected}€</span></div>
    <div class="b-row pending"><span>Pendiente (no pagado ❌)</span><span class="amt">${budget.pending}€</span></div>
    <div class="b-row"><span>Gasto envíos estimado (${budget.shipCount}×${data.prices.envio}€)</span><span class="amt">${budget.shipping}€</span></div>
    <div class="b-row total"><span>Neto tras envíos</span><span class="amt">${budget.expected - budget.shipping}€</span></div>`;

  elements.count.textContent = `${activeCount} activos`;
}

/* Rellena los desplegables sin perder lo que ya estaba elegido. */
function fillSelect(select, options) {
  const previous = select.value;
  const next = options.map(({ value, label }) => `<option value="${esc(value)}">${esc(label)}</option>`).join("");
  if (select.innerHTML === next) return;
  select.innerHTML = next;
  const stillThere = options.some((option) => option.value === previous);
  select.value = stillThere ? previous : options[0]?.value ?? "";
}

export function renderForms(data, elements) {
  const items = Object.entries(data.items).map(([value, item]) => ({
    value,
    label: `${item.label} · ${item.price}€`,
  }));
  fillSelect(elements.newOrderItem, items.length ? items : [{ value: "", label: "Añade antes un artículo" }]);
  fillSelect(elements.newOrderGroup, listGroups(data).map((group) => ({ value: group, label: group })));
  elements.itemsDatalist.innerHTML = Object.values(data.items)
    .map((item) => `<option value="${esc(item.label)}"></option>`)
    .join("");
}
