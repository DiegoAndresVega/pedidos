/* Configuración de la app y del repositorio privado de datos. */

export const DEFAULT_REMOTE = Object.freeze({
  owner: "DiegoAndresVega",
  repo: "pedidos-datos",
  path: "datos.json",
  branch: "main",
});

export const STORAGE_KEYS = Object.freeze({
  token: "pedidos_gh_token",
  remote: "pedidos_gh_remote",
  cache: "pedidos_cache_v2",
  blur: "pedidos_blur",
  filter: "pedidos_filtro",
});

/* Pestañas de la lista de pedidos. */
export const FILTERS = Object.freeze({
  all: "all",
  pending: "pending",
  topack: "topack",
  delivered: "delivered",
});
export const DEFAULT_FILTER = FILTERS.all;

export const GITHUB_API = "https://api.github.com";

export const SAVE_DEBOUNCE_MS = 1200;
export const RETRY_DELAY_MS = 8000;
export const FLASH_MS = 2200;
export const MAX_ITEM_COPIES = 4;

export const PAY_STATES = Object.freeze({ paid: "paid", unpaid: "unpaid" });
