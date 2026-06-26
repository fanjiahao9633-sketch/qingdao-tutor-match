const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";
const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === "1";
const STORAGE_KEY = "qingdao-tutor-match-demo";

const seedData = {
  users: [
    { id: "parent-demo", role: "parent", nickname: "Parent Demo", createdAt: "2026-06-26T00:00:00.000Z" },
    { id: "teacher-demo", role: "teacher", nickname: "Teacher Demo", createdAt: "2026-06-26T00:00:00.000Z" }
  ],
  tutorRequests: [
    {
      id: "req-seed-1",
      parentId: "parent-demo",
      parentNickname: "Parent Demo",
      studentGrade: "初二",
      studentGender: "女",
      subject: "数学",
      frequency: "每周2次",
      duration: "每次2小时",
      expectedTime: "周三晚、周六下午",
      budgetMin: 120,
      budgetMax: 180,
      mode: "offline",
      address: "市南区 香港中路附近",
      area: "市南区",
      latitude: 36.0668,
      longitude: 120.3826,
      requirements: "希望老师有初中数学提分经验。请勿填写详细门牌号。",
      status: "open",
      createdAt: "2026-06-26T00:00:00.000Z"
    }
  ],
  teacherProfiles: [
    {
      id: "teacher-seed-1",
      teacherId: "teacher-demo",
      name: "李老师",
      gender: "男",
      school: "中国海洋大学",
      degree: "本科在读",
      major: "数学与应用数学",
      subjects: "数学, 物理",
      serviceAreas: "市南区, 崂山区",
      expectedPrice: 150,
      availableTime: "周末、工作日晚",
      experience: "2年一对一家教经验",
      bio: "擅长梳理知识框架和错题复盘。",
      certificates: "数学竞赛省级奖项",
      address: "崂山区 海大崂山校区附近",
      area: "崂山区",
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

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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
  const areas = ["市南区", "市北区", "李沧区", "崂山区", "城阳区", "黄岛区", "即墨区", "胶州市", "平度市", "莱西市"];
  return areas.find((area) => address.includes(area)) || "青岛市";
}

function fuzzyCoordinate(value, seed = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const offset = ((Math.sin(numeric * 1000 + seed) + 1) / 2 - 0.5) * 0.006;
  return Number((numeric + offset).toFixed(6));
}

function ensureUser(db, role) {
  const id = role === "teacher" ? "teacher-demo" : "parent-demo";
  let user = db.users.find((item) => item.id === id);
  if (!user) {
    user = { id, role, nickname: role === "teacher" ? "Teacher Demo" : "Parent Demo", createdAt: now() };
    db.users.push(user);
  }
  return user;
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
  bootstrap: async () => clone(loadDemo()),
  createRequest: async (payload) => {
    const db = loadDemo();
    const user = ensureUser(db, "parent");
    const item = {
      id: newId("req"),
      parentId: user.id,
      parentNickname: user.nickname,
      ...payload,
      budgetMin: Number(payload.budgetMin || 0),
      budgetMax: Number(payload.budgetMax || 0),
      area: deriveArea(payload.address || ""),
      latitude: fuzzyCoordinate(payload.latitude || 36.0671, 1),
      longitude: fuzzyCoordinate(payload.longitude || 120.3826, 2),
      status: "open",
      createdAt: now()
    };
    db.tutorRequests.unshift(item);
    saveDemo(db);
    return clone(item);
  },
  createTeacher: async (payload) => {
    const db = loadDemo();
    const user = ensureUser(db, "teacher");
    const item = {
      id: newId("teacher"),
      teacherId: user.id,
      ...payload,
      expectedPrice: Number(payload.expectedPrice || 0),
      area: deriveArea(`${payload.address || ""} ${payload.serviceAreas || ""}`),
      latitude: fuzzyCoordinate(payload.latitude || 36.0671, 3),
      longitude: fuzzyCoordinate(payload.longitude || 120.3826, 4),
      status: "open",
      createdAt: now()
    };
    db.teacherProfiles.unshift(item);
    saveDemo(db);
    return clone(item);
  },
  interest: async (payload) => {
    const db = loadDemo();
    const user = ensureUser(db, payload.fromRole === "teacher" ? "teacher" : "parent");
    const interest = {
      id: newId("interest"),
      fromUserId: user.id,
      fromRole: payload.fromRole,
      targetType: payload.targetType,
      targetId: payload.targetId,
      requestId: payload.requestId || payload.targetId,
      teacherProfileId: payload.teacherProfileId || payload.targetId,
      status: "pending",
      createdAt: now()
    };
    const existing = db.interests.find((item) => item.fromUserId === interest.fromUserId && item.targetType === interest.targetType && item.targetId === interest.targetId && item.requestId === interest.requestId && item.teacherProfileId === interest.teacherProfileId);
    const saved = existing || interest;
    if (!existing) db.interests.push(saved);
    const match = createMatchIfMutual(db, saved);
    saveDemo(db);
    return { interest: clone(saved), match: clone(match), snapshot: clone(db) };
  },
  sendMessage: async (payload) => {
    const db = loadDemo();
    const match = db.matches.find((item) => item.id === payload.matchId);
    if (!match) throw new Error("未匹配成功前不允许私聊。");
    const message = { id: newId("msg"), matchId: match.id, senderId: payload.senderId || match.parentId, content: String(payload.content || "").trim(), createdAt: now() };
    if (!message.content) throw new Error("消息不能为空。");
    db.messages.push(message);
    const requestItem = db.tutorRequests.find((item) => item.id === match.requestId);
    const profile = db.teacherProfiles.find((item) => item.id === match.teacherProfileId);
    if (requestItem) requestItem.status = "chatting";
    if (profile) profile.status = "chatting";
    saveDemo(db);
    return { message: clone(message), snapshot: clone(db) };
  }
};

export const api = STATIC_DEMO ? staticApi : {
  bootstrap: () => request("/api/bootstrap"),
  createRequest: (payload) => request("/api/requests", { method: "POST", body: JSON.stringify(payload) }),
  createTeacher: (payload) => request("/api/teachers", { method: "POST", body: JSON.stringify(payload) }),
  interest: (payload) => request("/api/interests", { method: "POST", body: JSON.stringify(payload) }),
  sendMessage: (payload) => request("/api/messages", { method: "POST", body: JSON.stringify(payload) })
};