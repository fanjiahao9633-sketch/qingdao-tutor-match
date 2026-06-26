import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { deriveArea, fuzzyCoordinate, newId, now, publicSnapshot, readDb, storageMode, writeDb } from "./store.js";

const app = express();
const port = Number(process.env.PORT || 3001);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, "..", "dist");

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored = "") {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = hashPassword(password, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, contact, ...safe } = user;
  return safe;
}

function ensureDemoUser(db, role) {
  const id = role === "teacher" ? "teacher-demo" : "parent-demo";
  let user = db.users.find((item) => item.id === id);
  if (!user) {
    user = { id, role, nickname: role === "teacher" ? "教师演示账号" : "家长演示账号", createdAt: now() };
    db.users.push(user);
  }
  return user;
}

function getCurrentUser(db, req, fallbackRole = "parent") {
  const userId = req.headers["x-user-id"] || req.body?.userId;
  const user = userId ? db.users.find((item) => item.id === userId) : null;
  return user || ensureDemoUser(db, fallbackRole);
}

function updateChattingStatus(db, match) {
  const request = db.tutorRequests.find((item) => item.id === match.requestId);
  const profile = db.teacherProfiles.find((item) => item.id === match.teacherProfileId);
  if (request) request.status = "chatting";
  if (profile) profile.status = "chatting";
}

function createMatchIfMutual(db, interest) {
  if (interest.status === "matched") return null;

  if (interest.targetType === "teacher") {
    const profile = db.teacherProfiles.find((item) => item.id === interest.targetId);
    const request = db.tutorRequests.find((item) => item.id === interest.requestId);
    if (!profile || !request) return null;
    const reverse = db.interests.find((item) =>
      item.fromUserId === profile.teacherId &&
      item.targetType === "request" &&
      item.targetId === request.id &&
      item.teacherProfileId === profile.id
    );
    if (!reverse) return null;
    return createMatch(db, interest, reverse, request, profile);
  }

  const request = db.tutorRequests.find((item) => item.id === interest.targetId);
  const profile = db.teacherProfiles.find((item) => item.id === interest.teacherProfileId);
  if (!request || !profile) return null;
  const reverse = db.interests.find((item) =>
    item.fromUserId === request.parentId &&
    item.targetType === "teacher" &&
    item.targetId === profile.id &&
    item.requestId === request.id
  );
  if (!reverse) return null;
  return createMatch(db, interest, reverse, request, profile);
}

function createMatch(db, a, b, request, profile) {
  const existing = db.matches.find((item) => item.requestId === request.id && item.teacherProfileId === profile.id);
  a.status = "matched";
  b.status = "matched";
  if (existing) return existing;
  const match = {
    id: newId("match"),
    parentId: request.parentId,
    teacherId: profile.teacherId,
    requestId: request.id,
    teacherProfileId: profile.id,
    createdAt: now()
  };
  db.matches.push(match);
  return match;
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, name: "qingdao-tutor-match", storage: storageMode() });
});

app.get("/api/bootstrap", asyncRoute(async (req, res) => {
  const db = await readDb();
  const userId = req.headers["x-user-id"];
  const currentUser = userId ? db.users.find((item) => item.id === userId) : null;
  res.json({ ...publicSnapshot(db), currentUser: sanitizeUser(currentUser), storage: storageMode() });
}));

app.get("/api/me", asyncRoute(async (req, res) => {
  const db = await readDb();
  const user = req.headers["x-user-id"] ? db.users.find((item) => item.id === req.headers["x-user-id"]) : null;
  res.json({ user: sanitizeUser(user) });
}));

app.post("/api/auth/register", asyncRoute(async (req, res) => {
  const db = await readDb();
  const body = req.body || {};
  const role = body.role === "teacher" ? "teacher" : "parent";
  const nickname = String(body.nickname || "").trim();
  const contact = String(body.contact || "").trim();
  const password = String(body.password || "");

  if (!nickname || !contact || password.length < 6) {
    return res.status(400).json({ error: "请填写昵称、联系方式和至少 6 位密码。" });
  }
  if (db.users.some((item) => item.contact === contact)) {
    return res.status(409).json({ error: "这个联系方式已注册，请直接登录。" });
  }

  const user = {
    id: newId("user"),
    role,
    nickname,
    contact,
    passwordHash: hashPassword(password),
    createdAt: now()
  };
  db.users.push(user);
  await writeDb(db);
  res.status(201).json({ user: sanitizeUser(user) });
}));

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const db = await readDb();
  const contact = String(req.body?.contact || "").trim();
  const password = String(req.body?.password || "");
  const user = db.users.find((item) => item.contact === contact);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: "联系方式或密码不正确。" });
  }
  res.json({ user: sanitizeUser(user) });
}));

app.post("/api/requests", asyncRoute(async (req, res) => {
  const db = await readDb();
  const user = getCurrentUser(db, req, "parent");
  if (user.role !== "parent") return res.status(403).json({ error: "请切换或登录家长身份后发布需求。" });
  const body = req.body || {};
  const request = {
    id: newId("req"),
    parentId: user.id,
    parentNickname: user.nickname,
    studentGrade: body.studentGrade || "",
    studentGender: body.studentGender || "",
    subject: body.subject || "",
    frequency: body.frequency || "",
    duration: body.duration || "",
    expectedTime: body.expectedTime || "",
    budgetMin: toNumber(body.budgetMin),
    budgetMax: toNumber(body.budgetMax),
    mode: body.mode || "offline",
    address: body.address || "青岛市",
    area: deriveArea(body.address || ""),
    latitude: fuzzyCoordinate(body.latitude || 36.0671, 1),
    longitude: fuzzyCoordinate(body.longitude || 120.3826, 2),
    requirements: body.requirements || "",
    status: "open",
    createdAt: now()
  };
  db.tutorRequests.unshift(request);
  await writeDb(db);
  res.status(201).json(request);
}));

app.post("/api/teachers", asyncRoute(async (req, res) => {
  const db = await readDb();
  const user = getCurrentUser(db, req, "teacher");
  if (user.role !== "teacher") return res.status(403).json({ error: "请切换或登录教师身份后发布简历。" });
  const body = req.body || {};
  const profile = {
    id: newId("teacher"),
    teacherId: user.id,
    name: body.name || user.nickname,
    gender: body.gender || "",
    school: body.school || "",
    degree: body.degree || "",
    major: body.major || "",
    subjects: body.subjects || "",
    serviceAreas: body.serviceAreas || "",
    expectedPrice: toNumber(body.expectedPrice),
    availableTime: body.availableTime || "",
    experience: body.experience || "",
    bio: body.bio || "",
    certificates: body.certificates || "",
    address: body.address || "青岛市",
    area: deriveArea(`${body.address || ""} ${body.serviceAreas || ""}`),
    latitude: fuzzyCoordinate(body.latitude || 36.0671, 3),
    longitude: fuzzyCoordinate(body.longitude || 120.3826, 4),
    status: "open",
    createdAt: now()
  };
  db.teacherProfiles.unshift(profile);
  await writeDb(db);
  res.status(201).json(profile);
}));

app.post("/api/interests", asyncRoute(async (req, res) => {
  const db = await readDb();
  const body = req.body || {};
  const fromRole = body.fromRole === "teacher" ? "teacher" : "parent";
  const user = getCurrentUser(db, req, fromRole);
  if (user.role !== fromRole) return res.status(403).json({ error: "当前登录身份与操作身份不一致。" });

  const targetType = body.targetType === "request" ? "request" : "teacher";
  const targetId = body.targetId;
  const requestId = body.requestId || (targetType === "request" ? targetId : db.tutorRequests.find((item) => item.parentId === user.id)?.id);
  const teacherProfileId = body.teacherProfileId || (targetType === "teacher" ? targetId : db.teacherProfiles.find((item) => item.teacherId === user.id)?.id);

  if (!targetId) return res.status(400).json({ error: "targetId is required" });
  if (!requestId || !teacherProfileId) {
    return res.status(400).json({ error: "需要先发布对应的家教需求或教师简历，才能发起兴趣。" });
  }

  let interest = db.interests.find((item) =>
    item.fromUserId === user.id &&
    item.targetType === targetType &&
    item.targetId === targetId &&
    item.requestId === requestId &&
    item.teacherProfileId === teacherProfileId
  );
  if (!interest) {
    interest = {
      id: newId("interest"),
      fromUserId: user.id,
      fromRole,
      targetType,
      targetId,
      requestId,
      teacherProfileId,
      status: "pending",
      createdAt: now()
    };
    db.interests.push(interest);
  }

  const match = createMatchIfMutual(db, interest);
  await writeDb(db);
  res.status(201).json({ interest, match, snapshot: publicSnapshot(db) });
}));

app.get("/api/matches", asyncRoute(async (req, res) => {
  const db = await readDb();
  res.json(db.matches);
}));

app.get("/api/messages", asyncRoute(async (req, res) => {
  const db = await readDb();
  const matchId = req.query.matchId;
  const messages = matchId ? db.messages.filter((item) => item.matchId === matchId) : db.messages;
  res.json(messages);
}));

app.post("/api/messages", asyncRoute(async (req, res) => {
  const db = await readDb();
  const body = req.body || {};
  const match = db.matches.find((item) => item.id === body.matchId);
  if (!match) return res.status(404).json({ error: "未匹配成功前不允许私聊。" });
  const user = getCurrentUser(db, req, "parent");
  if (![match.parentId, match.teacherId].includes(user.id)) return res.status(403).json({ error: "只有匹配双方可以发送消息。" });
  const message = {
    id: newId("msg"),
    matchId: match.id,
    senderId: user.id,
    content: String(body.content || "").trim(),
    createdAt: now()
  };
  if (!message.content) return res.status(400).json({ error: "消息不能为空。" });
  db.messages.push(message);
  updateChattingStatus(db, match);
  await writeDb(db);
  res.status(201).json({ message, snapshot: publicSnapshot(db) });
}));

if (fs.existsSync(distPath)) {
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "服务器内部错误", detail: err.message });
});

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});