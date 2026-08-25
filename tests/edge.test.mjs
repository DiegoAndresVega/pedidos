import assert from "node:assert/strict";
import fs from "node:fs";
import { boot, httpError } from "./harness.mjs";

const SEED = JSON.parse(fs.readFileSync(new URL("fixtures/datos.json", import.meta.url), "utf8"));
/* La nota se edita con 📝 y se confirma con ✓. */
async function saveNote(doc, window, settle, id, text) {
  const row = () => doc.querySelector(`.order[data-id="${id}"]`);
  row().querySelector('[data-act="note-edit"]').click();
  const input = row().querySelector(".note");
  input.value = text;
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  row().querySelector('[data-act="note-save"]').click();
  await settle(80);
}

const results = [];
const check = (name, fn) => {
  try { fn(); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + " → " + e.message]); }
};

// 1. Sin token: pantalla de acceso, cero llamadas a GitHub
{
  const { doc, remote } = await boot({ token: null });
  check("sin token se muestra la pantalla de acceso", () =>
    assert.equal(doc.getElementById("gate").hidden, false));
  check("sin token no se descarga nada", () => assert.equal(remote.puts.length, 0));
  check("sin token no se ven pedidos", () => assert.equal(doc.querySelectorAll(".order").length, 0));
}

// 2. Token inválido: 401 y mensaje claro
{
  const { doc } = await boot({ intercept: ({ method }) => (method === "GET" ? httpError(401) : null) });
  check("token inválido vuelve a la pantalla de acceso", () =>
    assert.equal(doc.getElementById("gate").hidden, false));
  check("token inválido explica el motivo", () =>
    assert.match(doc.getElementById("gateError").textContent, /Token inválido|caducado/));
}

// 3. Sin red pero con copia local: se trabaja igual
{
  let offline = true;
  const { doc } = await boot({
    cache: SEED,
    intercept: ({ method }) => {
      if (offline && method === "GET") throw new TypeError("Failed to fetch");
      return null;
    },
  });
  check("sin red se usa la copia local", () =>
    assert.equal(doc.querySelectorAll(".order").length, 25));
  check("sin red se avisa en la barra", () =>
    assert.match(doc.getElementById("savedTag").textContent, /Copia local|conexión/));
  offline = false;
}

// 4. Conflicto 409: se reintenta con el sha nuevo y se guarda
{
  let firstPut = true;
  const { doc, remote, window, settle } = await boot({
    intercept: ({ method }) => {
      if (method === "PUT" && firstPut) { firstPut = false; return httpError(409); }
      return null;
    },
  });
  const id = doc.querySelector(".order").dataset.id;
  await saveNote(doc, window, settle, id, "conflicto");
  check("un conflicto se resuelve solo y el cambio se guarda", () =>
    assert.equal(remote.file.orders.find((o) => o.id === id).note, "conflicto"));
  check("el aviso de conflicto es visible", () =>
    assert.match(doc.getElementById("savedTag").textContent, /conflicto|Guardado|Sincronizado/));
}

// 5. Acentos y emoji sobreviven al viaje base64
{
  const { doc, remote, window, settle } = await boot();
  const id = doc.querySelector(".order").dataset.id;
  await saveNote(doc, window, settle, id, "Riñonera marrón — Íñigo 🧢");
  check("acentos y emoji se guardan intactos", () =>
    assert.equal(remote.file.orders.find((o) => o.id === id).note, "Riñonera marrón — Íñigo 🧢"));
}

// 5b. 404 por falta de permisos: nunca se confunde con "archivo vacío"
{
  const { doc, remote, settle } = await boot({
    intercept: ({ method, url }) =>
      method === "GET" ? httpError(404) : null,
  });
  await settle(80);
  check("un 404 no borra los datos ni crea un archivo vacío", () =>
    assert.equal(remote.puts.length, 0));
  check("un 404 explica que el token no ve el repositorio", () =>
    assert.match(doc.getElementById("gateError").textContent, /no puede acceder a .*pedidos-datos/));
  check("un 404 no deja la página con la lista vacía en silencio", () =>
    assert.equal(doc.getElementById("gate").hidden, false));
}

// 5c. Archivo realmente ausente en un repo accesible: se crea vacío
{
  const { doc, remote, settle } = await boot({
    intercept: ({ method, url }) =>
      method === "GET" && url.includes("/contents/") ? httpError(404) : null,
  });
  await settle(80);
  check("si el repo se ve pero falta el archivo, se crea vacío", () => {
    assert.equal(remote.puts.length, 1);
    assert.equal(doc.getElementById("gate").hidden, true);
  });
}

// 6. JSON corrupto en el repositorio
{
  const { doc } = await boot({
    intercept: ({ method }) =>
      method === "GET"
        ? { ok: true, status: 200, json: async () => ({ content: Buffer.from("{roto", "utf8").toString("base64"), sha: "s" }), text: async () => "" }
        : null,
  });
  check("un datos.json corrupto no rompe la página", () =>
    assert.match(doc.getElementById("gateError").textContent, /no es un JSON válido/));
}

for (const [status, name] of results) console.log(`${status}  ${name}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} pruebas OK`);
process.exit(failed ? 1 : 0);
