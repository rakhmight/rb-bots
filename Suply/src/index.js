import "dotenv/config";
import { Telegraf, Markup } from "telegraf";
import cron from "node-cron";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";

import {
  db,
  ensureUser,
  addTasks,
  listTasksForAssignee,
  toggleTask,
  statsForDate,
  rollOverOpenTasks,
} from "./db.js";
import { todayYMD, parseLines } from "./utils.js";

/* ========= ENV / НАСТРОЙКИ ========= */
const BOT_TOKEN = (process.env.BOT_TOKEN || "").trim();
const TZ = process.env.TZ || "Asia/Tashkent";
const START_TIME = process.env.START_TIME || "09:00"; // ежедневно
const END_TIME   = process.env.END_TIME   || "18:00"; // ежедневно
const GROUP_SUMMARY_CHAT_ID = process.env.GROUP_SUMMARY_CHAT_ID || "";

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN missing in .env");
  process.exit(1);
}

/* ========= РОЛИ / ИСПОЛНИТЕЛИ ========= */
const INITIAL_ADMIN_IDS = ["549405058"]; // поменяйте под себя
let ADMIN_IDS = new Set(INITIAL_ADMIN_IDS);

const EXECUTORS = [
  { id: "6106779069", name: "Мубашшира" },
  { id: "6509229090", name: "Шамсиддин" },
  { id: "7088279230", name: "Ирода" },
  { id: "8111383621", name: "Умар" },
  { id: "7373334420", name: "Гузаль" },
];

/* ===== Персональные ежедневные списки (правьте под себя) ===== */
const TASKS_6106779069 = [
  'Показать расчёт пациентов, у которых есть долг (Зав. врачу или лечащему доктору)',
  'Уведомить о долге каждого пациента',
  'Контроль оплаты за счёт пациента, у которого есть долг в назначенное время',
  'Фиксирование процессов для улучшения качества и эффективности работы (в группе "Фиксация")',
  "Сервис обхода пациентов (в приоритете жалобные пациенты)",
  "Контроль выполнения всех организационных для пациента услуг (консультации докторов, диагностические услуги, приглашённые врачи и т.д.)",
  'Проверить счёт и сделать "расчёт" каждого пациента',
  "Успешная выписка пациентов",
  'Выполнение отчёта "Госп - Выписка"',
  'Выполнение отчёта "IPD - Стационар"',
  "Анкетирование Пациентов",
];
const TASKS_6509229090 = [...TASKS_6106779069];
const TASKS_7088279230 = [...TASKS_6106779069];
const TASKS_8111383621 = [...TASKS_6106779069];
const TASKS_7373334420 = [...TASKS_6106779069];

/** "*" — каждый день; можно добавить 1..7 (ISO: 1=Пн … 7=Вс) для особых дней */
const DAILY_TEMPLATES_BY_DAY = {
  "*": {
    "6106779069": TASKS_6106779069,
    "6509229090": TASKS_6509229090,
    "7088279230": TASKS_7088279230,
    "8111383621": TASKS_8111383621,
    "7373334420": TASKS_7373334420,
  },
};

const isAdmin = (id) => ADMIN_IDS.has(String(id));
const labelFor = (uid) => {
  const x = EXECUTORS.find((e) => String(e.id) === String(uid));
  return x ? `${x.name} (${x.id})` : String(uid);
};

async function loadAdminsFromDb() {
  await db.read();
  const cfg = (db.data.config ||= {});
  if (!Array.isArray(cfg.adminIds) || !cfg.adminIds.length) {
    cfg.adminIds = [...INITIAL_ADMIN_IDS];
    await db.write();
  }
  ADMIN_IDS = new Set(cfg.adminIds.map(String));
}
async function saveAdminsToDb(list) {
  await db.read();
  db.data.config ||= {};
  db.data.config.adminIds = list.map(String);
  await db.write();
  ADMIN_IDS = new Set(db.data.config.adminIds);
}
async function addAdmin(id) { const s=new Set(ADMIN_IDS); s.add(String(id)); await saveAdminsToDb([...s]); }
async function removeAdmin(id) { const s=new Set(ADMIN_IDS); s.delete(String(id)); await saveAdminsToDb([...s]); }

/* ========= ВСПОМОГАТЕЛЬНОЕ ========= */
function jsWeekdayISO(d = new Date()) { const x = d.getDay(); return x === 0 ? 7 : x; }
function timeToCron(hhmm = "09:00", dow = "1-7") {
  const [h, m] = String(hhmm).split(":").map(n => parseInt(n) || 0);
  return `${m} ${h} * * ${dow}`;
}
function normBtnText(s = "") {
  return String(s)
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
function uniqueNormalized(list) {
  const seen = new Set(); const out = [];
  for (const t of list || []) {
    const k = String(t).trim().toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(String(t).trim()); }
  }
  return out;
}
function titlesFor(uid, weekdayISO) {
  const res = [];
  const byStar = DAILY_TEMPLATES_BY_DAY["*"];
  if (byStar?.[String(uid)]?.length) res.push(...byStar[String(uid)]);
  const byDay = DAILY_TEMPLATES_BY_DAY[weekdayISO];
  if (byDay?.[String(uid)]?.length) res.push(...byDay[String(uid)]);
  return uniqueNormalized(res);
}
async function ensureDailyTemplatesForDay(uid, weekdayISO) {
  const titles = titlesFor(uid, weekdayISO);
  if (!titles?.length) return null;
  const existing = await listTasksForAssignee(uid, todayYMD());
  const have = new Set(existing.map(t => t.title.trim().toLowerCase()));
  const toCreate = titles.filter(t => !have.has(String(t).trim().toLowerCase()));
  if (!toCreate.length) return [];
  return addTasks({ creatorId: "system", assigneeId: uid, date: todayYMD(), titles: toCreate });
}

/* ========= BOT ========= */
const bot = new Telegraf(BOT_TOKEN);

// регистрация
bot.use(async (ctx, next) => {
  if (ctx.from) {
    await ensureUser(
      String(ctx.from.id),
      ctx.from.username || null,
      [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ")
    );
  }
  return next();
});

// меню
function mainKeyboard(ctx) {
  const admin = isAdmin(ctx.from?.id);
  const rows = [];
  rows.push(["🆕 Назначить", "📨 Входящие"]);
  rows.push([admin ? "📊 Статус сегодня" : "ℹ️ Помощь"]);
  rows.push([admin ? "📤 Экспорт" : "📄 Мои отчёты"]);
  return Markup.keyboard(rows).resize();
}
function taskKeyboard(tasks) {
  return Markup.inlineKeyboard(
    tasks.map(t => [Markup.button.callback(
      (t.status === "done" ? "✅ " : "⬜ ") + t.title.slice(0, 60),
      `toggle:${t.id}`
    )])
  );
}
function executorsKeyboard(page = 0, pageSize = 6) {
  const start = page * pageSize;
  const slice = EXECUTORS.slice(start, start + pageSize);
  const rows = slice.map(e => [Markup.button.callback(`${e.name} (${e.id})`, `pick:${e.id}`)]);
  const pages = Math.ceil(EXECUTORS.length / pageSize);
  if (pages > 1) {
    const nav = [];
    if (page > 0) nav.push(Markup.button.callback("⏮️ Назад", `pg:${page - 1}`));
    if (page < pages - 1) nav.push(Markup.button.callback("Вперёд ⏭️", `pg:${page + 1}`));
    if (nav.length) rows.push(nav);
  }
  return Markup.inlineKeyboard(rows);
}
function afterPickKeyboard(uid) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("📋 Списком", `mode:list:${uid}`)],
    [Markup.button.callback("✍️ Одна задача", `mode:one:${uid}`)],
    [Markup.button.callback("🎤 Голосовое", `mode:voice:${uid}`)],
    [Markup.button.callback("📎 Фото/Видео/Документ", `mode:media:${uid}`)],
  ]);
}

/* ========= START / HELP ========= */
bot.command("myid", (ctx) => ctx.reply(`Ваш Telegram ID: ${ctx.from.id}`));
bot.command("daily_now", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply("⛔ Только админ.");
  const wd = jsWeekdayISO(new Date());
  let total = 0;
  for (const ex of EXECUTORS) {
    const created = await ensureDailyTemplatesForDay(String(ex.id), wd);
    if (created?.length) {
      total += created.length;
      try {
        await ctx.telegram.sendMessage(
          String(ex.id),
          "🗓 Ежедневные задачи на сегодня:\n" + created.map(t => "• " + t.title).join("\n"),
          taskKeyboard(created)
        );
      } catch {}
    }
  }
  await ctx.reply(`Готово. Создано новых задач: ${total}.`);
});

bot.start(async (ctx) => {
  const hi =
    `👋 <b>Добро пожаловать, ${ctx.from.first_name || "друг"}!</b>\n\n` +
    `Я — бот для распределения задач и отметки выполнения.\n\n` +
    `Нажмите «🆕 Назначить», чтобы выбрать исполнителя.\n` +
    `Полезно: /inbox, /status (админ), /export, /myid, /daily_now.`;
  await ctx.reply(hi, { parse_mode: "HTML", ...mainKeyboard(ctx) });
});
bot.help((ctx) =>
  ctx.reply(
    "Подсказка:\n" +
      "• «🆕 Назначить» — выбрать исполнителя и назначить задачи.\n" +
      "• «📨 Входящие» — мои задачи на сегодня.\n" +
      "• «📊 Статус сегодня» — сводка (админ).\n" +
      "• «📤 Экспорт» — выгрузка XLSX/PDF.\n" +
      "• /admins, /addadmin <id>, /rmadmin <id>.\n" +
      "• /daily_now — вручную отправить ежедневки сейчас (админ).",
    mainKeyboard(ctx)
  )
);

/* ========= УНИВЕРСАЛЬНЫЕ КНОПКИ ========= */
bot.on("text", async (ctx, next) => {
  const t = normBtnText(ctx.message.text);

  if (t === "назначить" || t === "+ назначить") {
    if (!isAdmin(ctx.from.id)) return ctx.reply("⛔ Только админ.", mainKeyboard(ctx));
    if (!EXECUTORS.length) return ctx.reply("Список исполнителей пуст.", mainKeyboard(ctx));
    await ctx.reply("Кого назначаем? Выбери исполнителя:", executorsKeyboard());
    return;
  }

  if (t === "входящие") {
    const myId = String(ctx.from.id);
    const list = await listTasksForAssignee(myId, todayYMD());
    if (!list.length) return ctx.reply("Пока задач на сегодня нет.", mainKeyboard(ctx));
    await ctx.reply("📥 Ваши задачи на сегодня:", taskKeyboard(list));
    return;
  }

  if (t === "статус сегодня" || t === "статус") {
    if (!isAdmin(ctx.from.id)) return ctx.reply("⛔ Только админ.", mainKeyboard(ctx));
    const stats = await statsForDate(todayYMD());
    const keys = Object.keys(stats);
    if (!keys.length) return ctx.reply("Сегодня задач нет.", mainKeyboard(ctx));
    let txt = `📊 <b>Сводка за ${todayYMD()}</b>\n`;
    for (const id of keys) {
      const s = stats[id];
      txt += `• ${labelFor(id)}: выполнено ${s.done}/${s.total}\n`;
    }
    await ctx.reply(txt, { parse_mode: "HTML", ...mainKeyboard(ctx) });
    return;
  }

  if (t === "экспорт" || t === "выгрузка" || t === "отчёт") {
    if (!isAdmin(ctx.from.id)) return ctx.reply("⛔ Только админ.", mainKeyboard(ctx));
    await ctx.reply("Выбери период и формат:", exportKeyboard());
    return;
  }

  return next();
});

/* ========= АДМИНЫ ========= */
bot.command("admins", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply("⛔ Только админ.");
  const list = [...ADMIN_IDS];
  const lines = list.map(id => {
    const ex = EXECUTORS.find(e => String(e.id) === String(id));
    return `• ${ex ? `${ex.name} (${id})` : id}`;
  });
  return ctx.reply("👑 Админы:\n" + lines.join("\n"));
});
bot.command("addadmin", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply("⛔ Только админ.");
  let target = (ctx.message.text.split(/\s+/)[1] || "").trim();
  if (!target && ctx.message.reply_to_message) target = String(ctx.message.reply_to_message.from.id);
  if (!target) return ctx.reply("Укажи ID: /addadmin <id> (или ответом на сообщение)");
  await addAdmin(target); return ctx.reply(`✅ Добавлен админ: ${target}`);
});
bot.command("rmadmin", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply("⛔ Только админ.");
  let target = (ctx.message.text.split(/\s+/)[1] || "").trim();
  if (!target && ctx.message.reply_to_message) target = String(ctx.message.reply_to_message.from.id);
  if (!target) return ctx.reply("Укажи ID: /rmadmin <id> (или ответом на сообщение)");
  if ([...ADMIN_IDS].length <= 1 && ADMIN_IDS.has(String(target)))
    return ctx.reply("Нельзя удалить последнего админа.");
  await removeAdmin(target); return ctx.reply(`🗑 Удалён админ: ${target}`);
});

/* ========= НАЗНАЧЕНИЕ ========= */
const state = new Map(); // adminId -> { mode: 'list'|'one'|'voice'|'media', assigneeId }

bot.action(/pg:(\d+)/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Только админ");
  const page = Number(ctx.match[1]);
  try { await ctx.editMessageText("Кого назначаем? Выбери исполнителя:", executorsKeyboard(page)); } catch {}
  await ctx.answerCbQuery();
});
bot.action(/pick:(\d+)/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Только админ");
  const uid = ctx.match[1]; state.set(String(ctx.from.id), { assigneeId: uid, mode: null });
  try {
    await ctx.editMessageText(`Исполнитель: <b>${labelFor(uid)}</b>\nВыбери способ назначения:`,
      { parse_mode: "HTML", ...afterPickKeyboard(uid) });
  } catch {}
  await ctx.answerCbQuery();
});
bot.action(/mode:(list|one|voice|media):(\d+)/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Только админ");
  const mode = ctx.match[1], uid = ctx.match[2];
  state.set(String(ctx.from.id), { assigneeId: uid, mode });
  await ctx.answerCbQuery(
    mode === "list" ? "Списком" :
    mode === "one" ? "Одна" :
    mode === "voice" ? "Голосовое" : "Медиа"
  );
  const msg =
    mode === "list"
      ? `Ок, <b>${labelFor(uid)}</b>.\nПришли список задач, по одной в строке. Пустое сообщение — завершить.`
      : mode === "one"
      ? `Ок, <b>${labelFor(uid)}</b>.\nПришли текст одной задачи:`
      : mode === "voice"
      ? `Ок, <b>${labelFor(uid)}</b>.\nПришли голосовое — перешлю исполнителю.`
      : `Ок, <b>${labelFor(uid)}</b>.\nПришли фото/видео/документ (можно несколько). Завершить — /done.`;
  await ctx.reply(msg, { parse_mode: "HTML", ...mainKeyboard(ctx) });
});

// текст назначения
bot.on("text", async (ctx, next) => {
  const aid = String(ctx.from.id);
  const st = state.get(aid);
  if (!st || !isAdmin(ctx.from.id)) return next();

  const uid = st.assigneeId;
  if (st.mode === "list") {
    const lines = parseLines(ctx.message.text);
    if (lines.length === 0) { state.delete(aid); return ctx.reply("Режим назначения завершён.", mainKeyboard(ctx)); }
    const tasks = await addTasks({ creatorId: aid, assigneeId: uid, date: todayYMD(), titles: lines });
    try {
      await ctx.telegram.sendMessage(uid, `📝 Вам назначены задачи:\n` + lines.map(x => "• " + x).join("\n"), taskKeyboard(tasks));
    } catch (e) {
      state.delete(aid);
      return ctx.reply(`Сохранил (${tasks.length}), но отправить не удалось (${e.message}).`, mainKeyboard(ctx));
    }
    state.delete(aid); return ctx.reply(`✅ Назначено задач: ${tasks.length} → ${labelFor(uid)}`, mainKeyboard(ctx));
  }
  if (st.mode === "one") {
    const title = ctx.message.text.trim();
    if (!title) return ctx.reply("Пришли текст задачи.");
    const [task] = await addTasks({ creatorId: aid, assigneeId: uid, date: todayYMD(), titles: [title] });
    try {
      await ctx.telegram.sendMessage(uid, `📝 Вам назначена задача:\n• ${task.title}`, taskKeyboard([task]));
    } catch (e) {
      state.delete(aid); return ctx.reply(`Сохранил, но отправка не удалась (${e.message}).`, mainKeyboard(ctx));
    }
    state.delete(aid); return ctx.reply(`✅ Назначено: «${title}» → ${labelFor(uid)}`, mainKeyboard(ctx));
  }

  return next();
});

// голосовые
bot.on(["voice", "audio"], async (ctx, next) => {
  const aid = String(ctx.from.id);
  const st = state.get(aid);
  if (!st || st.mode !== "voice" || !isAdmin(ctx.from.id)) return next();
  const uid = st.assigneeId;
  try {
    await ctx.telegram.copyMessage(String(uid), ctx.chat.id, ctx.message.message_id, { caption: "🎤 Голосовое от администратора" });
    await ctx.reply(`✅ Голосовое отправлено → ${labelFor(uid)}`, mainKeyboard(ctx));
  } catch (e) {
    await ctx.reply(`Не удалось отправить (${e.message}).`, mainKeyboard(ctx));
  }
  state.delete(aid);
});

// медиа
bot.on(["photo", "video", "animation", "document", "video_note"], async (ctx, next) => {
  const aid = String(ctx.from.id);
  const st = state.get(aid);
  if (!st || st.mode !== "media" || !isAdmin(ctx.from.id)) return next();
  const uid = st.assigneeId;
  try {
    await ctx.telegram.copyMessage(String(uid), ctx.chat.id, ctx.message.message_id);
    await ctx.reply(`📎 Переслал → ${labelFor(uid)}. Ещё? /done`, mainKeyboard(ctx));
  } catch (e) {
    await ctx.reply(`Не удалось переслать (${e.message}).`, mainKeyboard(ctx));
  }
});
bot.command("done", async (ctx) => {
  const aid = String(ctx.from.id);
  const st = state.get(aid);
  if (st?.mode === "media") {
    state.delete(aid);
    return ctx.reply("Готово. Режим вложений завершён.", mainKeyboard(ctx));
  }
});

/* ========= КНОПКА ВЫПОЛНЕНИЯ ========= */
bot.action(/toggle:(.+)/, async (ctx) => {
  const id = ctx.match[1];
  const t = await toggleTask(id);
  if (!t) return ctx.answerCbQuery("Не найдено");
  const list = await listTasksForAssignee(t.assigneeId, t.date);
  try { await ctx.editMessageReplyMarkup(taskKeyboard(list).reply_markup); } catch {}
  await ctx.answerCbQuery(t.status === "done" ? "Готово ✅" : "Вернул ⬜");
});
bot.command("inbox", async (ctx) => {
  const myId = String(ctx.from.id);
  const list = await listTasksForAssignee(myId, todayYMD());
  if (!list.length) return ctx.reply("Пока задач на сегодня нет.", mainKeyboard(ctx));
  await ctx.reply("📥 Ваши задачи:", taskKeyboard(list));
});
bot.command("status", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply("⛔ Только админ.", mainKeyboard(ctx));
  const stats = await statsForDate(todayYMD());
  const keys = Object.keys(stats);
  if (!keys.length) return ctx.reply("Сегодня задач нет.", mainKeyboard(ctx));
  let txt = `📊 <b>Сводка за ${todayYMD()}</b>\n`;
  for (const id of keys) { const s = stats[id]; txt += `• ${labelFor(id)}: выполнено ${s.done}/${s.total}\n`; }
  return ctx.reply(txt, { parse_mode: "HTML", ...mainKeyboard(ctx) });
});

/* ========= ЭКСПОРТ ========= */
function exportKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Сегодня • XLSX", "export:today:xlsx"), Markup.button.callback("Сегодня • PDF",  "export:today:pdf")],
    [Markup.button.callback("Неделя • XLSX",  "export:week:xlsx"),  Markup.button.callback("Неделя • PDF",   "export:week:pdf")],
    [Markup.button.callback("Месяц • XLSX",   "export:month:xlsx"), Markup.button.callback("Месяц • PDF",    "export:month:pdf")],
  ]);
}
bot.action(/^export:(today|week|month):(xlsx|pdf)$/i, async (ctx) => {
  const p = ctx.match[1], f = ctx.match[2];
  await ctx.answerCbQuery("Готовлю файл…"); await doExport(ctx, p, f);
});
bot.command("export", async (ctx) => {
  const a = ctx.message.text.trim().split(/\s+/).slice(1);
  await doExport(ctx, (a[0] || "today").toLowerCase(), (a[1] || "xlsx").toLowerCase());
});
function periodToRange(period) {
  const td = new Date(); const pad = n => String(n).padStart(2, "0");
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (period === "today") { const d = td; return { from: ymd(d), to: ymd(d) }; }
  if (period === "week")  { const js = td.getDay(); const delta = js === 0 ? 6 : js - 1;
    const s = new Date(td); s.setDate(td.getDate() - delta); const e = new Date(s); e.setDate(s.getDate() + 6);
    return { from: ymd(s), to: ymd(e) }; }
  if (period === "month") { const s = new Date(td.getFullYear(), td.getMonth(), 1);
    const e = new Date(td.getFullYear(), td.getMonth() + 1, 0); return { from: ymd(s), to: ymd(e) }; }
  return periodToRange("today");
}
async function fetchRows(fromY, toY) {
  await db.read(); const inR = d => d >= fromY && d <= toY; const rows = [];
  for (const t of db.data.tasks) {
    if (!inR(t.date)) continue;
    rows.push({
      date: t.date,
      assigneeId: String(t.assigneeId),
      assignee: labelFor(t.assigneeId),
      title: t.title,
      status: t.status === "done" ? "выполненные" : "не выполненные",
      doneAt: t.doneAt || "",
    });
  }
  rows.sort((a,b)=>
    a.date.localeCompare(b.date) ||
    a.assignee.localeCompare(b.assignee) ||
    a.title.localeCompare(b.title)
  );
  return rows;
}
async function makeXLSX(rows, period, outDir) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Tasks");
  ws.columns = [
    { header: "Date",     key: "date",     width: 12 },
    { header: "Assignee", key: "assignee", width: 28 },
    { header: "Title",    key: "title",    width: 60 },
    { header: "Status",   key: "status",   width: 18 },
    { header: "Done At",  key: "doneAt",   width: 20 },
  ];
  ws.getRow(1).font = { bold: true };
  const GREEN_FILL={type:"pattern",pattern:"solid",fgColor:{argb:"C6EFCE"}}, GREEN_FONT={color:{argb:"006100"}};
  const RED_FILL  ={type:"pattern",pattern:"solid",fgColor:{argb:"FFC7CE"}}, RED_FONT  ={color:{argb:"9C0006"}};
  rows.forEach(r => {
    const row = ws.addRow(r);
    const ok = r.status === "выполненные";
    row.eachCell(c => {
      c.fill = ok ? GREEN_FILL : RED_FILL;
      c.font = { ...(c.font||{}), ...(ok?GREEN_FONT:RED_FONT) };
    });
  });
  const file = path.join(outDir, `report_${period}_${Date.now()}.xlsx`);
  await wb.xlsx.writeFile(file);
  return file;
}
function findCyrFontPath(){
  const cwd=process.cwd();
  const candidates = [
    path.join(cwd,"fonts","DejaVuSans.ttf"),
    path.join(cwd,"fonts","NotoSans-Regular.ttf"),
    path.join(cwd,"fonts","Roboto-Regular.ttf"),
    "C:\\Windows\\Fonts\\arial.ttf","C:\\Windows\\Fonts\\arialuni.ttf","C:\\Windows\\Fonts\\segoeui.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
    "/usr/share/fonts/truetype/roboto/Roboto-Regular.ttf",
    "/Library/Fonts/Arial Unicode.ttf","/Library/Fonts/Arial.ttf",
  ];
  for (const p of candidates) { try { if (fs.existsSync(p)) return p; } catch {} }
  return null;
}
async function makePDF(rows, period, outDir) {
  const file = path.join(outDir, `report_${period}_${Date.now()}.pdf`);
  const sanitize=(s="")=>String(s)
    .replace(/[\u{1F300}-\u{1FAFF}\u{FE00}-\u{FE0F}\u{200D}]/gu,"")
    .replace(/\s+/g," ").trim();

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 32 });
    const st  = fs.createWriteStream(file);
    st.on("finish", resolve); st.on("error", reject);
    doc.pipe(st);

    const fp = findCyrFontPath();
    if (fp) { try { doc.registerFont("Cyr", fp); doc.font("Cyr"); } catch(e) { console.warn("PDF font:", e.message); } }
    else { console.warn("Нет кириллического шрифта. Положи fonts/DejaVuSans.ttf"); }

    const COLS = [
      { key: "date", title: "Дата", width: 80 },
      { key: "assignee", title: "Исполнитель", width: 170 },
      { key: "status", title: "Статус", width: 110 },
      { key: "title", title: "Задача", width: 595 - 32*2 - (80+170+110) - 6 },
    ];
    const startX = 32;
    let y = doc.y;
    function drawHeader() {
      y += 2; let x = startX;
      doc.fontSize(10).fillColor("#000");
      for (const c of COLS) { doc.text(c.title, x, y, { width: c.width }); x += c.width + 2; }
      y = doc.y + 6;
      doc.moveTo(startX,y).lineTo(595-32,y).strokeColor("#BBBBBB").lineWidth(0.8).stroke();
      y += 4;
    }
    function ensurePage(height = 18) {
      const bottom = 842 - 32;
      if (y + height <= bottom) return;
      doc.addPage(); y = 32; drawHeader();
    }
    drawHeader();

    let stripe = false;
    for (const r of rows) {
      ensurePage(24); stripe = !stripe;
      if (stripe) {
        doc.rect(startX-1, y-2, 595-32*2, 20).fillOpacity(0.06).fill("#999").fillOpacity(1);
      }
      let x = startX;
      const statusTxt = r.status === "выполненные" ? "выполнено" : "не выполнено";
      const statusColor = r.status === "выполненные" ? "#0B7A21" : "#9C0006";

      doc.fontSize(10).fillColor("#333").text(r.date, x, y, { width: COLS[0].width }); x += COLS[0].width + 2;
      doc.fillColor("#000").text(sanitize(r.assignee), x, y, { width: COLS[1].width }); x += COLS[1].width + 2;
      doc.fillColor(statusColor).text(statusTxt, x, y, { width: COLS[2].width }); x += COLS[2].width + 2;
      doc.fillColor("#000").text(sanitize(r.title||""), x, y, { width: COLS[3].width });

      y = Math.max(y + 16, doc.y + 2);
    }

    doc.end();
  });

  return file;
}
async function doExport(ctx, period = "today", format = "xlsx") {
  if (!isAdmin(ctx.from.id)) return ctx.reply("⛔ Только админ.", mainKeyboard(ctx));
  const { from, to } = periodToRange(period);
  const rows = await fetchRows(from, to);
  if (!rows.length) return ctx.reply("За выбранный период задач нет.", mainKeyboard(ctx));
  const outDir = path.join("data", "reports"); fs.mkdirSync(outDir, { recursive: true });
  if (format === "xlsx") {
    const file = await makeXLSX(rows, period, outDir); await fsPromises.access(file);
    await ctx.replyWithDocument({ source: file, filename: path.basename(file) });
  } else if (format === "pdf") {
    const file = await makePDF(rows, period, outDir); await fsPromises.access(file);
    await ctx.replyWithDocument({ source: file, filename: path.basename(file) });
  } else await ctx.reply("Формат не поддерживается. xlsx или pdf.");
}

/* ========= РАСПИСАНИЕ ========= */
const lastNotified = { morning: new Map(), evening: new Map() };
function shouldSend(map, key, win = 60_000) {
  const now = Date.now(); const prev = map.get(String(key)) || 0;
  if (now - prev < win) return false; map.set(String(key), now); return true;
}
async function runMorning(){
  const wd = jsWeekdayISO(new Date());
  try {
    for (const ex of EXECUTORS) {
      const created = await ensureDailyTemplatesForDay(String(ex.id), wd);
      if (created?.length) {
        try { if (shouldSend(lastNotified.morning, ex.id)) {
          await bot.telegram.sendMessage(String(ex.id),
            "🗓 Ежедневные задачи на сегодня:\n" + created.map(t=>"• "+t.title).join("\n"),
            taskKeyboard(created)
          );
        }} catch (e) { console.warn("Morning DM failed:", ex.id, e.message); }
      }
    }
  } catch (e) { console.error("Morning scheduler error:", e); }
}
cron.schedule(timeToCron(START_TIME, "1-7"), ()=>runMorning(), { timezone: TZ, recoverMissedExecutions:true });

cron.schedule(timeToCron(END_TIME,"1-7"), async ()=>{
  try {
    // перенос open -> завтра
    const pad = n => String(n).padStart(2, "0");
    const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    const today = new Date(); const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    await rollOverOpenTasks({ fromDate: ymd(today), toDate: ymd(tomorrow) });

    // личные напоминания
    for (const ex of EXECUTORS) {
      try { if (shouldSend(lastNotified.evening, ex.id)) {
        await bot.telegram.sendMessage(String(ex.id),
          "⏰ Конец дня. Отметьте выполненные задачи и подготовьте отчёт.",
          mainKeyboard({ from: { id: ex.id } })
        );
      }} catch (e) { console.warn("Evening DM failed:", ex.id, e.message); }
    }

    // сводка
    if (GROUP_SUMMARY_CHAT_ID) {
      const stats = await statsForDate(todayYMD());
      const keys = Object.keys(stats);
      let msg = `📊 Сводка за ${todayYMD()}:\n`;
      if (!keys.length) msg += "Сегодня задач нет.";
      else for (const id of keys) { const s = stats[id]; msg += `• ${labelFor(id)}: выполнено ${s.done}/${s.total}\n`; }
      try { await bot.telegram.sendMessage(String(GROUP_SUMMARY_CHAT_ID), msg, { parse_mode: "HTML" }); }
      catch (e) { console.warn("Group summary failed:", e.message); }
    }
  } catch (e) { console.error("Evening scheduler error:", e); }
}, { timezone: TZ, recoverMissedExecutions:true });

/* ========= START ========= */
(async ()=>{
  await loadAdminsFromDb();
  try { const me = await bot.telegram.getMe(); console.log(`[RoleBot] @${me.username} (${me.id})`); } catch {}
  await bot.launch({ allowedUpdates:["message","edited_message","callback_query"] });
  console.log("✅ RoleBot started");
  // Автопрогон на старте (если бот запущен после START_TIME)
  await runMorning();
})();

process.once("SIGINT",  () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
