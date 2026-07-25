/* CoPrompt room client.
 *
 * Every client is an equal viewer of one server-produced stream. Nothing here
 * owns the run: the browser renders what the SSE channel says, and the server
 * is the only thing that decides state.
 */

const $ = (id) => document.getElementById(id);

const S = {
  room: null,
  userId: null,
  me: null,
  state: "IDLE",
  participants: [],
  proposal: null,
  es: null,
};

const ROLE_LABEL = { pm: "PM", eng: "ENG", design: "DESIGN", qa: "QA" };

/* ---------------------------------------------------------------- join --- */

function roomFromUrl() {
  const m = location.pathname.match(/^\/r\/([\w-]+)/);
  return m ? m[1] : "";
}

async function join() {
  const room = ($("g-room").value || roomFromUrl() || "demo").trim();
  const name = $("g-name").value.trim();
  const role = $("g-role").value;
  if (!name) return $("g-name").focus();

  const res = await fetch(`/api/rooms/${room}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, role }),
  });
  if (!res.ok) return alert("Could not join: " + (await res.text()));

  const data = await res.json();
  S.room = room;
  S.userId = data.user_id;
  S.me = { name, role, color: data.color };

  history.replaceState({}, "", `/r/${room}`);
  $("gate").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("room-label").textContent = room;

  applySnapshot(data.room);
  connect();
  loadProviders();
}

/* ------------------------------------------------------------- snapshot --- */

function applySnapshot(snap) {
  setState(snap.state);
  S.participants = snap.participants;
  renderPeers();
  if (document.activeElement !== $("intent")) $("intent").value = snap.intent || "";
  $("chat").innerHTML = "";
  (snap.messages || []).forEach(addMessage);
  renderLedger(snap.ledger || {});
  if (snap.proposal) renderProposal(snap.proposal);
}

/* ------------------------------------------------------------------ SSE --- */

function connect() {
  if (S.es) S.es.close();
  const es = new EventSource(`/api/rooms/${S.room}/events`);
  S.es = es;

  es.addEventListener("presence", (e) => {
    S.participants = JSON.parse(e.data).participants;
    renderPeers();
    if (S.proposal) refreshQuorum();
  });

  es.addEventListener("state", (e) => setState(JSON.parse(e.data).state));
  es.addEventListener("message", (e) => addMessage(JSON.parse(e.data)));

  es.addEventListener("intent", (e) => {
    const d = JSON.parse(e.data);
    if (d.by !== S.userId && document.activeElement !== $("intent")) {
      $("intent").value = d.intent;
    }
  });

  es.addEventListener("run_started", (e) => {
    const d = JSON.parse(e.data);
    $("stream").textContent = "";
    $("steps").innerHTML = "";
    pushStep(`run started by ${d.by}`);
  });

  es.addEventListener("provider", (e) => {
    const d = JSON.parse(e.data);
    $("provider-note").textContent = `${d.provider} · ${d.model}`;
  });

  es.addEventListener("step", (e) => {
    const d = JSON.parse(e.data);
    pushStep(`step ${d.step + 1} — ${d.label}`);
  });

  es.addEventListener("tool", (e) => {
    pushStep(`↳ ${JSON.parse(e.data).name}`, "tool");
  });

  es.addEventListener("token", (e) => {
    const el = $("stream");
    el.textContent += JSON.parse(e.data).chunk;
    el.scrollTop = el.scrollHeight;
  });

  es.addEventListener("steer_queued", (e) => {
    const d = JSON.parse(e.data);
    flashSteer(`${d.author} (${ROLE_LABEL[d.role]}) queued a ${d.kind}: ${d.content}`);
  });

  es.addEventListener("steer_applied", (e) => {
    const d = JSON.parse(e.data);
    const who = d.steers.map((s) => `${s.author} (${ROLE_LABEL[s.role]})`).join(", ");
    flashSteer(`⚡ STEER APPLIED — ${who}`);
    d.steers.forEach((s) => pushStep(`⚡ steer from ${s.author}: ${s.content}`, "tool"));
  });

  es.addEventListener("halted", (e) => {
    pushStep(`■ halted by ${JSON.parse(e.data).by}`, "tool");
  });

  es.addEventListener("question", (e) => {
    const d = JSON.parse(e.data);
    flashSteer(`🙋 CoPrompt is asking the room: ${d.question}`);
    $("composer-input").focus();
  });

  es.addEventListener("proposal", (e) => {
    renderProposal(JSON.parse(e.data));
  });

  es.addEventListener("vote", (e) => {
    const d = JSON.parse(e.data);
    if (S.proposal) S.proposal.votes.push({ user_id: d.by, verdict: d.verdict });
    renderQuorum(d.quorum);
  });

  es.addEventListener("pr_opened", (e) => {
    const d = JSON.parse(e.data);
    if (S.proposal) { S.proposal.status = "merged"; S.proposal.pr_url = d.pr_url; }
    renderProposal(S.proposal);
  });

  es.addEventListener("ledger", (e) => renderLedger(JSON.parse(e.data).ledger));

  es.addEventListener("ledger_unavailable", (e) => {
    $("ledger-body").innerHTML =
      `<span class="muted">${JSON.parse(e.data).message}</span>`;
  });

  es.addEventListener("decision", (e) => {
    pushStep(`✎ decision recorded: ${JSON.parse(e.data).decision}`, "tool");
  });

  es.addEventListener("done", (e) => {
    const d = JSON.parse(e.data);
    pushStep(`✓ ${d.status} — ${d.input_tokens + d.output_tokens} tokens`);
  });

  es.addEventListener("error", (e) => {
    try { flashSteer("⚠ " + JSON.parse(e.data).message); } catch { /* reconnect */ }
  });
}

/* -------------------------------------------------------------- render --- */

function setState(state) {
  S.state = state;
  const pill = $("state-pill");
  pill.textContent = state;
  pill.className = "pill " + state.toLowerCase();

  const running = state === "RUNNING";
  $("run-btn").classList.toggle("hidden", running);
  $("halt-btn").classList.toggle("hidden", !running);
  $("run-btn").disabled = state !== "IDLE";

  const hints = {
    IDLE: "Room is idle — this starts the next run's prompt.",
    RUNNING: "Run in progress — what you type queues as a steer and lands between steps.",
    AWAITING_INPUT: "CoPrompt asked the room a question — your message answers it.",
    PROPOSED: "A proposal is waiting on the room's approval.",
  };
  $("composer-hint").textContent = hints[state] || "";
  $("composer-input").placeholder =
    running ? "Steer the run…" : state === "AWAITING_INPUT" ? "Answer the room…" : "Type to prompt…";
}

function renderPeers() {
  $("peers").innerHTML = S.participants.map((p) => `
    <span class="peer">
      <span class="dot" style="background:${p.color}">${initials(p.name)}</span>
      ${escapeHtml(p.name)}<span class="role">${ROLE_LABEL[p.role] || p.role}</span>
      ${p.has_key ? '<span class="key-on" title="key loaded">●</span>' : ""}
    </span>`).join("");
}

function addMessage(m) {
  const el = document.createElement("div");
  el.className = "msg " + m.kind;
  if (m.kind === "system") {
    el.innerHTML = `<div class="body">${escapeHtml(m.content)}</div>`;
  } else {
    const who = m.kind === "agent" || m.kind === "question" ? "CoPrompt" : m.author_name;
    const tag = m.kind === "agent" || m.kind === "question"
      ? "" : `<span class="role-tag">${ROLE_LABEL[m.role] || m.role}</span>`;
    el.innerHTML =
      `<div class="who">${escapeHtml(who)}${tag}</div>
       <div class="body">${escapeHtml(m.content)}</div>`;
  }
  const chat = $("chat");
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
}

function pushStep(text, cls = "") {
  const el = document.createElement("div");
  el.className = "step " + cls;
  el.textContent = text;
  $("steps").appendChild(el);
  $("steps").scrollTop = $("steps").scrollHeight;
}

let flashTimer;
function flashSteer(text) {
  const el = $("steer-flash");
  el.innerHTML = `<b>${escapeHtml(text)}</b>`;
  el.classList.remove("hidden");
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.classList.add("hidden"), 9000);
}

function renderLedger(ledger) {
  const names = Object.fromEntries(S.participants.map((p) => [p.user_id, p.name]));
  const rows = Object.entries(ledger || {});
  if (!rows.length) {
    $("ledger-body").innerHTML = '<span class="muted">No runs yet.</span>';
    return;
  }
  const total = rows.reduce((a, [, v]) => a + v, 0);
  $("ledger-body").innerHTML =
    rows.sort((a, b) => b[1] - a[1]).map(([uid, tokens]) =>
      `<div class="ledger-row"><span>${escapeHtml(names[uid] || uid)}</span>
       <b>${tokens.toLocaleString()}</b></div>`).join("") +
    `<div class="ledger-row" style="border-top:1px solid var(--line);margin-top:6px;padding-top:6px">
       <span class="muted">total</span><b>${total.toLocaleString()}</b></div>`;
}

function renderProposal(p) {
  if (!p) return;
  S.proposal = p;

  const diffs = p.files.map((f) => `
    <div class="file-diff">
      <div class="path">${escapeHtml(f.path)}</div>
      <pre>${colorDiff(f.diff || f.new_content)}</pre>
    </div>`).join("");

  const merged = p.status === "merged";
  $("proposal").innerHTML = `
    <h3>${escapeHtml(p.title)}</h3>
    <div class="rationale">${escapeHtml(p.rationale || "")}</div>
    ${diffs}
    <div id="votes" class="votes"></div>
    <div class="proposal-actions">
      <button id="approve-btn" class="primary" ${merged ? "disabled" : ""}>✓ Approve</button>
      <button id="reject-btn" class="ghost" ${merged ? "disabled" : ""}>✕ Request changes</button>
      <button id="pr-btn" class="primary" disabled>Open PR</button>
    </div>
    ${p.pr_url ? `<a class="pr-link" href="${p.pr_url}" target="_blank" rel="noopener">→ ${escapeHtml(p.pr_url)}</a>` : ""}
  `;

  $("approve-btn").onclick = () => vote("approve");
  $("reject-btn").onclick = () => vote("request_changes");
  $("pr-btn").onclick = openPr;
  refreshQuorum();
}

function renderQuorum(q) {
  const names = Object.fromEntries(S.participants.map((p) => [p.user_id, p.name]));
  const chip = (uid, cls, mark) =>
    `<span class="vote-chip ${cls}">${mark} ${escapeHtml(names[uid] || uid)}</span>`;

  const votes = $("votes");
  if (votes) {
    votes.innerHTML =
      q.approved_by.map((u) => chip(u, "approved", "✓")).join("") +
      q.blocked_by.map((u) => chip(u, "blocked", "✕")).join("") +
      q.waiting_on.map((u) => chip(u, "waiting", "○")).join("");
  }
  $("quorum-note").textContent = q.reason || "";
  const btn = $("pr-btn");
  if (btn) {
    btn.disabled = !q.can_open_pr || S.proposal?.status === "merged";
    btn.textContent = q.can_open_pr ? "🚀 Open PR" : "Open PR";
  }
}

async function refreshQuorum() {
  if (!S.proposal) return;
  const r = await fetch(`/api/rooms/${S.room}/proposals/${S.proposal.id}/quorum`);
  if (r.ok) renderQuorum(await r.json());
}

/* -------------------------------------------------------------- actions --- */

async function post(path, body, method = "POST") {
  const r = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: S.userId, ...body }),
  });
  if (!r.ok) {
    let msg = await r.text();
    try { msg = JSON.stringify(JSON.parse(msg).detail); } catch { /* raw */ }
    flashSteer("⚠ " + msg);
    return null;
  }
  return r.json();
}

const send = () => {
  const input = $("composer-input");
  const content = input.value.trim();
  if (!content) return;
  input.value = "";
  post(`/api/rooms/${S.room}/message`, { content });
};

const vote = (verdict) =>
  post(`/api/rooms/${S.room}/proposals/${S.proposal.id}/vote`, { verdict });

const openPr = async () => {
  const btn = $("pr-btn");
  btn.disabled = true;
  btn.textContent = "opening…";
  const res = await post(`/api/rooms/${S.room}/proposals/${S.proposal.id}/pr`, {});
  if (!res) { btn.disabled = false; btn.textContent = "🚀 Open PR"; }
};

let intentTimer;
$("intent").addEventListener("input", () => {
  clearTimeout(intentTimer);
  intentTimer = setTimeout(() => {
    post(`/api/rooms/${S.room}/intent`, { intent: $("intent").value }, "PUT");
  }, 400);
});

/* ----------------------------------------------------------- byo keys --- */

async function loadProviders() {
  const r = await fetch("/api/providers");
  if (!r.ok) return;
  const { providers } = await r.json();
  $("k-provider").innerHTML = providers
    .map((p) => `<option value="${p.id}">${p.label} — ${p.key_hint}</option>`)
    .join("");
}

$("key-btn").onclick = () => $("key-modal").classList.remove("hidden");
$("k-cancel").onclick = () => $("key-modal").classList.add("hidden");

$("k-save").onclick = async () => {
  const key = $("k-key").value.trim();
  if (!key) return;
  const r = await fetch(`/api/rooms/${S.room}/key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: S.userId, key, provider: $("k-provider").value }),
  });
  if (!r.ok) return ($("k-status").textContent = "Rejected: " + (await r.text()));
  const { fingerprint } = await r.json();
  $("k-key").value = "";
  $("k-status").textContent = `Loaded ${fingerprint} — memory only, never stored.`;
  setTimeout(() => $("key-modal").classList.add("hidden"), 1200);
};

/* ---------------------------------------------------------------- wire --- */

$("g-join").onclick = join;
$("g-room").value = roomFromUrl();
["g-name", "g-room"].forEach((id) =>
  $(id).addEventListener("keydown", (e) => e.key === "Enter" && join()));

$("send-btn").onclick = send;
$("composer-input").addEventListener("keydown", (e) => e.key === "Enter" && send());
$("run-btn").onclick = () => post(`/api/rooms/${S.room}/run`, {});
$("halt-btn").onclick = () => post(`/api/rooms/${S.room}/halt`, {});

/* --------------------------------------------------------------- utils --- */

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function colorDiff(text) {
  return String(text ?? "").split("\n").map((line) => {
    const safe = escapeHtml(line);
    if (line.startsWith("+") && !line.startsWith("+++")) return `<span class="add">${safe}</span>`;
    if (line.startsWith("-") && !line.startsWith("---")) return `<span class="del">${safe}</span>`;
    return safe;
  }).join("\n");
}

function initials(name) {
  return String(name).trim().slice(0, 2).toUpperCase();
}
