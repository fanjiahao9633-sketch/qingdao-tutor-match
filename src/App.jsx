import React, { useEffect, useMemo, useState } from "react";
import MapView from "./components/MapView.jsx";
import { api } from "./api.js";

const emptyRequest = {
  studentGrade: "",
  studentGender: "",
  subject: "",
  frequency: "",
  duration: "",
  expectedTime: "",
  budgetMin: 100,
  budgetMax: 180,
  mode: "offline",
  address: "青岛市",
  latitude: 36.0671,
  longitude: 120.3826,
  requirements: ""
};

const emptyTeacher = {
  name: "",
  gender: "",
  school: "",
  degree: "",
  major: "",
  subjects: "",
  serviceAreas: "",
  expectedPrice: 150,
  availableTime: "",
  experience: "",
  bio: "",
  certificates: "",
  address: "青岛市",
  latitude: 36.0671,
  longitude: 120.3826
};

const tabs = [
  ["map", "地图"],
  ["request", "发需求"],
  ["teacher", "发简历"],
  ["matches", "匹配"],
  ["chat", "私聊"]
];

function modeLabel(mode) {
  return { online: "线上", offline: "线下", both: "线上/线下" }[mode] || mode;
}

function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function App() {
  const [data, setData] = useState({ users: [], tutorRequests: [], teacherProfiles: [], interests: [], matches: [], messages: [] });
  const [role, setRole] = useState("parent");
  const [tab, setTab] = useState("map");
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState({ type: "all", state: "all", subject: "", area: "", min: "", max: "" });
  const [requestForm, setRequestForm] = useState(emptyRequest);
  const [teacherForm, setTeacherForm] = useState(emptyTeacher);
  const [activeMatchId, setActiveMatchId] = useState("");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    api.bootstrap().then(setData).catch((err) => setNotice(err.message));
  }, []);

  const currentUser = useMemo(() => {
    return data.users.find((user) => user.role === role) || { id: role === "parent" ? "parent-demo" : "teacher-demo", role, nickname: role === "parent" ? "家长演示账号" : "教师演示账号" };
  }, [data.users, role]);

  const myRequest = data.tutorRequests.find((item) => item.parentId === currentUser.id) || data.tutorRequests[0];
  const myTeacherProfile = data.teacherProfiles.find((item) => item.teacherId === currentUser.id) || data.teacherProfiles[0];

  const mapItems = useMemo(() => {
    const requests = data.tutorRequests.map((item) => ({ ...item, kind: "request", title: `${item.subject} 家教需求` }));
    const teachers = data.teacherProfiles.map((item) => ({ ...item, kind: "teacher", title: `${item.name} 教师简历` }));
    return [...requests, ...teachers].filter((item) => {
      if (filters.type !== "all" && item.kind !== filters.type) return false;
      if (filters.state !== "all" && item.status !== filters.state) return false;
      const subjectText = item.kind === "request" ? item.subject : item.subjects;
      if (filters.subject && !subjectText?.includes(filters.subject)) return false;
      const areaText = `${item.area || ""} ${item.address || ""} ${item.serviceAreas || ""}`;
      if (filters.area && !areaText.includes(filters.area)) return false;
      const price = item.kind === "request" ? Number(item.budgetMax) : Number(item.expectedPrice);
      if (filters.min && price < Number(filters.min)) return false;
      if (filters.max && price > Number(filters.max)) return false;
      return true;
    });
  }, [data, filters]);

  const selectedItem = selected || mapItems[0];
  const sentInterests = data.interests.filter((item) => item.fromUserId === currentUser.id);
  const receivedInterests = data.interests.filter((interest) => {
    if (role === "parent") return data.tutorRequests.some((req) => req.parentId === currentUser.id && interest.targetType === "request" && interest.targetId === req.id);
    return data.teacherProfiles.some((profile) => profile.teacherId === currentUser.id && interest.targetType === "teacher" && interest.targetId === profile.id);
  });
  const myMatches = data.matches.filter((match) => match.parentId === currentUser.id || match.teacherId === currentUser.id);
  const activeMatch = myMatches.find((match) => match.id === activeMatchId) || myMatches[0];
  const activeMessages = activeMatch ? data.messages.filter((item) => item.matchId === activeMatch.id) : [];

  async function refreshFromSnapshot(result) {
    if (result.snapshot) setData(result.snapshot);
    else setData(await api.bootstrap());
  }

  async function submitRequest(event) {
    event.preventDefault();
    const created = await api.createRequest(requestForm);
    setData(await api.bootstrap());
    setSelected({ ...created, kind: "request" });
    setTab("map");
    setNotice("家教需求已发布，地图位置已做轻微模糊化处理。");
  }

  async function submitTeacher(event) {
    event.preventDefault();
    const created = await api.createTeacher(teacherForm);
    setData(await api.bootstrap());
    setSelected({ ...created, kind: "teacher" });
    setTab("map");
    setNotice("教师简历已发布，地图位置已做轻微模糊化处理。");
  }

  async function showInterest(item) {
    try {
      const payload = item.kind === "teacher"
        ? { fromRole: "parent", targetType: "teacher", targetId: item.id, requestId: myRequest?.id }
        : { fromRole: "teacher", targetType: "request", targetId: item.id, teacherProfileId: myTeacherProfile?.id };
      const result = await api.interest(payload);
      await refreshFromSnapshot(result);
      setNotice(result.match ? "匹配成功，已开启私聊入口。" : "已发送兴趣，等待对方回应。");
    } catch (err) {
      setNotice(err.message);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    if (!activeMatch || !message.trim()) return;
    const result = await api.sendMessage({ matchId: activeMatch.id, senderId: currentUser.id, content: message });
    setMessage("");
    await refreshFromSnapshot(result);
  }

  function renderCard(item) {
    if (!item) return <div className="empty">暂无符合条件的信息。</div>;
    const isRequest = item.kind === "request";
    const canInterest = (role === "parent" && !isRequest) || (role === "teacher" && isRequest);
    const title = isRequest ? `${item.subject}家教 · ${item.studentGrade}` : `${item.name} · ${item.subjects}`;
    return (
      <article className={`info-card ${item.id === selectedItem?.id ? "selected" : ""}`} onClick={() => setSelected(item)}>
        <div className="card-head">
          <span className={`dot ${isRequest ? "blue" : "green"} ${item.status === "chatting" ? "solid" : ""}`} />
          <div>
            <h3>{title}</h3>
            <p>{item.area || item.address} · {item.status === "chatting" ? "正在接触中" : "无人私聊"}</p>
          </div>
        </div>
        <div className="meta-grid">
          <span>{isRequest ? `${item.budgetMin}-${item.budgetMax} 元/小时` : `${item.expectedPrice} 元/小时`}</span>
          <span>{isRequest ? item.frequency : item.serviceAreas}</span>
          <span>{isRequest ? modeLabel(item.mode) : item.availableTime}</span>
        </div>
        <p className="summary">{isRequest ? item.requirements : item.bio}</p>
        {canInterest && (
          <button className="primary small" onClick={(event) => { event.stopPropagation(); showInterest(item); }}>
            感兴趣
          </button>
        )}
      </article>
    );
  }

  function interestTitle(interest) {
    const request = data.tutorRequests.find((item) => item.id === interest.requestId || item.id === interest.targetId);
    const teacher = data.teacherProfiles.find((item) => item.id === interest.teacherProfileId || item.id === interest.targetId);
    return `${teacher?.name || "教师"} ↔ ${request?.subject || "需求"}`;
  }

  function matchTitle(match) {
    const request = data.tutorRequests.find((item) => item.id === match.requestId);
    const teacher = data.teacherProfiles.find((item) => item.id === match.teacherProfileId);
    return `${teacher?.name || "教师"} / ${request?.subject || "家教需求"}`;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>青岛家教信息共享与双向匹配</h1>
          <p>地图找需求与教师，双方感兴趣后开启站内私聊。</p>
        </div>
        <div className="identity">
          <span>当前身份</span>
          <button className={role === "parent" ? "active" : ""} onClick={() => setRole("parent")}>家长端</button>
          <button className={role === "teacher" ? "active" : ""} onClick={() => setRole("teacher")}>教师端</button>
        </div>
      </header>

      <nav className="tabs">
        {tabs.map(([key, label]) => (
          <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>
        ))}
      </nav>

      {notice && <div className="notice" onClick={() => setNotice("")}>{notice}</div>}

      {tab === "map" && (
        <main className="map-layout">
          <section className="map-panel">
            <MapView items={mapItems} selectedId={selectedItem?.id} onSelect={setSelected} />
            <div className="legend">
              <span><i className="legend-blue" />蓝色家教需求</span>
              <span><i className="legend-green" />绿色教师简历</span>
              <span><i className="legend-light" />浅色无人私聊</span>
              <span><i className="legend-dark" />深色正在接触中</span>
            </div>
          </section>
          <aside className="side-panel">
            <div className="filters">
              <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
                <option value="all">全部类型</option>
                <option value="request">只看家教需求</option>
                <option value="teacher">只看教师简历</option>
              </select>
              <select value={filters.state} onChange={(e) => setFilters({ ...filters, state: e.target.value })}>
                <option value="all">全部状态</option>
                <option value="open">只看无人私聊</option>
                <option value="chatting">只看正在接触中</option>
              </select>
              <input placeholder="科目" value={filters.subject} onChange={(e) => setFilters({ ...filters, subject: e.target.value })} />
              <input placeholder="区域，如市南区" value={filters.area} onChange={(e) => setFilters({ ...filters, area: e.target.value })} />
              <input type="number" placeholder="最低价" value={filters.min} onChange={(e) => setFilters({ ...filters, min: e.target.value })} />
              <input type="number" placeholder="最高价" value={filters.max} onChange={(e) => setFilters({ ...filters, max: e.target.value })} />
            </div>
            <div className="detail">
              <h2>详情</h2>
              {renderCard(selectedItem)}
            </div>
            <div className="list">{mapItems.map(renderCard)}</div>
          </aside>
        </main>
      )}

      {tab === "request" && (
        <FormShell title="发布家教需求" tip="联系方式不公开展示，请不要填写身份证号、详细门牌号等敏感信息。地图点选只用于模糊位置展示。">
          <form onSubmit={submitRequest} className="form-grid">
            <Field label="学生年级" value={requestForm.studentGrade} onChange={(v) => setRequestForm({ ...requestForm, studentGrade: v })} required />
            <Field label="学生性别" value={requestForm.studentGender} onChange={(v) => setRequestForm({ ...requestForm, studentGender: v })} />
            <Field label="科目" value={requestForm.subject} onChange={(v) => setRequestForm({ ...requestForm, subject: v })} required />
            <Field label="每周频率" value={requestForm.frequency} onChange={(v) => setRequestForm({ ...requestForm, frequency: v })} />
            <Field label="每次时长" value={requestForm.duration} onChange={(v) => setRequestForm({ ...requestForm, duration: v })} />
            <Field label="期望时间" value={requestForm.expectedTime} onChange={(v) => setRequestForm({ ...requestForm, expectedTime: v })} />
            <Field label="预算下限" type="number" value={requestForm.budgetMin} onChange={(v) => setRequestForm({ ...requestForm, budgetMin: v })} />
            <Field label="预算上限" type="number" value={requestForm.budgetMax} onChange={(v) => setRequestForm({ ...requestForm, budgetMax: v })} />
            <label>授课形式<select value={requestForm.mode} onChange={(e) => setRequestForm({ ...requestForm, mode: e.target.value })}><option value="offline">线下</option><option value="online">线上</option><option value="both">线上/线下</option></select></label>
            <Field label="位置/商圈" value={requestForm.address} onChange={(v) => setRequestForm({ ...requestForm, address: v })} />
            <label className="wide">其他要求<textarea value={requestForm.requirements} onChange={(e) => setRequestForm({ ...requestForm, requirements: e.target.value })} /></label>
            <div className="wide picker"><MapView picker items={[]} onPick={(pos) => setRequestForm({ ...requestForm, ...pos })} /></div>
            <button className="primary wide">提交需求</button>
          </form>
        </FormShell>
      )}

      {tab === "teacher" && (
        <FormShell title="发布教师简历" tip="证书和成绩可用文本说明；请勿上传身份证号、准考证号、详细住址等敏感信息。">
          <form onSubmit={submitTeacher} className="form-grid">
            <Field label="姓名或昵称" value={teacherForm.name} onChange={(v) => setTeacherForm({ ...teacherForm, name: v })} required />
            <Field label="性别" value={teacherForm.gender} onChange={(v) => setTeacherForm({ ...teacherForm, gender: v })} />
            <Field label="学校" value={teacherForm.school} onChange={(v) => setTeacherForm({ ...teacherForm, school: v })} />
            <Field label="学历" value={teacherForm.degree} onChange={(v) => setTeacherForm({ ...teacherForm, degree: v })} />
            <Field label="专业" value={teacherForm.major} onChange={(v) => setTeacherForm({ ...teacherForm, major: v })} />
            <Field label="可教科目" value={teacherForm.subjects} onChange={(v) => setTeacherForm({ ...teacherForm, subjects: v })} required />
            <Field label="授课区域" value={teacherForm.serviceAreas} onChange={(v) => setTeacherForm({ ...teacherForm, serviceAreas: v })} />
            <Field label="期望薪资" type="number" value={teacherForm.expectedPrice} onChange={(v) => setTeacherForm({ ...teacherForm, expectedPrice: v })} />
            <Field label="可授课时间" value={teacherForm.availableTime} onChange={(v) => setTeacherForm({ ...teacherForm, availableTime: v })} />
            <Field label="位置/商圈" value={teacherForm.address} onChange={(v) => setTeacherForm({ ...teacherForm, address: v })} />
            <label className="wide">教学经验<textarea value={teacherForm.experience} onChange={(e) => setTeacherForm({ ...teacherForm, experience: e.target.value })} /></label>
            <label className="wide">个人简介<textarea value={teacherForm.bio} onChange={(e) => setTeacherForm({ ...teacherForm, bio: e.target.value })} /></label>
            <label className="wide">证书/成绩/获奖经历<textarea value={teacherForm.certificates} onChange={(e) => setTeacherForm({ ...teacherForm, certificates: e.target.value })} /></label>
            <div className="wide picker"><MapView picker items={[]} onPick={(pos) => setTeacherForm({ ...teacherForm, ...pos })} /></div>
            <button className="primary wide">提交简历</button>
          </form>
        </FormShell>
      )}

      {tab === "matches" && (
        <main className="workspace">
          <Panel title="我发出的兴趣">{sentInterests.length ? sentInterests.map((item) => <StatusRow key={item.id} title={interestTitle(item)} status={item.status} />) : <Empty />}</Panel>
          <Panel title="收到的兴趣">{receivedInterests.length ? receivedInterests.map((item) => <StatusRow key={item.id} title={interestTitle(item)} status={item.status} />) : <Empty />}</Panel>
          <Panel title="匹配成功">{myMatches.length ? myMatches.map((item) => <button className="match-row" key={item.id} onClick={() => { setActiveMatchId(item.id); setTab("chat"); }}>{matchTitle(item)}<span>进入私聊</span></button>) : <Empty text="双方互相感兴趣后会出现在这里。" />}</Panel>
        </main>
      )}

      {tab === "chat" && (
        <main className="chat-layout">
          <aside className="chat-list">
            <h2>聊天列表</h2>
            {myMatches.map((match) => {
              const last = data.messages.filter((item) => item.matchId === match.id).slice(-1)[0];
              return <button key={match.id} className={activeMatch?.id === match.id ? "active" : ""} onClick={() => setActiveMatchId(match.id)}><strong>{matchTitle(match)}</strong><span>{last?.content || "暂无消息"}</span><small>{formatTime(last?.createdAt || match.createdAt)}</small></button>;
            })}
            {!myMatches.length && <Empty text="未匹配成功前不允许私聊。" />}
          </aside>
          <section className="chat-window">
            <h2>{activeMatch ? matchTitle(activeMatch) : "请选择聊天"}</h2>
            <div className="messages">
              {activeMessages.map((item) => <div key={item.id} className={`message ${item.senderId === currentUser.id ? "mine" : ""}`}><p>{item.content}</p><span>{formatTime(item.createdAt)}</span></div>)}
              {!activeMessages.length && <Empty text="匹配成功后即可发送第一条站内消息。" />}
            </div>
            <form className="composer" onSubmit={sendMessage}>
              <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="输入站内消息" disabled={!activeMatch} />
              <button className="primary" disabled={!activeMatch}>发送</button>
            </form>
          </section>
        </main>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required = false }) {
  return <label>{label}<input type={type} value={value} required={required} onChange={(e) => onChange(e.target.value)} /></label>;
}

function FormShell({ title, tip, children }) {
  return <main className="form-shell"><h2>{title}</h2><p className="privacy-tip">{tip}</p>{children}</main>;
}

function Panel({ title, children }) {
  return <section className="panel"><h2>{title}</h2>{children}</section>;
}

function StatusRow({ title, status }) {
  return <div className="status-row"><span>{title}</span><strong>{status === "matched" ? "匹配成功" : "等待对方回应"}</strong></div>;
}

function Empty({ text = "暂无数据。" }) {
  return <p className="empty">{text}</p>;
}
