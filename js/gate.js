/* Pantalla de acceso: pide el token y el repositorio privado de datos. */

import { getRemote, getToken, setRemote, setToken } from "./settings.js";

export function createGate({ onCredentials }) {
  const gate = document.getElementById("gate");
  const form = document.getElementById("gateForm");
  const errorBox = document.getElementById("gateError");
  const submitBtn = document.getElementById("gateSubmit");
  const fields = {
    token: document.getElementById("gateToken"),
    owner: document.getElementById("gateOwner"),
    repo: document.getElementById("gateRepo"),
    path: document.getElementById("gatePath"),
    branch: document.getElementById("gateBranch"),
  };

  function fillFromSettings() {
    const remote = getRemote();
    fields.token.value = getToken();
    fields.owner.value = remote.owner;
    fields.repo.value = remote.repo;
    fields.path.value = remote.path;
    fields.branch.value = remote.branch;
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = !message;
  }

  function open(message = "") {
    fillFromSettings();
    showError(message);
    gate.hidden = false;
    document.body.classList.add("gated");
    fields.token.focus();
  }

  function close() {
    gate.hidden = true;
    document.body.classList.remove("gated");
    showError("");
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showError("");
    submitBtn.disabled = true;
    submitBtn.textContent = "Comprobando…";
    try {
      setRemote({
        owner: fields.owner.value,
        repo: fields.repo.value,
        path: fields.path.value,
        branch: fields.branch.value,
      });
      setToken(fields.token.value);
      await onCredentials();
      close();
    } catch (error) {
      showError(error?.message || "No se pudo entrar.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Entrar";
    }
  });

  return { open, close };
}
