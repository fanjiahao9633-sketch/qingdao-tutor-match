import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "data", "db.json");
const usePostgres = Boolean(process.env.DATABASE_URL);
let pool;
let initialized = false;

const seedDb = {
  users: [
    { id: "parent-demo", role: "parent", nickname: "Parent Demo", createdAt: "2026-06-26T00:00:00.000Z" },
    { id: "teacher-demo", role: "teacher", nickname: "Teacher Demo", createdAt: "2026-06-26T00:00:00.000Z" }
  ],
  tutorRequests: [
    {
      id: "req-seed-1",
      parentId: "parent-demo",
      parentNickname: "Parent Demo",
      studentGrade: "Grade 8",
      studentGender: "Female",
      subject: "Math",
      frequency: "2 times/week",
      duration: "2 hours/session",
      expectedTime: "Wed evening, Sat afternoon",
      budgetMin: 120,
      budgetMax: 180,
      mode: "offline",
      address: "Shinan District, near Hong Kong Middle Road",
      area: "\u5e02\u5357\u533a",
      latitude: 36.0668,
      longitude: 120.3826,
      requirements: "Looking for a tutor experienced with junior middle school math improvement.",
      status: "open",
      createdAt: "2026-06-26T00:00:00.000Z"
    }
  ],
  teacherProfiles: [
    {
      id: "teacher-seed-1",
      teacherId: "teacher-demo",
      name: "Li Teacher",
      gender: "Male",
      school: "Ocean University of China",
      degree: "Undergraduate",
      major: "Applied Mathematics",
      subjects: "Math, Physics",
      serviceAreas: "\u5e02\u5357\u533a, \u5d02\u5c71\u533a",
      expectedPrice: 150,
      availableTime: "Weekends and weekday evenings",
      experience: "2 years of one-on-one tutoring",
      bio: "Good at knowledge mapping and mistake review.",
      certificates: "Provincial math competition award",
      address: "Laoshan District, near OUC Laoshan campus",
      area: "\u5d02\u5c71\u533a",
      latitude: 36.1601,
      longitude: 120.4979,
      status: "open",
      createdAt: "2026-06-26T00:00:00.000Z"
    }
  ],
  interests: [],
  matches: [],
  messages: []
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeDb(db = {}) {
  return {
    users: Array.isArray(db.users) ? db.users : [],
    tutorRequests: Array.isArray(db.tutorRequests) ? db.tutorRequests : [],
    teacherProfiles: Array.isArray(db.teacherProfiles) ? db.teacherProfiles : [],
    interests: Array.isArray(db.interests) ? db.interests : [],
    matches: Array.isArray(db.matches) ? db.matches : [],
    messages: Array.isArray(db.messages) ? db.messages : []
  };
}

async function getPool() {
  if (!pool) {
    const needsSsl = !process.env.DATABASE_URL.includes("localhost") && !process.env.DATABASE_URL.includes("127.0.0.1");
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined
    });
  }
  if (!initialized) {
    await pool.query(`
      create table if not exists app_state (
        id text primary key,
        data jsonb not null,
        updated_at timestamptz not null default now()
      )
    `);
    const existing = await pool.query("select id from app_state where id = 'main'");
    if (existing.rowCount === 0) {
      await pool.query("insert into app_state (id, data) values ('main', $1::jsonb)", [JSON.stringify(seedDb)]);
    }
    initialized = true;
  }
  return pool;
}

export async function readDb() {
  if (usePostgres) {
    const dbPool = await getPool();
    const result = await dbPool.query("select data from app_state where id = 'main'");
    return normalizeDb(result.rows[0]?.data || seedDb);
  }

  try {
    const raw = await fs.readFile(dbPath, "utf8");
    return normalizeDb(JSON.parse(raw));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const initial = clone(seedDb);
    await writeDb(initial);
    return initial;
  }
}

export async function writeDb(db) {
  const normalized = normalizeDb(db);
  if (usePostgres) {
    const dbPool = await getPool();
    await dbPool.query(
      "insert into app_state (id, data, updated_at) values ('main', $1::jsonb, now()) on conflict (id) do update set data = excluded.data, updated_at = now()",
      [JSON.stringify(normalized)]
    );
    return;
  }

  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  await fs.writeFile(dbPath, JSON.stringify(normalized, null, 2), "utf8");
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
  const areas = ["\u5e02\u5357\u533a", "\u5e02\u5317\u533a", "\u674e\u6ca7\u533a", "\u5d02\u5c71\u533a", "\u57ce\u9633\u533a", "\u9ec4\u5c9b\u533a", "\u5373\u58a8\u533a", "\u80f6\u5dde\u5e02", "\u5e73\u5ea6\u5e02", "\u83b1\u897f\u5e02"];
  return areas.find((area) => address.includes(area)) || "\u9752\u5c9b\u5e02";
}

export function publicSnapshot(db) {
  return {
    users: db.users.map(({ passwordHash, contact, password, ...user }) => user),
    tutorRequests: db.tutorRequests,
    teacherProfiles: db.teacherProfiles,
    interests: db.interests,
    matches: db.matches,
    messages: db.messages
  };
}

export function storageMode() {
  return usePostgres ? "postgres" : "json";
}