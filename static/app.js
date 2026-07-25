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
  roles: null,
  powers: null,
  es: null,
};

const ROLE_LABEL = { pm: "PM", eng: "ENG", design: "DESIGN", qa: "QA",
                     observer: "OBSERVER" };

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
  loadRoles();
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
    $("provider-note").textContent =
      `${d.provider} · ${d.model}` + (d.shared ? " · shared demo key" : "");
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

  es.addEventListener("roles", (e) => {
    const d = JSON.parse(e.data);
    S.roles = d.effective;
    flashSteer(`${d.by} changed the room's role powers`);
    applyMyPowers();
  });

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

const PILL_LABEL = {
  IDLE: "Quiet",
  RUNNING: "Working",
  AWAITING_INPUT: "Needs your answer",
  PROPOSED: "Waiting on the room",
};

function setState(state) {
  S.state = state;

  // The stylesheet keys the composer colour, the caret and the pill animation
  // off this one attribute, so the whole shell shifts together.
  $("app").dataset.state = state;

  const pill = $("state-pill");
  pill.textContent = PILL_LABEL[state] || state;
  pill.className = "pill " + state.toLowerCase();

  const running = state === "RUNNING";
  $("run-btn").classList.toggle("hidden", running);
  $("halt-btn").classList.toggle("hidden", !running);
  $("run-btn").disabled = state !== "IDLE";
  if (S.roles) applyMyPowers();

  const hints = {
    IDLE: "Room's quiet — this becomes the next thing we ask for.",
    RUNNING: "It's working — whatever you type slips in between steps.",
    AWAITING_INPUT: "CoPrompt asked the room something — your message is the answer.",
    PROPOSED: "Changes are waiting for everyone's yes.",
  };
  const placeholders = {
    IDLE: "Say what you want built…",
    RUNNING: "Nudge it while it works…",
    AWAITING_INPUT: "Answer the room…",
    PROPOSED: "Say what you want built…",
  };
  const buttons = { IDLE: "Send", RUNNING: "Nudge", AWAITING_INPUT: "Answer",
                    PROPOSED: "Send" };

  $("composer-hint").textContent = hints[state] || "";
  $("composer-input").placeholder = placeholders[state] || "Type…";
  $("send-btn").textContent = buttons[state] || "Send";
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

  const fromAgent = m.kind === "agent" || m.kind === "question";
  const who = fromAgent ? "CoPrompt" : m.author_name;
  const color = fromAgent ? "#6b8afd" : peerColor(m.author_id, m.author_name);
  const tag = fromAgent ? ""
    : `<span class="role-tag">${ROLE_LABEL[m.role] || m.role || ""}</span>`;

  el.innerHTML =
    `<div class="msg-head">
       <span class="dot" style="background:${color}">${initials(who)}</span>
       <span class="who">${escapeHtml(who)}</span>${tag}
     </div>
     <div class="body">${escapeHtml(m.content)}</div>`;

  const chat = $("chat");
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
}

/* Stable colour per person: the same teammate is the same colour everywhere --
   presence chip, chat avatar, ledger row. */
function peerColor(userId, name) {
  const found = S.participants.find((p) => p.user_id === userId);
  if (found) return found.color;
  const seed = String(name || "?").split("")
    .reduce((a, c) => a + c.charCodeAt(0), 0);
  return ["#7aa2f7", "#e0af68", "#bb9af7", "#7fe0b0", "#ff9d9d", "#9fb4ff"][seed % 6];
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
  const rows = Object.entries(ledger || {});
  if (!rows.length) {
    $("ledger-body").innerHTML = '<span class="muted">Nothing spent yet.</span>';
    return;
  }
  const names = Object.fromEntries(S.participants.map((p) => [p.user_id, p.name]));
  const total = rows.reduce((a, [, v]) => a + v, 0);

  $("ledger-body").innerHTML =
    rows.sort((a, b) => b[1] - a[1]).map(([uid, tokens]) => {
      const name = names[uid] || "left the room";
      return `<div class="ledger-row">
          <span style="display:flex;align-items:center;gap:9px;min-width:0">
            <span class="dot" style="background:${peerColor(uid, name)}">${initials(name)}</span>
            <span>${escapeHtml(name)}</span>
          </span>
          <b>${tokens.toLocaleString()}</b>
        </div>`;
    }).join("") +
    `<div class="ledger-row total"><span>Total so far</span>
       <b>${total.toLocaleString()}</b></div>`;
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
      <button id="approve-btn" ${merged ? "disabled" : ""}>Looks good</button>
      <button id="reject-btn" ${merged ? "disabled" : ""}>Ask for changes</button>
      <button id="pr-btn" disabled>Open the pull request</button>
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
  const chip = (uid, cls, mark) => {
    const name = names[uid] || uid;
    return `<span class="vote-chip ${cls}">
        <span class="dot">${mark}</span>${escapeHtml(name)}</span>`;
  };

  const votes = $("votes");
  if (votes) {
    votes.innerHTML =
      q.approved_by.map((u) => chip(u, "approved", "\u2713")).join("") +
      q.blocked_by.map((u) => chip(u, "blocked", "\u2715")).join("") +
      q.waiting_on.map((u) => chip(u, "waiting", "\u25CB")).join("");
  }
  $("quorum-note").textContent = q.reason || "";

  const btn = $("pr-btn");
  if (btn) {
    const mine = S.roles?.[S.me?.role];
    const mayOpen = mine ? mine.open_pr : true;
    btn.disabled = !q.can_open_pr || !mayOpen || S.proposal?.status === "merged";
    btn.textContent = S.proposal?.status === "merged"
      ? "Pull request opened"
      : "Open the pull request";
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
  btn.textContent = "Opening…";
  const res = await post(`/api/rooms/${S.room}/proposals/${S.proposal.id}/pr`, {});
  if (!res) { btn.disabled = false; btn.textContent = "Open the pull request"; }
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

/* --------------------------------------------------------- role powers --- */

async function loadRoles() {
  const r = await fetch(`/api/rooms/${S.room}/roles`);
  if (!r.ok) return;                       // pdd modules not generated yet
  const d = await r.json();
  S.powers = d.powers;
  S.roles = d.effective;
  S.lenses = d.lenses;
  applyMyPowers();
}

/* Reflect the room's rules in the UI. The server enforces them regardless --
   this only avoids offering a button that would be refused. */
function applyMyPowers() {
  const mine = S.roles?.[S.me?.role];
  if (!mine) return;
  $("run-btn").disabled = !mine.run || S.state !== "IDLE";
  $("halt-btn").disabled = !mine.halt;
  $("intent").readOnly = !mine.edit_intent;
  $("roles-btn").disabled = !mine.edit_intent;
  $("lock-note").textContent = mine.edit_intent ? "" : "read-only for your role";

  const pr = $("pr-btn");
  if (pr && !mine.open_pr) {
    pr.disabled = true;
    pr.title = "Your role cannot open PRs in this room";
  }
  const approve = $("approve-btn");
  if (approve && !mine.vote) {
    approve.disabled = true;
    $("reject-btn").disabled = true;
    approve.title = "Your role has no vote in this room";
  }
}

function renderRolesGrid() {
  const powers = S.powers || [];
  const rows = Object.entries(S.roles || {}).map(([role, p]) => `
    <tr class="${role}">
      <td>${ROLE_LABEL[role] || role}</td>
      ${powers.map((pw) => `<td><input type="checkbox" data-role="${role}"
          data-power="${pw}" ${p[pw] ? "checked" : ""}></td>`).join("")}
      <td><input type="number" data-role="${role}" data-power="priority"
          value="${p.priority}" min="0" max="999"></td>
    </tr>`).join("");

  $("roles-grid").innerHTML = `
    <table>
      <thead><tr><th>role</th>
        ${powers.map((pw) => `<th>${pw.replace("_", " ")}</th>`).join("")}
        <th>priority</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

$("roles-btn").onclick = () => {
  renderRolesGrid();
  $("roles-modal").classList.remove("hidden");
};
$("r-cancel").onclick = () => $("roles-modal").classList.add("hidden");

$("r-save").onclick = async () => {
  const overrides = {};
  $("roles-grid").querySelectorAll("input").forEach((el) => {
    const { role, power } = el.dataset;
    (overrides[role] ||= {})[power] =
      el.type === "checkbox" ? el.checked : Number(el.value);
  });
  const res = await post(`/api/rooms/${S.room}/roles`, { overrides }, "PUT");
  if (!res) return;
  S.roles = res.effective;
  applyMyPowers();
  $("r-status").textContent = "Saved — everyone in the room sees this now.";
  setTimeout(() => $("roles-modal").classList.add("hidden"), 900);
};
