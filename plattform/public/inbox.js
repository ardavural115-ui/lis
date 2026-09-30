// Team-Inbox: Vorgänge sehen, antworten, erledigen. Kundentexte immer mit textContent einfügen.

const STATUS = { bot: "Bot fragt nach", team: "Beim Team", done: "Erledigt" };
const ORDER = { team: 0, bot: 1, done: 2 };
const WHO = { customer: "Kunde", bot: "Assistent", team: "Team" };

const loginForm = document.getElementById("login");
const tenantInput = document.getElementById("tenant");
const tokenInput = document.getElementById("token");
const inbox = document.getElementById("inbox");
const caseList = document.getElementById("cases");
const detail = document.getElementById("detail");
const errorBox = document.getElementById("error");

let auth = null;
let selected = null;
let timer = null;

tenantInput.value = new URLSearchParams(location.search).get("tenant") || sessionStorage.getItem("lis-inbox-betrieb") || "";

function el(tag, className = "", text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function time(iso) {
  return new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

async function api(path, options = {}) {
  const res = await fetch(`/api/tenants/${encodeURIComponent(auth.tenant)}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
  return data;
}

function showError(message) {
  errorBox.textContent = message;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  auth = { tenant: tenantInput.value.trim(), token: tokenInput.value.trim() };
  try {
    await loadCases();
    sessionStorage.setItem("lis-inbox-betrieb", auth.tenant);
    inbox.hidden = false;
    showError("");
    clearInterval(timer);
    timer = setInterval(() => {
      if (!document.hidden) loadCases().catch((err) => showError(err.message));
    }, 10000);
  } catch (err) {
    inbox.hidden = true;
    showError(err.message);
  }
});

async function loadCases() {
  const { cases } = await api("/cases");
  // Erst was beim Team liegt, darin Dringendes zuerst, dann das Neueste
  const urgent = (c) => (c.priority === "high" ? 0 : 1);
  cases.sort((a, b) => ORDER[a.status] - ORDER[b.status] || urgent(a) - urgent(b) || b.updatedAt.localeCompare(a.updatedAt));
  caseList.replaceChildren(...cases.map(caseItem));
  if (cases.length === 0) caseList.append(el("li", "empty", "Noch keine Vorgänge. Schreiben Sie im Chat eine Nachricht."));
  // Nicht neu zeichnen, während jemand eine Antwort tippt
  if (selected && document.activeElement?.tagName !== "TEXTAREA") await showCase(selected);
}

function badges(c) {
  const wrap = el("span", "badges");
  wrap.append(el("span", `badge ${c.status}`, STATUS[c.status]));
  if (c.priority === "high") wrap.append(el("span", "badge high", "Dringend"));
  for (const tag of c.tags) wrap.append(el("span", "badge", tag));
  if (c.team) wrap.append(el("span", "badge", c.team));
  return wrap;
}

function caseItem(c) {
  const item = el("li");
  const button = el("button", c.id === selected ? "case active" : "case");
  button.type = "button";
  button.dataset.id = c.id;
  button.append(badges(c), el("strong", "", c.title), el("span", "meta", `${c.name ?? "Name noch offen"} · ${time(c.updatedAt)}`));
  if (c.summary) button.append(el("span", "summary", c.summary));
  button.addEventListener("click", () => showCase(c.id).catch((err) => showError(err.message)));
  item.append(button);
  return item;
}

async function showCase(id) {
  selected = id;
  for (const button of caseList.querySelectorAll(".case")) button.classList.toggle("active", button.dataset.id === id);
  const { case: c } = await api(`/cases/${encodeURIComponent(id)}`);
  const draft = detail.querySelector("textarea")?.value ?? "";

  detail.replaceChildren(el("h2", "", c.title), badges(c));
  if (c.summary) detail.append(el("p", "summary", c.summary));

  const entries = Object.entries(c.data).filter(([, value]) => value);
  if (entries.length > 0) {
    const list = el("dl", "data");
    for (const [key, value] of entries) list.append(el("dt", "", c.labels[key] ?? key), el("dd", "", value));
    detail.append(list);
  }

  const log = el("ol", "messages");
  for (const m of c.messages) {
    const item = el("li", `msg ${m.from}`);
    item.append(el("span", "who", WHO[m.from]), el("p", "", m.text), el("time", "", time(m.at)));
    log.append(item);
  }
  detail.append(log);
  if (c.status !== "done") detail.append(replyForm(c, draft));
}

function replyForm(c, draft) {
  const form = el("form", "reply");
  const text = el("textarea");
  text.placeholder = "Antwort an den Kunden …";
  text.maxLength = 2000;
  text.required = true;
  text.value = draft;
  const send = el("button", "", "Antworten");
  send.type = "submit";
  const close = el("button", "secondary", "Erledigt");
  close.type = "button";
  const actions = el("div", "actions");
  actions.append(send, close);
  form.append(text, actions);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api(`/cases/${encodeURIComponent(c.id)}/reply`, { method: "POST", body: JSON.stringify({ text: text.value }) });
      text.value = "";
      text.blur();
      await loadCases();
    } catch (err) {
      showError(err.message);
    }
  });
  close.addEventListener("click", async () => {
    try {
      await api(`/cases/${encodeURIComponent(c.id)}/close`, { method: "POST", body: "{}" });
      text.value = "";
      await loadCases();
    } catch (err) {
      showError(err.message);
    }
  });
  return form;
}
