/* Construcción del DOM. No modifica datos: solo los pinta. */

import { FILTERS, PAY_STATES } from "./config.js";
import {
  computeTotals,
  HAND_GROUP,
  isPickupOrder,
  listGroups,
  missingShippingFields,
  orderPrice,
  PICKUP_GROUP,
  REQUIRED_SHIPPING_COUNT,
  SHIPPING_FIELDS,
  SHIPPING_GROUP,
} from "./state.js";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/* Solo los envíos llevan etiqueta; solo las retiradas se dejan en el local. */
function stageButtons(order, on) {
  const ticket = order.shipping
    ? `<button type="button" data-act="label" class="${on(order.labelPrinted).trim()}" title="Etiqueta impresa">🎫</button>`
    : "";
  const farmer = isPickupOrder(order)
    ? `<button type="button" data-act="drop" class="${on(order.dropped).trim()}" title="Depositado en el local de recogida">🧑🏻‍🌾</button>`
    : "";
  return { ticket, farmer };
}

function statusButtons(order) {
  const on = (isOn) => (isOn ? " on" : "");
  const { ticket, farmer } = stageButtons(order, on);
  return `
    <div class="status">
      <button type="button" data-act="pay" class="${on(order.pay === PAY_STATES.paid).trim()}" title="Pagado"><span class="dollar">$</span></button>
      ${ticket}
      <button type="button" data-act="pack" class="${on(order.packed).trim()}" title="Empaquetado">📦</button>
      ${farmer}
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
  const state = missing ? `Faltan ${missing} de ${REQUIRED_SHIPPING_COUNT} obligatorios` : "Datos completos";
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

export const NEW_GROUP_VALUE = "__nueva__";

/* Bloque: desplegable con las categorías que ya existen, sin escribir a mano. */
function groupField(data, order, isNaming) {
  if (isNaming) {
    return `
        <label>Nueva categoría
          <input type="text" data-field="groupNew" value="" placeholder="Escribe y pulsa Intro" autocomplete="off">
        </label>`;
  }
  const options = listGroups(data)
    .map((group) => `<option value="${esc(group)}"${group === order.group ? " selected" : ""}>${esc(group)}</option>`)
    .join("");
  return `
        <label>Bloque
          <select data-field="group">${options}<option value="${NEW_GROUP_VALUE}">➕ Nueva categoría…</option></select>
        </label>`;
}

function editPanel(data, order, isNamingGroup) {
  return `
    <div class="edit-panel">
      <div class="edit-grid">
        <label>Nombre / IG
          <input type="text" data-field="ig" value="${esc(order.ig)}" placeholder="nombre o @usuario">
        </label>
        <label>Descripción
          <input type="text" data-field="desc" value="${esc(order.desc)}" placeholder="Gorro azul // Riñonera negra">
        </label>
        ${groupField(data, order, isNamingGroup)}
      </div>
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

function shippingFlag(order, isInfoOpen) {
  if (!order.shipping) return "";
  const flag = missingShippingFields(order).length
    ? `<span class="ship-flag missing">📮 faltan datos de envío</span>`
    : `<span class="ship-flag ok">📮 envío listo</span>`;
  const label = isInfoOpen ? "✕ Cerrar" : "📋 Ver info";
  return `${flag}<button type="button" class="info-btn${isInfoOpen ? " on" : ""}" data-act="info">${label}</button>`;
}

/* Datos de envío en modo lectura, para consultarlos sin abrir la edición. */
function infoPanel(order) {
  const rows = SHIPPING_FIELDS.map((field) => {
    const value = order.shippingInfo?.[field.key] ?? "";
    const isMissing = field.required && !value;
    return `
          <div class="info-row${isMissing ? " missing" : ""}">
            <dt>${esc(field.label)}</dt><dd>${value ? esc(value) : "—"}</dd>
          </div>`;
  }).join("");
  return `
      <dl class="info-panel">${rows}</dl>`;
}

/* La nota se escribe solo tras pulsar 📝 y no viaja al repositorio hasta pulsar ✓. */
function noteField(order, noteDraft) {
  const isEditing = noteDraft?.id === order.id;
  const value = isEditing ? noteDraft.value : order.note;
  return `
          <span class="note-wrap${isEditing ? " editing" : ""}">
            <input class="note" data-act="note" placeholder="nombre / nota…"
                   value="${esc(value)}" ${isEditing ? "" : "readonly"}>
            <button type="button" class="note-btn" data-act="${isEditing ? "note-save" : "note-edit"}"
                    title="${isEditing ? "Guardar nota" : "Editar nota"}">${isEditing ? "✓" : "📝"}</button>
          </span>`;
}

function orderRow(data, order, isEditing, ui) {
  const { noteDraft, namingGroupId } = ui;
  const isInfoOpen = order.shipping && ui.infoId === order.id;
  const price = orderPrice(data, order);
  const title = order.desc || "(sin descripción)";
  const handle = order.ig || "(sin nombre)";
  return `
    <div class="order${order.checked ? " checked" : ""}${isEditing ? " editing" : ""}" data-id="${esc(order.id)}">
      <input type="checkbox" data-act="check" ${order.checked ? "checked" : ""} title="Cuenta para stock y presupuesto">
      <div class="body">
        <div class="desc">${esc(title)} — <span class="handle">${esc(handle)}</span></div>
        <div class="meta">
          ${noteField(order, noteDraft)}
          ${statusButtons(order)}
        </div>
        <div class="price">${price}€${order.shipping ? ` (incl. envío ${data.prices.envio}€)` : ""}${shippingFlag(order, isInfoOpen)}</div>
        ${isInfoOpen ? infoPanel(order) : ""}
        ${isEditing ? editPanel(data, order, namingGroupId === order.id) : ""}
      </div>
    </div>`;
}

const FILTER_TESTS = {
  [FILTERS.all]: () => true,
  [FILTERS.pending]: (order) => !order.delivered,
  /* Todo lo que aún no está cobrado, marcado con ❌ o sin marcar todavía. */
  [FILTERS.unpaid]: (order) => order.pay !== PAY_STATES.paid,
  /* Lo que sigue en casa sin empaquetar: si ya está entregado, no hay nada que empaquetar. */
  [FILTERS.topack]: (order) => !order.packed && !order.delivered,
  [FILTERS.delivered]: (order) => order.delivered,
  [FILTERS.hand]: (order) => order.group === HAND_GROUP,
  [FILTERS.barn]: (order) => order.group === PICKUP_GROUP,
  [FILTERS.shipping]: (order) => order.group === SHIPPING_GROUP,
};

const EMPTY_TEXTS = {
  [FILTERS.all]: "Todavía no hay pedidos. Añade uno con el formulario de arriba.",
  [FILTERS.pending]: "No queda ningún pedido pendiente. Todo entregado.",
  [FILTERS.unpaid]: "No queda nada por cobrar 💲.",
  [FILTERS.topack]: "No queda nada por empaquetar 📦.",
  [FILTERS.delivered]: "Todavía no has marcado ningún pedido como entregado ✅.",
  [FILTERS.hand]: `Ningún pedido en ${HAND_GROUP}.`,
  [FILTERS.barn]: `Ningún pedido en ${PICKUP_GROUP}.`,
  [FILTERS.shipping]: `Ningún pedido en ${SHIPPING_GROUP}.`,
};

export function filterOrders(orders, filter) {
  return orders.filter(FILTER_TESTS[filter] ?? FILTER_TESTS[FILTERS.all]);
}

/* Números de cada pestaña, siempre sobre la lista completa. */
export function renderTabs(data, elements, filter) {
  const counts = Object.fromEntries(
    Object.values(FILTERS).map((name) => [name, filterOrders(data.orders, name).length]),
  );
  elements.tabs.querySelectorAll(".tab").forEach((tab) => {
    const isOn = tab.dataset.filter === filter;
    tab.classList.toggle("on", isOn);
    tab.setAttribute("aria-selected", String(isOn));
    tab.querySelector(".tab-n").textContent = counts[tab.dataset.filter] ?? 0;
  });
}

export function renderOrders(container, data, editingId, filter = FILTERS.all, ui = {}) {
  const groupOrder = listGroups(data);
  const visible = filterOrders(data.orders, filter)
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const byGroup = groupOrder.indexOf(a.entry.group) - groupOrder.indexOf(b.entry.group);
      return byGroup !== 0 ? byGroup : a.index - b.index;
    })
    .map(({ entry }) => entry);
  if (!visible.length) {
    container.innerHTML = `<div class="empty">${esc(EMPTY_TEXTS[filter] ?? EMPTY_TEXTS[FILTERS.all])}</div>`;
    return;
  }

  let lastGroup = null;
  const html = visible
    .map((order) => {
      const heading = order.group && order.group !== lastGroup
        ? `<div class="section-label">${esc(order.group)}</div>`
        : "";
      lastGroup = order.group || lastGroup;
      return heading + orderRow(data, order, order.id === editingId, ui);
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

/* Productos ya apuntados al pedido que se está creando. Cada chip quita una unidad. */
export function renderDraftItems(container, data, keys) {
  const valid = keys.filter((key) => Object.hasOwn(data.items, key));
  container.hidden = valid.length === 0;
  if (!valid.length) {
    container.innerHTML = "";
    return;
  }
  const counts = valid.reduce((acc, key) => ({ ...acc, [key]: (acc[key] ?? 0) + 1 }), {});
  const chips = Object.entries(counts)
    .map(([key, count]) => {
      const label = count > 1 ? `${esc(data.items[key].label)} ×${count}` : esc(data.items[key].label);
      return `<button type="button" class="chip on" data-draft="${esc(key)}" title="Quitar una unidad">${label} ✕</button>`;
    })
    .join("");
  container.innerHTML = `<span class="draft-label">En este pedido</span><div class="chips">${chips}</div>`;
}

/* Tras crear un envío se ofrece rellenar los datos en el momento o dejarlo para luego. */
export function renderShipPrompt(container, order) {
  container.hidden = !order;
  if (!order) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = `
      <span class="ship-prompt-text">📮 <b>${esc(order.ig)}</b> es un envío: aún le faltan los datos de entrega.</span>
      <button type="button" class="tbtn primary" data-ship-prompt="now">Rellenar ahora</button>
      <button type="button" class="tbtn" data-ship-prompt="later">Dejarlo para luego</button>`;
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
