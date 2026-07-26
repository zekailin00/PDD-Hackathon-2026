import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Role } from "@/pdd/role-policy";

export type Identity = { roomId: string; userId: string; name: string; role: Role };

const globalSecret = globalThis as typeof globalThis & { __copromptSigningSecret?: Buffer };
const signingSecret = process.env.ROOM_SIGNING_SECRET
  ? Buffer.from(process.env.ROOM_SIGNING_SECRET)
  : globalSecret.__copromptSigningSecret ?? randomBytes(32);
globalSecret.__copromptSigningSecret = signingSecret;

function signature(payload: string): string {
  return createHmac("sha256", signingSecret).update(payload).digest("base64url");
}

export function issueIdentity(identity: Identity): string {
  const payload = Buffer.from(JSON.stringify(identity)).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyIdentity(request: Request, roomId: string): Identity {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : new URL(request.url).searchParams.get("token") ?? "";
  return verifyIdentityToken(token, roomId);
}

export function verifyIdentityToken(token: string, roomId: string): Identity {
  const [payload, provided] = token.split(".");
  if (!payload || !provided) throw new Error("A valid room identity is required.");
  const expected = signature(payload);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("The room identity is invalid.");
  const identity = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Identity;
  if (identity.roomId !== roomId) throw new Error("The room identity does not match this room.");
  return identity;
}
