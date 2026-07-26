"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import {
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
  Participant,
  PublicRoom,
  Room,
  RoomEvent,
  RoomProgress,
  RoomVisibility,
} from "@/lib/domain";
import { humanizeAgentOutput } from "@/lib/presentation";
import { ROOM_AGENT_SYSTEM } from "@/lib/prompts";
import { downloadGeneratedJavaScript } from "@/pdd/generated-code-download";
import type { Difficulty } from "@/pdd/model-router";
import {
  DEFAULT_POLICY,
  POWERS,
  resolveRole,
  voters,
  type Power,
  type Role,
  type RoleEntry,
} from "@/pdd/role-policy";

const identityKey = "coprompt:identity";
const preferencesKey = "coprompt:preferences";
type Locale = "en" | "zh-TW";
type ThemeMode = "light" | "dark";

const COPY = {
  en: {
    switchLanguage: "中文",
    switchToChinese: "Switch to Traditional Chinese",
    switchToEnglish: "Switch to English",
    switchToDark: "Switch to dark mode",
    switchToLight: "Switch to light mode",
    dark: "Dark",
    light: "Light",
    heroTitle: "CoPrompt",
    heroDescription: "Join Room and Create Co-working Session are separate. Rooms can only be selected from the public list or an invite link.",
    yourName: "Your name",
    pmRole: "PM · Scope",
    engRole: "ENG · Build",
    designRole: "DESIGN · Experience",
    qaRole: "QA · Verify",
    joinRoom: "Join Room",
    createSession: "Create Co-working Session",
    selectPublicRoom: "Select a public room",
    privateInvitedRoom: "Private invited room",
    noPublicRooms: "No public rooms yet. Create one or use a private invite link.",
    joining: "Joining…",
    joinSelected: "Join selected room",
    projectName: "Project name",
    publicListed: "Public — listed in room directory",
    privateInvite: "Private — invite link only",
    preferredModel: "Preferred model (leave blank for TokenRouter auto)",
    apiKeyCreate: "TokenRouter API key (optional; kept in server memory only)",
    startingZipLabel: "Starting project ZIP (optional)",
    startingZipHelp: "Upload up to 10 MB. Code and text files become read-only context for the shared agent.",
    chooseZip: "Choose a .zip project",
    zipTooLarge: "The ZIP file must be 10 MB or smaller.",
    zipRequired: "Please choose a .zip file.",
    systemPromptLabel: "Shared agent System Prompt",
    systemPromptHelp: "These instructions apply to every AI run in this room.",
    memoryLabel: "Long-term room memory",
    memoryHelp: "Remember approved room decisions. Member Chat, secrets, uploaded source, and generated code are never stored.",
    memoryOn: "Memory on",
    memoryOff: "Memory off",
    memoryPending: "Saving approved decision…",
    memoryQueued: "Approved decision queued for memory",
    memoryError: "Memory save unavailable",
    files: "files",
    creating: "Creating…",
    createFailed: "Could not create the room.",
    selectRoomFirst: "Select a room from the list.",
    joinFailed: "Could not join the room.",
    copyInvite: "Copy invite",
    roomSettings: "Room settings",
    roomId: "Room ID",
    copyRoomId: "Copy room ID",
    roomIdCopied: "Room ID copied.",
    deleteRoom: "Delete room",
    deleteRoomConfirm: "Delete this room for everyone? This cannot be undone.",
    roomDeleted: "This room was deleted.",
    logout: "Logout",
    leaveConfirm: "Leave this room? Your membership will be removed.",
    roomMembers: "Room members",
    joined: "joined",
    online: "Online",
    away: "Away",
    offline: "Offline",
    sharedIntent: "Shared intent document",
    sync: "Sync",
    intentSynced: "Shared intent synced",
    reply: "Reply",
    replyingTo: "Replying to",
    message: "message",
    memberOnly: "still not sent to AI",
    cancel: "Cancel",
    memberPlaceholder: "Only room members will receive this. It is never sent to AI…",
    sendMemberChat: "Send Member Chat",
    chatSynced: "Member Chat synced; never sent to AI",
    neverSent: "Member Chat · Never sent to AI · 0 tokens",
    roomActivity: "Room activity & Member Chat",
    sharedConversation: "Shared conversation",
    conversationEmpty: "Team prompts and agent responses will appear here.",
    artifactGenerated: "Artifact generated. Open Preview to review it.",
    liveRun: "Live run",
    defaultOutput: "Once the shared intent is ready, any authorized role can start the agent.",
    steeringPlaceholder: "What should change before the next step?",
    runPlaceholder: "Tell the shared agent what to complete in this run…",
    running: "Running…",
    noRunningRun: "There is no active run.",
    steerQueued: "queued for the next checkpoint",
    noProposal: "There is no proposal awaiting review.",
    startingRouter: "Starting TokenRouter auto…",
    steerApplied: "steering notes applied",
    haltedBy: "stopped the run",
    step: "Step",
    artifactsApproval: "Artifacts & approval",
    preview: "Preview",
    generatedCode: "Generated code",
    tests: "Tests",
    previewEmpty: "The agent's complete HTML will be previewed here in a sandboxed window.",
    codeEmpty: "The complete generated HTML will appear here after an implementation run.",
    testsEmpty: "No test artifact yet.",
    approvalGate: "Room approval gate",
    approvalHelp: "Download the latest generated code as a self-contained JavaScript module.",
    approve: "Approve",
    requestChanges: "Request changes",
    approvalStatus: "Member approval status",
    approvalStatusHelp: "Each eligible member can cast or update one vote for this proposal.",
    notVoted: "Not voted",
    approved: "Approved",
    changesRequested: "Changes requested",
    confirmApproval: "Confirm approval",
    feedbackLabel: "What should change?",
    feedbackPlaceholder: "Describe the change the room needs before approval…",
    submitChanges: "Submit requested changes",
    feedbackRequired: "Please explain the requested changes.",
    exportIssue: "Download generated code",
    reading: "Reading room",
    planning: "Planning",
    building: "Building",
    reviewing: "Reviewing",
    done: "Done",
    you: "you",
    pickedUp: "Picked up",
    waiting: "Waiting",
    nonePickedUp: "No messages picked up yet",
    allReceived: "Everyone has been heard",
    settingsDescription: "Only the creator can change room settings, role powers, and decision priorities.",
    rolePowers: "Role powers & decision priority",
    rolePowersHelp: "Higher priority resolves conflicts in that decision domain. Disable a power to remove that role's action.",
    decisionPriority: "Priority",
    runPower: "Run agent",
    steerPower: "Nudge",
    haltPower: "Halt",
    editIntentPower: "Edit intent",
    votePower: "Vote",
    openPrPower: "Export",
    newApiKey: "New API key (leave blank to keep the current server key)",
    saveSettings: "Save settings",
    settingsUpdated: "Room settings updated",
  },
  "zh-TW": {
    switchLanguage: "English",
    switchToChinese: "切換為繁體中文",
    switchToEnglish: "切換為英文",
    switchToDark: "切換為深色模式",
    switchToLight: "切換為淺色模式",
    dark: "深色",
    light: "淺色",
    heroTitle: "CoPrompt",
    heroDescription: "Join Room 與 Create Co-working Session 完全分開。房間只能從公開清單或邀請連結選擇。",
    yourName: "你的名字",
    pmRole: "PM · 範圍",
    engRole: "ENG · 實作",
    designRole: "DESIGN · 體驗",
    qaRole: "QA · 驗證",
    joinRoom: "加入房間",
    createSession: "建立共同工作階段",
    selectPublicRoom: "選擇公開房間",
    privateInvitedRoom: "私人邀請房間",
    noPublicRooms: "目前沒有公開房間；請建立房間或使用私人邀請連結。",
    joining: "加入中…",
    joinSelected: "加入所選房間",
    projectName: "專案名稱",
    publicListed: "公開 — 顯示於房間清單",
    privateInvite: "私人 — 僅邀請連結",
    preferredModel: "偏好模型（留空由 TokenRouter 自動選擇）",
    apiKeyCreate: "TokenRouter API Key（選填；只保留在伺服器記憶體）",
    startingZipLabel: "初始專案 ZIP（選填）",
    startingZipHelp: "最多 10 MB；程式碼與文字檔會成為共用 agent 的唯讀初始內容。",
    chooseZip: "選擇 .zip 專案",
    zipTooLarge: "ZIP 檔案不可超過 10 MB。",
    zipRequired: "請選擇 .zip 檔案。",
    systemPromptLabel: "共用 Agent System Prompt",
    systemPromptHelp: "這些指令會套用到此房間的每一次 AI 執行。",
    memoryLabel: "房間長期記憶",
    memoryHelp: "只記住已核准的房間決策；Member Chat、秘密、上傳原始碼與生成程式碼永不儲存。",
    memoryOn: "記憶已開啟",
    memoryOff: "記憶已關閉",
    memoryPending: "正在儲存核准決策…",
    memoryQueued: "核准決策已排入記憶",
    memoryError: "記憶儲存目前無法使用",
    files: "個檔案",
    creating: "建立中…",
    createFailed: "建立房間失敗。",
    selectRoomFirst: "請從清單選擇房間。",
    joinFailed: "加入房間失敗。",
    copyInvite: "複製邀請",
    roomSettings: "房間設定",
    roomId: "房間 ID",
    copyRoomId: "複製房間 ID",
    roomIdCopied: "房間 ID 已複製。",
    deleteRoom: "刪除房間",
    deleteRoomConfirm: "確定要為所有成員刪除此房間？此操作無法復原。",
    roomDeleted: "此房間已被刪除。",
    logout: "登出",
    leaveConfirm: "確定要離開房間？你的成員身分會從房間移除。",
    roomMembers: "房間成員",
    joined: "已加入",
    online: "在線",
    away: "離開",
    offline: "離線",
    sharedIntent: "共同意圖文件",
    sync: "同步",
    intentSynced: "共同意圖已同步",
    reply: "回覆",
    replyingTo: "回覆",
    message: "訊息",
    memberOnly: "仍不會傳給 AI",
    cancel: "取消",
    memberPlaceholder: "只傳給房間成員，不會傳給 AI…",
    sendMemberChat: "送出 Member Chat",
    chatSynced: "Member Chat 已同步；不會傳給 AI",
    neverSent: "Member Chat · 不會傳給 AI · 0 tokens",
    roomActivity: "房間動態與 Member Chat",
    sharedConversation: "共享對話",
    conversationEmpty: "成員提示與 Agent 回覆會顯示在這裡。",
    artifactGenerated: "產物已生成；請到「預覽」查看。",
    liveRun: "即時執行",
    defaultOutput: "共同意圖準備好後，任何有權限的角色都能啟動 agent。",
    steeringPlaceholder: "下一個步驟前要修正什麼？",
    runPlaceholder: "告訴共享 agent 這一輪要完成什麼…",
    running: "執行中…",
    noRunningRun: "目前沒有執行中的 run。",
    steerQueued: "已排入下一個檢查點",
    noProposal: "目前沒有待審提案。",
    startingRouter: "正在啟動 TokenRouter auto…",
    steerApplied: "則導引已套用",
    haltedBy: "已中止執行",
    step: "步驟",
    artifactsApproval: "產物與核准",
    preview: "預覽",
    generatedCode: "生成程式碼",
    tests: "測試",
    previewEmpty: "Agent 產出的完整 HTML 會在這個 sandboxed sub-window 預覽。",
    codeEmpty: "執行實作意圖後，完整 HTML 程式碼會出現在這裡。",
    testsEmpty: "尚無測試產物。",
    approvalGate: "房間核准關卡",
    approvalHelp: "將最新生成程式碼下載成自包含的 JavaScript 模組。",
    approve: "核准",
    requestChanges: "要求修改",
    approvalStatus: "成員核准狀態",
    approvalStatusHelp: "每位符合資格的成員可針對此提案投票或更新一次投票。",
    notVoted: "尚未投票",
    approved: "已核准",
    changesRequested: "要求修改",
    confirmApproval: "確認核准",
    feedbackLabel: "需要修改什麼？",
    feedbackPlaceholder: "描述房間核准前需要完成的修改…",
    submitChanges: "送出修改要求",
    feedbackRequired: "請說明需要修改的內容。",
    exportIssue: "下載生成程式碼",
    reading: "讀取房間",
    planning: "擬定計畫",
    building: "產出內容",
    reviewing: "檢查驗收",
    done: "完成",
    you: "你",
    pickedUp: "已讀取",
    waiting: "未讀取",
    nonePickedUp: "尚未讀取任何人的訊息",
    allReceived: "全部都收到了",
    settingsDescription: "只有建立者可修改房間設定、角色權限與決策優先級。",
    rolePowers: "角色權限與決策優先級",
    rolePowersHelp: "同一決策領域發生衝突時，優先級較高者優先；關閉權限可移除該角色的操作。",
    decisionPriority: "優先級",
    runPower: "執行 Agent",
    steerPower: "Nudge",
    haltPower: "Halt",
    editIntentPower: "編輯意圖",
    votePower: "投票",
    openPrPower: "匯出",
    newApiKey: "新的 API key（留空保留目前 server key）",
    saveSettings: "儲存設定",
    settingsUpdated: "房間設定已更新",
  },
} as const;
type Copy = (typeof COPY)[Locale];

const newId = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues !== "function") return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};
const presenceColor = { online: "#59cf96", away: "#f2b84b", offline: "#6d707c" };
const presenceOrder = { online: 0, away: 1, offline: 2 };
const ROLES = ["pm", "eng", "design", "qa", "observer"] as const;

function resolvedPolicy(room: Room): Record<Role, RoleEntry> {
  return Object.fromEntries(
    ROLES.map((role) => [role, resolveRole(role, room.roleOverrides)]),
  ) as Record<Role, RoleEntry>;
}

function sortedParticipants(participants: Participant[]): Participant[] {
  return [...participants].sort(
    (a, b) => presenceOrder[a.status] - presenceOrder[b.status] || a.name.localeCompare(b.name),
  );
}

function memberTone(userId: string): string {
  if (userId === "agent") return "member-tone-agent";
  let hash = 0;
  for (const character of userId) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return `member-tone-${Math.abs(hash) % 6}`;
}

type Identity = { userId: string; name: string; role: Role };
type RoomResponse = { room: Room; token: string; inviteCode?: string; identity?: Identity; error?: string };

function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>, submit: () => void): void {
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
  event.preventDefault();
  submit();
}

export default function Home() {
  const [locale, setLocale] = useState<Locale>("en");
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [preferencesReady, setPreferencesReady] = useState(false);
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
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [projectZip, setProjectZip] = useState<File | null>(null);
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [approvalMode, setApprovalMode] = useState<"approve" | "request_changes" | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState("");
  const lastRoomId = useRef("");
  const intentDirty = useRef(false);
  const copy = COPY[locale];

  const refreshRooms = async () => {
    const response = await fetch("/api/rooms", { cache: "no-store" });
    const data = await response.json() as { rooms?: PublicRoom[] };
    setPublicRooms(data.rooms ?? []);
  };

  const exitRoom = async (message?: string) => {
    setRoom(null);
    setToken("");
    setCreatorInviteCode("");
    setUrlInviteCode("");
    setIntentDraft("");
    setLiveOutput("");
    setProgress(null);
    lastRoomId.current = "";
    if (message) setNotice(message);
    window.history.replaceState({}, "", window.location.pathname);
    await refreshRooms();
  };

  useEffect(() => {
    const storedPreferences = localStorage.getItem(preferencesKey);
    if (storedPreferences) {
      try {
        const parsed = JSON.parse(storedPreferences) as { locale?: Locale; themeMode?: ThemeMode };
        if (parsed.locale === "en" || parsed.locale === "zh-TW") setLocale(parsed.locale);
        if (parsed.themeMode === "light" || parsed.themeMode === "dark") setThemeMode(parsed.themeMode);
      } catch {
        localStorage.removeItem(preferencesKey);
      }
    }
    setPreferencesReady(true);
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
    if (!preferencesReady) return;
    document.documentElement.lang = locale;
    document.documentElement.dataset.themeMode = themeMode;
    localStorage.setItem(preferencesKey, JSON.stringify({ locale, themeMode }));
  }, [locale, preferencesReady, themeMode]);

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
      } else if (value.type === "progress") {
        // A terminal progress event can be emitted after the run's `done`
        // event, so never let it recreate the transient progress card.
        setProgress(value.progress.phase === "done" ? null : value.progress);
      } else if (value.type === "step") {
        setNotice(`${copy.step} ${value.step}: ${value.label}`);
      } else if (value.type === "steer_applied") {
        setNotice(`⚡ ${value.steers.length} ${copy.steerApplied}`);
      } else if (value.type === "halted") {
        setProgress(null);
        setNotice(`${value.by} ${copy.haltedBy}`);
      } else if (value.type === "done") {
        setProgress(null);
        setLiveOutput("");
      } else if (value.type === "deleted") {
        void exitRoom(copy.roomDeleted);
      } else if (value.type === "error") {
        setProgress(null);
        setNotice(value.message);
      }
    };
    return () => {
      events.close();
      lastRoomId.current = "";
    };
  }, [copy.haltedBy, copy.roomDeleted, copy.steerApplied, copy.step, room?.id, token]);

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
    const resolvedIdentity = data.identity || nextIdentity;
    localStorage.setItem(identityKey, JSON.stringify(resolvedIdentity));
    setIdentity(resolvedIdentity);
    setToken(data.token);
    setRoom(data.room);
    setIntentDraft(data.room.intent);
    setCreatorInviteCode(data.inviteCode || "");
    setNotice("");
    setLiveOutput("");
    setProgress(null);
    setApiKey("");
    setProjectZip(null);
    const invite = data.room.visibility === "private" ? data.inviteCode || urlInviteCode : "";
    const query = new URLSearchParams({ room: data.room.id });
    if (invite) query.set("invite", invite);
    window.history.replaceState({}, "", `?${query.toString()}`);
  };

  const createSession = async () => {
    if (projectZip && !projectZip.name.toLowerCase().endsWith(".zip")) {
      return setNotice(copy.zipRequired);
    }
    if (projectZip && projectZip.size > 10 * 1024 * 1024) {
      return setNotice(copy.zipTooLarge);
    }
    const nextIdentity = identityFromForm(identity, name, role);
    const form = new FormData();
    for (const [key, value] of Object.entries({
      action: "create",
      ...nextIdentity,
      title,
      visibility,
      preferredModel,
      systemPrompt,
      apiKey,
      baseUrl: "https://api.tokenrouter.com/v1",
    })) form.set(key, value);
    form.set("memoryEnabled", String(memoryEnabled));
    if (projectZip) form.set("projectZip", projectZip);
    setBusy(true);
    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        body: form,
      });
      const data = await response.json() as RoomResponse;
      if (!response.ok) return setNotice(data.error || copy.createFailed);
      enterRoom(data, nextIdentity);
    } finally {
      setBusy(false);
    }
  };

  const joinSession = async () => {
    if (!roomCode) return setNotice(copy.selectRoomFirst);
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
      if (!response.ok) return setNotice(data.error || copy.joinFailed);
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
    setNotice(response.ok ? copy.intentSynced : data.error);
  };

  const run = async () => {
    if (!room || !prompt.trim()) return;
    setBusy(true);
    setLiveOutput("");
    setProgress(null);
    setNotice(copy.startingRouter);
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
    if (!room || !runId) return setNotice(copy.noRunningRun);
    const response = await fetch(`/api/rooms/${room.id}/steers`, authorized(token, {
      runId,
      kind,
      content: steer,
    }));
    const data = await response.json();
    setNotice(response.ok ? `${kind.toUpperCase()} ${copy.steerQueued}` : data.error);
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
    setNotice(response.ok ? copy.chatSynced : data.error);
    if (response.ok) {
      setChatDraft("");
      setReplyTo("");
    }
  };

  const vote = async (verdict: "approve" | "request_changes", feedback?: string) => {
    const runId = [...(room?.runs || [])].reverse().find((item) => item.status === "proposed")?.id;
    if (!room || !runId) return setNotice(copy.noProposal);
    if (verdict === "request_changes" && !feedback?.trim()) return setNotice(copy.feedbackRequired);
    const response = await fetch(`/api/rooms/${room.id}/votes`, authorized(token, {
      runId,
      verdict,
      feedback: feedback?.trim() || undefined,
    }));
    const data = await response.json();
    setNotice(response.ok ? data.quorum.reason : data.error);
    if (response.ok) {
      setApprovalMode(null);
      setReviewFeedback("");
    }
  };

  const exportIssue = () => {
    if (!room) return;
    const html = [...room.artifacts].reverse().find((artifact) => artifact.kind === "html");
    if (!html) return setNotice("Run the agent to generate code before downloading it.");
    try {
      const stem = room.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "coprompt-generated";
      downloadGeneratedJavaScript(html.content, `${stem}.js`);
      setNotice("Generated JavaScript download started.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not download generated code."); }
  };
  const logout = async () => {
    if (!room || !window.confirm(copy.leaveConfirm)) return;
    const response = await fetch(`/api/rooms/${room.id}`, authorized(token, undefined, "DELETE"));
    if (!response.ok) {
      const data = await response.json();
      return setNotice(data.error);
    }
    await exitRoom();
  };

  const deleteCurrentRoom = async () => {
    if (!room || !window.confirm(copy.deleteRoomConfirm)) return;
    const response = await fetch(`/api/rooms/${room.id}`, authorized(token, {
      operation: "delete_room",
    }, "DELETE"));
    if (!response.ok) {
      const data = await response.json();
      return setNotice(data.error);
    }
    await exitRoom(copy.roomDeleted);
  };

  const inviteUrl = (() => {
    if (!room || typeof window === "undefined") return "";
    const query = new URLSearchParams({ room: room.id });
    const invite = creatorInviteCode || urlInviteCode;
    if (room.visibility === "private" && invite) query.set("invite", invite);
    return `${window.location.origin}${window.location.pathname}?${query.toString()}`;
  })();

  return <Theme appearance={themeMode} accentColor="indigo" grayColor="slate" radius="large" data-theme-mode={themeMode}>
    {!room || !identity ? <Welcome
      {...{
        name, setName, role, setRole, title, setTitle, roomCode, setRoomCode,
        publicRooms, urlInviteCode, visibility, setVisibility, preferredModel,
        setPreferredModel, apiKey, setApiKey, systemPrompt, setSystemPrompt,
        memoryEnabled, setMemoryEnabled,
        projectZip, setProjectZip,
        createSession, joinSession, busy, notice, copy, locale, setLocale,
        themeMode, setThemeMode,
      }}
    /> : <main className="app-shell">
      <header className="topbar">
        <Flex className="topbar-brand" align="center" gap="3">
          <Image className="brand-icon" src="/coprompt-appicon.png" alt="" width={28} height={28} aria-hidden="true" />
          <Heading size="3">CoPrompt</Heading>
          <Badge color={room.isDemo ? "violet" : "indigo"}>{room.isDemo ? "Demo" : room.visibility}</Badge>
          {room.sourceArchive && <Badge color="cyan" title={room.sourceArchive.name}>ZIP · {room.sourceArchive.fileCount} {copy.files}</Badge>}
        </Flex>
        <Flex align="center" gap="2">
          <Badge color={room.state === "RUNNING" ? "amber" : room.state === "PROPOSED" ? "violet" : "green"}>{room.state}</Badge>
          <Badge color={room.memoryEnabled ? "green" : "gray"}>{room.memoryEnabled ? copy.memoryOn : copy.memoryOff}</Badge>
          <Text size="2">{room.title}</Text>
        </Flex>
        <Flex className="topbar-actions" justify="end" align="center">
          <PreferenceControls {...{ locale, setLocale, themeMode, setThemeMode }} compact />
          <Button size="1" variant="soft" onClick={() => void navigator.clipboard.writeText(inviteUrl)}>{copy.copyInvite}</Button>
          {room.createdBy === identity.userId && !room.isDemo && <Button size="1" variant="outline" onClick={() => setSettingsOpen(true)}>{copy.roomSettings}</Button>}
          <Button size="1" color="red" variant="ghost" onClick={() => void logout()}>{copy.logout}</Button>
        </Flex>
      </header>

      <section className="ensemble-grid">
        <section className="intent-panel">
          <Flex justify="between" align="center">
            <Box><Text size="1" color="gray" weight="bold">COPROMPT</Text><Heading size="4">{copy.sharedIntent}</Heading></Box>
            <Button size="1" variant="soft" onClick={saveIntent} disabled={room.state === "RUNNING"}>{copy.sync}</Button>
          </Flex>
          <TextArea className="intent-editor" value={intentDraft} onChange={(event) => {
            intentDirty.current = true;
            setIntentDraft(event.target.value);
          }} disabled={room.state === "RUNNING"} />
          <Separator size="4" />
          <ParticipantRoster room={room} meId={identity.userId} copy={copy} />
          <Separator size="4" />
          <Flex justify="between" align="center">
            <Text size="1" color="gray" weight="bold">{copy.roomActivity}</Text>
            <Badge color="green" variant="soft">{copy.neverSent}</Badge>
          </Flex>
          <Box className="room-messages">{room.messages
            .filter((message) => message.kind !== "agent")
            .slice(-20)
            .map((message) => {
              const parent = message.replyTo
                ? room.messages.find((item) => item.id === message.replyTo)
                : undefined;
              return <Box
                key={message.id}
                className={`room-message ${memberTone(message.userId)}${parent ? " is-reply" : ""}${message.role === "agent" ? " by-agent" : ""}`}
              >
                <Flex justify="between" align="center">
                  <Flex align="center" gap="2">
                    <span className="room-author-dot" aria-hidden="true" />
                    <Text size="1" weight="bold">{message.authorName} · {message.role.toUpperCase()}</Text>
                    <Badge color={message.kind === "review" ? "violet" : message.kind === "prompt" || message.kind === "steer" ? "amber" : "gray"}>
                      {messageKindLabel(message.kind)}
                    </Badge>
                  </Flex>
                  {message.kind === "member" && <Button size="1" variant="ghost" onClick={() => setReplyTo(message.id)}>{copy.reply}</Button>}
                </Flex>
                {parent && <Box className="thread-quote">↳ {copy.reply} {parent.authorName}: {parent.content.slice(0, 70)}{parent.content.length > 70 ? "…" : ""}</Box>}
                <Text as="p" size="2">{message.content}</Text>
              </Box>;
            })}</Box>
          <Box className="chat-compose">
            {replyTo && <Flex justify="between"><Text size="1" color="gray">{copy.replyingTo} {room.messages.find((item) => item.id === replyTo)?.authorName || copy.message}; {copy.memberOnly}</Text><Button size="1" variant="ghost" onClick={() => setReplyTo("")}>{copy.cancel}</Button></Flex>}
            <TextArea
              value={chatDraft}
              onChange={(event) => setChatDraft(event.target.value)}
              onKeyDown={(event) => submitOnEnter(event, () => {
                if (chatDraft.trim()) void sendMessage();
              })}
              placeholder={copy.memberPlaceholder}
            />
            <Button size="1" variant="soft" onClick={sendMessage} disabled={!chatDraft.trim()}>{copy.sendMemberChat}</Button>
          </Box>
        </section>

        <section className="run-panel">
          <Flex justify="between" align="center">
            <Box><Text size="1" color="gray" weight="bold">SHARED AGENT</Text><Heading size="4">{copy.liveRun}</Heading></Box>
            <Badge color="cyan">{room.preferredModel || "TokenRouter auto"}</Badge>
          </Flex>
          {notice && <Card className="notice"><Text size="2">{notice}</Text></Card>}
          {progress && <ProgressPanel progress={progress} meId={identity.userId} copy={copy} />}
          <ConversationPanel
            room={room}
            liveOutput={liveOutput}
            meId={identity.userId}
            copy={copy}
          />
          {room.state === "RUNNING" ? <Card className="steer-box">
            <Text size="2" weight="bold">Steering Queue</Text>
            <TextArea
              value={steer}
              onChange={(event) => setSteer(event.target.value)}
              onKeyDown={(event) => submitOnEnter(event, () => {
                if (steer.trim()) void sendSteer("nudge");
              })}
              placeholder={copy.steeringPlaceholder}
            />
            <Flex gap="2"><Button size="2" onClick={() => sendSteer("nudge")} disabled={!steer.trim()}>⚡ Nudge</Button><Button size="2" color="red" variant="soft" onClick={() => sendSteer("halt")}>Halt</Button></Flex>
          </Card> : <Card className="run-box">
            <TextArea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => submitOnEnter(event, () => {
                if (!busy && prompt.trim()) void run();
              })}
              placeholder={copy.runPlaceholder}
            />
            <Flex justify="between" align="center">
              <Select.Root value={difficulty} onValueChange={(value) => setDifficulty(value as Difficulty)}>
                <Select.Trigger />
                <Select.Content><Select.Item value="cheap">Fast / cheap</Select.Item><Select.Item value="standard">Balanced</Select.Item><Select.Item value="hard">Hard task</Select.Item></Select.Content>
              </Select.Root>
              <Button onClick={run} disabled={busy || !prompt.trim()}>{busy ? copy.running : "▶ Run"}</Button>
            </Flex>
          </Card>}
        </section>

        <ArtifactPanel room={room} onOpenApproval={setApprovalMode} onExport={exportIssue} copy={copy} />
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
        onDelete={deleteCurrentRoom}
        setNotice={setNotice}
        copy={copy}
      />
      <ApprovalDialog
        open={approvalMode !== null}
        mode={approvalMode}
        onOpenChange={(open) => {
          if (!open) {
            setApprovalMode(null);
            setReviewFeedback("");
          }
        }}
        room={room}
        meId={identity.userId}
        feedback={reviewFeedback}
        setFeedback={setReviewFeedback}
        onSubmit={vote}
        copy={copy}
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

function PreferenceControls(props: {
  locale: Locale;
  setLocale: (value: Locale) => void;
  themeMode: ThemeMode;
  setThemeMode: (value: ThemeMode) => void;
  compact?: boolean;
}) {
  const copy = COPY[props.locale];
  const nextTheme = props.themeMode === "light" ? "dark" : "light";
  return <Flex className={`preference-controls${props.compact ? " is-compact" : ""}`} gap="2">
    <Button
      size="1"
      variant="soft"
      aria-label={props.locale === "en" ? copy.switchToChinese : copy.switchToEnglish}
      onClick={() => props.setLocale(props.locale === "en" ? "zh-TW" : "en")}
    >{copy.switchLanguage}</Button>
    <Button
      size="1"
      variant="soft"
      aria-label={nextTheme === "dark" ? copy.switchToDark : copy.switchToLight}
      onClick={() => props.setThemeMode(nextTheme)}
    >{nextTheme === "dark" ? `☾ ${copy.dark}` : `☀ ${copy.light}`}</Button>
  </Flex>;
}

/**
 * In a shared session the useful question is not only "how far along is it"
 * but "has it heard me yet". Both are answered here so nobody has to guess
 * from a moving token stream.
 */
function ProgressPanel({ progress, meId, copy }: { progress: RoomProgress; meId: string; copy: Copy }) {
  const phaseLabel: Record<RoomProgress["phase"], string> = {
    reading: copy.reading,
    planning: copy.planning,
    building: copy.building,
    reviewing: copy.reviewing,
    done: copy.done,
  };
  const chip = (person: { userId: string; name: string; role: string }, got: boolean) =>
    <span key={person.userId} className={`pickup-chip ${got ? "got" : "pending"}`}>
      <span className="dot">{person.name.slice(0, 2).toUpperCase()}</span>
      {person.userId === meId ? `${person.name} (${copy.you})` : person.name}
    </span>;

  return <Card className="progress-card">
    <Box className="progress-head">
      <span className="progress-phase">{phaseLabel[progress.phase]}</span>
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
        <span className="pickup-tag got">{copy.pickedUp}</span>
        {progress.pickedUp.length
          ? progress.pickedUp.map((person) => chip(person, true))
          : <span className="pickup-none">{copy.nonePickedUp}</span>}
      </Box>
      <Box className="pickup-row">
        <span className="pickup-tag pending">{copy.waiting}</span>
        {progress.waiting.length
          ? progress.waiting.map((person) => chip(person, false))
          : <span className="pickup-none">{copy.allReceived}</span>}
      </Box>
    </Box>
  </Card>;
}

function messageKindLabel(kind: Room["messages"][number]["kind"]): string {
  const labels: Record<Room["messages"][number]["kind"], string> = {
    prompt: "PROMPT",
    member: "CHAT",
    steer: "STEER",
    agent: "AGENT",
    question: "QUESTION",
    answer: "ANSWER",
    review: "REVIEW",
    system: "SYSTEM",
  };
  return labels[kind];
}

function powerLabel(power: Power, copy: Copy): string {
  return {
    run: copy.runPower,
    steer: copy.steerPower,
    halt: copy.haltPower,
    edit_intent: copy.editIntentPower,
    vote: copy.votePower,
    open_pr: copy.openPrPower,
  }[power];
}

function ConversationPanel(props: {
  room: Room;
  liveOutput: string;
  meId: string;
  copy: Copy;
}) {
  const visibleKinds = new Set<Room["messages"][number]["kind"]>([
    "prompt",
    "steer",
    "agent",
    "question",
    "answer",
    "review",
  ]);
  const messages = props.room.messages.filter((message) => visibleKinds.has(message.kind)).slice(-30);
  const liveText = props.room.state === "RUNNING" ? humanizeAgentOutput(props.liveOutput) : "";

  return <Box className="conversation-feed" aria-label={props.copy.sharedConversation}>
    {!messages.length && !liveText && <Empty text={props.copy.conversationEmpty} />}
    {messages.map((message) => {
      const fromAgent = message.role === "agent";
      const fromSelf = message.userId === props.meId;
      const content = fromAgent ? humanizeAgentOutput(message.content) : message.content;
      if (!content) return null;
      return <Box
        key={message.id}
        className={`conversation-message ${fromAgent ? "from-agent member-tone-agent" : fromSelf ? "from-self" : `from-other ${memberTone(message.userId)}`}`}
      >
        <Flex className="conversation-meta" align="center" gap="2">
          <Text size="1" weight="bold">
            {message.authorName}{message.userId === props.meId ? ` (${props.copy.you})` : ""}
          </Text>
          <Badge color={fromAgent ? "cyan" : message.kind === "review" ? "violet" : "amber"}>
            {messageKindLabel(message.kind)}
          </Badge>
        </Flex>
        <Text as="p" size="2" className="conversation-body">
          {content || props.copy.artifactGenerated}
        </Text>
      </Box>;
    })}
    {liveText && <Box className="conversation-message from-agent member-tone-agent is-streaming">
      <Flex className="conversation-meta" align="center" gap="2">
        <Text size="1" weight="bold">CoPrompt agent</Text>
        <Badge color="cyan">LIVE</Badge>
      </Flex>
      <Text as="p" size="2" className="conversation-body">{liveText}</Text>
    </Box>}
  </Box>;
}

function ArtifactPanel({ room, onOpenApproval, onExport, copy }: {
  room: Room;
  onOpenApproval: (mode: "approve" | "request_changes") => void;
  onExport: () => void;
  copy: Copy;
}) {
  const latest = (kind: Artifact["kind"]) => [...room.artifacts].reverse().find((item) => item.kind === kind);
  const html = latest("html");
  const latestRun = room.runs.at(-1);
  const memoryStatus = latestRun?.memoryStatus === "pending"
    ? copy.memoryPending
    : latestRun?.memoryStatus === "queued"
      ? copy.memoryQueued
      : latestRun?.memoryStatus === "error"
        ? copy.memoryError
        : "";
  return <section className="artifact-panel">
    <Flex justify="between" align="center"><Box><Text size="1" color="gray" weight="bold">TEST CAPITAL</Text><Heading size="4">{copy.artifactsApproval}</Heading></Box>{html && <Badge>v{html.version}</Badge>}</Flex>
    <Tabs.Root defaultValue="preview">
      <Tabs.List><Tabs.Trigger value="preview">{copy.preview}</Tabs.Trigger><Tabs.Trigger value="code">{copy.generatedCode}</Tabs.Trigger><Tabs.Trigger value="tests">{copy.tests}</Tabs.Trigger></Tabs.List>
      <Box className="artifact-body">
        <Tabs.Content value="preview">{html ? <iframe key={html.id} title="Generated artifact" sandbox="allow-scripts" srcDoc={html.content} /> : <Empty text={copy.previewEmpty} />}</Tabs.Content>
        <Tabs.Content value="code">{html ? <pre className="generated-code">{html.content}</pre> : <Empty text={copy.codeEmpty} />}</Tabs.Content>
        <Tabs.Content value="tests"><pre>{latest("tests")?.content || copy.testsEmpty}</pre></Tabs.Content>
      </Box>
    </Tabs.Root>
    <Card className="approval-box">
      <Flex justify="between" align="center" gap="2">
        <Text size="2" weight="bold">{copy.approvalGate}</Text>
        {room.memoryEnabled && memoryStatus && <Badge color={latestRun?.memoryStatus === "error" ? "red" : "green"}>{memoryStatus}</Badge>}
      </Flex>
      <Text as="p" size="1" color="gray">{copy.approvalHelp}</Text>
      <Flex gap="2" wrap="wrap"><Button size="1" color="green" onClick={() => onOpenApproval("approve")}>{copy.approve}</Button><Button size="1" color="red" variant="soft" onClick={() => onOpenApproval("request_changes")}>{copy.requestChanges}</Button><Button size="1" variant="outline" onClick={onExport}>{copy.exportIssue}</Button></Flex>
    </Card>
  </section>;
}

function Empty({ text }: { text: string }) {
  return <Box className="empty"><Text size="2" color="gray">{text}</Text></Box>;
}

function ParticipantRoster(props: { room: Room; meId: string; copy: Copy }) {
  const statusLabel = {
    online: props.copy.online,
    away: props.copy.away,
    offline: props.copy.offline,
  };
  return <Box className="participant-roster">
    <Flex justify="between" align="center">
      <Text size="1" color="gray" weight="bold">{props.copy.roomMembers}</Text>
      <Badge color="gray">{props.room.participants.length} {props.copy.joined}</Badge>
    </Flex>
    <Flex className="participant-list" wrap="wrap" gap="2">
      {sortedParticipants(props.room.participants).map((person) => <Box key={person.userId} className={`participant-chip is-${person.status}`}>
        <Box className="presence-avatar">
          <MemberAvatar person={person} />
          <span className="presence-dot" style={{ background: presenceColor[person.status] }} />
        </Box>
        <Box className="participant-copy">
          <Text size="1" weight="bold">{person.name}{person.userId === props.meId ? ` (${props.copy.you})` : ""}</Text>
          <Text size="1">{person.role.toUpperCase()} · P{resolveRole(person.role, props.room.roleOverrides).priority} · {statusLabel[person.status]}</Text>
        </Box>
      </Box>)}
    </Flex>
  </Box>;
}

function ApprovalDialog(props: {
  open: boolean;
  mode: "approve" | "request_changes" | null;
  onOpenChange: (value: boolean) => void;
  room: Room;
  meId: string;
  feedback: string;
  setFeedback: (value: string) => void;
  onSubmit: (verdict: "approve" | "request_changes", feedback?: string) => void;
  copy: Copy;
}) {
  const run = [...props.room.runs].reverse().find((item) => item.status === "proposed");
  const eligibleIds = new Set(voters(props.room.participants, props.room.roleOverrides));
  const eligible = sortedParticipants(props.room.participants).filter((person) => eligibleIds.has(person.userId));
  const voteByUser = new Map(
    props.room.votes
      .filter((vote) => vote.runId === run?.id)
      .map((vote) => [vote.userId, vote]),
  );
  const myEligible = eligibleIds.has(props.meId);

  return <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
    <Dialog.Content maxWidth="560px">
      <Dialog.Title>{props.copy.approvalStatus}</Dialog.Title>
      <Dialog.Description size="2">{props.copy.approvalStatusHelp}</Dialog.Description>
      <Box className="approval-roster" mt="4">
        {eligible.map((person) => {
          const vote = voteByUser.get(person.userId);
          const label = vote?.verdict === "approve"
            ? props.copy.approved
            : vote?.verdict === "request_changes"
              ? props.copy.changesRequested
              : props.copy.notVoted;
          return <Flex key={person.userId} className="vote-row" justify="between" align="center" gap="3">
            <Flex align="center" gap="2">
              <MemberAvatar person={person} />
              <Box>
                <Text as="div" size="2" weight="bold">
                  {person.name}{person.userId === props.meId ? ` (${props.copy.you})` : ""}
                </Text>
                <Text as="div" size="1" color="gray">
                  {person.role.toUpperCase()} · P{resolveRole(person.role, props.room.roleOverrides).priority}
                </Text>
              </Box>
            </Flex>
            <Badge color={vote?.verdict === "approve" ? "green" : vote ? "red" : "gray"}>{label}</Badge>
          </Flex>;
        })}
      </Box>
      {props.mode === "request_changes" && <Box className="feedback-field" mt="4">
        <label className="field-label" htmlFor="review-feedback">{props.copy.feedbackLabel}</label>
        <TextArea
          id="review-feedback"
          value={props.feedback}
          onChange={(event) => props.setFeedback(event.target.value)}
          onKeyDown={(event) => submitOnEnter(event, () => {
            if (myEligible && props.feedback.trim()) props.onSubmit("request_changes", props.feedback);
          })}
          placeholder={props.copy.feedbackPlaceholder}
        />
      </Box>}
      <Flex justify="end" gap="2" mt="5">
        <Dialog.Close><Button variant="soft" color="gray">{props.copy.cancel}</Button></Dialog.Close>
        {props.mode === "approve"
          ? <Button color="green" disabled={!run || !myEligible} onClick={() => props.onSubmit("approve")}>{props.copy.confirmApproval}</Button>
          : <Button color="red" disabled={!run || !myEligible || !props.feedback.trim()} onClick={() => props.onSubmit("request_changes", props.feedback)}>{props.copy.submitChanges}</Button>}
      </Flex>
    </Dialog.Content>
  </Dialog.Root>;
}

function MemberAvatar({ person, showTitle = false }: { person: Participant; showTitle?: boolean }) {
  const initials = person.name.trim().slice(0, 2).toUpperCase() || "?";
  return <span
    className={`member-avatar is-${person.role}`}
    aria-label={showTitle ? `${person.name} · ${person.role} · ${person.status}` : person.name}
    title={showTitle ? `${person.name} · ${person.role} · ${person.status}` : undefined}
  >
    {initials}
  </span>;
}

function UsersIcon() {
  return <svg className="member-count-icon" viewBox="0 0 20 20" aria-hidden="true">
    <circle cx="7" cy="6" r="3" />
    <path d="M1.8 16c.3-3.2 2.1-5 5.2-5s4.9 1.8 5.2 5" />
    <circle cx="14.5" cy="7" r="2.3" />
    <path d="M13.1 11.5c3-.6 4.8.9 5.1 3.7" />
  </svg>;
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
  memoryEnabled: boolean;
  setMemoryEnabled: (value: boolean) => void;
  projectZip: File | null;
  setProjectZip: (value: File | null) => void;
  createSession: () => void;
  joinSession: () => void;
  busy: boolean;
  notice: string;
  copy: Copy;
  locale: Locale;
  setLocale: (value: Locale) => void;
  themeMode: ThemeMode;
  setThemeMode: (value: ThemeMode) => void;
}) {
  const invitedPrivate = Boolean(props.roomCode && props.urlInviteCode && !props.publicRooms.some((room) => room.id === props.roomCode));
  return <main className="welcome">
    <Box className="welcome-preferences">
      <PreferenceControls
        locale={props.locale}
        setLocale={props.setLocale}
        themeMode={props.themeMode}
        setThemeMode={props.setThemeMode}
      />
    </Box>
    <Card className="welcome-card welcome-card-wide">
      <Box className="welcome-lockup-frame">
        <Image
          className="welcome-lockup"
          src="/coprompt-lockup.png"
          alt="CoPrompt — build software together with AI"
          width={1120}
          height={300}
          priority
        />
      </Box>
      <Heading className="visually-hidden" size="7">{props.copy.heroTitle}</Heading>
      <Text as="p" color="gray" mt="2" mb="4">{props.copy.heroDescription}</Text>
      <Flex direction="column" gap="3" mb="4">
        <TextField.Root placeholder={props.copy.yourName} value={props.name} onChange={(event) => props.setName(event.target.value)} />
        <Select.Root value={props.role} onValueChange={(value) => props.setRole(value as Role)}>
          <Select.Trigger />
          <Select.Content><Select.Item value="pm">{props.copy.pmRole}</Select.Item><Select.Item value="eng">{props.copy.engRole}</Select.Item><Select.Item value="design">{props.copy.designRole}</Select.Item><Select.Item value="qa">{props.copy.qaRole}</Select.Item><Select.Item value="observer">Observer</Select.Item></Select.Content>
        </Select.Root>
      </Flex>
      <Tabs.Root defaultValue={props.roomCode ? "join" : "create"}>
        <Tabs.List size="2"><Tabs.Trigger value="join">{props.copy.joinRoom}</Tabs.Trigger><Tabs.Trigger value="create">{props.copy.createSession}</Tabs.Trigger></Tabs.List>
        <Box pt="4">
          <Tabs.Content value="join">
            <Flex direction="column" gap="3">
              <Select.Root value={props.roomCode} onValueChange={props.setRoomCode}>
                <Select.Trigger placeholder={props.copy.selectPublicRoom} />
                <Select.Content>
                  {invitedPrivate && <Select.Item value={props.roomCode}>{props.copy.privateInvitedRoom}</Select.Item>}
                  {props.publicRooms.map((room) => <Select.Item key={room.id} value={room.id}>{room.title}{room.isDemo ? " · Demo" : ""} · {room.participantCount} online</Select.Item>)}
                </Select.Content>
              </Select.Root>
              {!props.publicRooms.length && !invitedPrivate && <Text size="2" color="gray">{props.copy.noPublicRooms}</Text>}
              <Button size="3" onClick={props.joinSession} disabled={props.busy || !props.roomCode}>{props.busy ? props.copy.joining : props.copy.joinSelected}</Button>
            </Flex>
          </Tabs.Content>
          <Tabs.Content value="create">
            <Flex direction="column" gap="3">
              <TextField.Root placeholder={props.copy.projectName} value={props.title} onChange={(event) => props.setTitle(event.target.value)} />
              <Select.Root value={props.visibility} onValueChange={(value) => props.setVisibility(value as RoomVisibility)}>
                <Select.Trigger />
                <Select.Content><Select.Item value="public">{props.copy.publicListed}</Select.Item><Select.Item value="private">{props.copy.privateInvite}</Select.Item></Select.Content>
              </Select.Root>
              <TextField.Root placeholder={props.copy.preferredModel} value={props.preferredModel} onChange={(event) => props.setPreferredModel(event.target.value)} />
              <TextField.Root type="password" placeholder={props.copy.apiKeyCreate} value={props.apiKey} onChange={(event) => props.setApiKey(event.target.value)} />
              <label className="memory-toggle">
                <input
                  type="checkbox"
                  checked={props.memoryEnabled}
                  onChange={(event) => props.setMemoryEnabled(event.target.checked)}
                />
                <span>
                  <strong>{props.copy.memoryLabel}</strong>
                  <small>{props.copy.memoryHelp}</small>
                </span>
              </label>
              <Box className="field-group">
                <label className="field-label" htmlFor="project-zip">{props.copy.startingZipLabel}</label>
                <Text as="p" size="1" color="gray" mb="2">{props.copy.startingZipHelp}</Text>
                <input
                  id="project-zip"
                  className="zip-input"
                  type="file"
                  accept=".zip,application/zip"
                  onChange={(event) => props.setProjectZip(event.target.files?.[0] ?? null)}
                />
                <label className="zip-picker" htmlFor="project-zip">
                  <span>📦</span>
                  <span>{props.projectZip?.name || props.copy.chooseZip}</span>
                </label>
              </Box>
              <Box className="field-group">
                <label className="field-label" htmlFor="create-system-prompt">{props.copy.systemPromptLabel}</label>
                <Text as="p" size="1" color="gray" mb="2" id="create-system-prompt-help">{props.copy.systemPromptHelp}</Text>
                <TextArea
                  id="create-system-prompt"
                  aria-describedby="create-system-prompt-help"
                  value={props.systemPrompt}
                  onChange={(event) => props.setSystemPrompt(event.target.value)}
                />
              </Box>
              <Button size="3" onClick={props.createSession} disabled={props.busy || !props.title.trim()}>{props.busy ? props.copy.creating : props.copy.createSession}</Button>
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
  onDelete: () => void;
  setNotice: (value: string) => void;
  copy: Copy;
}) {
  const [title, setTitle] = useState(props.room.title);
  const [visibility, setVisibility] = useState(props.room.visibility);
  const [preferredModel, setPreferredModel] = useState(props.room.preferredModel || "");
  const [systemPrompt, setSystemPrompt] = useState(props.room.systemPrompt);
  const [memoryEnabled, setMemoryEnabled] = useState(props.room.memoryEnabled);
  const [apiKey, setApiKey] = useState("");
  const [rolePolicy, setRolePolicy] = useState<Record<Role, RoleEntry>>(() => resolvedPolicy(props.room));

  useEffect(() => {
    if (!props.open) return;
    setTitle(props.room.title);
    setVisibility(props.room.visibility);
    setPreferredModel(props.room.preferredModel || "");
    setSystemPrompt(props.room.systemPrompt);
    setMemoryEnabled(props.room.memoryEnabled);
    setApiKey("");
    setRolePolicy(resolvedPolicy(props.room));
  }, [
    props.open,
    props.room.id,
    props.room.title,
    props.room.visibility,
    props.room.preferredModel,
    props.room.systemPrompt,
    props.room.memoryEnabled,
    props.room.roleOverrides,
  ]);

  const save = async () => {
    const response = await fetch(`/api/rooms/${props.room.id}`, authorized(props.token, {
      operation: "settings",
      title,
      visibility,
      preferredModel,
      systemPrompt,
      memoryEnabled,
      roleOverrides: rolePolicy,
      ...(apiKey.trim() ? { apiKey, baseUrl: "https://api.tokenrouter.com/v1" } : {}),
    }, "PATCH"));
    const data = await response.json();
    if (!response.ok) return props.setNotice(data.error);
    props.onUpdated(data.room, data.inviteCode);
    props.onOpenChange(false);
    props.setNotice(props.copy.settingsUpdated);
  };

  return <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
    <Dialog.Content maxWidth="820px">
      <Dialog.Title>{props.copy.roomSettings}</Dialog.Title>
      <Dialog.Description size="2">{props.copy.settingsDescription}</Dialog.Description>
      <Flex direction="column" gap="3" mt="4">
        <Flex className="settings-room-id" justify="between" align="center" gap="3">
          <Box>
            <Text as="div" size="1" color="gray" weight="bold">{props.copy.roomId}</Text>
            <Text as="div" size="2">{props.room.id}</Text>
          </Box>
          <Button
            size="1"
            variant="soft"
            onClick={() => {
              void navigator.clipboard.writeText(props.room.id);
              props.setNotice(props.copy.roomIdCopied);
            }}
          >
            {props.copy.copyRoomId}
          </Button>
        </Flex>
        <TextField.Root value={title} onChange={(event) => setTitle(event.target.value)} />
        <Select.Root value={visibility} onValueChange={(value) => setVisibility(value as RoomVisibility)}>
          <Select.Trigger />
          <Select.Content><Select.Item value="public">{props.copy.publicListed}</Select.Item><Select.Item value="private">{props.copy.privateInvite}</Select.Item></Select.Content>
        </Select.Root>
        <TextField.Root value={preferredModel} onChange={(event) => setPreferredModel(event.target.value)} placeholder="Preferred model or TokenRouter auto" />
        <TextField.Root type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={props.copy.newApiKey} />
        <label className="memory-toggle">
          <input
            type="checkbox"
            checked={memoryEnabled}
            onChange={(event) => setMemoryEnabled(event.target.checked)}
          />
          <span>
            <strong>{props.copy.memoryLabel}</strong>
            <small>{props.copy.memoryHelp}</small>
          </span>
        </label>
        <Box className="field-group">
          <label className="field-label" htmlFor="settings-system-prompt">{props.copy.systemPromptLabel}</label>
          <Text as="p" size="1" color="gray" mb="2" id="settings-system-prompt-help">{props.copy.systemPromptHelp}</Text>
          <TextArea
            id="settings-system-prompt"
            aria-describedby="settings-system-prompt-help"
            value={systemPrompt}
            onChange={(event) => setSystemPrompt(event.target.value)}
          />
        </Box>
        <Box className="role-policy">
          <Heading size="3">{props.copy.rolePowers}</Heading>
          <Text as="p" size="1" color="gray">{props.copy.rolePowersHelp}</Text>
          <Box className="role-policy-grid" mt="3">
            {ROLES.map((role) => <Box key={role} className="role-policy-row">
              <Flex className="role-policy-head" justify="between" align="center" gap="3">
                <Text weight="bold">{role.toUpperCase()}</Text>
                <label className="priority-field">
                  <span>{props.copy.decisionPriority}</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={rolePolicy[role].priority}
                    onChange={(event) => {
                      const priority = Math.max(0, Math.min(100, Number(event.target.value) || 0));
                      setRolePolicy((current) => ({
                        ...current,
                        [role]: { ...current[role], priority },
                      }));
                    }}
                  />
                </label>
              </Flex>
              <Flex className="power-list" wrap="wrap" gap="2" mt="2">
                {POWERS.map((power) => <label key={power} className="power-toggle">
                  <input
                    type="checkbox"
                    checked={rolePolicy[role][power]}
                    onChange={(event) => setRolePolicy((current) => ({
                      ...current,
                      [role]: { ...current[role], [power]: event.target.checked },
                    }))}
                  />
                  <span>{powerLabel(power, props.copy)}</span>
                </label>)}
              </Flex>
            </Box>)}
          </Box>
        </Box>
      </Flex>
      <Flex justify="between" gap="2" mt="5">
        <Button color="red" variant="soft" onClick={props.onDelete}>{props.copy.deleteRoom}</Button>
        <Flex gap="2">
          <Dialog.Close><Button variant="soft" color="gray">{props.copy.cancel}</Button></Dialog.Close>
          <Button onClick={save}>{props.copy.saveSettings}</Button>
        </Flex>
      </Flex>
    </Dialog.Content>
  </Dialog.Root>;
}
