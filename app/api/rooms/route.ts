import { NextResponse } from "next/server";

// Intentionally small: this makes a shared room work on one deployed instance.
// The browser also keeps a local copy, so a refresh does not lose the project.
const rooms = new Map<string, unknown>();

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  const room = id ? rooms.get(id) : undefined;
  return room ? NextResponse.json(room) : NextResponse.json({ error: "Room not found" }, { status: 404 });
}

export async function POST(request: Request) {
  const room = await request.json() as { id?: string; provider?: { apiKey?: string } };
  if (!room?.id) return NextResponse.json({ error: "A room id is required." }, { status: 400 });
  // Provider keys are deliberately never shared or retained by the room service.
  if (room.provider) room.provider.apiKey = "";
  rooms.set(room.id, room);
  return NextResponse.json(room);
}
