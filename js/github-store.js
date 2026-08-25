/* Lectura y escritura de datos.json en el repositorio privado
   usando la API de contenidos de GitHub. */

import { GITHUB_API } from "./config.js";

export const ERROR_KINDS = Object.freeze({
  auth: "auth",
  notFound: "notFound",
  conflict: "conflict",
  network: "network",
  server: "server",
  invalid: "invalid",
});

export class StoreError extends Error {
  constructor(kind, message, status = 0) {
    super(message);
    this.name = "StoreError";
    this.kind = kind;
    this.status = status;
  }
}

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(base64) {
  const binary = atob(String(base64).replace(/\s+/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function contentsUrl(remote) {
  const { owner, repo, path } = remote;
  const safePath = path.split("/").map(encodeURIComponent).join("/");
  return `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${safePath}`;
}

function headers(token) {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    Authorization: `Bearer ${token}`,
  };
}

async function request(url, token, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { ...headers(token), ...(options.headers || {}) },
      cache: "no-store",
    });
  } catch (error) {
    throw new StoreError(ERROR_KINDS.network, "Sin conexión con GitHub.", 0);
  }

  if (response.ok) return response.json();

  const detail = await response.text().catch(() => "");
  if (response.status === 401) {
    throw new StoreError(ERROR_KINDS.auth, "Token inválido o caducado.", 401);
  }
  if (response.status === 403) {
    throw new StoreError(ERROR_KINDS.auth, "El token no tiene permiso de escritura sobre ese repositorio.", 403);
  }
  if (response.status === 404) {
    throw new StoreError(ERROR_KINDS.notFound, "No se encontró el repositorio o el archivo.", 404);
  }
  if (response.status === 409 || response.status === 422) {
    throw new StoreError(ERROR_KINDS.conflict, "Los datos cambiaron desde otro dispositivo.", response.status);
  }
  throw new StoreError(ERROR_KINDS.server, `GitHub respondió ${response.status}. ${detail.slice(0, 200)}`, response.status);
}

/* Devuelve { data, sha } o { data: null, sha: null } si el archivo aún no existe. */
export async function readData(remote, token) {
  const url = `${contentsUrl(remote)}?ref=${encodeURIComponent(remote.branch)}&t=${Date.now()}`;
  let payload;
  try {
    payload = await request(url, token);
  } catch (error) {
    if (error instanceof StoreError && error.kind === ERROR_KINDS.notFound) {
      return { data: null, sha: null };
    }
    throw error;
  }

  if (!payload || typeof payload.content !== "string") {
    throw new StoreError(ERROR_KINDS.invalid, "La respuesta de GitHub no contenía el archivo.");
  }

  try {
    return { data: JSON.parse(decodeBase64(payload.content)), sha: payload.sha };
  } catch (error) {
    throw new StoreError(ERROR_KINDS.invalid, "datos.json no es un JSON válido.");
  }
}

/* Guarda el archivo. Devuelve el nuevo sha. */
export async function writeData(remote, token, data, sha, message) {
  const body = {
    message: message || `datos: actualización ${new Date().toISOString()}`,
    content: encodeBase64(`${JSON.stringify(data, null, 2)}\n`),
    branch: remote.branch,
  };
  if (sha) body.sha = sha;

  const payload = await request(contentsUrl(remote), token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const nextSha = payload?.content?.sha;
  if (!nextSha) {
    throw new StoreError(ERROR_KINDS.invalid, "GitHub no devolvió el identificador del archivo guardado.");
  }
  return nextSha;
}
