import "dotenv/config";
import { Telegraf, Markup } from "telegraf";
import fs from "node:fs/promises";

import { initDb } from "./db.js";
import { t } from "./i18n.js";
import {
  parseAdminIds,
  isValidName,
  parseAge,
  normalizePhone,
  cleanText,
  fmtLeadCard,
} from "./utils.js";
import { buildLeadsXlsx } from "./export.js";

const BOT_TOKEN = (process.env.BOT_TOKEN || "").trim();
if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN пустой. Заполни .env");
  process.exit(1);
}

const ADMIN_IDS = parseAdminIds(process.env.ADMIN_IDS);
const DB_PATH = process.env.DB_PATH || "./data/kelajack.db";
const BRAND = process.env.BRAND || "Kelajack";

const {
  getDraft,
  upsertDraft,
  deleteDraft,
  createLead,
  setLeadStatus,
  getStats,
  listLeadsAll,
} = initDb(DB_PATH);

const bot = new Telegraf(BOT_TOKEN);

/* ===== helpers ===== */
function isAdmin(ctx) {
  const id = ctx.from?.id;
  return Boolean(id && ADMIN_IDS.includes(id));
}

function langKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🇷🇺 " + t("ru", "ru"), "lang:ru")],
    [Markup.button.callback("🇺🇿 " + t("ru", "uz"), "lang:uz")],
    [Markup.button.callback("🇬🇧 " + t("ru", "en"), "lang:en")],
  ]);
}

function districtKeyboard() {
  // Пример для Ташкента — поменяй на свои районы при необходимости
  const items = [
    ["Чиланзар", "Юнусабад"],
    ["Мирабад", "Яккасарай"],
    ["Сергелий", "Алмазар"],
    ["Шайхантахур", "Учтепа"],
  ];

  const rows = items.map(([a, b]) => [
    Markup.button.callback(a, "district:" + a),
    Markup.button.callback(b, "district:" + b),
  ]);

  rows.push([Markup.button.callback("Другое ✍️", "district:other")]);
  return Markup.inlineKeyboard(rows);
}

async function askStep(ctx, draft) {
  const lang = draft.lang || "ru";
  const step = draft.step;

  if (step === "lang") {
    await ctx.reply(t(lang, "choose_lang"), langKeyboard());
    return;
  }
  if (step === "child_name") {
    await ctx.reply(t(lang, "ask_child_name"));
    return;
  }
  if (step === "age") {
    await ctx.reply(t(lang, "ask_age"));
    return;
  }
  if (step === "district") {
    await ctx.reply(t(lang, "ask_district"), districtKeyboard());
    return;
  }
  if (step === "phone") {
    await ctx.reply(t(lang, "consent"));
    await ctx.reply(
      t(lang, "ask_phone"),
      Markup.keyboard([
        Markup.button.contactRequest(
          lang === "ru"
            ? "📲 Отправить мой номер"
            : lang === "uz"
              ? "📲 Raqamni yuborish"
              : "📲 Send my number"
        ),
        lang === "ru"
          ? "↩️ Начать заново"
          : lang === "uz"
            ? "↩️ Qayta boshlash"
            : "↩️ Restart",
      ])
        .resize()
        .oneTime()
    );
    return;
  }
}

/* ===== start ===== */
bot.start(async (ctx) => {
  const tg_user_id = ctx.from.id;
  deleteDraft(tg_user_id);
  upsertDraft({ tg_user_id, step: "lang", lang: "ru", payload: {} });
  await askStep(ctx, { tg_user_id, step: "lang", lang: "ru", payload: {} });
});

bot.command("myid", async (ctx) => {
  await ctx.reply(t("ru", "myid", ctx.from.id));
});

/* ===== admin ===== */
bot.command("admin", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("⛔ Доступ запрещён.");
  await ctx.reply(
    t("ru", "admin_menu"),
    Markup.inlineKeyboard([
      [Markup.button.callback(t("ru", "admin_stats"), "admin:stats")],
      [Markup.button.callback(t("ru", "admin_export"), "admin:export")],
    ])
  );
});

bot.action("admin:stats", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("Нет доступа");
  const s = getStats();
  const byStatus = s.byStatus.map((x) => `${x.status}: ${x.c}`).join("\n");
  const byLang = s.byLang.map((x) => `${x.lang}: ${x.c}`).join("\n");
  const topDistricts = s.topDistricts.map((x) => `${x.district}: ${x.c}`).join("\n");

  await ctx.answerCbQuery();
  await ctx.reply(
    `📊 Статистика\n\nВсего: ${s.total}\n\nПо статусам:\n${byStatus || "-"}` +
      `\n\nПо языкам:\n${byLang || "-"}` +
      `\n\nТОП районы:\n${topDistricts || "-"}`
  );
});

bot.action("admin:export", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("Нет доступа");
  await ctx.answerCbQuery("Готовлю файл…");
  const leads = listLeadsAll();
  const filePath = await buildLeadsXlsx(leads, "./data");
  await ctx.replyWithDocument({ source: filePath, filename: "kelajack_leads.xlsx" });
  try {
    await fs.unlink(filePath);
  } catch {}
});

bot.action(/lead:done:(\d+)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("Нет доступа");
  const id = Number(ctx.match[1]);
  const lead = setLeadStatus(id, "Принято");
  await ctx.answerCbQuery(t("ru", "admin_marked"));
  await ctx.editMessageText(fmtLeadCard(lead) + "\n\n✅ Обработано");
});

/* ===== language select ===== */
bot.action(/lang:(ru|uz|en)/, async (ctx) => {
  const tg_user_id = ctx.from.id;
  const lang = ctx.match[1];

  const draft = getDraft(tg_user_id) || { tg_user_id, step: "lang", payload: {}, lang };
  upsertDraft({ tg_user_id, step: "child_name", lang, payload: draft.payload || {} });

  await ctx.answerCbQuery();
  await ctx.reply(t(lang, "ask_child_name"));
});

/* ===== district select (buttons) ===== */
bot.action(/district:(.+)/, async (ctx) => {
  const tg_user_id = ctx.from.id;
  const draft = getDraft(tg_user_id);
  if (!draft || draft.step !== "district") {
    await ctx.answerCbQuery();
    return;
  }

  const lang = draft.lang || "ru";
  const val = ctx.match[1];

  if (val === "other") {
    await ctx.answerCbQuery();
    return ctx.reply(
      lang === "ru"
        ? "Напишите район текстом:"
        : lang === "uz"
          ? "Tumanni matn bilan yozing:"
          : "Type your district:"
    );
  }

  draft.payload.district = val;
  upsertDraft({ tg_user_id, step: "phone", lang, payload: draft.payload });

  await ctx.answerCbQuery();
  await askStep(ctx, { ...draft, step: "phone" });
});

/* ===== text & contacts ===== */
bot.on("message", async (ctx) => {
  const tg_user_id = ctx.from?.id;
  if (!tg_user_id) return;

  const text = ctx.message?.text ? cleanText(ctx.message.text) : null;
  if (text && ["↩️ Начать заново", "↩️ Qayta boshlash", "↩️ Restart", "/start"].includes(text)) {
    deleteDraft(tg_user_id);
    upsertDraft({ tg_user_id, step: "lang", lang: "ru", payload: {} });
    return askStep(ctx, { tg_user_id, step: "lang", lang: "ru", payload: {} });
  }

  const draft = getDraft(tg_user_id);
  if (!draft) return;

  const lang = draft.lang || "ru";

  if (draft.step === "child_name") {
    if (!text || !isValidName(text)) return ctx.reply(t(lang, "invalid_name"));
    draft.payload.child_name = text;
    upsertDraft({ tg_user_id, step: "age", lang, payload: draft.payload });
    return ctx.reply(t(lang, "ask_age"));
  }

  if (draft.step === "age") {
    const age = parseAge(text);
    if (!age) return ctx.reply(t(lang, "invalid_age"));
    draft.payload.age = age;
    upsertDraft({ tg_user_id, step: "district", lang, payload: draft.payload });
    return askStep(ctx, { ...draft, step: "district" });
  }

  if (draft.step === "district") {
    if (!text || text.length < 2) {
      return ctx.reply(lang === "ru" ? "Введите район текстом." : lang === "uz" ? "Tumanni kiriting." : "Type district.");
    }
    draft.payload.district = text;
    upsertDraft({ tg_user_id, step: "phone", lang, payload: draft.payload });
    return askStep(ctx, { ...draft, step: "phone" });
  }

  if (draft.step === "phone") {
    let phone = null;

    if (ctx.message?.contact?.phone_number) {
      phone = normalizePhone(ctx.message.contact.phone_number);
    } else if (text) {
      phone = normalizePhone(text);
    }

    if (!phone) return ctx.reply(t(lang, "invalid_phone"));

    const lead = createLead({
      tg_user_id,
      tg_username: ctx.from.username || null,
      lang,
      child_name: draft.payload.child_name,
      age: draft.payload.age,
      district: draft.payload.district,
      phone,
    });

    deleteDraft(tg_user_id);

    await ctx.reply(t(lang, "done_user", BRAND, lead.id), Markup.removeKeyboard());

    const adminText = `${t("ru", "admin_new", BRAND)}\n\n${fmtLeadCard(lead)}`;
    const kb = Markup.inlineKeyboard([
      [Markup.button.callback("✅ Обработано", `lead:done:${lead.id}`)],
    ]);

    for (const adminId of ADMIN_IDS) {
      try {
        await ctx.telegram.sendMessage(adminId, adminText, kb);
      } catch {
        // Админ мог не запускать бота — Telegram тогда не даст написать первым
      }
    }
    return;
  }
});

/* ===== launch ===== */
bot.launch().then(() => console.log("✅ Kelajack bot started"));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
