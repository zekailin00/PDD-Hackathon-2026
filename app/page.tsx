"use client";

import { useEffect, useRef, useState } from "react";
import {
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Dialog,
  Flex,
  Heading,
  Select,
  Separator,
  Tabs,
  Text,
  TextArea,
  TextField,
  Theme,
} from "@radix-ui/themes";
import type {
  Artifact,
  PublicRoom,
  Room,
  RoomEvent,
  RoomVisibility,
} from "@/lib/domain";
import { ROOM_AGENT_SYSTEM } from "@/lib/prompts";
import type { Difficulty } from "@/pdd/model-router";
import type { Role } from "@/pdd/role-policy";

const identityKey = "coprompt:identity";
const newId = () => crypto.randomUUID();
const roleColor: Record<Role, "indigo" | "orange" | "pink" | "green" | "gray"> = {
  pm: "indigo", eng: "orange", design: "pink", qa: "green", observer: "gray",
};
const presenceColor = { online: "#59cf96", away: "#f2b84b", offline: "#6d707c" };

type Identity = { userId: string; name: string; role: Role };
type RoomResponse = { room: Room; token: string; inviteCode?: string; error?: string };

export default function Home() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [token, setToken] = useState("");
  const [creatorInviteCode, setCreatorInviteCode] = useState("");
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([]);
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("pm");
  const [roomCode, setRoomCode] = useState("");
  const [urlInviteCode, setUrlInviteCode] = useState("");
  const [title, setTitle] = useState("Collaborative product room");
  const [visibility, setVisibility] = useState<RoomVisibility>("public");
  const [preferredModel, setPreferredModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(ROOM_AGENT_SYSTEM);
  const [intentDraft, setIntentDraft] = useState("");
  const [prompt, setPrompt] = useState("");
  const [steer, setSteer] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("standard");
  const [liveOutput, setLiveOutput] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const lastRoomId = useRef("");
  const intentDirty = useRef(false);

  const refreshRooms = async () => {
    const response = await fetch("/api/rooms", { cache: "no-store" });
    const data = await response.json() as { rooms?: PublicRoom[] };
    setPublicRooms(data.rooms ?? []);
  };

  useEffect(() => {
    const stored = localStorage.getItem(identityKey);
    if (stored) {
      const parsed = JSON.parse(stored) as Identity;
      setName(parsed.name);
      setRole(parsed.role);
      setIdentity(parsed);
    }
    const params = new URLSearchParams(window.location.search);
    setRoomCode(params.get("room") || "");
    setUrlInviteCode(params.get("invite") || "");
    void refreshRooms();
  }, []);

  useEffect(() => {
    if (!room || !token || room.id === lastRoomId.current) return;
    lastRoomId.current = room.id;
    const events = new EventSource(`/api/rooms/${room.id}/events?token=${encodeURIComponent(token)}`);
    events.onmessage = (event) => {
      const value = JSON.parse(event.data) as RoomEvent;
      if (value.type === "snapshot") {
        setRoom(value.room);
        if (!intentDirty.current) setIntentDraft(value.room.intent);
      } else if (value.type === "presence") {
        setRoom((current) => current ? { ...current, participants: value.participants } : current);
      } else if (value.type === "token") {
        setLiveOutput((current) => current + value.chunk);
      } else if (value.type === "step") {
        setNotice(`Step ${value.step}: ${value.label}`);
      } else if (value.type === "steer_applied") {
        setNotice(`⚡ 已套用 ${value.steers.length} 則導引`);
      } else if (value.type === "halted") {
        setNotice(`${value.by} 已中止執行`);
      } else if (value.type === "error") {
        setNotice(value.message);
      }
    };
    return () => {
      events.close();
      lastRoomId.current = "";
    };
  }, [room?.id, token]);

  useEffect(() => {
    if (!room || !token) return;
    const updatePresence = (status: "online" | "away") => {
      void fetch(`/api/rooms/${room.id}`, authorized(token, {
        operation: "presence",
        status,
      }, "PATCH"));
    };
    const handleVisibility = () => updatePresence(document.hidden ? "away" : "online");
    document.addEventListener("visibilitychange", handleVisibility);
    handleVisibility();
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [room?.id, token]);

  const enterRoom = (data: RoomResponse, nextIdentity: Identity) => {
    localStorage.setItem(identityKey, JSON.stringify(nextIdentity));
    setIdentity(nextIdentity);
    setToken(data.token);
    setRoom(data.room);
    setIntentDraft(data.room.intent);
    setCreatorInviteCode(data.inviteCode || "");
    setApiKey("");
    const invite = data.room.visibility === "private" ? data.inviteCode || urlInviteCode : "";
    const query = new URLSearchParams({ room: data.room.id });
    if (invite) query.set("invite", invite);
    window.history.replaceState({}, "", `?${query.toString()}`);
  };

  const createSession = async () => {
    const nextIdentity = identityFromForm(identity, name, role);
    setBusy(true);
    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          ...nextIdentity,
          title,
          visibility,
          preferredModel,
          systemPrompt,
          apiKey,
          baseUrl: "https://api.tokenrouter.com/v1",
        }),
      });
      const data = await response.json() as RoomResponse;
      if (!response.ok) return setNotice(data.error || "建立房間失敗。");
      enterRoom(data, nextIdentity);
    } finally {
      setBusy(false);
    }
  };

  const joinSession = async () => {
    if (!roomCode) return setNotice("請從清單選擇房間。");
    const nextIdentity = identityFromForm(identity, name, role);
    setBusy(true);
    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join",
          ...nextIdentity,
          roomId: roomCode,
          inviteCode: urlInviteCode || undefined,
        }),
      });
      const data = await response.json() as RoomResponse;
      if (!response.ok) return setNotice(data.error || "加入房間失敗。");
      enterRoom(data, nextIdentity);
    } finally {
      setBusy(false);
    }
  };

  const saveIntent = async () => {
    if (!room) return;
    const response = await fetch(`/api/rooms/${room.id}`, authorized(token, {
      operation: "intent",
      intent: intentDraft,
    }, "PATCH"));
    const data = await response.json();
    if (response.ok) intentDirty.current = false;
    setNotice(response.ok ? "共同意圖已同步" : data.error);
  };

  const run = async () => {
    if (!room || !prompt.trim()) return;
    setBusy(true);
    setLiveOutput("");
    setNotice("正在啟動 TokenRouter auto…");
    try {
      const response = await fetch("/api/agent", authorized(token, {
        roomId: room.id,
        prompt,
        difficulty,
      }));
      if (!response.ok) {
        const data = await response.json();
        setNotice(data.error);
        return;
      }
      await response.text();
      setPrompt("");
    } finally {
      setBusy(false);
    }
  };

  const sendSteer = async (kind: "nudge" | "halt") => {
    const runId = [...(room?.runs || [])].reverse().find((item) => item.status === "running")?.id;
    if (!room || !runId) return setNotice("目前沒有執行中的 run");
    const response = await fetch(`/api/rooms/${room.id}/steers`, authorized(token, {
      runId,
      kind,
      content: steer,
    }));
    const data = await response.json();
    setNotice(response.ok ? `${kind.toUpperCase()} 已排入下一個檢查點` : data.error);
    if (response.ok) setSteer("");
  };

  const sendMessage = async () => {
    if (!room || !chatDraft.trim()) return;
    const response = await fetch(`/api/rooms/${room.id}/messages`, authorized(token, {
      content: chatDraft,
      replyTo: replyTo || undefined,
      kind: room.state === "AWAITING_INPUT" ? "answer" : "member",
    }));
    const data = await response.json();
    setNotice(response.ok ? "Member Chat 已同步；不會傳給 AI" : data.error);
    if (response.ok) {
      setChatDraft("");
      setReplyTo("");
    }
  };

  const vote = async (verdict: "approve" | "request_changes") => {
    const runId = [...(room?.runs || [])].reverse().find((item) => item.status === "proposed")?.id;
    if (!room || !runId) return setNotice("目前沒有待審提案");
    const response = await fetch(`/api/rooms/${room.id}/votes`, authorized(token, { runId, verdict }));
    const data = await response.json();
    setNotice(response.ok ? data.quorum.reason : data.error);
  };

  const exportIssue = async () => {
    if (!room) return;
    const response = await fetch(`/api/rooms/${room.id}/export`, authorized(token, {}));
    const data = await response.json();
    if (response.ok) window.open(data.url, "_blank", "noopener,noreferrer");
    else setNotice(data.error);
  };

  const logout = async () => {
    if (!room || !window.confirm("確定要離開房間？你的成員身分會從房間移除。")) return;
    const response = await fetch(`/api/rooms/${room.id}`, authorized(token, undefined, "DELETE"));
    if (!response.ok) {
      const data = await response.json();
      return setNotice(data.error);
    }
    setRoom(null);
    setToken("");
    setCreatorInviteCode("");
    setLiveOutput("");
    window.history.replaceState({}, "", window.location.pathname);
    await refreshRooms();
  };

  const inviteUrl = (() => {
    if (!room || typeof window === "undefined") return "";
    const query = new URLSearchParams({ room: room.id });
    const invite = creatorInviteCode || urlInviteCode;
    if (room.visibility === "private" && invite) query.set("invite", invite);
    return `${window.location.origin}${window.location.pathname}?${query.toString()}`;
  })();

  return <Theme appearance="dark" accentColor="indigo" grayColor="slate" radius="large">
    {!room || !identity ? <Welcome
      {...{
        name, setName, role, setRole, title, setTitle, roomCode, setRoomCode,
        publicRooms, urlInviteCode, visibility, setVisibility, preferredModel,
        setPreferredModel, apiKey, setApiKey, systemPrompt, setSystemPrompt,
        createSession, joinSession, busy, notice,
      }}
    /> : <main className="app-shell">
      <header className="topbar">
        <Flex align="center" gap="3">
          <Box className="brand-mark">⌘</Box>
          <Heading size="3">co-prompt</Heading>
          <Badge color={room.isDemo ? "violet" : "indigo"}>{room.isDemo ? "Demo" : room.visibility}</Badge>
        </Flex>
        <Flex align="center" gap="2">
          <Badge color={room.state === "RUNNING" ? "amber" : room.state === "PROPOSED" ? "violet" : "green"}>{room.state}</Badge>
          <Text size="2">{room.title}</Text>
        </Flex>
        <Flex justify="end" align="center" gap="2">
          {room.participants.slice(0, 5).map((person) => <Box key={person.userId} className="presence-avatar">
            <Avatar fallback={person.name.slice(0, 2).toUpperCase()} color={roleColor[person.role]} size="2" title={`${person.name} · ${person.role} · ${person.status}`} />
            <span style={{ background: presenceColor[person.status] }} />
          </Box>)}
          <Button size="1" variant="soft" onClick={() => void navigator.clipboard.writeText(inviteUrl)}>Copy invite</Button>
          {room.createdBy === identity.userId && !room.isDemo && <Button size="1" variant="outline" onClick={() => setSettingsOpen(true)}>Room settings</Button>}
          <Button size="1" color="red" variant="ghost" onClick={() => void logout()}>Logout</Button>
        </Flex>
      </header>

      <section className="ensemble-grid">
        <section className="intent-panel">
          <Flex justify="between" align="center">
            <Box><Text size="1" color="gray" weight="bold">PROMPT CAPITAL</Text><Heading size="4">共同意圖文件</Heading></Box>
            <Button size="1" variant="soft" onClick={saveIntent} disabled={room.state === "RUNNING"}>同步</Button>
          </Flex>
          <TextArea className="intent-editor" value={intentDraft} onChange={(event) => {
            intentDirty.current = true;
            setIntentDraft(event.target.value);
          }} disabled={room.state === "RUNNING"} />
          <Separator size="4" />
          <Flex justify="between" align="center">
            <Text size="1" color="gray" weight="bold">MEMBER CHAT</Text>
            <Badge color="green" variant="soft">Never sent to AI · 0 tokens</Badge>
          </Flex>
          <Box className="room-messages">{room.messages.filter((message) => message.kind === "member" || message.kind === "system").slice(-20).map((message) => <Box key={message.id} className="room-message">
            <Flex justify="between"><Text size="1" weight="bold">{message.authorName} · {message.role.toUpperCase()}</Text>{message.kind === "member" && <Button size="1" variant="ghost" onClick={() => setReplyTo(message.id)}>回覆</Button>}</Flex>
            {message.replyTo && <Text size="1" color="gray">↳ thread {message.replyTo.slice(0, 6)}</Text>}
            <Text as="p" size="2">{message.content}</Text>
          </Box>)}</Box>
          <Box className="chat-compose">
            {replyTo && <Flex justify="between"><Text size="1" color="gray">回覆 thread {replyTo.slice(0, 6)}</Text><Button size="1" variant="ghost" onClick={() => setReplyTo("")}>取消</Button></Flex>}
            <TextArea value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} placeholder="只傳給房間成員，不會傳給 AI…" />
            <Button size="1" variant="soft" onClick={sendMessage} disabled={!chatDraft.trim()}>送出 Member Chat</Button>
          </Box>
        </section>

        <section className="run-panel">
          <Flex justify="between" align="center">
            <Box><Text size="1" color="gray" weight="bold">SHARED AGENT</Text><Heading size="4">即時執行</Heading></Box>
            <Badge color="cyan">{room.preferredModel || "TokenRouter auto"}</Badge>
          </Flex>
          {notice && <Card className="notice"><Text size="2">{notice}</Text></Card>}
          <Box className="stream-output"><pre>{liveOutput || latestOutput(room) || "共同意圖準備好後，任何有權限的角色都能啟動 agent。"}</pre></Box>
          {room.state === "RUNNING" ? <Card className="steer-box">
            <Text size="2" weight="bold">Steering Queue</Text>
            <TextArea value={steer} onChange={(event) => setSteer(event.target.value)} placeholder="下一個步驟前要修正什麼？" />
            <Flex gap="2"><Button size="2" onClick={() => sendSteer("nudge")} disabled={!steer.trim()}>⚡ Nudge</Button><Button size="2" color="red" variant="soft" onClick={() => sendSteer("halt")}>Halt</Button></Flex>
          </Card> : <Card className="run-box">
            <TextArea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="告訴共享 agent 這一輪要完成什麼…" />
            <Flex justify="between" align="center">
              <Select.Root value={difficulty} onValueChange={(value) => setDifficulty(value as Difficulty)}>
                <Select.Trigger />
                <Select.Content><Select.Item value="cheap">Fast / cheap</Select.Item><Select.Item value="standard">Balanced</Select.Item><Select.Item value="hard">Hard task</Select.Item></Select.Content>
              </Select.Root>
              <Button onClick={run} disabled={busy || !prompt.trim()}>{busy ? "Running…" : "▶ Run"}</Button>
            </Flex>
          </Card>}
        </section>

        <ArtifactPanel room={room} onVote={vote} onExport={exportIssue} />
      </section>

      <RoomSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        room={room}
        token={token}
        onUpdated={(updated, invite) => {
          setRoom(updated);
          if (invite) setCreatorInviteCode(invite);
        }}
        setNotice={setNotice}
      />
    </main>}
  </Theme>;
}

function identityFromForm(current: Identity | null, name: string, role: Role): Identity {
  return { userId: current?.userId || newId(), name: name.trim() || "Anonymous", role };
}

function authorized(token: string, body?: unknown, method = "POST"): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

function latestOutput(room: Room) {
  return [...room.runs].reverse().find((run) => run.output)?.output || "";
}

function ArtifactPanel({ room, onVote, onExport }: { room: Room; onVote: (vote: "approve" | "request_changes") => void; onExport: () => void }) {
  const latest = (kind: Artifact["kind"]) => [...room.artifacts].reverse().find((item) => item.kind === kind);
  const html = latest("html");
  return <section className="artifact-panel">
    <Flex justify="between" align="center"><Box><Text size="1" color="gray" weight="bold">TEST CAPITAL</Text><Heading size="4">產物與核准</Heading></Box>{html && <Badge>v{html.version}</Badge>}</Flex>
    <Tabs.Root defaultValue="preview">
      <Tabs.List><Tabs.Trigger value="preview">預覽</Tabs.Trigger><Tabs.Trigger value="tests">測試</Tabs.Trigger><Tabs.Trigger value="criteria">驗收</Tabs.Trigger></Tabs.List>
      <Box className="artifact-body">
        <Tabs.Content value="preview">{html ? <iframe title="Generated artifact" sandbox="allow-scripts" srcDoc={html.content} /> : <Empty text="Agent 的單檔 HTML 會在這裡即時預覽。" />}</Tabs.Content>
        <Tabs.Content value="tests"><pre>{latest("tests")?.content || "尚無測試產物。"}</pre></Tabs.Content>
        <Tabs.Content value="criteria"><pre>{latest("criteria")?.content || "尚無驗收產物。"}</pre></Tabs.Content>
      </Box>
    </Tabs.Root>
    <Card className="approval-box"><Text size="2" weight="bold">Room approval gate</Text><Text as="p" size="1" color="gray">所有可投票角色核准後，才能建立 PDD Issue。</Text><Flex gap="2" wrap="wrap"><Button size="1" color="green" onClick={() => onVote("approve")}>Approve</Button><Button size="1" color="red" variant="soft" onClick={() => onVote("request_changes")}>Request changes</Button><Button size="1" variant="outline" onClick={onExport}>匯出 PDD Issue</Button></Flex></Card>
  </section>;
}

function Empty({ text }: { text: string }) {
  return <Box className="empty"><Text size="2" color="gray">{text}</Text></Box>;
}

function Welcome(props: {
  name: string;
  setName: (value: string) => void;
  role: Role;
  setRole: (value: Role) => void;
  title: string;
  setTitle: (value: string) => void;
  roomCode: string;
  setRoomCode: (value: string) => void;
  publicRooms: PublicRoom[];
  urlInviteCode: string;
  visibility: RoomVisibility;
  setVisibility: (value: RoomVisibility) => void;
  preferredModel: string;
  setPreferredModel: (value: string) => void;
  apiKey: string;
  setApiKey: (value: string) => void;
  systemPrompt: string;
  setSystemPrompt: (value: string) => void;
  createSession: () => void;
  joinSession: () => void;
  busy: boolean;
  notice: string;
}) {
  const invitedPrivate = Boolean(props.roomCode && props.urlInviteCode && !props.publicRooms.some((room) => room.id === props.roomCode));
  return <main className="welcome">
    <Card className="welcome-card welcome-card-wide">
      <Box className="welcome-logo">⌘</Box>
      <Heading size="7">Prompt capital，多人一起寫。</Heading>
      <Text as="p" color="gray" mt="2" mb="4">Join Room 與 Create Co-working Session 完全分開。房名只能從公開清單或邀請連結選擇。</Text>
      <Flex direction="column" gap="3" mb="4">
        <TextField.Root placeholder="你的名字" value={props.name} onChange={(event) => props.setName(event.target.value)} />
        <Select.Root value={props.role} onValueChange={(value) => props.setRole(value as Role)}>
          <Select.Trigger />
          <Select.Content><Select.Item value="pm">PM · 範圍</Select.Item><Select.Item value="eng">ENG · 實作</Select.Item><Select.Item value="design">DESIGN · 體驗</Select.Item><Select.Item value="qa">QA · 驗證</Select.Item><Select.Item value="observer">Observer</Select.Item></Select.Content>
        </Select.Root>
      </Flex>
      <Tabs.Root defaultValue={props.roomCode ? "join" : "create"}>
        <Tabs.List size="2"><Tabs.Trigger value="join">Join Room</Tabs.Trigger><Tabs.Trigger value="create">Create Co-working Session</Tabs.Trigger></Tabs.List>
        <Box pt="4">
          <Tabs.Content value="join">
            <Flex direction="column" gap="3">
              <Select.Root value={props.roomCode} onValueChange={props.setRoomCode}>
                <Select.Trigger placeholder="選擇公開房間" />
                <Select.Content>
                  {invitedPrivate && <Select.Item value={props.roomCode}>Private invited room</Select.Item>}
                  {props.publicRooms.map((room) => <Select.Item key={room.id} value={room.id}>{room.title}{room.isDemo ? " · Demo" : ""} · {room.participantCount} online</Select.Item>)}
                </Select.Content>
              </Select.Root>
              {!props.publicRooms.length && !invitedPrivate && <Text size="2" color="gray">目前沒有公開房間；請建立房間或使用私人邀請連結。</Text>}
              <Button size="3" onClick={props.joinSession} disabled={props.busy || !props.roomCode}>{props.busy ? "Joining…" : "Join selected room"}</Button>
            </Flex>
          </Tabs.Content>
          <Tabs.Content value="create">
            <Flex direction="column" gap="3">
              <TextField.Root placeholder="專案名稱" value={props.title} onChange={(event) => props.setTitle(event.target.value)} />
              <Select.Root value={props.visibility} onValueChange={(value) => props.setVisibility(value as RoomVisibility)}>
                <Select.Trigger />
                <Select.Content><Select.Item value="public">Public — 顯示於房間清單</Select.Item><Select.Item value="private">Private — 僅邀請連結</Select.Item></Select.Content>
              </Select.Root>
              <TextField.Root placeholder="偏好模型（留空由 TokenRouter 自動選擇）" value={props.preferredModel} onChange={(event) => props.setPreferredModel(event.target.value)} />
              <TextField.Root type="password" placeholder="TokenRouter API Key（選填；送出後只保留在伺服器記憶體）" value={props.apiKey} onChange={(event) => props.setApiKey(event.target.value)} />
              <TextArea value={props.systemPrompt} onChange={(event) => props.setSystemPrompt(event.target.value)} placeholder="System Prompt" />
              <Button size="3" onClick={props.createSession} disabled={props.busy || !props.title.trim()}>{props.busy ? "Creating…" : "Create Co-working Session"}</Button>
            </Flex>
          </Tabs.Content>
        </Box>
      </Tabs.Root>
      {props.notice && <Text as="p" size="2" color="red" mt="3">{props.notice}</Text>}
    </Card>
  </main>;
}

function RoomSettingsDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  room: Room;
  token: string;
  onUpdated: (room: Room, inviteCode?: string) => void;
  setNotice: (value: string) => void;
}) {
  const [title, setTitle] = useState(props.room.title);
  const [visibility, setVisibility] = useState(props.room.visibility);
  const [preferredModel, setPreferredModel] = useState(props.room.preferredModel || "");
  const [systemPrompt, setSystemPrompt] = useState(props.room.systemPrompt);
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (!props.open) return;
    setTitle(props.room.title);
    setVisibility(props.room.visibility);
    setPreferredModel(props.room.preferredModel || "");
    setSystemPrompt(props.room.systemPrompt);
    setApiKey("");
  }, [
    props.open,
    props.room.id,
    props.room.title,
    props.room.visibility,
    props.room.preferredModel,
    props.room.systemPrompt,
  ]);

  const save = async () => {
    const response = await fetch(`/api/rooms/${props.room.id}`, authorized(props.token, {
      operation: "settings",
      title,
      visibility,
      preferredModel,
      systemPrompt,
      ...(apiKey.trim() ? { apiKey, baseUrl: "https://api.tokenrouter.com/v1" } : {}),
    }, "PATCH"));
    const data = await response.json();
    if (!response.ok) return props.setNotice(data.error);
    props.onUpdated(data.room, data.inviteCode);
    props.onOpenChange(false);
    props.setNotice("房間設定已更新");
  };

  return <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
    <Dialog.Content maxWidth="620px">
      <Dialog.Title>Room settings</Dialog.Title>
      <Dialog.Description size="2">只有建立者可修改公開性、模型、server-only API key 與 System Prompt。</Dialog.Description>
      <Flex direction="column" gap="3" mt="4">
        <TextField.Root value={title} onChange={(event) => setTitle(event.target.value)} />
        <Select.Root value={visibility} onValueChange={(value) => setVisibility(value as RoomVisibility)}>
          <Select.Trigger />
          <Select.Content><Select.Item value="public">Public — listed</Select.Item><Select.Item value="private">Private — invite only</Select.Item></Select.Content>
        </Select.Root>
        <TextField.Root value={preferredModel} onChange={(event) => setPreferredModel(event.target.value)} placeholder="Preferred model or TokenRouter auto" />
        <TextField.Root type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="New API key（留空保留目前 server key）" />
        <TextArea value={systemPrompt} onChange={(event) => setSystemPrompt(event.target.value)} />
      </Flex>
      <Flex justify="end" gap="2" mt="5"><Dialog.Close><Button variant="soft" color="gray">Cancel</Button></Dialog.Close><Button onClick={save}>Save settings</Button></Flex>
    </Dialog.Content>
  </Dialog.Root>;
}
