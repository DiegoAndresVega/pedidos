/* Acceso a los ajustes locales (token y repositorio de datos).
   Nada de esto viaja al repositorio público: vive solo en este navegador. */

import { DEFAULT_FILTER, DEFAULT_REMOTE, FILTERS, STORAGE_KEYS } from "./config.js";

function readRaw(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.warn("No se pudo leer el almacenamiento local:", error);
    return null;
  }
}

function writeRaw(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn("No se pudo escribir en el almacenamiento local:", error);
    return false;
  }
}

export function getToken() {
  return readRaw(STORAGE_KEYS.token) || "";
}

export function setToken(token) {
  const clean = String(token || "").trim();
  return writeRaw(STORAGE_KEYS.token, clean || null);
}

export function clearToken() {
  return writeRaw(STORAGE_KEYS.token, null);
}

export function getRemote() {
  const raw = readRaw(STORAGE_KEYS.remote);
  if (!raw) return { ...DEFAULT_REMOTE };
  try {
    const parsed = JSON.parse(raw);
    return {
      owner: String(parsed.owner || DEFAULT_REMOTE.owner).trim(),
      repo: String(parsed.repo || DEFAULT_REMOTE.repo).trim(),
      path: String(parsed.path || DEFAULT_REMOTE.path).trim(),
      branch: String(parsed.branch || DEFAULT_REMOTE.branch).trim(),
    };
  } catch (error) {
    console.warn("Ajustes de repositorio corruptos, se usan los valores por defecto:", error);
    return { ...DEFAULT_REMOTE };
  }
}

export function setRemote(remote) {
  const next = {
    owner: String(remote.owner || "").trim(),
    repo: String(remote.repo || "").trim(),
    path: String(remote.path || DEFAULT_REMOTE.path).trim(),
    branch: String(remote.branch || DEFAULT_REMOTE.branch).trim(),
  };
  if (!next.owner || !next.repo || !next.path || !next.branch) {
    throw new Error("Faltan datos del repositorio (usuario, repo, archivo o rama).");
  }
  return writeRaw(STORAGE_KEYS.remote, JSON.stringify(next));
}

export function getCachedData() {
  const raw = readRaw(STORAGE_KEYS.cache);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn("Copia local ilegible, se descarta:", error);
    return null;
  }
}

export function setCachedData(data) {
  return writeRaw(STORAGE_KEYS.cache, JSON.stringify(data));
}

export function getBlurPreference() {
  return readRaw(STORAGE_KEYS.blur) === "1";
}

export function setBlurPreference(isOn) {
  return writeRaw(STORAGE_KEYS.blur, isOn ? "1" : "0");
}

export function getFilter() {
  const stored = readRaw(STORAGE_KEYS.filter);
  return Object.hasOwn(FILTERS, stored ?? "") ? stored : DEFAULT_FILTER;
}

export function setFilter(filter) {
  return writeRaw(STORAGE_KEYS.filter, Object.hasOwn(FILTERS, filter) ? filter : DEFAULT_FILTER);
}
