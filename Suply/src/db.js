// src/db.js
import fs from "node:fs";
import path from "node:path";
import { JSONFile } from "lowdb/node";
import { Low } from "lowdb";
import { nanoid } from "nanoid";

/** Абсолютные пути + гарантируем, что каталог существует */
const DATA_DIR = path.resolve(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, "db.json");

/** Адаптер и БД */
const adapter = new JSONFile(DB_FILE);
export const db = new Low(adapter, { users: [], tasks: [], config: {} });

await db.read();
db.data ||= { users: [], tasks: [], config: {} };
await db.write();

/** Универсальная безопасная запись с ретраями (на случай антивируса/блокировки на Windows) */
async function safeWrite(retries = 3, delayMs = 120) {
  for (let i = 0; i <= retries; i++) {
    try {
      await db.write();
      return;
    } catch (e) {
      if (i === retries) throw e;
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
}

/* ─────────── Users ─────────── */

export async function ensureUser(tgId, username, fullName) {
  await db.read();
  const id = String(tgId);
  let u = db.data.users.find((x) => x.tgId === id);
  if (!u) {
    u = {
      tgId: id,
      username: username || null,
      fullName: fullName || null,
      createdAt: new Date().toISOString(),
    };
    db.data.users.push(u);
  } else {
    u.username = username || u.username;
    u.fullName = fullName || u.fullName;
  }
  await safeWrite();
  return u;
}

/* ─────────── Tasks ─────────── */

/**
 * Добавляет ТОЛЬКО уникальные задачи для пары (assigneeId + date).
 * Дубликаты по названию (без регистра/пробелов) игнорируются.
 */
export async function addTasks({ creatorId, assigneeId, date, titles }) {
  await db.read();

  const created = [];
  const nowIso = new Date().toISOString();
  const norm = (s) => String(s).trim().toLowerCase();

  // Уже существующие на дату у исполнителя
  const existing = db.data.tasks.filter(
    (t) => t.assigneeId === String(assigneeId) && t.date === date
  );
  const existingSet = new Set(existing.map((t) => norm(t.title)));

  for (const raw of titles || []) {
    const title = String(raw).trim();
    if (!title) continue;
    if (existingSet.has(norm(title))) continue;

    const task = {
      id: nanoid(10),
      title,
      date,
      creatorId: String(creatorId),
      assigneeId: String(assigneeId),
      status: "open",
      createdAt: nowIso,
      doneAt: null,
    };
    db.data.tasks.push(task);
    created.push(task);
    existingSet.add(norm(title));
  }

  await safeWrite();
  return created;
}

export async function listTasksForAssignee(assigneeId, date) {
  await db.read();
  return db.data.tasks
    .filter((t) => t.assigneeId === String(assigneeId) && t.date === date)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function toggleTask(taskId) {
  await db.read();
  const t = db.data.tasks.find((x) => x.id === taskId);
  if (!t) return null;

  if (t.status === "done") {
    t.status = "open";
    t.doneAt = null;
  } else {
    t.status = "done";
    t.doneAt = new Date().toISOString();
  }

  await safeWrite();
  return t;
}

/** Сводка по дню: { [assigneeId]: { total, done, open } } */
export async function statsForDate(date) {
  await db.read();
  const res = {};
  for (const t of db.data.tasks.filter((x) => x.date === date)) {
    const id = String(t.assigneeId);
    if (!res[id]) res[id] = { total: 0, done: 0, open: 0 };
    res[id].total += 1;
    if (t.status === "done") res[id].done += 1;
    else if (t.status === "open") res[id].open += 1;
  }
  return res;
}

/**
 * Переносит ВСЕ невыполненные задачи с fromDate на toDate.
 * Делается ОДНА запись в БД в конце (без гонок).
 * Дубликаты на toDate (по assigneeId+title) не создаются.
 * Возвращает количество созданных задач.
 */
export async function rollOverOpenTasks({ fromDate, toDate }) {
  await db.read();

  const norm = (s) => String(s).trim().toLowerCase();

  // Что уже есть на дату toDate (для анти-дубликатов)
  const existsTo = new Set(
    db.data.tasks
      .filter((t) => t.date === toDate)
      .map((t) => `${t.assigneeId}::${norm(t.title)}`)
  );

  const opens = db.data.tasks.filter(
    (t) => t.date === fromDate && t.status !== "done"
  );

  let createdCount = 0;
  const nowIso = new Date().toISOString();

  for (const t of opens) {
    const key = `${t.assigneeId}::${norm(t.title)}`;
    if (existsTo.has(key)) continue;

    db.data.tasks.push({
      id: nanoid(10),
      title: t.title,
      date: toDate,
      creatorId: t.creatorId || "system",
      assigneeId: t.assigneeId,
      status: "open",
      createdAt: nowIso,
      doneAt: null,
    });
    existsTo.add(key);
    createdCount++;
  }

  await safeWrite();
  return createdCount;
}
