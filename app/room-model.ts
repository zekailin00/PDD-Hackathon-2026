export const ROLES = ["PM", "ENG", "DESIGN", "QA", "OBSERVER"] as const;

export type Role = (typeof ROLES)[number];
export type Presence = "online" | "away" | "offline";
export type RoomVisibility = "public" | "private";
export type ChatKind = "human" | "assistant";

export type FileItem = {
  path: string;
  content: string;
};

export type ChatMessage = {
  id: string;
  authorId?: string;
  author: string;
  initials: string;
  createdAt: string;
  body: string;
  kind: ChatKind;
  changed?: string[];
};

export type Provider = {
  name: string;
  model: string;
  baseUrl: string;
  apiKey: string;
};

export type Participant = {
  id: string;
  name: string;
  role: Role;
  status: Presence;
  lastSeen: number;
  isSeed?: boolean;
};

export type Room = {
  id: string;
  name: string;
  createdBy: string;
  visibility: RoomVisibility;
  allowedRoles: Role[];
  systemPrompt: string;
  files: FileItem[];
  agentMessages: ChatMessage[];
  memberMessages: ChatMessage[];
  participants: Participant[];
  provider: Provider;
  agentRunning: boolean;
  updatedAt: number;
  isDemo?: boolean;
};

export type CreateRoomInput = {
  name: string;
  userName: string;
  role: Role;
  visibility: RoomVisibility;
  allowedRoles: Role[];
  provider: Provider;
};

export const DEFAULT_PROVIDER: Provider = {
  name: "TokenRouter",
  model: "auto:balance",
  baseUrl: "https://api.tokenrouter.io/v1",
  apiKey: "",
};

export const DEFAULT_SYSTEM_PROMPT =
  "You are the project agent. This is a TypeScript Next.js web project. Explain your plan briefly, then only modify files when a user clearly asks for a change. Preserve the existing design and use the project’s current dependencies.";

export const DEMO_FILES: FileItem[] = [
  {
    path: "app/page.tsx",
    content:
      "export default function Home() {\n  return (\n    <main>\n      <h1>Acme</h1>\n      <p>Thoughtful products for ambitious teams.</p>\n    </main>\n  );\n}\n",
  },
  {
    path: "app/globals.css",
    content:
      ':root {\n  --background: #101114;\n  --foreground: #f8f8fa;\n}\n\nbody {\n  background: var(--background);\n  color: var(--foreground);\n}\n',
  },
  {
    path: "components/Hero.tsx",
    content:
      'export function Hero() {\n  return <section className="hero">Build together, faster.</section>;\n}\n',
  },
  {
    path: "package.json",
    content:
      '{\n  "name": "acme-landing",\n  "private": true,\n  "scripts": { "dev": "next dev" },\n  "dependencies": { "next": "latest", "react": "latest" }\n}\n',
  },
];

export const now = () =>
  new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export const makeId = () => Math.random().toString(36).slice(2, 10);

export const initialsFor = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase() || "AN";

export function createDemoRoom(): Room {
  const timestamp = Date.now();
  return {
    id: "demo",
    name: "Demo",
    createdBy: "demo-owner",
    visibility: "public",
    allowedRoles: [...ROLES],
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    files: DEMO_FILES,
    provider: DEFAULT_PROVIDER,
    agentRunning: false,
    isDemo: true,
    updatedAt: timestamp,
    participants: [
      { id: "seed-amy", name: "Amy", role: "ENG", status: "online", lastSeen: timestamp, isSeed: true },
      { id: "seed-joe", name: "Joe", role: "PM", status: "away", lastSeen: timestamp, isSeed: true },
      { id: "seed-kai", name: "Kai", role: "DESIGN", status: "online", lastSeen: timestamp, isSeed: true },
      { id: "seed-sam", name: "Sam", role: "QA", status: "offline", lastSeen: timestamp, isSeed: true },
    ],
    agentMessages: [
      {
        id: "demo-agent-ready",
        author: "co-prompt agent",
        initials: "✦",
        createdAt: "9:42 AM",
        body: "Room ready. Tell me about the project, ask a question, or ask me to modify the code.",
        kind: "assistant",
      },
      {
        id: "demo-agent-request",
        authorId: "seed-joe",
        author: "Joe",
        initials: "JO",
        createdAt: "9:43 AM",
        body: "Make the landing page remember the theme choice without adding another provider.",
        kind: "human",
      },
    ],
    memberMessages: [
      {
        id: "demo-member-message",
        authorId: "seed-kai",
        author: "Kai",
        initials: "KA",
        createdAt: "9:44 AM",
        body: "I’ll review the visual tokens while the agent handles the state change.",
        kind: "human",
      },
    ],
  };
}

export function createEmptyRoom(input: CreateRoomInput, creatorId: string): Room {
  const timestamp = Date.now();
  const slug =
    input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 28) || "session";

  return {
    id: `${slug}-${makeId().slice(0, 5)}`,
    name: input.name.trim(),
    createdBy: creatorId,
    visibility: input.visibility,
    allowedRoles: Array.from(new Set([...input.allowedRoles, input.role])),
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    files: [],
    agentMessages: [],
    memberMessages: [],
    participants: [
      {
        id: creatorId,
        name: input.userName.trim(),
        role: input.role,
        status: "online",
        lastSeen: timestamp,
      },
    ],
    provider: input.provider,
    agentRunning: false,
    updatedAt: timestamp,
  };
}

export function shouldModify(text: string) {
  return /\b(add|change|update|edit|create|remove|delete|implement|refactor|fix|make|build|replace)\b/i.test(
    text,
  );
}

export function makeLocalChange(files: FileItem[], prompt: string) {
  const stamp = `// AI update: ${prompt.replace(/\s+/g, " ").slice(0, 110)}`;
  if (!files.length) {
    return [
      {
        path: "app/page.tsx",
        content: `export default function Page() {\n  return <main>New co-working session</main>;\n}\n\n${stamp}\n`,
      },
    ];
  }

  const target = files.find((file) => file.path.endsWith("page.tsx")) || files[0];
  return files.map((file) =>
    file.path === target.path && !file.content.includes(stamp)
      ? { ...file, content: `${file.content}\n${stamp}\n` }
      : file,
  );
}

export function effectivePresence(participant: Participant): Presence {
  if (participant.isSeed) return participant.status;
  if (Date.now() - participant.lastSeen > 45_000) return "offline";
  return participant.status;
}
