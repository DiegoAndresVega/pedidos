/* Sincronización automática con el repositorio privado:
   agrupa cambios, resuelve conflictos y reintenta si se cae la red. */

import { RETRY_DELAY_MS, SAVE_DEBOUNCE_MS } from "./config.js";
import { ERROR_KINDS, readData, StoreError, writeData } from "./github-store.js";
import { normalizeData } from "./state.js";

export const SYNC_STATES = Object.freeze({
  idle: "idle",
  loading: "loading",
  saving: "saving",
  saved: "saved",
  offline: "offline",
  error: "error",
});

export function createSync({ getRemote, getToken, onStatus, onAuthError }) {
  let sha = null;
  let pending = null;
  let debounceTimer = null;
  let retryTimer = null;
  let isSaving = false;

  const report = (state, message) => onStatus({ state, message, hasPending: pending !== null });

  function handleFailure(error, data) {
    if (pending === null) pending = data;
    if (error instanceof StoreError && error.kind === ERROR_KINDS.auth) {
      report(SYNC_STATES.error, error.message);
      onAuthError?.(error);
      return;
    }
    const isOffline = error instanceof StoreError && error.kind === ERROR_KINDS.network;
    report(isOffline ? SYNC_STATES.offline : SYNC_STATES.error, error.message || "No se pudo guardar.");
    clearTimeout(retryTimer);
    retryTimer = setTimeout(flush, RETRY_DELAY_MS);
  }

  async function flush() {
    clearTimeout(debounceTimer);
    clearTimeout(retryTimer);
    if (isSaving || pending === null) return;

    const data = pending;
    pending = null;
    isSaving = true;
    report(SYNC_STATES.saving);

    try {
      sha = await writeData(getRemote(), getToken(), data, sha);
      report(SYNC_STATES.saved, "Guardado en GitHub");
    } catch (error) {
      const isConflict = error instanceof StoreError && error.kind === ERROR_KINDS.conflict;
      if (!isConflict) {
        handleFailure(error, data);
      } else {
        try {
          const remoteFile = await readData(getRemote(), getToken());
          sha = await writeData(getRemote(), getToken(), data, remoteFile.sha);
          report(SYNC_STATES.saved, "Guardado (se resolvió un conflicto)");
        } catch (retryError) {
          handleFailure(retryError, data);
        }
      }
    } finally {
      isSaving = false;
      if (pending !== null) flush();
    }
  }

  /* Descarga datos.json. Devuelve datos normalizados o null si el archivo no existe. */
  async function load() {
    report(SYNC_STATES.loading, "Cargando…");
    const remoteFile = await readData(getRemote(), getToken());
    sha = remoteFile.sha;
    if (remoteFile.data === null) {
      report(SYNC_STATES.idle, "Archivo vacío en el repositorio");
      return null;
    }
    report(SYNC_STATES.idle, "Sincronizado");
    return normalizeData(remoteFile.data);
  }

  function queue(data) {
    pending = data;
    report(SYNC_STATES.saving, "Cambios sin guardar");
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }

  return {
    load,
    queue,
    flush,
    hasPending: () => pending !== null || isSaving,
    reset: () => {
      sha = null;
      pending = null;
      clearTimeout(debounceTimer);
      clearTimeout(retryTimer);
    },
  };
}
