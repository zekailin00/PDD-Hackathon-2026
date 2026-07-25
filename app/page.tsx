"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Avatar, Badge, Box, Button, Card, Flex, Heading, Select, Separator, Tabs, Text, TextArea, TextField, Theme,
} from "@radix-ui/themes";
import type { Artifact, Room, RoomEvent, RoomProgress } from "@/lib/domain";
import type { Difficulty } from "@/pdd/model-router";
import type { Role } from "@/pdd/role-policy";

const identityKey = "coprompt:identity";
const tokenRouterKey = "coprompt:tokenrouter-key";
const newId = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues !== "function") return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};
const roleColor: Record<Role, "indigo" | "orange" | "pink" | "green" | "gray"> = {
  pm: "indigo", eng: "orange", design: "pink", qa: "green", observer: "gray",
};

type Identity = { userId: string; name: string; role: Role };

export default function Home() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [token, setToken] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("pm");
  const [title, setTitle] = useState("Collaborative product room");
  const [roomCode, setRoomCode] = useState("");
  const [intentDraft, setIntentDraft] = useState("");
  const [prompt, setPrompt] = useState("");
  const [steer, setSteer] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("standard");
  const [liveOutput, setLiveOutput] = useState("");
  const [progress, setProgress] = useState<RoomProgress | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const lastRoomId = useRef("");

  useEffect(() => {
    const stored = localStorage.getItem(identityKey);
    if (stored) {
      const parsed = JSON.parse(stored) as Identity;
      setName(parsed.name); setRole(parsed.role);
    }
    const storedKey = localStorage.getItem(tokenRouterKey) || "";
    setApiKey(storedKey); setApiKeyDraft(storedKey);
    setRoomCode(new URLSearchParams(window.location.search).get("room") || "");
  }, []);

  useEffect(() => {
    if (!room || room.id === lastRoomId.current) return;
    lastRoomId.current = room.id;
    const events = new EventSource(`/api/rooms/${room.id}/events`);
    events.onmessage = (event) => {
      const value = JSON.parse(event.data) as RoomEvent;
      if (value.type === "snapshot") {
        setRoom(value.room);
        setIntentDraft(value.room.intent);
      } else if (value.type === "token") {
        setLiveOutput((current) => current + value.chunk);
      } else if (value.type === "progress") {
        setProgress(value.progress.phase === "done" ? null : value.progress);
      } else if (value.type === "step") {
        setNotice(`Step ${value.step}: ${value.label}`);
      } else if (value.type === "steer_applied") {
        setNotice(`⚡ 已套用 ${value.steers.length} 則導引`);
      } else if (value.type === "halted") {
        setProgress(null);
        setNotice(`${value.by} 已中止執行`);
      } else if (value.type === "done") {
        setProgress(null);
      } else if (value.type === "error") {
        setProgress(null);
        setNotice(value.message);
      }
    };
    return () => { events.close(); lastRoomId.current = ""; };
  }, [room?.id]);

  const join = async () => {
    const nextIdentity = { userId: identity?.userId || newId(), name: name.trim() || "Anonymous", role };
    const response = await fetch("/api/rooms", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: roomCode || undefined, title, ...nextIdentity }),
    });
    const data = await response.json();
    if (!response.ok) return setNotice(data.error);
    localStorage.setItem(identityKey, JSON.stringify(nextIdentity));
    const resolvedIdentity = data.identity as Identity;
    localStorage.setItem(identityKey, JSON.stringify(resolvedIdentity));
    setIdentity(resolvedIdentity); setToken(data.token); setRoom(data.room); setIntentDraft(data.room.intent);
    window.history.replaceState({}, "", `?room=${data.room.id}`);
  };

  const authorized = (body?: unknown) => ({
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const saveIntent = async () => {
    if (!room) return;
    const response = await fetch(`/api/rooms/${room.id}`, {
      method: "PATCH", headers: authorized().headers, body: JSON.stringify({ intent: intentDraft }),
    });
    const data = await response.json();
    setNotice(response.ok ? "共同意圖已同步" : data.error);
  };

  const run = async () => {
    if (!room || !prompt.trim()) return;
    setBusy(true); setLiveOutput(""); setProgress(null); setNotice("正在啟動 TokenRouter auto…");
    try {
      if (!apiKey) { setNotice("Add a TokenRouter API key before running the agent."); return; }
      const response = await fetch("/api/agent", authorized({ roomId: room.id, prompt, difficulty, apiKey }));
      const data = await response.text();
      if (!response.ok) {
        const parsed = JSON.parse(data);
        setNotice(parsed.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const sendSteer = async (kind: "nudge" | "halt") => {
    const runId = [...(room?.runs || [])].reverse().find((item) => item.status === "running")?.id;
    if (!room || !runId) return setNotice("目前沒有執行中的 run");
    const response = await fetch(`/api/rooms/${room.id}/steers`, authorized({ runId, kind, content: steer }));
    const data = await response.json();
    setNotice(response.ok ? `${kind.toUpperCase()} 已排入下一個檢查點` : data.error);
    if (response.ok) setSteer("");
  };

  const sendMessage = async () => {
    if (!room || !chatDraft.trim()) return;
    const response = await fetch(`/api/rooms/${room.id}/messages`, authorized({
      content: chatDraft,
      replyTo: replyTo || undefined,
      kind: room.state === "AWAITING_INPUT" ? "answer" : "prompt",
    }));
    const data = await response.json();
    setNotice(response.ok ? "訊息已同步" : data.error);
    if (response.ok) { setChatDraft(""); setReplyTo(""); }
  };

  const vote = async (verdict: "approve" | "request_changes") => {
    const runId = [...(room?.runs || [])].reverse().find((item) => item.status === "proposed")?.id;
    if (!room || !runId) return setNotice("目前沒有待審提案");
    const response = await fetch(`/api/rooms/${room.id}/votes`, authorized({ runId, verdict }));
    const data = await response.json();
    setNotice(response.ok ? data.quorum.reason : data.error);
  };

  const exportIssue = async () => {
    if (!room) return;
    const response = await fetch(`/api/rooms/${room.id}/export`, authorized({}));
    const data = await response.json();
    if (response.ok) window.open(data.url, "_blank", "noopener,noreferrer");
    else setNotice(data.error);
  };
  const saveApiKey = () => {
    const value = apiKeyDraft.trim();
    if (!value) return setNotice("Enter a TokenRouter API key first.");
    localStorage.setItem(tokenRouterKey, value);
    setApiKey(value); setNotice("TokenRouter key saved in this browser only.");
  };
  const leaveRoom = async () => {
    if (!room || !token) return;
    const presenceStamp = room.participants.find((person) => person.userId === identity?.userId)?.lastSeenAt;
    await fetch(`/api/rooms/${room.id}/leave`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ presenceStamp }) }).catch(() => undefined);
    setRoom(null); setToken(""); setProgress(null); setLiveOutput("");
    window.history.replaceState({}, "", window.location.pathname);
  };

  useEffect(() => {
    if (!room || !token) return;
    const presenceStamp = room.participants.find((person) => person.userId === identity?.userId)?.lastSeenAt;
    const leaveOnClose = () => {
      navigator.sendBeacon(`/api/rooms/${room.id}/leave`, new Blob([JSON.stringify({ token, presenceStamp })], { type: "application/json" }));
    };
    window.addEventListener("pagehide", leaveOnClose);
    return () => window.removeEventListener("pagehide", leaveOnClose);
  }, [room?.id, token]);
  const copyRoomCode = async () => {
    if (!room) return;
    await navigator.clipboard.writeText(room.id).catch(() => undefined);
  };

  return <Theme appearance="dark" accentColor="indigo" grayColor="slate" radius="large">
    {!room || !identity ? <Welcome {...{ name, setName, role, setRole, title, setTitle, roomCode, setRoomCode, join, notice }} /> :
      <main className="app-shell">
        <header className="topbar">
          <Flex align="center" gap="3"><Box className="brand-mark">⌘</Box><Heading size="3">co-prompt</Heading><Badge color="indigo">PDD multiplayer</Badge></Flex>
          <Flex align="center" gap="2"><Badge color={room.state === "RUNNING" ? "amber" : room.state === "PROPOSED" ? "violet" : "green"}>{room.state}</Badge><Text size="2">{room.title}</Text></Flex>
          <Flex justify="end" align="center" gap="2"><Button size="1" variant="soft" onClick={() => void copyRoomCode()}>Room {room.id}</Button>{room.participants.slice(0, 5).map((person) => <Avatar key={person.userId} fallback={person.name.slice(0, 2).toUpperCase()} color={roleColor[person.role]} size="2" title={`${person.name} · ${person.role}`} />)}<Badge color={roleColor[identity.role]}>{identity.role.toUpperCase()}</Badge><Button size="1" color="red" variant="soft" onClick={() => void leaveRoom()}>Leave</Button></Flex>
        </header>

        <section className="ensemble-grid">
          <section className="intent-panel">
            <Flex justify="between" align="center"><Box><Text size="1" color="gray" weight="bold">PROMPT CAPITAL</Text><Heading size="4">共同意圖文件</Heading></Box><Button size="1" variant="soft" onClick={saveIntent} disabled={room.state === "RUNNING"}>同步</Button></Flex>
            <TextArea className="intent-editor" value={intentDraft} onChange={(event) => setIntentDraft(event.target.value)} disabled={room.state === "RUNNING"} />
            <Separator size="4" />
            <Text size="1" color="gray" weight="bold">ROOM CHAT</Text>
            <Box className="room-messages">{room.messages.slice(-12).map((message) => {
              const parent = message.replyTo ? room.messages.find((item) => item.id === message.replyTo) : undefined;
              return <Box key={message.id} className={`room-message${parent ? " is-reply" : ""}${message.role === "agent" ? " by-agent" : ""}`}>
                <Flex justify="between" align="center">
                  <Text size="1" weight="bold">{message.authorName} · {message.role.toUpperCase()}</Text>
                  <Button size="1" variant="ghost" onClick={() => setReplyTo(message.id)}>回覆</Button>
                </Flex>
                {parent && <Box className="thread-quote">↳ 回覆 {parent.authorName}：{parent.content.slice(0, 70)}{parent.content.length > 70 ? "…" : ""}</Box>}
                <Text as="p" size="2">{message.content}</Text>
              </Box>;
            })}</Box>
            <Box className="chat-compose">{replyTo && <Flex justify="between" align="center"><Text size="1" color="gray">回覆 {room.messages.find((item) => item.id === replyTo)?.authorName || "訊息"}（agent 會以你的回覆為準）</Text><Button size="1" variant="ghost" onClick={() => setReplyTo("")}>取消</Button></Flex>}<TextArea value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} placeholder="房間訊息…" /><Button size="1" variant="soft" onClick={sendMessage} disabled={!chatDraft.trim()}>送出</Button></Box>
          </section>

          <section className="run-panel">
            <Flex justify="between" align="center"><Box><Text size="1" color="gray" weight="bold">SHARED AGENT</Text><Heading size="4">即時執行</Heading></Box><Badge color="cyan">TokenRouter auto</Badge></Flex>
            {notice && <Card className="notice"><Text size="2">{notice}</Text></Card>}
            {progress && <ProgressPanel progress={progress} meId={identity.userId} />}
            <Box className="stream-output"><pre>{liveOutput || latestOutput(room) || "共同意圖準備好後，任何有權限的角色都能啟動 agent。"}</pre></Box>
            {!apiKey ? <Card className="run-box"><Text size="2" weight="bold">Connect TokenRouter</Text><Text size="1" color="gray">Your key stays in this browser and is sent only when you run the agent.</Text><TextField.Root type="password" value={apiKeyDraft} onChange={(event) => setApiKeyDraft(event.target.value)} placeholder="tr_..." /><Button size="2" onClick={saveApiKey} disabled={!apiKeyDraft.trim()}>Save API key</Button></Card> : room.state === "RUNNING" ? <Card className="steer-box">
              <Text size="2" weight="bold">Steering Queue</Text>
              <TextArea value={steer} onChange={(event) => setSteer(event.target.value)} placeholder="下一個步驟前要修正什麼？" />
              <Flex gap="2"><Button size="2" onClick={() => sendSteer("nudge")} disabled={!steer.trim()}>⚡ Nudge</Button><Button size="2" color="red" variant="soft" onClick={() => sendSteer("halt")}>Halt</Button></Flex>
            </Card> : <Card className="run-box">
              <TextArea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="告訴共享 agent 這一輪要完成什麼…" />
              <Flex justify="between" align="center"><Select.Root value={difficulty} onValueChange={(value) => setDifficulty(value as Difficulty)}><Select.Trigger /><Select.Content><Select.Item value="cheap">Fast / cheap</Select.Item><Select.Item value="standard">Balanced</Select.Item><Select.Item value="hard">Hard task</Select.Item></Select.Content></Select.Root><Button onClick={run} disabled={busy || !prompt.trim()}>{busy ? "Running…" : "▶ Run"}</Button></Flex>
            </Card>}
          </section>

          <ArtifactPanel room={room} onVote={vote} onExport={exportIssue} />
        </section>
      </main>}
  </Theme>;
}

const PHASE_LABEL: Record<RoomProgress["phase"], string> = {
  reading: "讀取房間",
  planning: "擬定計畫",
  building: "產出內容",
  reviewing: "檢查驗收",
  done: "完成",
};

/**
 * In a shared session the useful question is not only "how far along is it"
 * but "has it heard me yet". Both are answered here so nobody has to guess
 * from a moving token stream.
 */
function ProgressPanel({ progress, meId }: { progress: RoomProgress; meId: string }) {
  const chip = (person: { userId: string; name: string; role: string }, got: boolean) =>
    <span key={person.userId} className={`pickup-chip ${got ? "got" : "pending"}`}>
      <span className="dot">{person.name.slice(0, 2).toUpperCase()}</span>
      {person.userId === meId ? `${person.name}（你）` : person.name}
    </span>;

  return <Card className="progress-card">
    <Box className="progress-head">
      <span className="progress-phase">{PHASE_LABEL[progress.phase]}</span>
      <span className="progress-count">
        {progress.phase === "done" ? "DONE" : `STEP ${progress.step}/${progress.totalSteps}`} · {progress.percent}%
      </span>
    </Box>
    <Box className="progress-track">
      <Box className="progress-fill" style={{ width: `${progress.percent}%` }} />
    </Box>
    <Box className="progress-label">{progress.label}</Box>

    <Box className="pickup-rows">
      <Box className="pickup-row">
        <span className="pickup-tag got">已讀取</span>
        {progress.pickedUp.length
          ? progress.pickedUp.map((person) => chip(person, true))
          : <span className="pickup-none">尚未讀取任何人的訊息</span>}
      </Box>
      <Box className="pickup-row">
        <span className="pickup-tag pending">未讀取</span>
        {progress.waiting.length
          ? progress.waiting.map((person) => chip(person, false))
          : <span className="pickup-none">全部都收到了</span>}
      </Box>
    </Box>
  </Card>;
}

function latestOutput(room: Room) {
  return [...room.runs].reverse().find((run) => run.output)?.output || "";
}

function ArtifactPanel({ room, onVote, onExport }: { room: Room; onVote: (vote: "approve" | "request_changes") => void; onExport: () => void }) {
  const latest = (kind: Artifact["kind"]) => [...room.artifacts].reverse().find((item) => item.kind === kind);
  const html = latest("html");
  const output = latestOutput(room);
  const likelyTruncatedHtml = !html && /<artifact\s+kind="html"|<!doctype html>|<html\b/i.test(output);
  return <section className="artifact-panel">
    <Flex justify="between" align="center"><Box><Text size="1" color="gray" weight="bold">TEST CAPITAL</Text><Heading size="4">產物與核准</Heading></Box>{html && <Badge>v{html.version}</Badge>}</Flex>
    <Tabs.Root defaultValue="preview"><Tabs.List><Tabs.Trigger value="preview">預覽</Tabs.Trigger><Tabs.Trigger value="code">生成程式碼</Tabs.Trigger><Tabs.Trigger value="tests">測試</Tabs.Trigger><Tabs.Trigger value="criteria">驗收</Tabs.Trigger></Tabs.List>
      <Box className="artifact-body"><Tabs.Content value="preview">{html ? <iframe key={html.id} title="Generated artifact" sandbox="allow-scripts" srcDoc={html.content} /> : <Empty text={likelyTruncatedHtml ? "The agent output an incomplete HTML document. Run it again to generate a complete preview." : "Agent 產出的完整 HTML 會在這個 sandboxed sub-window 預覽。"} />}</Tabs.Content><Tabs.Content value="code">{html ? <pre className="generated-code">{html.content}</pre> : <Empty text={likelyTruncatedHtml ? "Incomplete HTML was detected; no partial document was saved as a preview artifact." : "執行實作意圖後，可提取的完整 HTML 程式碼會出現在這裡。"} />}</Tabs.Content><Tabs.Content value="tests"><pre>{latest("tests")?.content || "尚無測試產物。"}</pre></Tabs.Content><Tabs.Content value="criteria"><pre>{latest("criteria")?.content || "尚無驗收產物。"}</pre></Tabs.Content></Box>
    </Tabs.Root>
    <Card className="approval-box"><Text size="2" weight="bold">Room approval gate</Text><Text as="p" size="1" color="gray">所有可投票角色核准後，才能建立 PDD Issue。</Text><Flex gap="2" wrap="wrap"><Button size="1" color="green" onClick={() => onVote("approve")}>Approve</Button><Button size="1" color="red" variant="soft" onClick={() => onVote("request_changes")}>Request changes</Button><Button size="1" variant="outline" onClick={onExport}>匯出 PDD Issue</Button></Flex></Card>
  </section>;
}

function Empty({ text }: { text: string }) {
  return <Box className="empty"><Text size="2" color="gray">{text}</Text></Box>;
}

function Welcome(props: {
  name: string; setName: (value: string) => void; role: Role; setRole: (value: Role) => void;
  title: string; setTitle: (value: string) => void; roomCode: string; setRoomCode: (value: string) => void;
  join: () => void; notice: string;
}) {
  return <main className="welcome"><Card className="welcome-card"><Box className="welcome-logo">⌘</Box><Heading size="7">Prompt capital，多人一起寫。</Heading><Text as="p" color="gray" mt="2" mb="5">一個房間、N 個人類角色、同一個共享 agent。執行中也能導引，不必等它走偏。</Text><Flex direction="column" gap="3"><TextField.Root placeholder="你的名字" value={props.name} onChange={(event) => props.setName(event.target.value)} /><Select.Root value={props.role} onValueChange={(value) => props.setRole(value as Role)}><Select.Trigger /><Select.Content><Select.Item value="pm">PM · 範圍</Select.Item><Select.Item value="eng">ENG · 實作</Select.Item><Select.Item value="design">DESIGN · 體驗</Select.Item><Select.Item value="qa">QA · 驗證</Select.Item><Select.Item value="observer">Observer</Select.Item></Select.Content></Select.Root><TextField.Root placeholder="專案名稱" value={props.title} onChange={(event) => props.setTitle(event.target.value)} /><TextField.Root placeholder="房間代碼（留空建立新房）" value={props.roomCode} onChange={(event) => props.setRoomCode(event.target.value)} /><Button size="3" onClick={props.join}>{props.roomCode ? "加入房間" : "建立協作房間"}</Button></Flex>{props.notice && <Text as="p" size="2" color="red" mt="3">{props.notice}</Text>}</Card></main>;
}
