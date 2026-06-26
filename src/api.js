const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === "1";
const API_BASE = import.meta.env.VITE_API_BASE || "";
const STORAGE_KEY = "qingdao-tutor-match-demo";
const SESSION_KEY = "qingdao-tutor-session";

const seedData = {
  users: [
    { id: "parent-demo", role: "parent", nickname: "Parent Demo", contact: "parent-demo", password: "demo123", createdAt: "2026-06-26T00:00:00.000Z" },
    { id: "teacher-demo", role: "teacher", nickname: "Teacher Demo", contact: "teacher-demo", password: "demo123", createdAt: "2026-06-26T00:00:00.000Z" }
  ],
  tutorRequests: [
    { id: "req-seed-1", parentId: "parent-demo", parentNickname: "Parent Demo", studentGrade: "Grade 8", studentGender: "Female", subject: "Math", frequency: "2 times/week", duration: "2 hours/session", expectedTime: "Wed evening, Sat afternoon", budgetMin: 120, budgetMax: 180, mode: "offline", address: "Shinan District, near Hong Kong Middle Road", area: "\u5e02\u5357\u533a", latitude: 36.0668, longitude: 120.3826, requirements: "Looking for a tutor experienced with junior middle school math improvement.", status: "open", createdAt: "2026-06-26T00:00:00.000Z" }
  ],
  teacherProfiles: [
    { id: "teacher-seed-1", teacherId: "teacher-demo", name: "Li Teacher", gender: "Male", school: "Ocean University of China", degree: "Undergraduate", major: "Applied Mathematics", subjects: "Math, Physics", serviceAreas: "\u5e02\u5357\u533a, \u5d02\u5c71\u533a", expectedPrice: 150, availableTime: "Weekends and weekday evenings", experience: "2 years of one-on-one tutoring", bio: "Good at knowledge mapping and mistake review.", certificates: "Provincial math competition award", address: "Laoshan District, near OUC Laoshan campus", area: "\u5d02\u5c71\u533a", latitude: 36.1601, longitude: 120.4979, status: "open", createdAt: "2026-06-26T00:00:00.000Z" }
  ],
  interests: [],
  matches: [],
  messages: []
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function setSession(user) {
  if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  else localStorage.removeItem(SESSION_KEY);
}

async function request(path, options = {}) {
  const session = getSession();
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(session?.id ? { "X-User-Id": session.id } : {}),
      ...(options.headers || {})
    },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function publicDb(db) {
  return {
    ...db,
    users: db.users.map(({ password, contact, passwordHash, ...user }) => user),
    currentUser: getSession()
  };
}

function loadDemo() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const initial = clone(seedData);
    saveDemo(initial);
    return initial;
  }
  return JSON.parse(raw);
}

function saveDemo(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function now() {
  return new Date().toISOString();
}

function deriveArea(address = "") {
  const areas = ["\u5e02\u5357\u533a", "\u5e02\u5317\u533a", "\u674e\u6ca7\u533a", "\u5d02\u5c71\u533a", "\u57ce\u9633\u533a", "\u9ec4\u5c9b\u533a", "\u5373\u58a8\u533a", "\u80f6\u5dde\u5e02", "\u5e73\u5ea6\u5e02", "\u83b1\u897f\u5e02"];
  return areas.find((area) => address.includes(area)) || "\u9752\u5c9b\u5e02";
}

function fuzzyCoordinate(value, seed = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const offset = ((Math.sin(numeric * 1000 + seed) + 1) / 2 - 0.5) * 0.006;
  return Number((numeric + offset).toFixed(6));
}

function ensureUser(db, role) {
  const session = getSession();
  const sessionUser = session ? db.users.find((item) => item.id === session.id) : null;
  if (sessionUser) return sessionUser;
  const id = role === "teacher" ? "teacher-demo" : "parent-demo";
  return db.users.find((item) => item.id === id) || db.users[0];
}

function createMatchIfMutual(db, interest) {
  if (interest.targetType === "teacher") {
    const profile = db.teacherProfiles.find((item) => item.id === interest.targetId);
    const requestItem = db.tutorRequests.find((item) => item.id === interest.requestId);
    const reverse = profile && requestItem && db.interests.find((item) => item.fromUserId === profile.teacherId && item.targetType === "request" && item.targetId === requestItem.id && item.teacherProfileId === profile.id);
    return reverse ? createMatch(db, interest, reverse, requestItem, profile) : null;
  }
  const requestItem = db.tutorRequests.find((item) => item.id === interest.targetId);
  const profile = db.teacherProfiles.find((item) => item.id === interest.teacherProfileId);
  const reverse = requestItem && profile && db.interests.find((item) => item.fromUserId === requestItem.parentId && item.targetType === "teacher" && item.targetId === profile.id && item.requestId === requestItem.id);
  return reverse ? createMatch(db, interest, reverse, requestItem, profile) : null;
}

function createMatch(db, a, b, requestItem, profile) {
  a.status = "matched";
  b.status = "matched";
  const existing = db.matches.find((item) => item.requestId === requestItem.id && item.teacherProfileId === profile.id);
  if (existing) return existing;
  const match = { id: newId("match"), parentId: requestItem.parentId, teacherId: profile.teacherId, requestId: requestItem.id, teacherProfileId: profile.id, createdAt: now() };
  db.matches.push(match);
  return match;
}

const staticApi = {
  bootstrap: async () => publicDb(clone(loadDemo())),
  register: async (payload) => {
    const db = loadDemo();
    const contact = String(payload.contact || "").trim();
    if (!payload.nickname || !contact || String(payload.password || "").length < 6) throw new Error("Please fill nickname, contact, and a password of at least 6 characters.");
    if (db.users.some((item) => item.contact === contact)) throw new Error("This contact is already registered.");
    const user = { id: newId("user"), role: payload.role === "teacher" ? "teacher" : "parent", nickname: payload.nickname, contact, password: payload.password, createdAt: now() };
    db.users.push(user);
    saveDemo(db);
    const safe = publicDb(db).users.find((item) => item.id === user.id);
    setSession(safe);
    return { user: safe };
  },
  login: async (payload) => {
    const db = loadDemo();
    const user = db.users.find((item) => item.contact === String(payload.contact || "").trim() && item.password === payload.password);
    if (!user) throw new Error("Contact or password is incorrect. Demo: parent-demo/demo123 or teacher-demo/demo123.");
    const safe = publicDb(db).users.find((item) => item.id === user.id);
    setSession(safe);
    return { user: safe };
  },
  logout: async () => {
    setSession(null);
    return { ok: true };
  },
  createRequest: async (payload) => {
    const db = loadDemo();
    const user = ensureUser(db, "parent");
    if (user.role !== "parent") throw new Error("Please use a parent account to publish requests.");
    const item = { id: newId("req"), parentId: user.id, parentNickname: user.nickname, ...payload, budgetMin: Number(payload.budgetMin || 0), budgetMax: Number(payload.budgetMax || 0), area: deriveArea(payload.address || ""), latitude: fuzzyCoordinate(payload.latitude || 36.0671, 1), longitude: fuzzyCoordinate(payload.longitude || 120.3826, 2), status: "open", createdAt: now() };
    db.tutorRequests.unshift(item);
    saveDemo(db);
    return clone(item);
  },
  createTeacher: async (payload) => {
    const db = loadDemo();
    const user = ensureUser(db, "teacher");
    if (user.role !== "teacher") throw new Error("Please use a teacher account to publish profiles.");
    const item = { id: newId("teacher"), teacherId: user.id, ...payload, expectedPrice: Number(payload.expectedPrice || 0), area: deriveArea(`${payload.address || ""} ${payload.serviceAreas || ""}`), latitude: fuzzyCoordinate(payload.latitude || 36.0671, 3), longitude: fuzzyCoordinate(payload.longitude || 120.3826, 4), status: "open", createdAt: now() };
    db.teacherProfiles.unshift(item);
    saveDemo(db);
    return clone(item);
  },
  interest: async (payload) => {
    const db = loadDemo();
    const user = ensureUser(db, payload.fromRole === "teacher" ? "teacher" : "parent");
    if (user.role !== payload.fromRole) throw new Error("Current account role does not match this action.");
    const interest = { id: newId("interest"), fromUserId: user.id, fromRole: payload.fromRole, targetType: payload.targetType, targetId: payload.targetId, requestId: payload.requestId || payload.targetId, teacherProfileId: payload.teacherProfileId || payload.targetId, status: "pending", createdAt: now() };
    const existing = db.interests.find((item) => item.fromUserId === interest.fromUserId && item.targetType === interest.targetType && item.targetId === interest.targetId && item.requestId === interest.requestId && item.teacherProfileId === interest.teacherProfileId);
    const saved = existing || interest;
    if (!existing) db.interests.push(saved);
    const match = createMatchIfMutual(db, saved);
    saveDemo(db);
    return { interest: clone(saved), match: clone(match), snapshot: publicDb(clone(db)) };
  },
  sendMessage: async (payload) => {
    const db = loadDemo();
    const match = db.matches.find((item) => item.id === payload.matchId);
    if (!match) throw new Error("Chat is only allowed after a successful match.");
    const user = ensureUser(db, "parent");
    if (![match.parentId, match.teacherId].includes(user.id)) throw new Error("Only matched users can send messages.");
    const message = { id: newId("msg"), matchId: match.id, senderId: user.id, content: String(payload.content || "").trim(), createdAt: now() };
    if (!message.content) throw new Error("Message cannot be empty.");
    db.messages.push(message);
    const requestItem = db.tutorRequests.find((item) => item.id === match.requestId);
    const profile = db.teacherProfiles.find((item) => item.id === match.teacherProfileId);
    if (requestItem) requestItem.status = "chatting";
    if (profile) profile.status = "chatting";
    saveDemo(db);
    return { message: clone(message), snapshot: publicDb(clone(db)) };
  }
};

export const api = STATIC_DEMO ? staticApi : {
  bootstrap: () => request("/api/bootstrap"),
  register: (payload) => request("/api/auth/register", { method: "POST", body: JSON.stringify(payload) }).then((data) => { setSession(data.user); return data; }),
  login: (payload) => request("/api/auth/login", { method: "POST", body: JSON.stringify(payload) }).then((data) => { setSession(data.user); return data; }),
  logout: async () => { setSession(null); return { ok: true }; },
  createRequest: (payload) => request("/api/requests", { method: "POST", body: JSON.stringify(payload) }),
  createTeacher: (payload) => request("/api/teachers", { method: "POST", body: JSON.stringify(payload) }),
  interest: (payload) => request("/api/interests", { method: "POST", body: JSON.stringify(payload) }),
  sendMessage: (payload) => request("/api/messages", { method: "POST", body: JSON.stringify(payload) })
};