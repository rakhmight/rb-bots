// src/db.js (ESM)
import { JSONFile } from "lowdb/node";
import { Low } from "lowdb";
import { nanoid } from "nanoid";

/** Файл базы */
const adapter = new JSONFile("./data/db.json");
export const db = new Low(adapter, { users: [], tasks: [], config: {} });

/** Инициализация */
await db.read();
db.data ||= { users: [], tasks: [], config: {} };
await db.write();

/** Хелперы */
const normTitle = (s) => String(s).trim().toLowerCase();

/*
  Модели:
  user: { tgId, username, fullName, createdAt }
  task: {
    id, title, date, creatorId, assigneeId,
    status: 'open'|'done',
    createdAt, doneAt
  }
*/

// ─────────── Users ───────────

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
  await db.write();
  return u;
}

// ─────────── Tasks ───────────

/** Добавляет ТОЛЬКО уникальные задачи для (assigneeId + date); дубликаты по названию игнорируются */
export async function addTasks({ creatorId, assigneeId, date, titles }) {
  await db.read();

  const created = [];
  const nowIso = new Date().toISOString();
  const existing = db.data.tasks.filter(
    (t) => t.assigneeId === String(assigneeId) && t.date === date
  );
  const existingSet = new Set(existing.map((t) => normTitle(t.title)));

  for (const raw of titles || []) {
    const title = String(raw).trim();
    if (!title) continue;
    const key = normTitle(title);
    if (existingSet.has(key)) continue;

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
    existingSet.add(key);
  }

  await db.write();
  return created;
}

export async function listTasksForAssignee(assigneeId, date) {
  await db.read();
  return db.data.tasks
    .filter((t) => t.assigneeId === String(assigneeId) && t.date === date)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Тоггл статуса; при done — удаляет все будущие копии той же задачи у того же исполнителя */
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

    // Чистим БУДУЩИЕ копии этой же «серии»
    const keyTitle = normTitle(t.title);
    const today = t.date;
    db.data.tasks = db.data.tasks.filter((x) => {
      if (x === t) return true;
      if (x.assigneeId !== t.assigneeId) return true;
      if (x.date <= today) return true; // сегодня/прошлое оставляем
      return normTitle(x.title) !== keyTitle; // будущие дубли — удалить
    });
  }

  await db.write();
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
 * Переносит все OPEN-задачи с fromDate → toDate, но НЕ переносит, если:
 * 1) уже есть задача на toDate с тем же названием у этого исполнителя, или
 * 2) где-либо есть ВЫПОЛНЕННАЯ копия той же «серии» (same assigneeId + norm(title)).
 */
export async function rollOverOpenTasks({ fromDate, toDate }) {
  await db.read();

  const pairKey = (assigneeId, title) =>
    `${assigneeId}::${normTitle(title)}`;

  const doneSeries = new Set(
    db.data.tasks
      .filter((t) => t.status === "done")
      .map((t) => pairKey(t.assigneeId, t.title))
  );

  const alreadyTomorrow = new Set(
    db.data.tasks
      .filter((t) => t.date === toDate)
      .map((t) => pairKey(t.assigneeId, t.title))
  );

  const toCarry = db.data.tasks.filter(
    (t) => t.date === fromDate && t.status === "open"
  );

  const created = [];
  const nowIso = new Date().toISOString();

  for (const t of toCarry) {
    const key = pairKey(t.assigneeId, t.title);
    if (doneSeries.has(key)) continue;          // прекращаем цепочку
    if (alreadyTomorrow.has(key)) continue;     // не дублируем

    const newTask = {
      id: nanoid(10),
      title: t.title,
      date: toDate,
      creatorId: "system:rollover",
      assigneeId: String(t.assigneeId),
      status: "open",
      createdAt: nowIso,
      doneAt: null,
    };

    db.data.tasks.push(newTask);
    created.push(newTask);
    alreadyTomorrow.add(key);
  }

  await db.write();
  return created;
}
