import fs from "node:fs";
import { JSDOM } from "jsdom";

const APP = new URL("..", import.meta.url).pathname;
const SEED = JSON.parse(fs.readFileSync(new URL("fixtures/datos.json", import.meta.url), "utf8"));

export async function boot({ token = "tok_test", seed = SEED, cache = null, intercept = null } = {}) {
  const dom = new JSDOM(fs.readFileSync(`${APP}index.html`, "utf8"), {
    url: "https://diegoandresvega.github.io/pedidos/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;

  const remote = { file: JSON.parse(JSON.stringify(seed)), sha: "sha-0", puts: [] };
  const b64 = (t) => Buffer.from(t, "utf8").toString("base64");

  window.fetch = async (url, options = {}) => {
    const method = options.method || "GET";
    if (intercept) {
      const forced = await intercept({ url: String(url), method, remote });
      if (forced) return forced;
    }
    if (!String(url).includes("api.github.com")) throw new Error("URL inesperada: " + url);
    if (method === "GET") {
      return json200({ content: b64(JSON.stringify(remote.file)), sha: remote.sha });
    }
    const body = JSON.parse(options.body);
    if (body.sha && body.sha !== remote.sha) return jsonErr(409);
    remote.file = JSON.parse(Buffer.from(body.content, "base64").toString("utf8"));
    remote.sha = "sha-" + (remote.puts.length + 1);
    remote.puts.push(body);
    return json200({ content: { sha: remote.sha } });
  };
  const json200 = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => "" });
  const jsonErr = (status) => ({ ok: false, status, json: async () => ({}), text: async () => "conflict" });

  window.confirm = () => true;
  window.HTMLElement.prototype.scrollIntoView = () => {}; // jsdom no lo implementa
  window.URL.createObjectURL = () => "blob:test";
  window.URL.revokeObjectURL = () => {};
  if (token) window.localStorage.setItem("pedidos_gh_token", token);
  if (cache) window.localStorage.setItem("pedidos_cache_v2", JSON.stringify(cache));

  for (const key of ["window", "document", "localStorage", "fetch", "confirm",
                     "Blob", "URL", "Node", "Event", "CustomEvent", "HTMLElement", "getComputedStyle"]) {
    const value = window[key];
    globalThis[key] = typeof value === "function" ? value.bind(window) : value;
  }
  globalThis.addEventListener = window.addEventListener.bind(window);

  delete globalThis.__appLoaded;
  await import(`${APP}js/app.js?v=${Date.now()}`);
  await settle(window, 40);
  return { window, doc: window.document, remote, settle: (n = 40) => settle(window, n) };
}

export const httpError = (status) => ({ ok: false, status, json: async () => ({}), text: async () => "fallo simulado" });
export const netFail = () => { throw new TypeError("Failed to fetch"); };

export function settle(window, ticks = 40) {
  return new Promise((resolve) => {
    let n = 0;
    const step = () => (++n >= ticks ? resolve() : setTimeout(step, 20));
    step();
  });
}
