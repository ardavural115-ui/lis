// Chat-Widget für Kunden. Kundentexte immer mit textContent einfügen, nie mit innerHTML.

const tenantId = new URLSearchParams(location.search).get("tenant") || "praxis-demo";
const api = `/api/tenants/${encodeURIComponent(tenantId)}`;

const list = document.getElementById("messages");
const form = document.getElementById("composer");
const input = document.getElementById("text");
const quick = document.getElementById("quick");

const session = loadSession();
let greeting = "";
let shown = -1;
let busy = false;

for (const link of document.querySelectorAll(".demo-switch a")) {
  if (link.getAttribute("href") === `?tenant=${tenantId}`) link.setAttribute("aria-current", "page");
}

/** Eine zufällige Sitzungs-ID pro Betrieb und Browser, damit Antworten des Teams ankommen. */
function loadSession() {
  const key = `lis-sitzung-${tenantId}`;
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(key, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

function bubble(from, text) {
  const item = document.createElement("li");
  item.className = `msg ${from}`;
  if (from === "team") {
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = "Team";
    item.append(who);
  }
  const body = document.createElement("p");
  body.textContent = text;
  item.append(body);
  list.append(item);
  item.scrollIntoView({ block: "end" });
}

/** Verlauf vom Server anzeigen; ohne force nur, wenn sich etwas geändert hat. */
async function render(force = false) {
  const res = await fetch(`${api}/chat/${session}`);
  if (!res.ok) return;
  const { messages } = await res.json();
  if (!force && messages.length === shown) return;
  list.replaceChildren();
  bubble("bot", greeting);
  for (const m of messages) bubble(m.from, m.text);
  shown = messages.length;
  quick.hidden = messages.length > 0;
}

async function send(text) {
  text = text.trim();
  if (!text || busy) return;
  busy = true;
  input.value = "";
  bubble("customer", text);
  try {
    const res = await fetch(`${api}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session, text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      bubble("bot", data.error || "Die Nachricht konnte nicht gesendet werden.");
      return;
    }
    await render(true);
    // Antworten ohne Vorgang (z. B. nach „Daten löschen“) stehen nicht im Verlauf
    if (!data.caseId) for (const reply of data.replies) bubble("bot", reply);
  } catch {
    bubble("bot", "Keine Verbindung. Bitte versuchen Sie es gleich noch einmal.");
  } finally {
    busy = false;
    input.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  send(input.value);
});

async function start() {
  const res = await fetch(api);
  if (!res.ok) {
    bubble("bot", "Dieser Betrieb wurde nicht gefunden.");
    form.hidden = true;
    return;
  }
  const info = await res.json();
  document.title = `Chat – ${info.name}`;
  document.getElementById("tenant-name").textContent = info.name;
  document.getElementById("ai-hint").textContent =
    `Sie schreiben mit einem KI-Assistenten. Nachrichten werden nach ${info.retentionDays} Tagen gelöscht, mit „Daten löschen“ sofort.`;
  greeting = info.greeting;
  for (const label of info.quickReplies) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => send(label));
    quick.append(button);
  }
  await render(true);
  // Antworten des Teams abholen
  setInterval(() => {
    if (!busy && !document.hidden) render().catch(() => {});
  }, 5000);
}

start().catch(() => bubble("bot", "Keine Verbindung. Bitte laden Sie die Seite neu."));
