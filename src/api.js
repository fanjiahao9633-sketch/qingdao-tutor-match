const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

export const api = {
  bootstrap: () => request("/api/bootstrap"),
  createRequest: (payload) => request("/api/requests", { method: "POST", body: JSON.stringify(payload) }),
  createTeacher: (payload) => request("/api/teachers", { method: "POST", body: JSON.stringify(payload) }),
  interest: (payload) => request("/api/interests", { method: "POST", body: JSON.stringify(payload) }),
  sendMessage: (payload) => request("/api/messages", { method: "POST", body: JSON.stringify(payload) })
};
