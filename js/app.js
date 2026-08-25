/* Arranque y conexión entre datos, DOM y sincronización. */

import { FILTERS, FLASH_MS, PAY_STATES } from "./config.js";
import { createGate } from "./gate.js";
import { renderForms, renderOrders, renderTabs, renderTotals } from "./render.js";
import * as settings from "./settings.js";
import {
  addOrder,
  createEmptyData,
  countOrdersWithItem,
  cycleOrderItem,
  missingShippingFields,
  normalizeData,
  removeItem,
  removeOrder,
  setItemQuantity,
  togglePay,
  updateOrder,
  updateShippingInfo,
  upsertItem,
} from "./state.js";
import { createSync, SYNC_STATES } from "./sync.js";

const dom = {
  orders: document.getElementById("orders"),
  inventory: document.getElementById("inventory"),
  budget: document.getElementById("budget"),
  count: document.getElementById("checkedCount"),
  savedTag: document.getElementById("savedTag"),
  hint: document.getElementById("priceHint"),
  newOrderItem: document.getElementById("newOrderItem"),
  newOrderGroup: document.getElementById("newOrderGroup"),
  itemsDatalist: document.getElementById("articulos-lista"),
  tabs: document.getElementById("orderTabs"),
};

const ui = {
  data: createEmptyData(),
  editingId: null,
  inventoryEdit: null,
  filter: settings.getFilter(),
  isReady: false,
};

const sync = createSync({
  getRemote: settings.getRemote,
  getToken: settings.getToken,
  onStatus: showStatus,
  onAuthError: (error) => {
    ui.isReady = false;
    gate.open(error.message);
  },
});

const gate = createGate({ onCredentials: () => loadFromRemote({ throwOnError: true }) });

/* ---------- estado visual ---------- */

const STATUS_LABELS = {
  [SYNC_STATES.idle]: "Sincronizado",
  [SYNC_STATES.loading]: "Cargando…",
  [SYNC_STATES.saving]: "Guardando…",
  [SYNC_STATES.saved]: "Guardado",
  [SYNC_STATES.offline]: "Sin conexión · reintentando",
  [SYNC_STATES.error]: "Error al guardar",
};

let flashTimer = null;
function showStatus({ state, message }) {
  dom.savedTag.dataset.state = state;
  dom.savedTag.textContent = message || STATUS_LABELS[state] || state;
  clearTimeout(flashTimer);
  if (state === SYNC_STATES.saved) {
    flashTimer = setTimeout(() => {
      dom.savedTag.dataset.state = SYNC_STATES.idle;
      dom.savedTag.textContent = STATUS_LABELS[SYNC_STATES.idle];
    }, FLASH_MS);
  }
}

function renderAll() {
  renderOrders(dom.orders, ui.data, ui.editingId, ui.filter);
  renderTabs(ui.data, dom, ui.filter);
  renderTotals(ui.data, dom, ui.inventoryEdit);
  renderForms(ui.data, dom);
  dom.hint.textContent = Object.values(ui.data.items)
    .map((item) => `${item.label} ${item.price}€`)
    .join(" · ") + ` · Envío ${ui.data.prices.envio}€/paquete`;
}

/* Aplica datos nuevos: nunca muta los anteriores. */
function apply(nextData, { rerender = true } = {}) {
  ui.data = nextData;
  settings.setCachedData(nextData);
  sync.queue(nextData);
  if (rerender) renderAll();
  else {
    renderTabs(ui.data, dom, ui.filter);
    renderTotals(ui.data, dom, ui.inventoryEdit);
  }
}

/* ---------- carga ---------- */

async function loadFromRemote({ throwOnError = false } = {}) {
  try {
    const remoteData = await sync.load();
    if (remoteData === null) {
      ui.isReady = true;
      apply(createEmptyData());
      showStatus({
        state: SYNC_STATES.saving,
        message: `${settings.getRemote().path} no existía: se está creando vacío`,
      });
      return;
    }
    ui.data = remoteData;
    ui.isReady = true;
    settings.setCachedData(remoteData);
    renderAll();
  } catch (error) {
    const cached = settings.getCachedData();
    const hasUsableCache = Boolean(cached?.orders?.length || Object.keys(cached?.items || {}).length);
    if (hasUsableCache && !throwOnError) {
      ui.data = normalizeData(cached);
      ui.isReady = true;
      renderAll();
      showStatus({ state: SYNC_STATES.offline, message: `Copia local · ${error.message}` });
      return;
    }
    if (throwOnError) throw error;
    gate.open(error.message);
  }
}

/* ---------- eventos de la lista ---------- */

function orderIdFrom(target) {
  return target.closest(".order")?.dataset.id || null;
}

dom.orders.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-act]");
  if (!button) return;
  const id = orderIdFrom(button);
  if (!id) return;

  const actions = {
    pay: () => apply(togglePay(ui.data, id, PAY_STATES.paid)),
    unpay: () => apply(togglePay(ui.data, id, PAY_STATES.unpaid)),
    pack: () => apply(updateOrder(ui.data, id, { packed: !findChecked(id, "packed") })),
    deliver: () => apply(updateOrder(ui.data, id, { delivered: !findChecked(id, "delivered") })),
    item: () => apply(cycleOrderItem(ui.data, id, button.dataset.item)),
    edit: () => {
      ui.editingId = ui.editingId === id ? null : id;
      renderAll();
    },
    done: () => {
      ui.editingId = null;
      renderAll();
    },
    remove: () => {
      if (!confirm("¿Borrar este pedido? No se puede deshacer.")) return;
      ui.editingId = null;
      apply(removeOrder(ui.data, id));
    },
  };
  actions[button.dataset.act]?.();
});

function findChecked(id, field) {
  return Boolean(ui.data.orders.find((order) => order.id === id)?.[field]);
}

dom.orders.addEventListener("change", (event) => {
  const id = orderIdFrom(event.target);
  if (!id) return;
  if (event.target.dataset.act === "check") {
    apply(updateOrder(ui.data, id, { checked: event.target.checked }));
  }
  if (event.target.dataset.field === "shipping") {
    apply(updateOrder(ui.data, id, { shipping: event.target.checked }));
  }
});

/* El texto no repinta la lista: así no se pierde el cursor mientras escribes. */
dom.orders.addEventListener("input", (event) => {
  const id = orderIdFrom(event.target);
  if (!id) return;

  const shippingKey = event.target.dataset.ship;
  if (shippingKey) {
    apply(updateShippingInfo(ui.data, id, shippingKey, event.target.value), { rerender: false });
    refreshShippingState(id);
    return;
  }

  const field = event.target.dataset.act === "note" ? "note" : event.target.dataset.field;
  if (!["note", "ig", "desc", "group"].includes(field)) return;
  apply(updateOrder(ui.data, id, { [field]: event.target.value }), { rerender: false });
});

/* Actualiza el aviso de envío sin repintar la fila, para no perder el cursor. */
function refreshShippingState(id) {
  const row = dom.orders.querySelector(`.order[data-id="${id}"]`);
  const order = ui.data.orders.find((entry) => entry.id === id);
  if (!row || !order) return;

  const missing = missingShippingFields(order).length;
  const flag = row.querySelector(".ship-flag");
  if (flag) {
    flag.textContent = missing ? "📮 faltan datos de envío" : "📮 envío listo";
    flag.classList.toggle("missing", missing > 0);
    flag.classList.toggle("ok", missing === 0);
  }
  const panel = row.querySelector(".ship-panel");
  const state = row.querySelector(".ship-state");
  if (panel) panel.classList.toggle("incomplete", missing > 0);
  if (state) state.textContent = missing ? `Faltan ${missing} de 4 obligatorios` : "Datos completos";
}

/* ---------- pestañas: todos / pendiente / entregado ---------- */

dom.tabs.addEventListener("click", (event) => {
  const tab = event.target.closest(".tab");
  if (!tab || tab.dataset.filter === ui.filter) return;
  ui.filter = Object.hasOwn(FILTERS, tab.dataset.filter) ? tab.dataset.filter : FILTERS.all;
  ui.editingId = null;
  settings.setFilter(ui.filter);
  renderAll();
});

/* ---------- edición del inventario ---------- */

dom.inventory.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const row = button.closest(".inv-row");
  const key = row?.dataset.key;
  if (!key) return;

  if (button.dataset.invField) {
    ui.inventoryEdit = { key, field: button.dataset.invField };
    renderAll();
    return;
  }

  const actions = {
    edit: () => {
      ui.inventoryEdit = ui.inventoryEdit?.key === key ? null : { key, field: "available" };
      renderAll();
    },
    save: () => {
      const input = row.querySelector("[data-inv-value]");
      try {
        const next = setItemQuantity(ui.data, key, ui.inventoryEdit.field, input.value);
        ui.inventoryEdit = null;
        apply(next);
      } catch (error) {
        showStatus({ state: SYNC_STATES.error, message: error.message });
      }
    },
    remove: () => {
      const used = countOrdersWithItem(ui.data, key);
      const warning = used
        ? `Está en ${used} pedido(s): se quitará de ellos y cambiarán sus precios.\n\n`
        : "";
      if (!confirm(`${warning}¿Borrar «${ui.data.items[key].label}» del inventario?`)) return;
      ui.inventoryEdit = null;
      apply(removeItem(ui.data, key));
    },
  };
  actions[button.dataset.invAct]?.();
});

/* Enter dentro del número equivale a pulsar Guardar. */
dom.inventory.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.target.dataset.invValue === undefined) return;
  event.preventDefault();
  event.target.closest(".inv-row")?.querySelector('[data-inv-act="save"]')?.click();
});

/* ---------- barra de herramientas ---------- */

/* Mensajes de los formularios: verde al crear, rojo al fallar. */
const formMessageTimers = new WeakMap();
function showFormMessage(element, text, isError = false) {
  element.textContent = text;
  element.hidden = false;
  element.classList.toggle("is-error", isError);
  clearTimeout(formMessageTimers.get(element));
  formMessageTimers.set(element, setTimeout(() => { element.hidden = true; }, FLASH_MS * 2));
}

const addOrderForm = document.getElementById("addOrderForm");
const addOrderMsg = document.getElementById("addOrderMsg");
addOrderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const igField = document.getElementById("newOrderIg");
  const ig = igField.value.trim();
  const itemKey = dom.newOrderItem.value;
  const group = dom.newOrderGroup.value;

  if (!ig) return showFormMessage(addOrderMsg, "Escribe el nombre o el IG.", true);
  if (!itemKey) return showFormMessage(addOrderMsg, "Añade antes un artículo al inventario.", true);

  const { data, order } = addOrder(ui.data, { ig, itemKey, group });
  apply(data);
  igField.value = "";
  igField.focus();
  showFormMessage(addOrderMsg, `Añadido: ${order.desc} — ${order.ig} (${group}).`);
  document.querySelector(`.order[data-id="${order.id}"]`)?.scrollIntoView({ block: "center" });
});

const addItemForm = document.getElementById("addItemForm");
const addItemMsg = document.getElementById("addItemMsg");
addItemForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const labelField = document.getElementById("newItemLabel");
  const priceField = document.getElementById("newItemPrice");
  const unitsField = document.getElementById("newItemUnits");

  try {
    const { data, key, isNew } = upsertItem(ui.data, {
      label: labelField.value,
      price: priceField.value,
      units: unitsField.value,
    });
    apply(data);
    dom.newOrderItem.value = key;
    labelField.value = "";
    labelField.focus();
    showFormMessage(
      addItemMsg,
      isNew ? "Artículo creado y disponible en el desplegable." : "Unidades sumadas al stock.",
    );
  } catch (error) {
    showFormMessage(addItemMsg, error.message, true);
  }
});

document.getElementById("reloadBtn").addEventListener("click", async () => {
  if (sync.hasPending() && !confirm("Hay cambios sin guardar. ¿Recargar igualmente?")) return;
  ui.editingId = null;
  await loadFromRemote();
});

document.getElementById("backupBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(ui.data, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `pedidos-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

document.getElementById("settingsBtn").addEventListener("click", () => gate.open());

document.getElementById("logoutBtn").addEventListener("click", () => {
  if (sync.hasPending() && !confirm("Hay cambios sin guardar. ¿Salir igualmente?")) return;
  settings.clearToken();
  settings.setCachedData(createEmptyData());
  sync.reset();
  ui.data = createEmptyData();
  ui.isReady = false;
  renderAll();
  gate.open("Sesión cerrada.");
});

/* ---------- presupuesto difuminado ---------- */

const blurBtn = document.getElementById("blurBtn");
function applyBlur(isOn) {
  dom.budget.classList.toggle("blurred", isOn);
  dom.hint.classList.toggle("blurred", isOn);
  blurBtn.textContent = isOn ? "👁 Mostrar" : "👁 Ocultar";
  settings.setBlurPreference(isOn);
}
blurBtn.addEventListener("click", () => applyBlur(!dom.budget.classList.contains("blurred")));

/* ---------- salvaguardas ---------- */

window.addEventListener("beforeunload", (event) => {
  if (!sync.hasPending()) return;
  sync.flush();
  event.preventDefault();
  event.returnValue = "";
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !ui.isReady || sync.hasPending()) return;
  loadFromRemote();
});

/* ---------- arranque ---------- */

applyBlur(settings.getBlurPreference());
renderAll();
if (settings.getToken()) loadFromRemote();
else gate.open();
