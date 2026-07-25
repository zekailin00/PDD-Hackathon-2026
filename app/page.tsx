"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Avatar, Badge, Box, Button, Callout, Card, Dialog, Flex, Heading, IconButton,
  Select, Separator, Text, TextArea, TextField, Theme,
} from "@radix-ui/themes";

type FileItem = { path: string; content: string };
type Message = { id: string; author: string; initials: string; createdAt: string; body: string; role: "user" | "assistant"; changed?: string[] };
type Provider = { name: string; model: string; baseUrl: string; apiKey: string };
type Room = { id: string; name: string; userName: string; systemPrompt: string; files: FileItem[]; messages: Message[]; provider: Provider; updatedAt: number; agentRunning?: boolean };

const ROOM_KEY = "co-prompt:room:";
const TOKENROUTER_BASE_URL = "https://api.tokenrouter.com/v1";
const defaultFiles: FileItem[] = [
  { path: "app/page.tsx", content: `export default function Home() {\n  return (\n    <main>\n      <h1>Acme</h1>\n      <p>Thoughtful products for ambitious teams.</p>\n    </main>\n  );\n}\n` },
  { path: "app/globals.css", content: `@import "tailwindcss";\n\n:root {\n  --background: #101114;\n  --foreground: #f8f8fa;\n}\n\nbody {\n  background: var(--background);\n  color: var(--foreground);\n}\n` },
  { path: "components/Hero.tsx", content: `export function Hero() {\n  return <section className="hero">Build together, faster.</section>;\n}\n` },
  { path: "package.json", content: `{\n  "name": "acme-landing",\n  "private": true,\n  "scripts": { "dev": "next dev" },\n  "dependencies": { "next": "latest", "react": "latest" }\n}\n` },
];

const now = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const id = () => Math.random().toString(36).slice(2, 9);

function newRoom(name: string, userName: string, roomId: string): Room {
  return {
    id: roomId, name: name || "Untitled project", userName, files: defaultFiles,
    systemPrompt: "You are the project agent. This is a TypeScript Next.js web project. Explain your plan briefly, then only modify files when a user clearly asks for a change. Preserve the existing design and use the project’s current dependencies.",
    provider: { name: "TokenRouter", model: "", baseUrl: TOKENROUTER_BASE_URL, apiKey: "" },
    messages: [{ id: id(), author: "co-prompt", initials: "✦", createdAt: now(), role: "assistant", body: "Room ready. Tell me about the project, ask a question, or ask me to modify the code." }],
    updatedAt: Date.now(),
  };
}

function basename(path: string) { return path.split("/").at(-1) || path; }
function mergeFiles(current: FileItem[], updates: FileItem[]) {
  const next = new Map(current.map(file => [file.path, file]));
  updates.forEach(file => next.set(file.path, file));
  return [...next.values()];
}

export default function Home() {
  const [room, setRoom] = useState<Room | null>(null);
  const [roomName, setRoomName] = useState("Acme landing page");
  const [userName, setUserName] = useState("");
  const [draft, setDraft] = useState("");
  const [activeFile, setActiveFile] = useState("app/page.tsx");
  const [running, setRunning] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [systemOpen, setSystemOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [lastChange, setLastChange] = useState<string[]>([]);
  const [githubToken, setGithubToken] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState("");
  const channel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get("room");
    if (roomId) {
      const stored = localStorage.getItem(`${ROOM_KEY}${roomId}`);
      if (stored) setRoom(JSON.parse(stored) as Room);
      fetch(`/api/rooms?id=${encodeURIComponent(roomId)}`).then(response => response.ok ? response.json() : null).then(value => value && setRoom(current => ({ ...value, userName: current?.userName || "Anonymous", provider: { ...value.provider, apiKey: current?.provider.apiKey || "" } }))).catch(() => undefined);
    }
    channel.current = new BroadcastChannel("co-prompt-room");
    channel.current.onmessage = event => setRoom(event.data as Room);
    return () => channel.current?.close();
  }, []);

  useEffect(() => {
    if (!room) return;
    localStorage.setItem(`${ROOM_KEY}${room.id}`, JSON.stringify(room));
    channel.current?.postMessage(room);
    const sharedRoom = { ...room, provider: { ...room.provider, apiKey: "" } };
    void fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sharedRoom) });
  }, [room]);

  const file = useMemo(() => room?.files.find(item => item.path === activeFile) ?? room?.files[0], [room, activeFile]);
  const agentBusy = running || Boolean(room?.agentRunning);
  useEffect(() => {
    if (!room) return;
    const poll = window.setInterval(() => fetch(`/api/rooms?id=${encodeURIComponent(room.id)}`).then(response => response.ok ? response.json() : null).then(value => value && setRoom(current => !current || value.updatedAt <= current.updatedAt ? current : { ...value, userName: current.userName, provider: { ...value.provider, apiKey: current.provider.apiKey } })).catch(() => undefined), 2500);
    return () => window.clearInterval(poll);
  }, [room?.id]);
  const enterRoom = () => {
    const next = newRoom(roomName, userName.trim() || "Anonymous", id());
    window.history.replaceState({}, "", `?room=${next.id}`);
    setRoom(next); setActiveFile(next.files[0].path);
  };
  const updateRoom = (update: Partial<Room>) => setRoom(current => current ? { ...current, ...update, updatedAt: Date.now() } : current);
  const exportProject = () => {
    if (!room) return;
    const blob = new Blob([JSON.stringify({ name: room.name, files: room.files }, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = href; anchor.download = `${room.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "project"}.co-prompt.json`; anchor.click(); URL.revokeObjectURL(href);
    setExportOpen(false);
  };
  const publishGitHub = async () => {
    if (!room || !githubToken.trim() || !githubRepo.trim()) return;
    setPublishing(true); setPublishedUrl("");
    try {
      const response = await fetch("/api/github", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: githubToken.trim(), repository: githubRepo.trim(), files: room.files }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "GitHub publish failed.");
      setPublishedUrl(result.url);
    } catch (error) { setPublishedUrl(error instanceof Error ? error.message : "GitHub publish failed."); }
    finally { setPublishing(false); }
  };
  const send = async () => {
    if (!room || !draft.trim() || agentBusy) return;
    const prompt = draft.trim();
    const message: Message = { id: id(), author: room.userName, initials: room.userName.slice(0, 2).toUpperCase(), createdAt: now(), role: "user", body: prompt };
    updateRoom({ messages: [...room.messages, message], agentRunning: true }); setDraft("");
    setRunning(true);
    try {
      if (!room.provider.apiKey || !room.provider.baseUrl || !room.provider.model) throw new Error("Connect an AI provider, add an API key, and select a model before chatting with the agent.");
      const provider = room.provider.name === "TokenRouter" ? { ...room.provider, baseUrl: TOKENROUTER_BASE_URL } : room.provider;
      const response = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, systemPrompt: room.systemPrompt, prompt, files: room.files }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The configured provider could not complete the request.");
      const changed = result.action === "edit" ? (result.files as FileItem[]).map(item => item.path) : [];
      const files = result.action === "edit" ? mergeFiles(room.files, result.files as FileItem[]) : room.files;
      setLastChange(changed);
      setRoom(current => current ? { ...current, files, agentRunning: false, messages: [...current.messages, { id: id(), author: "co-prompt agent", initials: "✦", createdAt: now(), role: "assistant", body: result.message, ...(changed.length ? { changed } : {}) }], updatedAt: Date.now() } : current);
    } catch (error) {
      setRoom(current => current ? { ...current, agentRunning: false, messages: [...current.messages, { id: id(), author: "co-prompt agent", initials: "✦", createdAt: now(), role: "assistant", body: error instanceof Error ? error.message : "Agent request failed." }] } : current);
    } finally { setRunning(false); }
  };

  return <Theme appearance="dark" accentColor="indigo" grayColor="slate" radius="large">
    {!room ? <Welcome roomName={roomName} setRoomName={setRoomName} userName={userName} setUserName={setUserName} enterRoom={enterRoom} /> :
      <main className="app-shell">
        <header className="topbar"><Flex align="center" gap="3"><Box className="brand-mark">⌘</Box><Heading size="3">co-prompt</Heading><Badge color="gray">shared room</Badge></Flex><Flex align="center" gap="3"><Text size="2" weight="medium"><span className="green-dot" /> {room.name}</Text><Badge color="green" variant="soft">{room.id}</Badge></Flex><Flex justify="end" align="center" gap="2"><Avatar fallback={room.userName.slice(0, 2).toUpperCase()} color="indigo" size="2" /><Button size="2" variant="soft" onClick={() => navigator.clipboard.writeText(window.location.href)}>Copy room link</Button><Button size="2" onClick={() => setExportOpen(true)}>Save project</Button><IconButton variant="soft" onClick={() => setSettingsOpen(true)}>⚙</IconButton></Flex></header>
        <section className="workspace">
          <aside className="sidebar"><Flex justify="between" align="center" mb="3"><Text size="1" color="gray" weight="bold">PROJECT FILES</Text><IconButton size="1" variant="ghost" onClick={() => setSystemOpen(true)}>✦</IconButton></Flex><nav className="file-list">{room.files.map(item => <Button key={item.path} variant={item.path === file?.path ? "soft" : "ghost"} color={item.path === file?.path ? "indigo" : "gray"} className="file-button" onClick={() => setActiveFile(item.path)}><span>{item.path.endsWith(".json") ? "{}" : item.path.endsWith(".css") ? "#" : "◇"}</span>{item.path}</Button>)}</nav><Box className="sidebar-footer"><Text size="1" color="gray">Only the agent can modify files. Room changes sync through this app instance; your API key stays in your browser.</Text></Box></aside>
          <section className="editor-panel"><Flex className="editor-head" align="center" justify="between"><Text size="2" weight="medium">{file?.path}</Text><Badge color="gray" variant="soft">read-only</Badge></Flex><Box className="code-area">{file?.content.split("\n").map((line, index) => <div className="code-line" key={`${index}-${line}`}><span className="line-number">{index + 1}</span><code>{line || " "}</code></div>)}</Box><Flex className="editor-status" justify="between"><Text size="1">main · synced</Text><Text size="1">TypeScript · UTF-8</Text></Flex></section>
          <section className="chat-panel"><Flex className="chat-header" align="center" justify="between"><Box><Heading size="3">Room chat</Heading><Text size="1" color="gray"><span className="green-dot" /> {agentBusy ? "Agent is working" : "Ready to collaborate"}</Text></Box><Badge color={agentBusy ? "amber" : "green"}>{agentBusy ? "locked" : "live"}</Badge></Flex><Box className="messages">{room.messages.map(message => <Flex key={message.id} className={`message ${message.role}`} gap="2"><Avatar fallback={message.initials} color={message.role === "assistant" ? "indigo" : "orange"} size="2" /><Box><Flex gap="2" align="baseline"><Text size="2" weight="bold">{message.author}</Text><Text size="1" color="gray">{message.createdAt}</Text></Flex><Text as="p" size="2">{message.body}</Text>{message.changed && <Card className="change-card"><Flex justify="between" align="center"><Box><Text size="2" weight="bold">Modified {message.changed.length} file</Text><Text as="p" size="1" color="gray">{message.changed.join(", ")}</Text></Box><Button size="1" variant="soft" onClick={() => { setLastChange(message.changed || []); setChangesOpen(true); }}>Review</Button></Flex></Card>}</Box></Flex>)}</Box>{agentBusy && <Callout.Root className="working"><Callout.Text>Agent is modifying the project. Sending is temporarily locked for everyone.</Callout.Text></Callout.Root>}<Box className="composer"><TextArea value={draft} onChange={e => setDraft(e.target.value)} disabled={agentBusy} placeholder={agentBusy ? "Agent is modifying the project…" : "Ask about the project or request a code change…"} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} /><Flex justify="between" align="center" mt="2"><Text size="1" color="gray">Enter to send · Shift+Enter for a new line</Text><Button size="1" disabled={!draft.trim() || agentBusy} onClick={() => void send()}>{agentBusy ? "Working…" : "Send to agent"}</Button></Flex></Box></section>
        </section>
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} room={room} updateRoom={updateRoom} />
        <SystemDialog open={systemOpen} onOpenChange={setSystemOpen} value={room.systemPrompt} onSave={systemPrompt => updateRoom({ systemPrompt })} />
        <Dialog.Root open={exportOpen} onOpenChange={setExportOpen}><Dialog.Content maxWidth="500px"><Dialog.Title>Save project</Dialog.Title><Dialog.Description size="2">Publish the generated files to a private GitHub repository, or download a portable project bundle.</Dialog.Description><Flex direction="column" gap="3" mt="4"><label><Text size="2" weight="medium">GitHub repository</Text><TextField.Root mt="1" value={githubRepo} onChange={event => setGithubRepo(event.target.value)} placeholder="my-co-prompt-project" /></label><label><Text size="2" weight="medium">GitHub fine-grained token</Text><TextField.Root mt="1" type="password" value={githubToken} onChange={event => setGithubToken(event.target.value)} placeholder="github_pat_..." /></label><Text size="1" color="gray">The token is used only for this request. Grant Contents read/write permission.</Text>{publishedUrl && <Callout.Root color={publishedUrl.startsWith("http") ? "green" : "red"}><Callout.Text>{publishedUrl.startsWith("http") ? <a href={publishedUrl} target="_blank">Repository published — open GitHub</a> : publishedUrl}</Callout.Text></Callout.Root>}</Flex><Flex justify="between" gap="2" mt="5"><Button variant="soft" color="gray" onClick={exportProject}>Download bundle</Button><Flex gap="2"><Dialog.Close><Button variant="soft" color="gray">Close</Button></Dialog.Close><Button disabled={!githubToken.trim() || !githubRepo.trim() || publishing} onClick={() => void publishGitHub()}>{publishing ? "Publishing…" : "Publish to GitHub"}</Button></Flex></Flex></Dialog.Content></Dialog.Root>
        <Dialog.Root open={changesOpen} onOpenChange={setChangesOpen}><Dialog.Content maxWidth="700px"><Dialog.Title>Agent changes</Dialog.Title><Dialog.Description size="2" mb="3">The agent changed {lastChange.join(", ") || "a project file"}.</Dialog.Description><Card><pre className="diff">+ // AI update applied{"\n"}+ // Review the active file in the editor for the complete change.</pre></Card><Flex justify="end" mt="4"><Dialog.Close><Button>Done</Button></Dialog.Close></Flex></Dialog.Content></Dialog.Root>
      </main>}
  </Theme>;
}

function Welcome({ roomName, setRoomName, userName, setUserName, enterRoom }: { roomName: string; setRoomName: (value: string) => void; userName: string; setUserName: (value: string) => void; enterRoom: () => void }) {
  return <main className="welcome"><Card className="welcome-card"><Box className="welcome-logo">⌘</Box><Heading size="7" mb="2">Code together with an agent.</Heading><Text as="p" color="gray" mb="6">Create a room for your project. Open the same room link in another tab or browser to collaborate.</Text><Flex direction="column" gap="4"><label><Text size="2" weight="medium">Your name</Text><TextField.Root mt="1" placeholder="Ada Lovelace" value={userName} onChange={event => setUserName(event.target.value)} /></label><label><Text size="2" weight="medium">Project name</Text><TextField.Root mt="1" value={roomName} onChange={event => setRoomName(event.target.value)} /></label><Button size="3" onClick={enterRoom}>Create collaboration room</Button></Flex><Separator my="5" size="4" /><Text size="1" color="gray">AI changes are controlled from room chat. Configure TokenRouter or another OpenAI-compatible provider once you’re inside.</Text></Card></main>;
}

function SettingsDialog({ open, onOpenChange, room, updateRoom }: { open: boolean; onOpenChange: (value: boolean) => void; room: Room; updateRoom: (update: Partial<Room>) => void }) {
  const [provider, setProvider] = useState(room.provider);
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState("");
  useEffect(() => setProvider(room.provider), [room.provider, open]);
  const loadModels = async () => {
    if (!provider.apiKey) { setModelError("Add your API key first."); return; }
    setLoadingModels(true); setModelError("");
    try {
      const response = await fetch("/api/models", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: provider.apiKey, baseUrl: provider.name === "TokenRouter" ? TOKENROUTER_BASE_URL : provider.baseUrl }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load models.");
      setModels(result.models); if (!provider.model && result.models[0]) setProvider(current => ({ ...current, model: result.models[0] }));
      if (!result.models.length) setModelError("No chat models are enabled for this key.");
    } catch (error) { setModelError(error instanceof Error ? error.message : "Could not load models."); }
    finally { setLoadingModels(false); }
  };
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Content maxWidth="500px"><Dialog.Title>AI connection</Dialog.Title><Dialog.Description size="2">Load the models available to your TokenRouter key, then select one before saving.</Dialog.Description><Flex direction="column" gap="3" mt="4"><label><Text size="2" weight="medium">Provider</Text><Select.Root value={provider.name} onValueChange={name => setProvider({ ...provider, name, baseUrl: name === "TokenRouter" ? TOKENROUTER_BASE_URL : provider.baseUrl })}><Select.Trigger mt="1" /><Select.Content><Select.Item value="TokenRouter">TokenRouter</Select.Item><Select.Item value="OpenAI-compatible">OpenAI-compatible</Select.Item></Select.Content></Select.Root></label><label><Flex justify="between"><Text size="2" weight="medium">Model</Text><Button size="1" variant="ghost" onClick={() => void loadModels()}>{loadingModels ? "Loading…" : "Load available models"}</Button></Flex>{models.length ? <Select.Root value={provider.model} onValueChange={model => setProvider({ ...provider, model })}><Select.Trigger mt="1" /><Select.Content>{models.map(model => <Select.Item key={model} value={model}>{model}</Select.Item>)}</Select.Content></Select.Root> : <TextField.Root mt="1" value={provider.model} onChange={event => setProvider({ ...provider, model: event.target.value })} placeholder="Load models or enter a model id" />}{modelError && <Text as="p" size="1" color="red" mt="1">{modelError}</Text>}</label><label><Text size="2" weight="medium">API base URL</Text><TextField.Root mt="1" value={provider.name === "TokenRouter" ? TOKENROUTER_BASE_URL : provider.baseUrl} disabled={provider.name === "TokenRouter"} onChange={event => setProvider({ ...provider, baseUrl: event.target.value })} placeholder={TOKENROUTER_BASE_URL} /></label><label><Text size="2" weight="medium">API key</Text><TextField.Root mt="1" type="password" value={provider.apiKey} onChange={event => setProvider({ ...provider, apiKey: event.target.value })} placeholder="tr_..." /></label></Flex><Flex justify="end" gap="2" mt="5"><Dialog.Close><Button variant="soft" color="gray">Cancel</Button></Dialog.Close><Dialog.Close><Button onClick={() => updateRoom({ provider: provider.name === "TokenRouter" ? { ...provider, baseUrl: TOKENROUTER_BASE_URL } : provider })}>Save connection</Button></Dialog.Close></Flex></Dialog.Content></Dialog.Root>;
}

function SystemDialog({ open, onOpenChange, value, onSave }: { open: boolean; onOpenChange: (value: boolean) => void; value: string; onSave: (value: string) => void }) {
  const [prompt, setPrompt] = useState(value); useEffect(() => setPrompt(value), [value, open]);
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Content maxWidth="620px"><Dialog.Title>Project system prompt</Dialog.Title><Dialog.Description size="2">This context is sent with every live agent request and guides local mode as well.</Dialog.Description><TextArea mt="4" value={prompt} onChange={event => setPrompt(event.target.value)} style={{ minHeight: 190 }} /><Flex justify="end" gap="2" mt="4"><Dialog.Close><Button variant="soft" color="gray">Cancel</Button></Dialog.Close><Dialog.Close><Button onClick={() => onSave(prompt)}>Save context</Button></Dialog.Close></Flex></Dialog.Content></Dialog.Root>;
}
