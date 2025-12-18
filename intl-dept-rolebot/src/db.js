import fs from "node:fs/promises";
import path from "node:path";

const DB_DIR = path.join("data");
const DB_FILE = path.join(DB_DIR, "rolebot-intl-db.json");

let data = {
  users: [],
  tasks: [],
  config: {},
};

async function read() {
  try {
    const raw = await fs.readFile(DB_FILE, "utf-8");
    data = JSON.parse(raw);
  } catch {
    // ignore, use defaults
  }
}

async function write() {
  await fs.mkdir(DB_DIR, { recursive: true });
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export const db = {
  get data() {
    return data;
  },
  set data(v) {
    data = v;
  },
  read,
  write,
};

function ensureArrays() {
  if (!Array.isArray(data.users)) data.users = [];
  if (!Array.isArray(data.tasks)) data.tasks = [];
  if (!data.config || typeof data.config !== "object") data.config = {};
}

export async function ensureUser(id, username, fullName) {
  await read();
  ensureArrays();
  const uid = String(id);
  let u = data.users.find((x) => String(x.id) === uid);
  const now = new Date().toISOString();
  if (!u) {
    u = {
      id: uid,
      username: username || null,
      fullName: fullName || null,
      createdAt: now,
      updatedAt: now,
    };
    data.users.push(u);
  } else {
    u.username = username || u.username || null;
    u.fullName = fullName || u.fullName || null;
    u.updatedAt = now;
  }
  await write();
  return u;
}

let taskCounter = 0;
function nextTaskId() {
  taskCounter += 1;
  return String(Date.now()) + "-" + String(taskCounter);
}

export async function addTasks({ creatorId, assigneeId, date, titles }) {
  await read();
  ensureArrays();
  const now = new Date().toISOString();
  const uid = String(assigneeId);
  const created = [];
  for (const t of titles || []) {
    const title = String(t).trim();
    if (!title) continue;
    const task = {
      id: nextTaskId(),
      creatorId: String(creatorId),
      assigneeId: uid,
      date,
      title,
      status: "open",
      createdAt: now,
      doneAt: null,
    };
    data.tasks.push(task);
    created.push(task);
  }
  await write();
  return created;
}

export async function listTasksForAssignee(assigneeId, date) {
  await read();
  ensureArrays();
  const uid = String(assigneeId);
  const list = data.tasks.filter(
    (t) => String(t.assigneeId) === uid && t.date === date
  );
  list.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  return list;
}

export async function toggleTask(taskId) {
  await read();
  ensureArrays();
  const id = String(taskId);
  const t = data.tasks.find((x) => String(x.id) === id);
  if (!t) return null;
  if (t.status === "done") {
    t.status = "open";
    t.doneAt = null;
  } else {
    t.status = "done";
    t.doneAt = new Date().toISOString();
  }
  await write();
  return t;
}

export async function statsForDate(date) {
  await read();
  ensureArrays();
  const stats = {};
  for (const t of data.tasks) {
    if (t.date !== date) continue;
    const uid = String(t.assigneeId);
    if (!stats[uid]) stats[uid] = { total: 0, done: 0 };
    stats[uid].total += 1;
    if (t.status === "done") stats[uid].done += 1;
  }
  return stats;
}
