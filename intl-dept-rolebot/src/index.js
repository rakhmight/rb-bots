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
} from "./db.js";
import { todayYMD, parseLines } from "./utils.js";

/* ========= ENV / НАСТРОЙКИ ========= */
const RAW_TOKEN = process.env.BOT_TOKEN ?? "";
const BOT_TOKEN = RAW_TOKEN.trim();

const mask = (t) => (t || "").replace(/^(\d{3}).+(:).+$/, "$1***$2***");
console.log("[RoleBot] BOT_TOKEN =", mask(BOT_TOKEN), "len=", BOT_TOKEN.length);
if (!/^\d+:[\w-]{30,}$/.test(BOT_TOKEN)) {
  console.error(
    "BOT_TOKEN выглядит некорректно. Проверь .env — без кавычек и лишних пробелов, одной строкой."
  );
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN, {
  telegram: { apiRoot: "https://api.telegram.org" },
});

const TZ = process.env.TZ || "Asia/Tashkent";
const START_TIME = process.env.START_TIME || "09:00"; // утро — ежедневно
const END_TIME = process.env.END_TIME || "18:00"; // вечер — ежедневно
const GROUP_SUMMARY_CHAT_ID =
  process.env.GROUP_SUMMARY_CHAT_ID || ""; // общий чат (опц.)

const INITIAL_ADMIN_IDS = ["273845"];
let ADMIN_IDS = new Set(INITIAL_ADMIN_IDS);

/* ========= ИСПОЛНИТЕЛИ (International Department) ========= */

// TODO: подставь реальные Telegram ID вместо 111..., 222... и т.д.
const EXECUTORS = [
  { id: "273845", name: "Наргиза" },
  { id: "676585560", name: "Шахноза" },
  { id: "2385959", name: "Висола" },
  { id: "7704193972", name: "Гулчехра" },
  { id: "641479195", name: "Самариддин" },
  { id: "891894246", name: "Эльнора" },
  { id: "1158021172", name: "Шавкат" },
  { id: "873312368", name: "Азаматжон" },

];

// Ежедневные чек-листы по обязанностям
const DAILY_TEMPLATES_BY_DAY = {
  "*": {
    // Руководитель международного отдела — Рахимова Наргиза Шухратовна
    "273845": [
      "Составление и контроль плана продаж, анализ показателей",
      "Контроль эффективной работы специалистов международного отдела",
      "Планирование программ продвижения и мероприятий для стимула спроса услуг",
      "Контроль регистрации иностранных пациентов в АИС «ЕМЕНМОН»",
    ],

    // Ведущий специалист международного отдела — Каримова Шахноза Шухратиллаевна
    "676585560": [
      "Составление плана и анализ продаж",
      "Составление финансовых отчётов, анализ и контроль отчётов и задолжников клиники",
      "Организационные вопросы по представительству в Таджикистане и перевод документов",
      "Регистрация иностранных пациентов в АИС «ЕМЕНМОН»",
      "Бронирование услуг врачей для потенциальных клиентов",
      "Встреча и проводы пациентов",
    ],

    // Специалист межд. отдела — Юнусова Висола Дилмуродовна
    "2385959": [
      "Бронирование услуг врачей для потенциальных клиентов",
      "Ответы на входящие звонки и ведение телефонных переговоров",
      "Встреча и проводы пациентов",
      "Сопровождение корпоративных клиентов и иностранных англоязычных пациентов клиники",
    ],

    // Стажёр межд. отдела — Солижонова Гулчехра Нематжоновна
    "7704193972": [
      "Бронирование услуг врачей для потенциальных клиентов",
      "Встреча и проводы пациентов",
    ],
  },
};

/* ========= УТИЛИТЫ ПО ПРАВАМ ========= */

const isAdmin = (id) => ADMIN_IDS.has(String(id));

const labelFor = (uid) => {
  const x = EXECUTORS.find((e) => String(e.id) === String(uid));
  return x ? `${x.name} (${x.id})` : String(uid);
};

// является ли пользователь одним из исполнителей
const isExecutor = (id) =>
  EXECUTORS.some((e) => String(e.id) === String(id));

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
async function addAdmin(id) {
  const s = new Set(ADMIN_IDS);
  s.add(String(id));
  await saveAdminsToDb([...s]);
}
async function removeAdmin(id) {
  const s = new Set(ADMIN_IDS);
  s.delete(String(id));
  await saveAdminsToDb([...s]);
}

/* ========= ВСПОМОГАТЕЛЬНОЕ ========= */
function jsWeekdayISO(d = new Date()) {
  const x = d.getDay(); // 0..6 (вс..сб)
  return x === 0 ? 7 : x; // 1..7 (пн..вс)
}
function timeToCron(hhmm = "09:00", dow = "*") {
  const [h, m] = String(hhmm)
    .split(":")
    .map((n) => parseInt(n) || 0);
  return `${m} ${h} * * ${dow}`;
}
function normBtnText(s = "") {
  return String(s)
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
function ymd(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function tomorrowYMD() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return ymd(d);
}

async function ensureDailyTemplatesForDay(uid, weekdayISO) {
  const dayMap =
    DAILY_TEMPLATES_BY_DAY[weekdayISO] ||
    DAILY_TEMPLATES_BY_DAY["*"] ||
    DAILY_TEMPLATES_BY_DAY[1];
  if (!dayMap) return null;

  const titles = dayMap[String(uid)];
  if (!titles?.length) return null;

  const existing = await listTasksForAssignee(uid, todayYMD());
  const have = new Set(existing.map((t) => t.title.trim().toLowerCase()));
  const toCreate = titles.filter(
    (t) => !have.has(String(t).trim().toLowerCase())
  );
  if (!toCreate.length) return [];
  return addTasks({
    creatorId: "system",
    assigneeId: uid,
    date: todayYMD(),
    titles: toCreate,
  });
}

/* ========= ПЕРЕНОС НЕВЫПОЛНЕННЫХ (вечером -> завтра) ========= */
/** Копирует все открытые задачи с fromY на toY, без дублей.
 * Возвращает map: { [assigneeId]: Task[] созданные на toY } */
async function rollOverOpenTasks(fromY, toY) {
  await db.read();
  const norm = (s) => String(s).trim().toLowerCase();

  // уже есть на toY (антидубли)
  const todays = db.data.tasks.filter((t) => t.date === toY);
  const haveByUid = {};
  for (const t of todays) {
    const uid = String(t.assigneeId);
    (haveByUid[uid] ||= new Set()).add(norm(t.title));
  }

  // открытые на fromY
  const open = db.data.tasks.filter(
    (t) =>
      t.date === fromY &&
      t.status === "open" &&
      t.title &&
      String(t.title).trim()
  );

  const toCreateByUid = {};
  for (const t of open) {
    const uid = String(t.assigneeId);
    const key = norm(t.title);
    const set = (haveByUid[uid] ||= new Set());
    if (set.has(key)) continue;
    (toCreateByUid[uid] ||= []).push(t.title);
    set.add(key);
  }

  const createdByUid = {};
  for (const [uid, titles] of Object.entries(toCreateByUid)) {
    if (!titles.length) continue;
    const created = await addTasks({
      creatorId: "system",
      assigneeId: uid,
      date: toY,
      titles,
    });
    if (created?.length) createdByUid[uid] = created;
  }
  return createdByUid;
}

/* ========= BOT ========= */

// регистрируем пользователя в локальной БД
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
    tasks.map((t) => [
      Markup.button.callback(
        (t.status === "done" ? "✅ " : "⬜ ") + t.title.slice(0, 60),
        `toggle:${t.id}`
      ),
    ])
  );
}
function executorsKeyboard(page = 0, pageSize = 6) {
  const start = page * pageSize;
  const slice = EXECUTORS.slice(start, start + pageSize);
  const rows = slice.map((e) => [
    Markup.button.callback(`${e.name} (${e.id})`, `pick:${e.id}`),
  ]);
  const pages = Math.ceil(EXECUTORS.length / pageSize);
  if (pages > 1) {
    const nav = [];
    if (page > 0)
      nav.push(Markup.button.callback("⏮️ Назад", `pg:${page - 1}`));
    if (page < pages - 1)
      nav.push(Markup.button.callback("Вперёд ⏭️", `pg:${page + 1}`));
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

bot.start(async (ctx) => {
  const hi =
    `👋 <b>Добро пожаловать, ${
      ctx.from.first_name || "друг"
    }!</b>\n\n` +
    `Я — бот для распределения задач по людям и отметки выполнения.\n\n` +
    `Нажмите «🆕 Назначить», чтобы выбрать исполнителя из списка.\n` +
    `Исполнителю придут задачи с кнопками для отметки.\n\n` +
    `Полезно: /inbox, /status (только админ), /export, /myid.`;
  await ctx.reply(hi, { parse_mode: "HTML", ...mainKeyboard(ctx) });
});
bot.help((ctx) =>
  ctx.reply(
    "Подсказка:\n" +
      "• «🆕 Назначить» — выбрать исполнителя и назначить задачи.\n" +
      "• «📨 Входящие» — мои задачи на сегодня.\n" +
      "• «📊 Статус сегодня» — сводка (админ).\n" +
      "• «📤 Экспорт» — выгрузка XLSX/PDF.\n" +
      "• Режим «📎 Фото/Видео/Документ» — пересылка вложений исполнителю.\n" +
      "• Автоперенос: невыполненные задачи переносятся вечером «на завтра».\n" +
      "• /admins, /addadmin <id>, /rmadmin <id>.",
    mainKeyboard(ctx)
  )
);

/* ========= УНИВЕРСАЛЬНЫЕ КНОПКИ ========= */
bot.on("text", async (ctx, next) => {
  const t = normBtnText(ctx.message.text);

  // Назначить
  if (t === "назначить" || t === "+ назначить") {
    if (!isAdmin(ctx.from.id))
      return ctx.reply("⛔ Только админ.", mainKeyboard(ctx));
    if (!EXECUTORS.length)
      return ctx.reply(
        "Список исполнителей пуст (EXECUTORS).",
        mainKeyboard(ctx)
      );
    await ctx.reply("Кого назначаем? Выбери исполнителя:", executorsKeyboard());
    return;
  }

  // Входящие
  if (t === "входящие") {
    const myId = String(ctx.from.id);

    // Лениво подкидываем ежедневные задачи, если это исполнитель
    if (isExecutor(myId)) {
      await ensureDailyTemplatesForDay(myId, jsWeekdayISO(new Date()));
    }

    const list = await listTasksForAssignee(myId, todayYMD());
    if (!list.length)
      return ctx.reply("Пока задач на сегодня нет.", mainKeyboard(ctx));
    await ctx.reply("📥 Ваши задачи на сегодня:", taskKeyboard(list));
    return;
  }

  // Статус
  if (t === "статус сегодня" || t === "статус") {
    if (!isAdmin(ctx.from.id))
      return ctx.reply("⛔ Только админ.", mainKeyboard(ctx));
    const stats = await statsForDate(todayYMD());
    const keys = Object.keys(stats);
    if (!keys.length)
      return ctx.reply("Сегодня задач нет.", mainKeyboard(ctx));
    let txt = `📊 <b>Сводка за ${todayYMD()}</b>\n`;
    for (const id of keys) {
      const s = stats[id];
      txt += `• ${labelFor(id)}: выполнено ${s.done}/${s.total}\n`;
    }
    await ctx.reply(txt, { parse_mode: "HTML", ...mainKeyboard(ctx) });
    return;
  }

  // Экспорт
  if (t === "экспорт" || t === "выгрузка" || t === "отчёт") {
    if (!isAdmin(ctx.from.id))
      return ctx.reply("⛔ Только админ.", mainKeyboard(ctx));
    await ctx.reply("Выбери период и формат:", exportKeyboard());
    return;
  }

  // Режим media: подсказка/выход
  const aid = String(ctx.from.id);
  const st = state.get(aid);
  if (st && st.mode === "media" && isAdmin(ctx.from.id)) {
    const txt = (ctx.message.text || "").trim().toLowerCase();
    if (txt === "/done" || txt === "готово" || txt === "стоп") {
      state.delete(aid);
      return ctx.reply("✅ Режим медиа завершён.", mainKeyboard(ctx));
    }
    return ctx.reply(
      "Пришли фото/видео/документ или напиши /done, чтобы выйти.",
      mainKeyboard(ctx)
    );
  }

  // не кнопка — дальше
  return next();
});

/* ========= АДМИНЫ ========= */
bot.command("admins", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply("⛔ Только админ.");
  const list = [...ADMIN_IDS];
  const lines = list.map((id) => {
    const ex = EXECUTORS.find((e) => String(e.id) === String(id));
    return `• ${ex ? `${ex.name} (${id})` : id}`;
  });
  return ctx.reply("👑 Админы:\n" + lines.join("\n"));
});

// список исполнителей
bot.command("execs", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply("⛔ Только админ.");
  const lines = EXECUTORS.map((e) => `• ${e.name}: ${e.id}`);
  return ctx.reply("Исполнители:\n" + lines.join("\n"));
});

bot.command("addadmin", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply("⛔ Только админ.");
  let target = (ctx.message.text.split(/\s+/)[1] || "").trim();
  if (!target && ctx.message.reply_to_message)
    target = String(ctx.message.reply_to_message.from.id);
  if (!target)
    return ctx.reply("Укажи ID: /addadmin <id> (или ответом на сообщение)");
  await addAdmin(target);
  return ctx.reply(`✅ Добавлен админ: ${target}`);
});
bot.command("rmadmin", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply("⛔ Только админ.");
  let target = (ctx.message.text.split(/\s+/)[1] || "").trim();
  if (!target && ctx.message.reply_to_message)
    target = String(ctx.message.reply_to_message.from.id);
  if (!target)
    return ctx.reply("Укажи ID: /rmadmin <id> (или ответом на сообщение)");
  if ([...ADMIN_IDS].length <= 1 && ADMIN_IDS.has(String(target)))
    return ctx.reply("Нельзя удалить последнего админа.");
  await removeAdmin(target);
  return ctx.reply(`🗑 Удалён админ: ${target}`);
});

/* ========= НАЗНАЧЕНИЕ ========= */
const state = new Map(); // adminId -> { mode: 'list'|'one'|'voice'|'media', assigneeId }

bot.action(/pg:(\d+)/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Только админ");
  const page = Number(ctx.match[1]);
  try {
    await ctx.editMessageText(
      "Кого назначаем? Выбери исполнителя:",
      executorsKeyboard(page)
    );
  } catch {}
  await ctx.answerCbQuery();
});
bot.action(/pick:(\d+)/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Только админ");
  const uid = ctx.match[1];
  state.set(String(ctx.from.id), { assigneeId: uid, mode: null });
  try {
    await ctx.editMessageText(
      `Исполнитель: <b>${labelFor(uid)}</b>\nВыбери способ назначения:`,
      { parse_mode: "HTML", ...afterPickKeyboard(uid) }
    );
  } catch {}
  await ctx.answerCbQuery();
});
bot.action(/mode:(list|one):(\d+)/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Только админ");
  const mode = ctx.match[1],
    uid = ctx.match[2];
  state.set(String(ctx.from.id), { assigneeId: uid, mode });
  await ctx.answerCbQuery(mode === "list" ? "Списком" : "Одна задача");
  await ctx.reply(
    mode === "list"
      ? `Ок, <b>${labelFor(
          uid
        )}</b>.\nПришли список задач, по одной в строке. Пустое сообщение — завершить.`
      : `Ок, <b>${labelFor(uid)}</b>.\nПришли текст одной задачи:`,
    { parse_mode: "HTML", ...mainKeyboard(ctx) }
  );
});
bot.action(/mode:voice:(\d+)/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Только админ");
  const uid = ctx.match[1];
  state.set(String(ctx.from.id), { assigneeId: uid, mode: "voice" });
  await ctx.answerCbQuery("Голосовое");
  await ctx.reply(
    `Ок, <b>${labelFor(uid)}</b>.\nПришли голосовое — перешлю исполнителю.`,
    { parse_mode: "HTML", ...mainKeyboard(ctx) }
  );
});
bot.action(/mode:media:(\d+)/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("Только админ");
  const uid = ctx.match[1];
  state.set(String(ctx.from.id), { assigneeId: uid, mode: "media" });
  await ctx.answerCbQuery("Медиа");
  await ctx.reply(
    `Ок, <b>${labelFor(
      uid
    )}</b>.\nОтправь фото/видео/документ. Можно несколько подряд.\nКогда закончишь — напиши <code>/done</code> или «готово».`,
    { parse_mode: "HTML", ...mainKeyboard(ctx) }
  );
});

// Текст после выбора режима (list/one) — задачи
bot.on("text", async (ctx, next) => {
  const aid = String(ctx.from.id);
  const st = state.get(aid);
  if (!st || !isAdmin(ctx.from.id)) return next();

  const uid = st.assigneeId;
  if (st.mode === "list") {
    const lines = parseLines(ctx.message.text);
    if (lines.length === 0) {
      state.delete(aid);
      return ctx.reply("Режим назначения завершён.", mainKeyboard(ctx));
    }
    const tasks = await addTasks({
      creatorId: aid,
      assigneeId: uid,
      date: todayYMD(),
      titles: lines,
    });
    try {
      await ctx.telegram.sendMessage(
        uid,
        `📝 Вам назначены задачи:\n` + lines.map((x) => "• " + x).join("\n"),
        taskKeyboard(tasks)
      );
    } catch (e) {
      state.delete(aid);
      return ctx.reply(
        `Сохранил (${tasks.length}), но отправить не удалось (${e.message}).`,
        mainKeyboard(ctx)
      );
    }
    state.delete(aid);
    return ctx.reply(
      `✅ Назначено задач: ${tasks.length} → ${labelFor(uid)}`,
      mainKeyboard(ctx)
    );
  }
  if (st.mode === "one") {
    const title = ctx.message.text.trim();
    if (!title) return ctx.reply("Пришли текст задачи.");
    const [task] = await addTasks({
      creatorId: aid,
      assigneeId: uid,
      date: todayYMD(),
      titles: [title],
    });
    try {
      await ctx.telegram.sendMessage(
        uid,
        `📝 Вам назначена задача:\n• ${task.title}`,
        taskKeyboard([task])
      );
    } catch (e) {
      state.delete(aid);
      return ctx.reply(
        `Сохранил, но отправка не удалась (${e.message}).`,
        mainKeyboard(ctx)
      );
    }
    state.delete(aid);
    return ctx.reply(
      `✅ Назначено: «${title}» → ${labelFor(uid)}`,
      mainKeyboard(ctx)
    );
  }

  return next();
});

// Голосовые от админа
bot.on(["voice", "audio"], async (ctx, next) => {
  const aid = String(ctx.from.id);
  const st = state.get(aid);
  if (!st || st.mode !== "voice" || !isAdmin(ctx.from.id)) return next();
  const uid = st.assigneeId;
  try {
    await ctx.telegram.copyMessage(String(uid), ctx.chat.id, ctx.message.message_id, {
      caption: "🎤 Голосовое от администратора",
    });
    await ctx.reply(
      `✅ Голосовое отправлено → ${labelFor(uid)}`,
      mainKeyboard(ctx)
    );
  } catch (e) {
    await ctx.reply(
      `Не удалось отправить (${e.message}).`,
      mainKeyboard(ctx)
    );
  }
  state.delete(aid);
});

// Фото/видео/документ в режиме media
bot.on(
  ["photo", "video", "animation", "document", "video_note"],
  async (ctx, next) => {
    const aid = String(ctx.from.id);
    const st = state.get(aid);
    if (!st || st.mode !== "media" || !isAdmin(ctx.from.id)) return next();

    const uid = st.assigneeId;
    try {
      await ctx.telegram.copyMessage(
        String(uid),
        ctx.chat.id,
        ctx.message.message_id
      );
      await ctx.reply(
        `📎 Отправлено → ${labelFor(
          uid
        )}. Можешь отправить ещё или /done.`,
        mainKeyboard(ctx)
      );
    } catch (e) {
      await ctx.reply(
        `Не удалось отправить (${e.message}).`,
        mainKeyboard(ctx)
      );
    }
  }
);

/* ========= ИСПОЛНИТЕЛИ: INBOX / STATUS ========= */
bot.action(/toggle:(.+)/, async (ctx) => {
  const id = ctx.match[1];
  const t = await toggleTask(id);
  if (!t) return ctx.answerCbQuery("Не найдено");
  const list = await listTasksForAssignee(t.assigneeId, t.date);
  try {
    await ctx.editMessageReplyMarkup(taskKeyboard(list).reply_markup);
  } catch {}
  await ctx.answerCbQuery(t.status === "done" ? "Готово ✅" : "Вернул ⬜");
});

bot.command("inbox", async (ctx) => {
  const myId = String(ctx.from.id);

  if (isExecutor(myId)) {
    await ensureDailyTemplatesForDay(myId, jsWeekdayISO(new Date()));
  }

  const list = await listTasksForAssignee(myId, todayYMD());
  if (!list.length)
    return ctx.reply("Пока задач на сегодня нет.", mainKeyboard(ctx));
  await ctx.reply("📥 Ваши задачи:", taskKeyboard(list));
});

bot.command("status", async (ctx) => {
  if (!isAdmin(ctx.from.id))
    return ctx.reply("⛔ Только админ.", mainKeyboard(ctx));
  const stats = await statsForDate(todayYMD());
  const keys = Object.keys(stats);
  if (!keys.length) return ctx.reply("Сегодня задач нет.", mainKeyboard(ctx));
  let txt = `📊 <b>Сводка за ${todayYMD()}</b>\n`;
  for (const id of keys) {
    const s = stats[id];
    txt += `• ${labelFor(id)}: выполнено ${s.done}/${s.total}\n`;
  }
  return ctx.reply(txt, { parse_mode: "HTML", ...mainKeyboard(ctx) });
});

/* ========= ЭКСПОРТ ========= */
function exportKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Сегодня • XLSX", "export:today:xlsx"),
      Markup.button.callback("Сегодня • PDF", "export:today:pdf"),
    ],
    [
      Markup.button.callback("Неделя • XLSX", "export:week:xlsx"),
      Markup.button.callback("Неделя • PDF", "export:week:pdf"),
    ],
    [
      Markup.button.callback("Месяц • XLSX", "export:month:xlsx"),
      Markup.button.callback("Месяц • PDF", "export:month:pdf"),
    ],
  ]);
}
bot.action(/^export:(today|week|month):(xlsx|pdf)$/i, async (ctx) => {
  const p = ctx.match[1],
    f = ctx.match[2];
  await ctx.answerCbQuery("Готовлю файл…");
  await doExport(ctx, p, f);
});
bot.command("export", async (ctx) => {
  const a = ctx.message.text.trim().split(/\s+/).slice(1);
  await doExport(
    ctx,
    (a[0] || "today").toLowerCase(),
    (a[1] || "xlsx").toLowerCase()
  );
});

function periodToRange(period) {
  const td = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const ymd_ = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (period === "today") {
    const d = td;
    return { from: ymd_(d), to: ymd_(d) };
  }
  if (period === "week") {
    const js = td.getDay();
    const delta = js === 0 ? 6 : js - 1;
    const s = new Date(td);
    s.setDate(td.getDate() - delta);
    const e = new Date(s);
    e.setDate(s.getDate() + 6);
    return { from: ymd_(s), to: ymd_(e) };
  }
  if (period === "month") {
    const s = new Date(td.getFullYear(), td.getMonth(), 1);
    const e = new Date(td.getFullYear(), td.getMonth() + 1, 0);
    return { from: ymd_(s), to: ymd_(e) };
  }
  return periodToRange("today");
}
async function fetchRows(fromY, toY) {
  await db.read();
  const inR = (d) => d >= fromY && d <= toY;
  const rows = [];
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
  rows.sort(
    (a, b) =>
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
    { header: "Date", key: "date", width: 12 },
    { header: "Assignee", key: "assignee", width: 28 },
    { header: "Title", key: "title", width: 60 },
    { header: "Status", key: "status", width: 16 },
    { header: "Done At", key: "doneAt", width: 20 },
  ];
  ws.getRow(1).font = { bold: true };
  const GREEN_FILL = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "C6EFCE" },
  };
  const GREEN_FONT = { color: { argb: "006100" } };
  const RED_FILL = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFC7CE" },
  };
  const RED_FONT = { color: { argb: "9C0006" } };
  rows.forEach((r) => {
    const row = ws.addRow(r);
    const ok = r.status === "выполненные";
    row.eachCell((c) => {
      c.fill = ok ? GREEN_FILL : RED_FILL;
      c.font = { ...(c.font || {}), ...(ok ? GREEN_FONT : RED_FONT) };
    });
  });
  const file = path.join(outDir, `report_${period}_${Date.now()}.xlsx`);
  await wb.xlsx.writeFile(file);
  return file;
}
function findCyrFontPath() {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "fonts", "DejaVuSans.ttf"),
    path.join(cwd, "fonts", "NotoSans-Regular.ttf"),
    path.join(cwd, "fonts", "Roboto-Regular.ttf"),
    "C:\\Windows\\Fonts\\arial.ttf",
    "C:\\Windows\\Fonts\\arialuni.ttf",
    "C:\\Windows\\Fonts\\segoeui.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
    "/usr/share/fonts/truetype/roboto/Roboto-Regular.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
    "/Library/Fonts/Arial.ttf",
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return null;
}

// ===== аккуратный PDF =====
async function makePDF(rows, period, outDir) {
  const file = path.join(outDir, `report_${period}_${Date.now()}.pdf`);

  const sanitize = (s = "") =>
    String(s)
      .replace(/[\u{1F300}-\u{1FAFF}\u{FE00}-\u{FE0F}\u{200D}]/gu, "")
      .replace(/\s+/g, " ")
      .trim();

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 36,
      layout:
        (process.env.PDF_LANDSCAPE || "").toLowerCase() === "true"
          ? "landscape"
          : "portrait",
    });
    const st = fs.createWriteStream(file);
    st.on("finish", resolve);
    st.on("error", reject);
    doc.pipe(st);

    const fp = findCyrFontPath();
    if (fp) {
      try {
        doc.registerFont("Cyr", fp);
        doc.font("Cyr");
      } catch (e) {
        console.warn("PDF font:", e.message);
      }
    } else {
      console.warn("Нет кириллического шрифта. Положи fonts/DejaVuSans.ttf");
    }

    const L = doc.page.margins.left;
    const R = doc.page.width - doc.page.margins.right;
    const T = doc.page.margins.top;
    const B = doc.page.height - doc.page.margins.bottom;

    const DATE_W = 80,
      STAT_W = 120,
      GAP = 8;
    const TITLE_W = R - L - DATE_W - STAT_W - GAP * 2;

    const TH = 22,
      PAD_Y = 6,
      ROW_MIN_H = 20;
    const LINE = "#E5E7EB",
      ZEBRA = "#F8FAFC",
      GREY = "#444";

    let y = T;

    function drawPageHeader() {
      doc.fontSize(18).fillColor("#000").text(
        `Отчёт по задачам (${period})`,
        L,
        y,
        {
          width: R - L,
        }
      );
      y += 8;
      doc
        .moveTo(L, y)
        .lineTo(R, y)
        .strokeColor(LINE)
        .lineWidth(1)
        .stroke();
      y += 10;
      drawTableHeader();
    }
    function drawTableHeader() {
      doc.save();
      doc.rect(L, y, R - L, TH).fill("#EEF2FF");
      doc.restore();

      doc.fontSize(11).fillColor("#000");
      let x = L;
      doc.text("Дата", x + 6, y + (TH - 12) / 2, {
        width: DATE_W - 12,
        align: "left",
      });
      x += DATE_W + GAP;
      doc.text("Статус", x + 6, y + (TH - 12) / 2, {
        width: STAT_W - 12,
        align: "left",
      });
      x += STAT_W + GAP;
      doc.text("Задача", x + 6, y + (TH - 12) / 2, {
        width: TITLE_W - 12,
        align: "left",
      });

      y += TH;
      doc
        .moveTo(L, y)
        .lineTo(R, y)
        .strokeColor(LINE)
        .lineWidth(1)
        .stroke();
    }
    function addPageIfNeeded(needH) {
      if (y + needH <= B) return;
      doc.addPage();
      y = T;
      drawPageHeader();
    }

    const groups = rows.reduce(
      (m, r) => ((m[r.assignee] ??= []).push(r), m),
      {}
    );
    const assignees = Object.keys(groups).sort((a, b) =>
      a.localeCompare(b, "ru")
    );

    drawPageHeader();

    assignees.forEach((assignee, gi) => {
      const items = groups[assignee];

      const gh = 22;
      addPageIfNeeded(gh + TH);
      doc.fontSize(13).fillColor("#000").text(assignee, L, y);
      y += gh;

      let i = 0;
      for (const r of items) {
        const dateTxt = r.date,
          stxt = r.status,
          titleTxt = sanitize(r.title || "");
        const titleH = doc.heightOfString(titleTxt, {
          width: TITLE_W - 12,
          align: "left",
        });
        const rowH = Math.max(ROW_MIN_H, titleH + PAD_Y * 2);

        addPageIfNeeded(rowH);

        if (i % 2 === 1) {
          doc.save();
          doc.rect(L, y, R - L, rowH).fill(ZEBRA);
          doc.restore();
        }

        doc
          .moveTo(L + DATE_W + GAP / 2, y)
          .lineTo(L + DATE_W + GAP / 2, y + rowH)
          .strokeColor(LINE)
          .lineWidth(0.5)
          .stroke();
        doc
          .moveTo(L + DATE_W + GAP + STAT_W + GAP / 2, y)
          .lineTo(L + DATE_W + GAP + STAT_W + GAP / 2, y + rowH)
          .strokeColor(LINE)
          .lineWidth(0.5)
          .stroke();

        let x = L;
        doc.fontSize(10).fillColor(GREY).text(dateTxt, x + 6, y + PAD_Y, {
          width: DATE_W - 12,
          align: "left",
        });
        x += DATE_W + GAP;

        const isDone = stxt === "выполненные";
        doc.fontSize(10)
          .fillColor(isDone ? "#0B7A21" : "#9C0006")
          .text(stxt, x + 6, y + PAD_Y, {
            width: STAT_W - 12,
            align: "left",
          });
        x += STAT_W + GAP;

        doc.fontSize(10).fillColor("#000").text(titleTxt, x + 6, y + PAD_Y, {
          width: TITLE_W - 12,
          align: "left",
        });

        doc
          .moveTo(L, y + rowH)
          .lineTo(R, y + rowH)
          .strokeColor(LINE)
          .lineWidth(0.5)
          .stroke();

        y += rowH;
        i += 1;
      }

      y += 8;
      if (gi < assignees.length - 1) addPageIfNeeded(TH + 30);
    });

    doc.end();
  });

  return file;
}

async function doExport(ctx, period = "today", format = "xlsx") {
  if (!isAdmin(ctx.from.id))
    return ctx.reply("⛔ Только админ.", mainKeyboard(ctx));
  const { from, to } = periodToRange(period);
  const rows = await fetchRows(from, to);
  if (!rows.length)
    return ctx.reply("За выбранный период задач нет.", mainKeyboard(ctx));
  const outDir = path.join("data", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  if (format === "xlsx") {
    const file = await makeXLSX(rows, period, outDir);
    await fsPromises.access(file);
    await ctx.replyWithDocument({
      source: file,
      filename: path.basename(file),
    });
  } else if (format === "pdf") {
    const file = await makePDF(rows, period, outDir);
    await fsPromises.access(file);
    await ctx.replyWithDocument({
      source: file,
      filename: path.basename(file),
    });
  } else await ctx.reply("Формат не поддерживается. xlsx или pdf.");
}

/* ========= ЕЖЕДНЕВНЫЕ КРОНЫ ========= */
const lastNotified = { morning: new Map(), evening: new Map() };
function shouldSend(map, key, win = 60_000) {
  const now = Date.now();
  const prev = map.get(String(key)) || 0;
  if (now - prev < win) return false;
  map.set(String(key), now);
  return true;
}

// Утро: только добавляем ежедневные и шлём общий список задач на сегодня
async function runMorning() {
  const wd = jsWeekdayISO(new Date());
  try {
    for (const ex of EXECUTORS) {
      const uid = String(ex.id);
      const createdTemplates =
        (await ensureDailyTemplatesForDay(uid, wd)) || [];
      const allToday = await listTasksForAssignee(uid, todayYMD());
      if (allToday.length) {
        if (shouldSend(lastNotified.morning, uid)) {
          const parts = [];
          if (createdTemplates.length) {
            parts.push(
              "🆕 Ежедневные добавлены:\n" +
                createdTemplates.map((t) => "• " + t.title).join("\n")
            );
          }
          parts.push(`📌 Всего задач на сегодня: ${allToday.length}`);
          await bot.telegram.sendMessage(
            uid,
            "🗓 Задачи на сегодня:\n" + parts.join("\n\n"),
            taskKeyboard(allToday)
          );
        }
      }
    }
  } catch (e) {
    console.error("Morning scheduler error:", e);
  }
}
// ежедневно утром
cron.schedule(timeToCron(START_TIME, "*"), () => runMorning(), {
  timezone: TZ,
  recoverMissedExecutions: true,
});

// Вечер: переносим open-задачи «на завтра», шлём личные напоминания и сводку в общий чат
cron.schedule(
  timeToCron(END_TIME, "*"),
  async () => {
    try {
      // (1) перенос
      const fromY = todayYMD();
      const toY = tomorrowYMD();
      const rolledMap = await rollOverOpenTasks(fromY, toY);
      const movedCount = Object.values(rolledMap || {}).reduce(
        (a, arr) => a + (arr?.length || 0),
        0
      );
      console.log(`[rollover] moved ${movedCount} open tasks to ${toY}`);

      // (2) личные напоминания
      for (const ex of EXECUTORS) {
        try {
          if (shouldSend(lastNotified.evening, ex.id)) {
            await bot.telegram.sendMessage(
              String(ex.id),
              "⏰ Конец дня. Отметьте выполненные задачи и подготовьте отчёт.",
              // небольшой хак: передаём объект с from.id, чтобы mainKeyboard понял, админ это или нет
              mainKeyboard({ from: { id: ex.id } })
            );
          }
        } catch (e) {
          console.warn("Evening DM failed:", ex.id, e.message);
        }
      }

      // (3) сводка в общий чат
      if (GROUP_SUMMARY_CHAT_ID) {
        const stats = await statsForDate(fromY);
        const keys = Object.keys(stats);
        let msg = `📊 Сводка за ${fromY}:\n`;
        if (!keys.length) msg += "Сегодня задач нет.";
        else
          for (const id of keys) {
            const s = stats[id];
            msg += `• ${labelFor(id)}: выполнено ${s.done}/${s.total}\n`;
          }
        try {
          await bot.telegram.sendMessage(String(GROUP_SUMMARY_CHAT_ID), msg, {
            parse_mode: "HTML",
          });
        } catch (e) {
          console.warn("Group summary failed:", e.message);
        }
      }
    } catch (e) {
      console.error("Evening scheduler error:", e);
    }
  },
  { timezone: TZ, recoverMissedExecutions: true }
);

/* ========= START ========= */
(async () => {
  await loadAdminsFromDb();
  try {
    const me = await bot.telegram.getMe();
    console.log(`[RoleBot] @${me.username} (${me.id})`);
  } catch (e) {
    console.error("getMe failed:", e?.message || e);
  }
  await bot.launch({
    allowedUpdates: ["message", "edited_message", "callback_query"],
  });
  console.log("✅ RoleBot started");
})();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
