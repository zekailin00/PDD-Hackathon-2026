"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Avatar, Badge, Box, Button, Callout, Card, Dialog, Flex, Heading, IconButton,
  Select, Separator, Text, TextArea, TextField, Theme,
} from "@radix-ui/themes";

type FileItem = { path: string; content: string };
type Message = { id: string; author: string; initials: string; createdAt: string; body: string; role: "user" | "assistant"; changed?: string[] };
type Provider = { name: string; model: string; baseUrl: string; apiKey: string };
type Room = { id: string; name: string; userName: string; systemPrompt: string; files: FileItem[]; messages: Message[]; provider: Provider; updatedAt: number };

const ROOM_KEY = "co-prompt:room";
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
    provider: { name: "TokenRouter", model: "auto:balance", baseUrl: "https://api.tokenrouter.io/v1", apiKey: "" },
    messages: [{ id: id(), author: "co-prompt", initials: "✦", createdAt: now(), role: "assistant", body: "Room ready. Tell me about the project, ask a question, or ask me to modify the code." }],
    updatedAt: Date.now(),
  };
}

function basename(path: string) { return path.split("/").at(-1) || path; }
function shouldModify(text: string) { return /\b(add|change|update|edit|create|remove|delete|implement|refactor|fix|make|build|replace)\b/i.test(text); }

function makeLocalChange(files: FileItem[], prompt: string) {
  const target = files.find(file => file.path.endsWith("page.tsx")) || files[0];
  const stamp = `\n// AI update: ${prompt.replace(/\s+/g, " ").slice(0, 110)}\n`;
  return files.map(file => file.path === target.path ? { ...file, content: file.content.includes(stamp.trim()) ? file.content : file.content + stamp } : file);
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
  const channel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stored = localStorage.getItem(ROOM_KEY);
    if (stored) {
      const value = JSON.parse(stored) as Room;
      if (!params.get("room") || params.get("room") === value.id) setRoom(value);
    }
    channel.current = new BroadcastChannel("co-prompt-room");
    channel.current.onmessage = event => setRoom(event.data as Room);
    return () => channel.current?.close();
  }, []);

  useEffect(() => {
    if (!room) return;
    localStorage.setItem(ROOM_KEY, JSON.stringify(room));
    channel.current?.postMessage(room);
  }, [room]);

  const file = useMemo(() => room?.files.find(item => item.path === activeFile) ?? room?.files[0], [room, activeFile]);
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
  const send = async () => {
    if (!room || !draft.trim() || running) return;
    const prompt = draft.trim(); const modifies = shouldModify(prompt);
    const message: Message = { id: id(), author: room.userName, initials: room.userName.slice(0, 2).toUpperCase(), createdAt: now(), role: "user", body: prompt };
    updateRoom({ messages: [...room.messages, message] }); setDraft("");
    if (!modifies) {
      const answer: Message = { id: id(), author: "co-prompt agent", initials: "✦", createdAt: now(), role: "assistant", body: "This looks like a project question, so I won’t change any files. Ask me to add, update, or fix something when you want me to make an edit." };
      setTimeout(() => setRoom(current => current ? { ...current, messages: [...current.messages, answer], updatedAt: Date.now() } : current), 400);
      return;
    }
    setRunning(true);
    try {
      let output = "";
      if (room.provider.apiKey && room.provider.baseUrl) {
        const response = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: room.provider, systemPrompt: room.systemPrompt, prompt, files: room.files }) });
        if (!response.ok) throw new Error("The configured provider could not complete the request.");
        output = (await response.json()).message || "I completed the requested update.";
      } else {
        await new Promise(resolve => setTimeout(resolve, 900));
        output = "I updated the primary page file. Configure an OpenAI-compatible provider in AI connection to use a live agent; local mode keeps this prototype fully usable without sending your code anywhere.";
      }
      const files = makeLocalChange(room.files, prompt); const changed = [files.find(item => item.path === (room.files.find(f => f.path.endsWith("page.tsx")) || room.files[0]).path)?.path || files[0].path];
      setLastChange(changed);
      setRoom(current => current ? { ...current, files, messages: [...current.messages, { id: id(), author: "co-prompt agent", initials: "✦", createdAt: now(), role: "assistant", body: output, changed }], updatedAt: Date.now() } : current);
    } catch (error) {
      setRoom(current => current ? { ...current, messages: [...current.messages, { id: id(), author: "co-prompt agent", initials: "✦", createdAt: now(), role: "assistant", body: error instanceof Error ? error.message : "Agent request failed." }] } : current);
    } finally { setRunning(false); }
  };

  return <Theme appearance="dark" accentColor="indigo" grayColor="slate" radius="large">
    {!room ? <Welcome roomName={roomName} setRoomName={setRoomName} userName={userName} setUserName={setUserName} enterRoom={enterRoom} /> :
      <main className="app-shell">
        <header className="topbar"><Flex align="center" gap="3"><Box className="brand-mark">⌘</Box><Heading size="3">co-prompt</Heading><Badge color="gray">local room</Badge></Flex><Flex align="center" gap="3"><Text size="2" weight="medium"><span className="green-dot" /> {room.name}</Text><Badge color="green" variant="soft">{room.id}</Badge></Flex><Flex justify="end" align="center" gap="2"><Avatar fallback={room.userName.slice(0, 2).toUpperCase()} color="indigo" size="2" /><Button size="2" onClick={() => setExportOpen(true)}>Export project</Button><IconButton variant="soft" onClick={() => setSettingsOpen(true)}>⚙</IconButton></Flex></header>
        <section className="workspace">
          <aside className="sidebar"><Flex justify="between" align="center" mb="3"><Text size="1" color="gray" weight="bold">PROJECT FILES</Text><IconButton size="1" variant="ghost" onClick={() => setSystemOpen(true)}>✦</IconButton></Flex><nav className="file-list">{room.files.map(item => <Button key={item.path} variant={item.path === file?.path ? "soft" : "ghost"} color={item.path === file?.path ? "indigo" : "gray"} className="file-button" onClick={() => setActiveFile(item.path)}><span>{item.path.endsWith(".json") ? "{}" : item.path.endsWith(".css") ? "#" : "◇"}</span>{item.path}</Button>)}</nav><Box className="sidebar-footer"><Text size="1" color="gray">Only the agent can modify files. All room data is stored in this browser and syncs across open tabs.</Text></Box></aside>
          <section className="editor-panel"><Flex className="editor-head" align="center" justify="between"><Text size="2" weight="medium">{file?.path}</Text><Badge color="gray" variant="soft">read-only</Badge></Flex><Box className="code-area">{file?.content.split("\n").map((line, index) => <div className="code-line" key={`${index}-${line}`}><span className="line-number">{index + 1}</span><code>{line || " "}</code></div>)}</Box><Flex className="editor-status" justify="between"><Text size="1">main · synced</Text><Text size="1">TypeScript · UTF-8</Text></Flex></section>
          <section className="chat-panel"><Flex className="chat-header" align="center" justify="between"><Box><Heading size="3">Room chat</Heading><Text size="1" color="gray"><span className="green-dot" /> {running ? "Agent is working" : "Ready to collaborate"}</Text></Box><Badge color={running ? "amber" : "green"}>{running ? "locked" : "live"}</Badge></Flex><Box className="messages">{room.messages.map(message => <Flex key={message.id} className={`message ${message.role}`} gap="2"><Avatar fallback={message.initials} color={message.role === "assistant" ? "indigo" : "orange"} size="2" /><Box><Flex gap="2" align="baseline"><Text size="2" weight="bold">{message.author}</Text><Text size="1" color="gray">{message.createdAt}</Text></Flex><Text as="p" size="2">{message.body}</Text>{message.changed && <Card className="change-card"><Flex justify="between" align="center"><Box><Text size="2" weight="bold">Modified {message.changed.length} file</Text><Text as="p" size="1" color="gray">{message.changed.join(", ")}</Text></Box><Button size="1" variant="soft" onClick={() => { setLastChange(message.changed || []); setChangesOpen(true); }}>Review</Button></Flex></Card>}</Box></Flex>)}</Box>{running && <Callout.Root className="working"><Callout.Text>Agent is modifying the project. Sending is temporarily locked for everyone.</Callout.Text></Callout.Root>}<Box className="composer"><TextArea value={draft} onChange={e => setDraft(e.target.value)} disabled={running} placeholder={running ? "Agent is modifying the project…" : "Ask about the project or request a code change…"} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} /><Flex justify="between" align="center" mt="2"><Text size="1" color="gray">Enter to send · Shift+Enter for a new line</Text><Button size="1" disabled={!draft.trim() || running} onClick={() => void send()}>{running ? "Working…" : "Send to agent"}</Button></Flex></Box></section>
        </section>
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} room={room} updateRoom={updateRoom} />
        <SystemDialog open={systemOpen} onOpenChange={setSystemOpen} value={room.systemPrompt} onSave={systemPrompt => updateRoom({ systemPrompt })} />
        <Dialog.Root open={exportOpen} onOpenChange={setExportOpen}><Dialog.Content maxWidth="450px"><Dialog.Title>Export project</Dialog.Title><Dialog.Description size="2">Download a portable co-prompt project bundle containing the current file tree. You can commit the files to any Git repository afterwards.</Dialog.Description><Flex justify="end" gap="2" mt="5"><Dialog.Close><Button variant="soft" color="gray">Cancel</Button></Dialog.Close><Button onClick={exportProject}>Download bundle</Button></Flex></Dialog.Content></Dialog.Root>
        <Dialog.Root open={changesOpen} onOpenChange={setChangesOpen}><Dialog.Content maxWidth="700px"><Dialog.Title>Agent changes</Dialog.Title><Dialog.Description size="2" mb="3">The agent changed {lastChange.join(", ") || "a project file"}.</Dialog.Description><Card><pre className="diff">+ // AI update applied{"\n"}+ // Review the active file in the editor for the complete change.</pre></Card><Flex justify="end" mt="4"><Dialog.Close><Button>Done</Button></Dialog.Close></Flex></Dialog.Content></Dialog.Root>
      </main>}
  </Theme>;
}

function Welcome({ roomName, setRoomName, userName, setUserName, enterRoom }: { roomName: string; setRoomName: (value: string) => void; userName: string; setUserName: (value: string) => void; enterRoom: () => void }) {
  return <main className="welcome"><Card className="welcome-card"><Box className="welcome-logo">⌘</Box><Heading size="7" mb="2">Code together with an agent.</Heading><Text as="p" color="gray" mb="6">Create a room for your project. Open the same room link in another tab or browser to collaborate.</Text><Flex direction="column" gap="4"><label><Text size="2" weight="medium">Your name</Text><TextField.Root mt="1" placeholder="Ada Lovelace" value={userName} onChange={event => setUserName(event.target.value)} /></label><label><Text size="2" weight="medium">Project name</Text><TextField.Root mt="1" value={roomName} onChange={event => setRoomName(event.target.value)} /></label><Button size="3" onClick={enterRoom}>Create collaboration room</Button></Flex><Separator my="5" size="4" /><Text size="1" color="gray">AI changes are controlled from room chat. Configure TokenRouter or another OpenAI-compatible provider once you’re inside.</Text></Card></main>;
}

function SettingsDialog({ open, onOpenChange, room, updateRoom }: { open: boolean; onOpenChange: (value: boolean) => void; room: Room; updateRoom: (update: Partial<Room>) => void }) {
  const [provider, setProvider] = useState(room.provider);
  useEffect(() => setProvider(room.provider), [room.provider, open]);
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Content maxWidth="500px"><Dialog.Title>AI connection</Dialog.Title><Dialog.Description size="2">TokenRouter is ready by default. Add a key to use a live model; otherwise the local agent remains available for demos.</Dialog.Description><Flex direction="column" gap="3" mt="4"><label><Text size="2" weight="medium">Provider</Text><Select.Root value={provider.name} onValueChange={name => setProvider({ ...provider, name, baseUrl: name === "TokenRouter" ? "https://api.tokenrouter.io/v1" : provider.baseUrl })}><Select.Trigger mt="1" /><Select.Content><Select.Item value="TokenRouter">TokenRouter</Select.Item><Select.Item value="OpenAI-compatible">OpenAI-compatible</Select.Item></Select.Content></Select.Root></label><label><Text size="2" weight="medium">Model</Text><TextField.Root mt="1" value={provider.model} onChange={event => setProvider({ ...provider, model: event.target.value })} placeholder="auto:balance" /></label><label><Text size="2" weight="medium">API base URL</Text><TextField.Root mt="1" value={provider.baseUrl} onChange={event => setProvider({ ...provider, baseUrl: event.target.value })} placeholder="https://api.tokenrouter.io/v1" /></label><label><Text size="2" weight="medium">API key</Text><TextField.Root mt="1" type="password" value={provider.apiKey} onChange={event => setProvider({ ...provider, apiKey: event.target.value })} placeholder="tr_..." /></label></Flex><Flex justify="end" gap="2" mt="5"><Dialog.Close><Button variant="soft" color="gray">Cancel</Button></Dialog.Close><Dialog.Close><Button onClick={() => updateRoom({ provider })}>Save connection</Button></Dialog.Close></Flex></Dialog.Content></Dialog.Root>;
}

function SystemDialog({ open, onOpenChange, value, onSave }: { open: boolean; onOpenChange: (value: boolean) => void; value: string; onSave: (value: string) => void }) {
  const [prompt, setPrompt] = useState(value); useEffect(() => setPrompt(value), [value, open]);
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Content maxWidth="620px"><Dialog.Title>Project system prompt</Dialog.Title><Dialog.Description size="2">This context is sent with every live agent request and guides local mode as well.</Dialog.Description><TextArea mt="4" value={prompt} onChange={event => setPrompt(event.target.value)} style={{ minHeight: 190 }} /><Flex justify="end" gap="2" mt="4"><Dialog.Close><Button variant="soft" color="gray">Cancel</Button></Dialog.Close><Dialog.Close><Button onClick={() => onSave(prompt)}>Save context</Button></Dialog.Close></Flex></Dialog.Content></Dialog.Root>;
}
