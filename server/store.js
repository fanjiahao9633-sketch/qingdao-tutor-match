import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "data", "db.json");

export async function readDb() {
  const raw = await fs.readFile(dbPath, "utf8");
  return JSON.parse(raw);
}

export async function writeDb(db) {
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2), "utf8");
}

export function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function now() {
  return new Date().toISOString();
}

export function fuzzyCoordinate(value, seed = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const offset = ((Math.sin(numeric * 1000 + seed) + 1) / 2 - 0.5) * 0.006;
  return Number((numeric + offset).toFixed(6));
}

export function deriveArea(address = "") {
  const areas = ["市南区", "市北区", "李沧区", "崂山区", "城阳区", "黄岛区", "即墨区", "胶州市", "平度市", "莱西市"];
  return areas.find((area) => address.includes(area)) || "青岛市";
}

export function publicSnapshot(db) {
  return {
    users: db.users,
    tutorRequests: db.tutorRequests,
    teacherProfiles: db.teacherProfiles,
    interests: db.interests,
    matches: db.matches,
    messages: db.messages
  };
}
