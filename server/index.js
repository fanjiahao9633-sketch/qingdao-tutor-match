import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { deriveArea, fuzzyCoordinate, newId, now, publicSnapshot, readDb, writeDb } from "./store.js";

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

function ensureDemoUser(db, role) {
  const id = role === "teacher" ? "teacher-demo" : "parent-demo";
  let user = db.users.find((item) => item.id === id);
  if (!user) {
    user = { id, role, nickname: role === "teacher" ? "Teacher Demo" : "Parent Demo", createdAt: now() };
    db.users.push(user);
  }
  return user;
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
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
  res.json({ ok: true, name: "qingdao-tutor-match" });
});

app.get("/api/bootstrap", asyncRoute(async (req, res) => {
  const db = await readDb();
  res.json(publicSnapshot(db));
}));

app.post("/api/requests", asyncRoute(async (req, res) => {
  const db = await readDb();
  const user = ensureDemoUser(db, "parent");
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
  const user = ensureDemoUser(db, "teacher");
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
  const user = ensureDemoUser(db, fromRole);
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
  const senderId = body.senderId || match.parentId;
  const message = {
    id: newId("msg"),
    matchId: match.id,
    senderId,
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
