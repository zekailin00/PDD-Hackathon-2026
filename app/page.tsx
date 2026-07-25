"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Avatar,
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Checkbox,
  Dialog,
  Flex,
  Heading,
  IconButton,
  Select,
  Separator,
  Text,
  TextArea,
  TextField,
  Theme,
} from "@radix-ui/themes";
import {
  DEFAULT_PROVIDER,
  ROLES,
  ChatMessage,
  CreateRoomInput,
  Participant,
  Provider,
  Role,
  Room,
  RoomVisibility,
  createDemoRoom,
  createEmptyRoom,
  effectivePresence,
  initialsFor,
  makeId,
  makeLocalChange,
  now,
  shouldModify,
} from "./room-model";

const ROOMS_KEY = "co-prompt:rooms:v2";
const LEGACY_ROOM_KEY = "co-prompt:room";
const ACTIVE_ROOM_KEY = "co-prompt:active-room";
const USER_ID_KEY = "co-prompt:user-id";
const CHANNEL_NAME = "co-prompt-rooms-v2";

type LegacyRoom = Partial<Room> & {
  messages?: ChatMessage[];
  userName?: string;
};

function normalizeRooms(value: unknown): Room[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const room = candidate as LegacyRoom;
    if (!room.id || !room.name) return [];
    return [{
      ...room,
      id: room.id,
      name: room.name,
      createdBy: room.createdBy || "legacy-owner",
      visibility: room.visibility || "public",
      allowedRoles: room.allowedRoles?.length ? room.allowedRoles : [...ROLES],
      files: room.files || [],
      agentMessages: room.agentMessages || room.messages || [],
      memberMessages: room.memberMessages || [],
      participants: room.participants || [],
      provider: room.provider || DEFAULT_PROVIDER,
      systemPrompt: room.systemPrompt || createDemoRoom().systemPrompt,
      agentRunning: false,
      updatedAt: room.updatedAt || Date.now(),
    } satisfies Room];
  });
}

function loadRooms(): Room[] {
  try {
    const stored = localStorage.getItem(ROOMS_KEY);
    const normalized = stored ? normalizeRooms(JSON.parse(stored)) : [];
    if (normalized.length) {
      return normalized.some((room) => room.id === "demo")
        ? normalized
        : [createDemoRoom(), ...normalized];
    }

    const legacyRaw = localStorage.getItem(LEGACY_ROOM_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as LegacyRoom;
      const demo = createDemoRoom();
      return [{
        ...demo,
        files: legacy.files || demo.files,
        agentMessages: legacy.messages || demo.agentMessages,
        provider: legacy.provider || demo.provider,
        systemPrompt: legacy.systemPrompt || demo.systemPrompt,
      }];
    }
  } catch {
    localStorage.removeItem(ROOMS_KEY);
  }
  return [createDemoRoom()];
}

function basename(path: string) {
  return path.split("/").at(-1) || path;
}

export default function Home() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [invitedRoomId, setInvitedRoomId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [activeFile, setActiveFile] = useState("");
  const [agentDraft, setAgentDraft] = useState("");
  const [memberDraft, setMemberDraft] = useState("");
  const [chatMode, setChatMode] = useState<"agent" | "members">("agent");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [lastChange, setLastChange] = useState<string[]>([]);
  const channel = useRef<BroadcastChannel | null>(null);
  const receivingSync = useRef(false);
  const userId = useRef("");

  useEffect(() => {
    userId.current = sessionStorage.getItem(USER_ID_KEY) || `user-${makeId()}`;
    sessionStorage.setItem(USER_ID_KEY, userId.current);

    const loadedRooms = loadRooms();
    const params = new URLSearchParams(window.location.search);
    const inviteId = params.get("room");
    const storedActiveRoom = sessionStorage.getItem(ACTIVE_ROOM_KEY);
    setRooms(loadedRooms);
    setInvitedRoomId(inviteId);
    if (
      storedActiveRoom &&
      loadedRooms.some((room) => room.id === storedActiveRoom) &&
      (!inviteId || inviteId === storedActiveRoom)
    ) {
      setActiveRoomId(storedActiveRoom);
    }

    channel.current = new BroadcastChannel(CHANNEL_NAME);
    channel.current.onmessage = (event: MessageEvent<{ rooms?: unknown }>) => {
      const nextRooms = normalizeRooms(event.data?.rooms);
      if (!nextRooms.length) return;
      receivingSync.current = true;
      setRooms(nextRooms);
    };
    setHydrated(true);
    return () => channel.current?.close();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms));
    if (receivingSync.current) {
      receivingSync.current = false;
      return;
    }
    channel.current?.postMessage({ rooms });
  }, [rooms, hydrated]);

  const activeRoom = useMemo(
    () => rooms.find((room) => room.id === activeRoomId) || null,
    [rooms, activeRoomId],
  );
  const activeParticipant = activeRoom?.participants.find(
    (participant) => participant.id === userId.current,
  );

  useEffect(() => {
    if (!activeRoom) {
      setActiveFile("");
      return;
    }
    if (!activeRoom.files.some((file) => file.path === activeFile)) {
      setActiveFile(activeRoom.files[0]?.path || "");
    }
  }, [activeRoom, activeFile]);

  useEffect(() => {
    if (!hydrated || !activeRoomId) return;
    const updatePresence = (status: "online" | "away") => {
      setRooms((current) =>
        current.map((room) =>
          room.id === activeRoomId
            ? {
                ...room,
                participants: room.participants.map((participant) =>
                  participant.id === userId.current
                    ? { ...participant, status, lastSeen: Date.now() }
                    : participant,
                ),
                updatedAt: Date.now(),
              }
            : room,
        ),
      );
    };
    const handleVisibility = () =>
      updatePresence(document.hidden ? "away" : "online");
    const handleUnload = () => {
      try {
        const stored = normalizeRooms(
          JSON.parse(localStorage.getItem(ROOMS_KEY) || "[]"),
        );
        const next = stored.map((room) =>
          room.id === activeRoomId
            ? {
                ...room,
                participants: room.participants.map((participant) =>
                  participant.id === userId.current
                    ? { ...participant, status: "offline" as const, lastSeen: Date.now() }
                    : participant,
                ),
              }
            : room,
        );
        localStorage.setItem(ROOMS_KEY, JSON.stringify(next));
      } catch {
        // The next heartbeat repairs presence if storage is temporarily unavailable.
      }
    };

    updatePresence("online");
    const heartbeat = window.setInterval(
      () => updatePresence(document.hidden ? "away" : "online"),
      15_000,
    );
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [activeRoomId, hydrated]);

  const updateRoom = (
    roomId: string,
    update: Partial<Room> | ((room: Room) => Room),
  ) => {
    setRooms((current) =>
      current.map((room) => {
        if (room.id !== roomId) return room;
        const next = typeof update === "function" ? update(room) : { ...room, ...update };
        return { ...next, updatedAt: Date.now() };
      }),
    );
  };

  const enterRoom = (roomId: string, name: string, role: Role) => {
    const room = rooms.find((candidate) => candidate.id === roomId);
    if (!room || !room.allowedRoles.includes(role)) return;
    const participant: Participant = {
      id: userId.current,
      name: name.trim() || "Anonymous",
      role,
      status: "online",
      lastSeen: Date.now(),
    };
    updateRoom(roomId, (current) => ({
      ...current,
      participants: [
        ...current.participants.filter((item) => item.id !== userId.current),
        participant,
      ],
    }));
    setActiveRoomId(roomId);
    setInvitedRoomId(roomId);
    sessionStorage.setItem(ACTIVE_ROOM_KEY, roomId);
    window.history.replaceState({}, "", `?room=${encodeURIComponent(roomId)}`);
  };

  const createRoom = (input: CreateRoomInput) => {
    const room = createEmptyRoom(input, userId.current);
    setRooms((current) => [...current, room]);
    setActiveRoomId(room.id);
    setInvitedRoomId(room.id);
    sessionStorage.setItem(ACTIVE_ROOM_KEY, room.id);
    window.history.replaceState({}, "", `?room=${encodeURIComponent(room.id)}`);
  };

  const confirmLeave = () => {
    if (!activeRoom) return;
    const leavingRoomId = activeRoom.id;
    updateRoom(leavingRoomId, (current) => ({
      ...current,
      participants: current.participants.filter(
        (participant) => participant.id !== userId.current,
      ),
    }));
    sessionStorage.removeItem(ACTIVE_ROOM_KEY);
    setActiveRoomId(null);
    setInvitedRoomId(leavingRoomId);
    setLeaveOpen(false);
    setChatMode("agent");
    window.history.replaceState(
      {},
      "",
      `?room=${encodeURIComponent(leavingRoomId)}`,
    );
  };

  const sendMemberMessage = () => {
    if (!activeRoom || !activeParticipant || !memberDraft.trim()) return;
    const message: ChatMessage = {
      id: makeId(),
      authorId: userId.current,
      author: activeParticipant.name,
      initials: initialsFor(activeParticipant.name),
      createdAt: now(),
      body: memberDraft.trim(),
      kind: "human",
    };
    updateRoom(activeRoom.id, (current) => ({
      ...current,
      memberMessages: [...current.memberMessages, message],
    }));
    setMemberDraft("");
  };

  const sendAgentMessage = async () => {
    if (
      !activeRoom ||
      !activeParticipant ||
      activeParticipant.role === "OBSERVER" ||
      !agentDraft.trim() ||
      activeRoom.agentRunning
    ) {
      return;
    }
    const roomSnapshot = activeRoom;
    const prompt = agentDraft.trim();
    const modifies = shouldModify(prompt);
    const message: ChatMessage = {
      id: makeId(),
      authorId: userId.current,
      author: activeParticipant.name,
      initials: initialsFor(activeParticipant.name),
      createdAt: now(),
      body: prompt,
      kind: "human",
    };
    updateRoom(roomSnapshot.id, (current) => ({
      ...current,
      agentMessages: [...current.agentMessages, message],
      agentRunning: modifies,
    }));
    setAgentDraft("");

    if (!modifies) {
      window.setTimeout(() => {
        updateRoom(roomSnapshot.id, (current) => ({
          ...current,
          agentMessages: [
            ...current.agentMessages,
            {
              id: makeId(),
              author: "co-prompt agent",
              initials: "✦",
              createdAt: now(),
              kind: "assistant",
              body: "This looks like a project question, so I won’t change any files. Ask me to add, update, or fix something when you want me to make an edit.",
            },
          ],
        }));
      }, 350);
      return;
    }

    try {
      let output = "";
      if (roomSnapshot.provider.apiKey && roomSnapshot.provider.baseUrl) {
        const response = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: roomSnapshot.provider,
            systemPrompt: roomSnapshot.systemPrompt,
            prompt,
            files: roomSnapshot.files,
          }),
        });
        if (!response.ok) {
          throw new Error("The configured provider could not complete the request.");
        }
        output =
          (await response.json()).message || "I completed the requested update.";
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 850));
        output =
          "I updated the primary page file. Configure TokenRouter or another OpenAI-compatible provider in Room settings to use a live agent; local mode keeps this prototype usable without sending your code anywhere.";
      }

      const files = makeLocalChange(roomSnapshot.files, prompt);
      const changed = [files[0].path];
      setLastChange(changed);
      updateRoom(roomSnapshot.id, (current) => ({
        ...current,
        files,
        agentRunning: false,
        agentMessages: [
          ...current.agentMessages,
          {
            id: makeId(),
            author: "co-prompt agent",
            initials: "✦",
            createdAt: now(),
            kind: "assistant",
            body: output,
            changed,
          },
        ],
      }));
    } catch (error) {
      updateRoom(roomSnapshot.id, (current) => ({
        ...current,
        agentRunning: false,
        agentMessages: [
          ...current.agentMessages,
          {
            id: makeId(),
            author: "co-prompt agent",
            initials: "✦",
            createdAt: now(),
            kind: "assistant",
            body:
              error instanceof Error ? error.message : "Agent request failed.",
          },
        ],
      }));
    }
  };

  const exportProject = () => {
    if (!activeRoom) return;
    const blob = new Blob(
      [JSON.stringify({ name: activeRoom.name, files: activeRoom.files }, null, 2)],
      { type: "application/json" },
    );
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${
      activeRoom.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "project"
    }.co-prompt.json`;
    anchor.click();
    URL.revokeObjectURL(href);
    setExportOpen(false);
  };

  const openInvite = () => {
    setInviteCopied(false);
    setInviteOpen(true);
  };

  const inviteUrl =
    activeRoom && typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(activeRoom.id)}`
      : "";

  const copyInvite = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setInviteCopied(true);
  };

  if (!hydrated) {
    return (
      <Theme appearance="dark" accentColor="indigo" grayColor="slate" radius="large">
        <main className="welcome"><Text color="gray">Loading co-prompt…</Text></main>
      </Theme>
    );
  }

  if (!activeRoom || !activeParticipant) {
    return (
      <Theme appearance="dark" accentColor="indigo" grayColor="slate" radius="large">
        <Welcome
          rooms={rooms}
          invitedRoomId={invitedRoomId}
          onJoin={enterRoom}
          onCreate={createRoom}
        />
      </Theme>
    );
  }

  const file =
    activeRoom.files.find((item) => item.path === activeFile) ||
    activeRoom.files[0];
  const messages =
    chatMode === "agent" ? activeRoom.agentMessages : activeRoom.memberMessages;
  const canManage = activeRoom.createdBy === userId.current;
  const canPromptAgent = activeParticipant.role !== "OBSERVER";

  return (
    <Theme appearance="dark" accentColor="indigo" grayColor="slate" radius="large">
      <main className="app-shell">
        <header className="topbar">
          <Flex align="center" gap="3">
            <Box className="brand-mark">⌘</Box>
            <Heading size="3">co-prompt</Heading>
            <Badge color={activeRoom.isDemo ? "violet" : "gray"}>
              {activeRoom.isDemo ? "Demo" : activeRoom.visibility}
            </Badge>
          </Flex>
          <Flex className="room-presence" align="center" gap="2">
            <Text size="2" weight="medium">{activeRoom.name}</Text>
            {activeRoom.participants.map((participant) => {
              const presence = effectivePresence(participant);
              return (
                <div
                  className="participant-pill"
                  key={participant.id}
                  title={`${participant.name} · ${participant.role} · ${presence}`}
                >
                  <Avatar fallback={initialsFor(participant.name)} size="1" />
                  <span className={`presence-dot ${presence}`} />
                  <Text size="1" weight="medium">{participant.name}</Text>
                  <Text size="1" color="gray">{participant.role}</Text>
                </div>
              );
            })}
          </Flex>
          <Flex justify="end" align="center" gap="2">
            <Button size="2" variant="soft" onClick={openInvite}>Invite</Button>
            {canManage && !activeRoom.isDemo && (
              <Button size="2" variant="soft" onClick={() => setSettingsOpen(true)}>
                Room settings
              </Button>
            )}
            <IconButton
              variant="soft"
              color="red"
              aria-label="Leave room"
              title="Leave room"
              onClick={() => setLeaveOpen(true)}
            >
              ↗
            </IconButton>
          </Flex>
        </header>

        <section className="workspace">
          <aside className="sidebar">
            <Flex justify="between" align="center" mb="3">
              <Text size="1" color="gray" weight="bold">PROJECT FILES</Text>
              <Button size="1" variant="ghost" onClick={() => setExportOpen(true)}>
                Export
              </Button>
            </Flex>
            {activeRoom.files.length ? (
              <nav className="file-list">
                {activeRoom.files.map((item) => (
                  <Button
                    key={item.path}
                    variant={item.path === file?.path ? "soft" : "ghost"}
                    color={item.path === file?.path ? "indigo" : "gray"}
                    className="file-button"
                    onClick={() => setActiveFile(item.path)}
                  >
                    <span>
                      {item.path.endsWith(".json")
                        ? "{}"
                        : item.path.endsWith(".css")
                          ? "#"
                          : "◇"}
                    </span>
                    {basename(item.path)}
                  </Button>
                ))}
              </nav>
            ) : (
              <Card className="empty-files">
                <Text size="2" weight="bold">No project files yet</Text>
                <Text as="p" size="1" color="gray">
                  Ask the agent to create the first TypeScript file.
                </Text>
              </Card>
            )}
            <Box className="sidebar-footer">
              <Text size="1" color="gray">
                Agent room messages can use tokens. Member chat is never included in
                AI requests.
              </Text>
            </Box>
          </aside>

          <section className="editor-panel">
            <Flex className="editor-head" align="center" justify="between">
              <Text size="2" weight="medium">{file?.path || "No file selected"}</Text>
              <Badge color="gray" variant="soft">read-only</Badge>
            </Flex>
            {file ? (
              <Box className="code-area">
                {file.content.split("\n").map((line, index) => (
                  <div className="code-line" key={`${index}-${line}`}>
                    <span className="line-number">{index + 1}</span>
                    <code>{line || " "}</code>
                  </div>
                ))}
              </Box>
            ) : (
              <Box className="empty-editor">
                <Heading size="4">Start with a clean session.</Heading>
                <Text color="gray">
                  This room has no seed project. Ask the agent to build something or
                  use member chat to plan first.
                </Text>
              </Box>
            )}
            <Flex className="editor-status" justify="between">
              <Text size="1">new · synced</Text>
              <Text size="1">Node + TypeScript · UTF-8</Text>
            </Flex>
          </section>

          <section className="chat-panel">
            <div className="chat-tabs">
              <button
                className={chatMode === "agent" ? "active" : ""}
                onClick={() => setChatMode("agent")}
              >
                Agent room
                <small>AI sees this · may use tokens</small>
              </button>
              <button
                className={chatMode === "members" ? "active" : ""}
                onClick={() => setChatMode("members")}
              >
                Member chat
                <small>Private from AI · 0 tokens</small>
              </button>
            </div>

            <Flex className="chat-header" align="center" justify="between">
              <Box>
                <Heading size="3">
                  {chatMode === "agent" ? "Build with the agent" : "Team chatroom"}
                </Heading>
                <Text size="1" color="gray">
                  <span className="green-dot" />
                  {chatMode === "agent"
                    ? activeRoom.agentRunning
                      ? "Agent is working"
                      : "Shared AI session"
                    : "Members only — excluded from every AI prompt"}
                </Text>
              </Box>
              <Badge
                color={
                  chatMode === "members"
                    ? "green"
                    : activeRoom.agentRunning
                      ? "amber"
                      : "indigo"
                }
              >
                {chatMode === "members"
                  ? "0 tokens"
                  : activeRoom.agentRunning
                    ? "locked"
                    : "agent"}
              </Badge>
            </Flex>

            <Box className="messages">
              {!messages.length && (
                <div className="empty-chat">
                  <Text size="2" weight="bold">
                    {chatMode === "agent"
                      ? "No agent prompts yet"
                      : "No member messages yet"}
                  </Text>
                  <Text size="1" color="gray">
                    {chatMode === "agent"
                      ? "Start the shared build when the room is ready."
                      : "Plan freely here. The agent cannot see this channel."}
                  </Text>
                </div>
              )}
              {messages.map((message) => (
                <Flex
                  key={message.id}
                  className={`message ${message.kind}`}
                  gap="2"
                >
                  <Avatar
                    fallback={message.initials}
                    color={message.kind === "assistant" ? "indigo" : "orange"}
                    size="2"
                  />
                  <Box>
                    <Flex gap="2" align="baseline">
                      <Text size="2" weight="bold">{message.author}</Text>
                      <Text size="1" color="gray">{message.createdAt}</Text>
                    </Flex>
                    <Text as="p" size="2">{message.body}</Text>
                    {message.changed && (
                      <Card className="change-card">
                        <Flex justify="between" align="center">
                          <Box>
                            <Text size="2" weight="bold">
                              Modified {message.changed.length} file
                            </Text>
                            <Text as="p" size="1" color="gray">
                              {message.changed.join(", ")}
                            </Text>
                          </Box>
                          <Button
                            size="1"
                            variant="soft"
                            onClick={() => {
                              setLastChange(message.changed || []);
                              setChangesOpen(true);
                            }}
                          >
                            Review
                          </Button>
                        </Flex>
                      </Card>
                    )}
                  </Box>
                </Flex>
              ))}
            </Box>

            {chatMode === "agent" && activeRoom.agentRunning && (
              <Callout.Root className="working">
                <Callout.Text>
                  Agent is modifying the project. Agent prompts are temporarily locked;
                  member chat remains available.
                </Callout.Text>
              </Callout.Root>
            )}

            <Box className={`composer ${chatMode === "members" ? "member-composer" : ""}`}>
              <TextArea
                value={chatMode === "agent" ? agentDraft : memberDraft}
                onChange={(event) =>
                  chatMode === "agent"
                    ? setAgentDraft(event.target.value)
                    : setMemberDraft(event.target.value)
                }
                disabled={
                  chatMode === "agent" &&
                  (activeRoom.agentRunning || !canPromptAgent)
                }
                placeholder={
                  chatMode === "members"
                    ? "Message members without involving the AI…"
                    : !canPromptAgent
                      ? "Observers cannot prompt the agent."
                      : activeRoom.agentRunning
                        ? "Agent is modifying the project…"
                        : "Ask about the project or request a code change…"
                }
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.shiftKey) return;
                  event.preventDefault();
                  if (chatMode === "agent") void sendAgentMessage();
                  else sendMemberMessage();
                }}
              />
              <Flex justify="between" align="center" mt="2">
                <Text size="1" color="gray">
                  {chatMode === "members"
                    ? "Never sent to the agent · zero token cost"
                    : "Shared with the agent and everyone in this room"}
                </Text>
                <Button
                  size="1"
                  color={chatMode === "members" ? "green" : "indigo"}
                  disabled={
                    chatMode === "agent"
                      ? !agentDraft.trim() ||
                        activeRoom.agentRunning ||
                        !canPromptAgent
                      : !memberDraft.trim()
                  }
                  onClick={() =>
                    chatMode === "agent"
                      ? void sendAgentMessage()
                      : sendMemberMessage()
                  }
                >
                  {chatMode === "agent" ? "Send to agent" : "Send to members"}
                </Button>
              </Flex>
            </Box>
          </section>
        </section>

        <RoomSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          room={activeRoom}
          onSave={(update) => updateRoom(activeRoom.id, update)}
        />

        <Dialog.Root open={inviteOpen} onOpenChange={setInviteOpen}>
          <Dialog.Content maxWidth="520px">
            <Dialog.Title>Invite members</Dialog.Title>
            <Dialog.Description size="2">
              Share this link to join {activeRoom.name}. Private sessions do not appear
              in the public room list and can only be reached with this link.
            </Dialog.Description>
            <TextField.Root mt="4" value={inviteUrl} readOnly />
            <Flex justify="between" align="center" mt="4">
              <Text size="1" color={inviteCopied ? "green" : "gray"}>
                {inviteCopied
                  ? "Invite link copied."
                  : `${activeRoom.participants.length} member${activeRoom.participants.length === 1 ? "" : "s"} in this session`}
              </Text>
              <Button onClick={() => void copyInvite()}>
                {inviteCopied ? "Copied" : "Copy invite link"}
              </Button>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>

        <Dialog.Root open={leaveOpen} onOpenChange={setLeaveOpen}>
          <Dialog.Content maxWidth="430px">
            <Dialog.Title>Leave this room?</Dialog.Title>
            <Dialog.Description size="2">
              You’ll be removed from {activeRoom.name} and your live status will
              disappear. Use the invite link to join again.
            </Dialog.Description>
            <Flex justify="end" gap="2" mt="5">
              <Dialog.Close><Button variant="soft" color="gray">Stay</Button></Dialog.Close>
              <Button color="red" onClick={confirmLeave}>Leave room</Button>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>

        <Dialog.Root open={exportOpen} onOpenChange={setExportOpen}>
          <Dialog.Content maxWidth="450px">
            <Dialog.Title>Export project</Dialog.Title>
            <Dialog.Description size="2">
              Download a portable co-prompt project bundle containing the current
              TypeScript file tree.
            </Dialog.Description>
            <Flex justify="end" gap="2" mt="5">
              <Dialog.Close><Button variant="soft" color="gray">Cancel</Button></Dialog.Close>
              <Button onClick={exportProject}>Download bundle</Button>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>

        <Dialog.Root open={changesOpen} onOpenChange={setChangesOpen}>
          <Dialog.Content maxWidth="700px">
            <Dialog.Title>Agent changes</Dialog.Title>
            <Dialog.Description size="2" mb="3">
              The agent changed {lastChange.join(", ") || "a project file"}.
            </Dialog.Description>
            <Card>
              <pre className="diff">
                + // AI update applied{"\n"}+ // Review the active file in the editor.
              </pre>
            </Card>
            <Flex justify="end" mt="4">
              <Dialog.Close><Button>Done</Button></Dialog.Close>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>
      </main>
    </Theme>
  );
}

function Welcome({
  rooms,
  invitedRoomId,
  onJoin,
  onCreate,
}: {
  rooms: Room[];
  invitedRoomId: string | null;
  onJoin: (roomId: string, userName: string, role: Role) => void;
  onCreate: (input: CreateRoomInput) => void;
}) {
  const joinableRooms = useMemo(
    () =>
      rooms.filter(
        (room) => room.visibility === "public" || room.id === invitedRoomId,
      ),
    [rooms, invitedRoomId],
  );
  const [mode, setMode] = useState<"join" | "create">("join");
  const [userName, setUserName] = useState("");
  const [roomId, setRoomId] = useState(
    invitedRoomId || joinableRooms[0]?.id || "",
  );
  const [role, setRole] = useState<Role>("ENG");
  const [sessionName, setSessionName] = useState("");
  const [visibility, setVisibility] = useState<RoomVisibility>("public");
  const [allowedRoles, setAllowedRoles] = useState<Role[]>([...ROLES]);
  const [provider, setProvider] = useState<Provider>({ ...DEFAULT_PROVIDER });

  useEffect(() => {
    if (invitedRoomId && rooms.some((room) => room.id === invitedRoomId)) {
      setRoomId(invitedRoomId);
      return;
    }
    if (!joinableRooms.some((room) => room.id === roomId)) {
      setRoomId(joinableRooms[0]?.id || "");
    }
  }, [invitedRoomId, joinableRooms, roomId, rooms]);

  const selectedRoom = joinableRooms.find((room) => room.id === roomId);
  useEffect(() => {
    if (selectedRoom && !selectedRoom.allowedRoles.includes(role)) {
      setRole(selectedRoom.allowedRoles[0] || "OBSERVER");
    }
  }, [role, selectedRoom]);

  const validName = userName.trim().length > 0;
  const canJoin = validName && Boolean(selectedRoom);
  const canCreate =
    validName && sessionName.trim().length > 0 && allowedRoles.length > 0;

  return (
    <main className="welcome">
      <Card className="welcome-card">
        <Box className="welcome-logo">⌘</Box>
        <Heading size="7" mb="2">Code together with an agent.</Heading>
        <Text as="p" color="gray" mb="5">
          Join an existing room or create a configurable co-working session.
        </Text>
        <div className="welcome-mode">
          <button className={mode === "join" ? "active" : ""} onClick={() => setMode("join")}>
            Join a room
          </button>
          <button className={mode === "create" ? "active" : ""} onClick={() => setMode("create")}>
            Create a co-working session
          </button>
        </div>

        <Flex direction="column" gap="4" mt="5">
          <label>
            <Text size="2" weight="medium">Your name</Text>
            <TextField.Root
              mt="1"
              placeholder="Ada Lovelace"
              value={userName}
              onChange={(event) => setUserName(event.target.value)}
            />
          </label>

          {mode === "join" ? (
            <>
              <label>
                <Text size="2" weight="medium">Available room</Text>
                {joinableRooms.length ? (
                  <Select.Root value={roomId} onValueChange={setRoomId}>
                    <Select.Trigger mt="1" placeholder="Select a room" />
                    <Select.Content>
                      {joinableRooms.map((room) => (
                        <Select.Item key={room.id} value={room.id}>
                          {room.name}
                          {room.isDemo
                            ? " · seeded demo"
                            : room.visibility === "private"
                              ? " · invited"
                              : ""}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Root>
                ) : (
                  <Callout.Root mt="2">
                    <Callout.Text>No public rooms are available yet.</Callout.Text>
                  </Callout.Root>
                )}
              </label>
              {selectedRoom && (
                <label>
                  <Text size="2" weight="medium">Your role</Text>
                  <Select.Root value={role} onValueChange={(value) => setRole(value as Role)}>
                    <Select.Trigger mt="1" />
                    <Select.Content>
                      {selectedRoom.allowedRoles.map((item) => (
                        <Select.Item key={item} value={item}>{item}</Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Root>
                </label>
              )}
              <Button
                size="3"
                disabled={!canJoin}
                onClick={() => selectedRoom && onJoin(selectedRoom.id, userName, role)}
              >
                Join selected room
              </Button>
              <Text size="1" color="gray">
                Room names are selected from live sessions and cannot be typed manually.
              </Text>
            </>
          ) : (
            <>
              <label>
                <Text size="2" weight="medium">Session name</Text>
                <TextField.Root
                  mt="1"
                  placeholder="Launch readiness"
                  value={sessionName}
                  onChange={(event) => setSessionName(event.target.value)}
                />
              </label>
              <Flex gap="3">
                <label className="grow">
                  <Text size="2" weight="medium">Who can join</Text>
                  <Select.Root
                    value={visibility}
                    onValueChange={(value) => setVisibility(value as RoomVisibility)}
                  >
                    <Select.Trigger mt="1" />
                    <Select.Content>
                      <Select.Item value="public">Public — listed</Select.Item>
                      <Select.Item value="private">Private — invite link only</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </label>
                <label className="grow">
                  <Text size="2" weight="medium">Your role</Text>
                  <Select.Root value={role} onValueChange={(value) => setRole(value as Role)}>
                    <Select.Trigger mt="1" />
                    <Select.Content>
                      {ROLES.map((item) => <Select.Item key={item} value={item}>{item}</Select.Item>)}
                    </Select.Content>
                  </Select.Root>
                </label>
              </Flex>

              <Box>
                <Text size="2" weight="medium">Roles allowed to join</Text>
                <RoleChecklist value={allowedRoles} onChange={setAllowedRoles} />
              </Box>

              <Card className="connection-card">
                <Text size="2" weight="bold">AI connection</Text>
                <Text as="p" size="1" color="gray">
                  Optional. Keys remain in this browser’s room storage.
                </Text>
                <Flex direction="column" gap="3" mt="3">
                  <TextField.Root
                    placeholder="Model · auto:balance"
                    value={provider.model}
                    onChange={(event) => setProvider({ ...provider, model: event.target.value })}
                  />
                  <TextField.Root
                    placeholder="API base URL"
                    value={provider.baseUrl}
                    onChange={(event) => setProvider({ ...provider, baseUrl: event.target.value })}
                  />
                  <TextField.Root
                    type="password"
                    placeholder="API key"
                    value={provider.apiKey}
                    onChange={(event) => setProvider({ ...provider, apiKey: event.target.value })}
                  />
                </Flex>
              </Card>

              <Button
                size="3"
                disabled={!canCreate}
                onClick={() =>
                  onCreate({
                    name: sessionName,
                    userName,
                    role,
                    visibility,
                    allowedRoles,
                    provider,
                  })
                }
              >
                Create co-working session
              </Button>
            </>
          )}
        </Flex>
      </Card>
    </main>
  );
}

function RoleChecklist({
  value,
  onChange,
}: {
  value: Role[];
  onChange: (roles: Role[]) => void;
}) {
  return (
    <Flex className="role-checklist" gap="2" wrap="wrap" mt="2">
      {ROLES.map((role) => (
        <label key={role}>
          <Checkbox
            checked={value.includes(role)}
            onCheckedChange={(checked) =>
              onChange(
                checked
                  ? Array.from(new Set([...value, role]))
                  : value.filter((item) => item !== role),
              )
            }
          />
          <Text size="1">{role}</Text>
        </label>
      ))}
    </Flex>
  );
}

function RoomSettingsDialog({
  open,
  onOpenChange,
  room,
  onSave,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  room: Room;
  onSave: (update: Partial<Room>) => void;
}) {
  const [name, setName] = useState(room.name);
  const [visibility, setVisibility] = useState(room.visibility);
  const [roles, setRoles] = useState<Role[]>(room.allowedRoles);
  const [provider, setProvider] = useState(room.provider);
  const [systemPrompt, setSystemPrompt] = useState(room.systemPrompt);

  useEffect(() => {
    if (!open) return;
    setName(room.name);
    setVisibility(room.visibility);
    setRoles(room.allowedRoles);
    setProvider(room.provider);
    setSystemPrompt(room.systemPrompt);
  }, [open, room]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="620px">
        <Dialog.Title>Room settings</Dialog.Title>
        <Dialog.Description size="2">
          The session creator controls access, roles, the system prompt, and AI keys.
        </Dialog.Description>
        <Flex direction="column" gap="4" mt="4">
          <label>
            <Text size="2" weight="medium">Room name</Text>
            <TextField.Root mt="1" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            <Text size="2" weight="medium">Access</Text>
            <Select.Root
              value={visibility}
              onValueChange={(value) => setVisibility(value as RoomVisibility)}
            >
              <Select.Trigger mt="1" />
              <Select.Content>
                <Select.Item value="public">Public — listed</Select.Item>
                <Select.Item value="private">Private — invite link only</Select.Item>
              </Select.Content>
            </Select.Root>
          </label>
          <Box>
            <Text size="2" weight="medium">Roles allowed to join</Text>
            <RoleChecklist value={roles} onChange={setRoles} />
          </Box>
          <label>
            <Text size="2" weight="medium">Project system prompt</Text>
            <TextArea
              mt="1"
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
              style={{ minHeight: 130 }}
            />
          </label>
          <Separator size="4" />
          <Text size="2" weight="bold">AI connection</Text>
          <Flex gap="3">
            <label className="grow">
              <Text size="1">Provider</Text>
              <Select.Root
                value={provider.name}
                onValueChange={(providerName) =>
                  setProvider({
                    ...provider,
                    name: providerName,
                    baseUrl:
                      providerName === "TokenRouter"
                        ? "https://api.tokenrouter.io/v1"
                        : provider.baseUrl,
                  })
                }
              >
                <Select.Trigger mt="1" />
                <Select.Content>
                  <Select.Item value="TokenRouter">TokenRouter</Select.Item>
                  <Select.Item value="OpenAI-compatible">OpenAI-compatible</Select.Item>
                </Select.Content>
              </Select.Root>
            </label>
            <label className="grow">
              <Text size="1">Model</Text>
              <TextField.Root
                mt="1"
                value={provider.model}
                onChange={(event) => setProvider({ ...provider, model: event.target.value })}
              />
            </label>
          </Flex>
          <label>
            <Text size="1">API base URL</Text>
            <TextField.Root
              mt="1"
              value={provider.baseUrl}
              onChange={(event) => setProvider({ ...provider, baseUrl: event.target.value })}
            />
          </label>
          <label>
            <Text size="1">API key</Text>
            <TextField.Root
              mt="1"
              type="password"
              value={provider.apiKey}
              onChange={(event) => setProvider({ ...provider, apiKey: event.target.value })}
            />
          </label>
        </Flex>
        <Flex justify="end" gap="2" mt="5">
          <Dialog.Close><Button variant="soft" color="gray">Cancel</Button></Dialog.Close>
          <Dialog.Close>
            <Button
              disabled={!name.trim() || !roles.length}
              onClick={() =>
                onSave({
                  name: name.trim(),
                  visibility,
                  allowedRoles: roles,
                  provider,
                  systemPrompt,
                })
              }
            >
              Save settings
            </Button>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
