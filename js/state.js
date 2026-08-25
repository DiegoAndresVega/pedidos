/* Modelo de datos. Todas las funciones devuelven copias nuevas:
   nunca se muta el objeto recibido. */

import { MAX_ITEM_COPIES, PAY_STATES } from "./config.js";

export const DEFAULT_GROUPS = Object.freeze(["EN MANO", "RETIRADA", "ENVÍOS"]);

export function createEmptyData() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    prices: { envio: 3 },
    items: {},
    stock: {},
    orders: [],
  };
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeItems(rawItems) {
  if (!rawItems || typeof rawItems !== "object") return {};
  return Object.entries(rawItems).reduce((acc, [key, value]) => {
    if (!key) return acc;
    acc[key] = {
      label: String(value?.label ?? key),
      price: toNumber(value?.price, 0),
    };
    return acc;
  }, {});
}

function normalizeStock(rawStock, items) {
  const source = rawStock && typeof rawStock === "object" ? rawStock : {};
  return Object.keys(items).reduce((acc, key) => {
    acc[key] = Math.max(0, Math.round(toNumber(source[key], 0)));
    return acc;
  }, {});
}

function normalizePay(value) {
  return value === PAY_STATES.paid || value === PAY_STATES.unpaid ? value : null;
}

function normalizeOrder(rawOrder, index, items) {
  const validItems = Array.isArray(rawOrder?.items)
    ? rawOrder.items.filter((key) => Object.hasOwn(items, key))
    : [];
  return {
    id: String(rawOrder?.id || `o${Date.now().toString(36)}${index}`),
    group: String(rawOrder?.group || DEFAULT_GROUPS[0]),
    ig: String(rawOrder?.ig ?? ""),
    desc: String(rawOrder?.desc ?? ""),
    items: validItems,
    shipping: Boolean(rawOrder?.shipping),
    checked: rawOrder?.checked === undefined ? true : Boolean(rawOrder.checked),
    pay: normalizePay(rawOrder?.pay),
    delivered: Boolean(rawOrder?.delivered),
    packed: Boolean(rawOrder?.packed),
    note: String(rawOrder?.note ?? ""),
  };
}

/* Valida y completa cualquier JSON que llegue del repositorio. */
export function normalizeData(raw) {
  if (!raw || typeof raw !== "object") return createEmptyData();
  const items = normalizeItems(raw.items);
  return {
    version: toNumber(raw.version, 1),
    updatedAt: String(raw.updatedAt || new Date().toISOString()),
    prices: { envio: toNumber(raw?.prices?.envio, 3) },
    items,
    stock: normalizeStock(raw.stock, items),
    orders: Array.isArray(raw.orders)
      ? raw.orders.map((order, index) => normalizeOrder(order, index, items))
      : [],
  };
}

function withTimestamp(data) {
  return { ...data, updatedAt: new Date().toISOString() };
}

export function newOrderId() {
  return `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const SHIPPING_GROUP = "ENVÍOS";

/* Alta de pedido desde el formulario. El bloque de envíos suma el gasto de envío. */
export function addOrder(data, { ig = "", itemKey = "", group = "" } = {}) {
  const chosenGroup = group || data.orders.at(-1)?.group || DEFAULT_GROUPS[0];
  const isKnownItem = Object.hasOwn(data.items, itemKey);
  const order = {
    id: newOrderId(),
    group: chosenGroup,
    ig: String(ig).trim(),
    desc: isKnownItem ? data.items[itemKey].label : "",
    items: isKnownItem ? [itemKey] : [],
    shipping: chosenGroup === SHIPPING_GROUP,
    checked: true,
    pay: null,
    delivered: false,
    packed: false,
    note: "",
  };
  const lastOfGroup = data.orders.reduce((last, entry, index) => (entry.group === chosenGroup ? index : last), -1);
  const orders = lastOfGroup === -1
    ? [...data.orders, order]
    : [...data.orders.slice(0, lastOfGroup + 1), order, ...data.orders.slice(lastOfGroup + 1)];
  return { data: withTimestamp({ ...data, orders }), order };
}

/* Clave interna a partir del nombre visible: "Gorros marrón" -> "gorros_marron". */
export function toItemKey(label) {
  const base = String(label)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || `item_${Date.now().toString(36)}`;
}

function findItemKeyByLabel(data, label) {
  const wanted = String(label).trim().toLowerCase();
  return Object.keys(data.items).find((key) => data.items[key].label.trim().toLowerCase() === wanted) || null;
}

/* Crea un artículo nuevo o suma unidades y actualiza el precio de uno existente. */
export function upsertItem(data, { label, price, units }) {
  const cleanLabel = String(label || "").trim();
  if (!cleanLabel) throw new Error("El artículo necesita un nombre.");

  const parsedPrice = Number(price);
  const parsedUnits = Number(units);
  if (!Number.isFinite(parsedPrice) || parsedPrice < 0) throw new Error("El precio debe ser un número de 0 en adelante.");
  if (!Number.isFinite(parsedUnits) || parsedUnits < 0) throw new Error("Las unidades deben ser un número de 0 en adelante.");

  const existingKey = findItemKeyByLabel(data, cleanLabel);
  const key = existingKey || toItemKey(cleanLabel);
  const addedUnits = Math.round(parsedUnits);

  return {
    data: withTimestamp({
      ...data,
      items: { ...data.items, [key]: { label: cleanLabel, price: parsedPrice } },
      stock: { ...data.stock, [key]: (data.stock[key] ?? 0) + addedUnits },
    }),
    key,
    isNew: !existingKey,
  };
}

export function updateOrder(data, id, patch) {
  return withTimestamp({
    ...data,
    orders: data.orders.map((order) => (order.id === id ? { ...order, ...patch } : order)),
  });
}

export function removeOrder(data, id) {
  return withTimestamp({ ...data, orders: data.orders.filter((order) => order.id !== id) });
}

export function togglePay(data, id, target) {
  const order = findOrder(data, id);
  if (!order) return data;
  return updateOrder(data, id, { pay: order.pay === target ? null : target });
}

/* Cada clic sobre un artículo suma una unidad y vuelve a cero al pasar el máximo. */
export function cycleOrderItem(data, id, itemKey) {
  const order = findOrder(data, id);
  if (!order) return data;
  const count = order.items.filter((key) => key === itemKey).length;
  const rest = order.items.filter((key) => key !== itemKey);
  const nextCount = count >= MAX_ITEM_COPIES ? 0 : count + 1;
  return updateOrder(data, id, { items: [...rest, ...Array(nextCount).fill(itemKey)] });
}

export function findOrder(data, id) {
  return data.orders.find((order) => order.id === id) || null;
}

export function orderPrice(data, order) {
  const itemsTotal = order.items.reduce((sum, key) => sum + (data.items[key]?.price ?? 0), 0);
  return itemsTotal + (order.shipping ? data.prices.envio : 0);
}

export function listGroups(data) {
  const used = data.orders.map((order) => order.group).filter(Boolean);
  return [...new Set([...DEFAULT_GROUPS, ...used])];
}

/* Resumen de inventario y presupuesto sobre los pedidos activos. */
export function computeTotals(data) {
  const active = data.orders.filter((order) => order.checked);

  const sold = Object.keys(data.items).reduce((acc, key) => ({ ...acc, [key]: 0 }), {});
  active.forEach((order) => {
    order.items.forEach((key) => {
      if (Object.hasOwn(sold, key)) sold[key] += 1;
    });
  });

  const inventory = Object.keys(data.items).map((key) => ({
    key,
    label: data.items[key].label,
    sold: sold[key],
    remaining: (data.stock[key] ?? 0) - sold[key],
  }));

  const budget = active.reduce(
    (acc, order) => {
      const price = orderPrice(data, order);
      return {
        expected: acc.expected + price,
        collected: acc.collected + (order.pay === PAY_STATES.paid ? price : 0),
        pending: acc.pending + (order.pay === PAY_STATES.paid ? 0 : price),
        shipping: acc.shipping + (order.shipping ? data.prices.envio : 0),
        shipCount: acc.shipCount + (order.shipping ? 1 : 0),
      };
    },
    { expected: 0, collected: 0, pending: 0, shipping: 0, shipCount: 0 },
  );

  return { activeCount: active.length, inventory, budget };
}
