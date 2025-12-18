// src/index.js
import "dotenv/config";
import { Telegraf, Markup } from "telegraf";
import cron from "node-cron";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  generateAnswer,
  generateAnswerWithImage,
  transcribeFromUrl
} from "./llm.js";
import { extractZone, enforceSafety } from "./validators.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOT_TOKEN = process.env.TG_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("TG_BOT_TOKEN is missing in .env");
  process.exit(1);
}

const TZ = process.env.TZ || "Asia/Tashkent";
const ADMIN_IDS = (process.env.ADMIN_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const bot = new Telegraf(BOT_TOKEN);

// ----------------------
// Локализация/детект языка
function detectLocale(textOrLangCode) {
  const text = String(textOrLangCode || "");
  const hasUzLatin = /[oqgʻʼ’`‘]|\b(ha|yoʻq|bola|shifokor)\b/i.test(text);
  const hasCyr = /[А-Яа-яЁёҚқҒғҲҳЎў]/.test(text);
  if (hasUzLatin && !hasCyr) return "uz";
  if (hasCyr) return "ru";
  return "ru";
}

// ----------------------
// Приветствия и меню с эмодзи
const WELCOME = {
  ru:
    "👋 Привет! Я 🍼 MamaCare — спокойный помощник для родителей.\n" +
    "Сделаем быстрый триаж **RED/AMBER/GREEN**:\n" +
    "• ✅ что сделать сейчас\n" +
    "• 👀 на что смотреть\n" +
    "• 🏥 когда обращаться к врачу\n" +
    "Отправляйте текст, фото или голос — и я подскажу по формату. Я не врач и не даю дозировок.",
  uz:
    "👋 Salom! Men 🍼 MamaCare — ota-onalarga sokin yordamchi.\n" +
    "**RED/AMBER/GREEN** triagi:\n" +
    "• ✅ hozir nima qilish\n" +
    "• 👀 nimalarni kuzatish\n" +
    "• 🏥 qachon shifokorga murojaat qilish\n" +
    "Matn, rasm yoki ovoz yuboring — men format bo‘yicha yo‘naltiraman. Men shifokor emasman, doza bermayman."
};

function mainKeyboard(locale) {
  if (locale === "uz") {
    return Markup.keyboard(
      [
        ["🍼 Savol berish", "📚 FAQ"],
        ["🚨 Zudlik bilan (RED)", "🌐 Til: RU/UZ"]
      ],
      { columns: 2 }
    ).resize();
  }
  return Markup.keyboard(
    [
      ["🍼 Задать вопрос", "📚 FAQ"],
      ["🚨 RED признаки", "🌐 Язык: RU/UZ"]
    ],
    { columns: 2 }
  ).resize();
}

function howToAsk(locale) {
  if (locale === "uz") {
    return (
      "🧭 Savolni shunday yozing:\n" +
      "• Yosh / taxminiy vazn\n" +
      "• Harorat (qachon/qanday o‘lchandi)\n" +
      "• Belgilar qancha vaqt davom etmoqda\n" +
      "• Ichishi/siyishi, faolligi, uyqusi\n" +
      "• Qo‘shimcha belgilar (toshma, qayt qilish, diareya, og‘riq)\n" +
      "• Dori berganmisiz (nima va qachondan)?\n" +
      "Shuningdek, rasm yoki ovoz yuborishingiz mumkin."
    );
  }
  return (
    "🧭 Пожалуйста, укажите:\n" +
    "• Возраст / примерный вес\n" +
    "• Температура (когда и как мерили)\n" +
    "• Сколько длятся симптомы\n" +
    "• Питьё/мочеиспускание, активность, сон\n" +
    "• Доп. признаки (сыпь, рвота, понос, боль)\n" +
    "• Давали ли лекарства (что и когда)?\n" +
    "Можно прислать фото или голосовое — я пойму."
  );
}

const RED_LIST = {
  ru:
    "🚨 Когда срочно:\n" +
    "• Тяжёлое дыхание/свист/втяжения\n" +
    "• Вялость, судороги, посинение губ\n" +
    "• Признаки обезвоживания (редкая моча, сухость, плач без слёз)\n" +
    "• Сильная травма/кровотечение/ожоги\n" +
    "• Проглочены батарейки/химикаты\n" +
    "• Грудничок до 3 мес с T ≥ 38.0°C\n" +
    "• Сыпь с петехиями",
  uz:
    "🚨 Zudlik bilan murojaat qiling:\n" +
    "• Qiyin nafas olish / hushtak ovozi / ko‘krak tortilishi\n" +
    "• Loqaydlik, tutqanoq, lablarning ko‘karishi\n" +
    "• Suvsizlanish (kam siydik, quruq og‘iz, ko‘z yoshi chiqmasligi)\n" +
    "• Og‘ir shikast / qon ketish / kuyish\n" +
    "• Batareya/kimyo yutilgan\n" +
    "• 3 oygacha go‘dakda T ≥ 38.0°C\n" +
    "• Petechial toshma"
};

// ----------------------
// Метрики
function logMetric(obj) {
  const line = JSON.stringify(obj) + "\n";
  fs.mkdirSync(path.join(__dirname, "..", "data"), { recursive: true });
  fs.appendFileSync(path.join(__dirname, "..", "data", "metrics.ndjson"), line, "utf-8");
}

// ----------------------
// Команды
bot.start(async (ctx) => {
  const locale = detectLocale(ctx.from?.language_code || "ru");
  await ctx.reply(WELCOME[locale], mainKeyboard(locale));
});

bot.command("help", async (ctx) => {
  const locale = detectLocale(ctx.message.text);
  await ctx.reply(howToAsk(locale));
});

bot.command("faq", async (ctx) => {
  const locale = detectLocale(ctx.message.text);
  await ctx.reply(
    locale === "uz"
      ? "📚 FAQ (tayyorlanmoqda):\n• Harorat\n• Yo‘tal\n• Toshma\n• Qayt qilish/diareya\n• Bosh jarohati"
      : "📚 FAQ (в разработке):\n• Температура\n• Кашель\n• Сыпь\n• Рвота/диарея\n• Травма головы"
  );
});

bot.command("red", async (ctx) => {
  const locale = detectLocale(ctx.message.text);
  await ctx.reply(RED_LIST[locale]);
});

bot.command("lang", async (ctx) => {
  await ctx.reply("🌐 Язык определяется автоматически по сообщению. Напишите на нужном языке (RU/UZ).");
});

// ----------------------
// Кнопки
bot.hears(/^🍼/i, async (ctx) => {
  const locale = detectLocale(ctx.message.text);
  await ctx.reply(howToAsk(locale));
});
bot.hears(/^(📚|FAQ)/i, async (ctx) => {
  const locale = detectLocale(ctx.message.text);
  await ctx.reply(
    locale === "uz"
      ? "📚 FAQ (tayyorlanmoqda):\n• Harorat\n• Yo‘tal\n• Toshma\n• Qayt qilish/diareya\n• Bosh jarohati"
      : "📚 FAQ (в разработке):\n• Температура\n• Кашель\n• Сыпь\n• Рвота/диарея\n• Травма головы"
  );
});
bot.hears(/^(🚨|RED)/i, async (ctx) => {
  const locale = detectLocale(ctx.message.text);
  await ctx.reply(RED_LIST[locale]);
});
bot.hears(/^🌐/i, async (ctx) => {
  await ctx.reply("🌐 Язык определяется автоматически. Напишите на нужном языке (RU/UZ).");
});

// ----------------------
// ТЕКСТ → LLM
bot.on("text", async (ctx) => {
  const userText = ctx.message.text.trim();

  // если это команды/кнопки — не уходим в LLM
  if (
    /^\/(start|help|faq|red|lang)\b/i.test(userText) ||
    /^[🍼📚🚨🌐]/.test(userText)
  ) return;

  const locale = detectLocale(userText);
  try {
    const { answer, usage, latencyMs } = await generateAnswer(userText);
    const safe = enforceSafety(answer);
    await ctx.reply(safe, { disable_web_page_preview: true });

    const zone = extractZone(safe);
    logMetric({
      ts: new Date().toISOString(),
      user_id_hash: String(ctx.from.id),
      zone,
      latency_ms: latencyMs,
      prompt_tokens: usage?.prompt_tokens ?? null,
      completion_tokens: usage?.completion_tokens ?? null,
      locale_guess: locale,
      kind: "text"
    });
  } catch (err) {
    console.error("LLM error:", err);
    await ctx.reply("Не удалось сформировать ответ. Попробуйте ещё раз позже.");
  }
});

// ----------------------
// ФОТО/КАРТИНКИ → VISION
bot.on("photo", async (ctx) => {
  try {
    const sizes = ctx.message.photo || [];
    const best = sizes[sizes.length - 1]; // самая большая
    const fileLink = await ctx.telegram.getFileLink(best.file_id);
    const url = fileLink?.href || String(fileLink);
    const caption = (ctx.message.caption || "").trim();

    await ctx.reply("🔎 Секунду, посмотрю изображение…");
    const { answer, usage, latencyMs } = await generateAnswerWithImage(
      caption || "Посмотри изображение и объясни по формату RED/AMBER/GREEN. Помни ограничения (без дозировок).",
      url
    );
    const safe = enforceSafety(answer);
    await ctx.reply(safe, { disable_web_page_preview: true });

    const zone = extractZone(safe);
    logMetric({
      ts: new Date().toISOString(),
      user_id_hash: String(ctx.from.id),
      zone,
      latency_ms: latencyMs,
      prompt_tokens: usage?.prompt_tokens ?? null,
      completion_tokens: usage?.completion_tokens ?? null,
      kind: "image"
    });
  } catch (e) {
    console.error("photo error:", e);
    await ctx.reply("Не удалось обработать изображение. Пришлите, пожалуйста, ещё раз или добавьте короткое описание.");
  }
});

// (опционально) Изображения как документы
bot.on("document", async (ctx) => {
  const doc = ctx.message.document;
  if (!doc?.mime_type?.startsWith("image/")) return; // пропускаем не-картинки
  try {
    const fileLink = await ctx.telegram.getFileLink(doc.file_id);
    const url = fileLink?.href || String(fileLink);
    const caption = (ctx.message.caption || "").trim();

    await ctx.reply("🔎 Обрабатываю изображение…");
    const { answer } = await generateAnswerWithImage(
      caption || "Посмотри изображение и объясни по формату RED/AMBER/GREEN.",
      url
    );
    await ctx.reply(enforceSafety(answer), { disable_web_page_preview: true });
  } catch (e) {
    console.error("document image error:", e);
    await ctx.reply("Не удалось обработать файл-изображение.");
  }
});

// ----------------------
// ГОЛОС/АУДИО → ASR → LLM
bot.on("voice", async (ctx) => {
  try {
    const fileLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
    const url = fileLink?.href || String(fileLink);
    await ctx.reply("🎙️ Секунду, распознаю голос…");
    const text = await transcribeFromUrl(url);
    if (!text) return await ctx.reply("Не получилось распознать голос. Повторите, пожалуйста.");

    const { answer, usage, latencyMs } = await generateAnswer(text);
    await ctx.reply(enforceSafety(answer), { disable_web_page_preview: true });

    const zone = extractZone(answer);
    logMetric({
      ts: new Date().toISOString(),
      user_id_hash: String(ctx.from.id),
      zone,
      latency_ms: latencyMs,
      prompt_tokens: usage?.prompt_tokens ?? null,
      completion_tokens: usage?.completion_tokens ?? null,
      kind: "voice"
    });
  } catch (e) {
    console.error("voice error:", e);
    await ctx.reply("Не удалось обработать голосовое. Попробуйте ещё раз.");
  }
});

bot.on("audio", async (ctx) => {
  try {
    const fileLink = await ctx.telegram.getFileLink(ctx.message.audio.file_id);
    const url = fileLink?.href || String(fileLink);
    await ctx.reply("🎧 Обрабатываю аудио…");
    const text = await transcribeFromUrl(url);
    if (!text) return await ctx.reply("Не получилось распознать аудио. Пришлите ещё раз.");

    const { answer, usage, latencyMs } = await generateAnswer(text);
    await ctx.reply(enforceSafety(answer), { disable_web_page_preview: true });

    const zone = extractZone(answer);
    logMetric({
      ts: new Date().toISOString(),
      user_id_hash: String(ctx.from.id),
      zone,
      latency_ms: latencyMs,
      prompt_tokens: usage?.prompt_tokens ?? null,
      completion_tokens: usage?.completion_tokens ?? null,
      kind: "audio"
    });
  } catch (e) {
    console.error("audio error:", e);
    await ctx.reply("Не удалось обработать аудио. Попробуйте в другом формате (например, MP3/OGG).");
  }
});

// ----------------------
// Дайджест 19:00 Asia/Tashkent
cron.schedule(
  "0 19 * * *",
  async () => {
    try {
      const file = path.join(__dirname, "..", "data", "metrics.ndjson");
      if (!fs.existsSync(file)) return;
      const today = new Date().toISOString().slice(0, 10);
      const lines = fs.readFileSync(file, "utf-8").trim().split("\n").filter(Boolean);
      const todayRows = lines.map((l) => JSON.parse(l)).filter((r) => (r.ts || "").startsWith(today));
      const total = todayRows.length;
      const count = (z) => todayRows.filter((r) => r.zone === z).length;
      const red = count("RED"), amber = count("AMBER"), green = count("GREEN");
      const avgLatency = total ? Math.round(todayRows.reduce((s, r) => s + (r.latency_ms || 0), 0) / total) : 0;

      const msg = [
        "📊 MamaCare — сводка за день",
        `Дата: ${today}`,
        `Всего диалогов: ${total}`,
        `RED/AMBER/GREEN: ${red} / ${amber} / ${green}`,
        `Сред. время ответа: ${avgLatency} мс`
      ].join("\n");

      for (const id of ADMIN_IDS) {
        try { await bot.telegram.sendMessage(id, msg); } catch (e) { console.error("send digest", e.message); }
      }
    } catch (e) {
      console.error("digest error:", e);
    }
  },
  { timezone: TZ }
);

// ----------------------
console.log(`[MamaCare] Bot starting at ${new Date().toISOString()} TZ=${TZ}`);
bot.launch().then(() => console.log("MamaCare bot launched."));
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
