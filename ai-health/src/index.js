import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Blob } from 'node:buffer';
import { Telegraf, Markup } from 'telegraf';
import { createI18n } from '../shared/utils/i18n.js';
import { splitMessage } from '../shared/utils/splitMessage.js';
import { log, error } from '../shared/utils/logger.js';
import { generateAI, summarizeMemory } from '../shared/ai/engine.js';
import * as mem from '../shared/memory/store.js';

// ===== media: ffmpeg-static (без системного ffmpeg)
import ffmpegPath from 'ffmpeg-static';
import { execFile as _execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFile = promisify(_execFile);

// ===== PDF text extraction (pdfjs-dist, LEGACY для Node; без workerSrc)
let pdfjsLib;
try {
  const mod = await import('pdfjs-dist/legacy/build/pdf.mjs'); // ESM legacy
  pdfjsLib = mod?.default?.getDocument ? mod.default : mod;
} catch (_) {
  const { createRequire } = await import('node:module');       // CJS fallback
  const require = createRequire(import.meta.url);
  const mod = require('pdfjs-dist/legacy/build/pdf.js');
  pdfjsLib = mod?.default?.getDocument ? mod.default : mod;
}
async function extractPdfText(buffer) {
  // pdfjs требует Uint8Array, а не Buffer
  const uint8 = buffer instanceof Uint8Array
    ? buffer
    : new Uint8Array(buffer.buffer, buffer.byteOffset || 0, buffer.byteLength);

  const loadingTask = pdfjsLib.getDocument({
    data: uint8,
    disableWorker: true,
    isEvalSupported: false,
    verbosity: 0
  });
  const pdf = await loadingTask.promise;
  let text = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const strings = content.items.map(it => it.str).filter(Boolean);
    text += `\n\n[Страница ${p} из ${pdf.numPages}]\n` + strings.join(' ');
  }
  return text.trim();
}

// ===== tmp dir
const TMP_DIR = process.env.TMP_DIR || os.tmpdir();

// ===== stickers (опционально)
let ST = {};
try { ST = JSON.parse(fs.readFileSync(path.resolve('./src/stickers.json'), 'utf8')); } catch { ST = {}; }

// ===== bot & i18n
const bot = new Telegraf(process.env.BOT_TOKEN);
const DEFAULT_LANG = process.env.DEFAULT_LANG || 'ru';
const localesDir = path.resolve('./src/locale');
const i18n = createI18n({ localesDir, defaultLang: DEFAULT_LANG });

const userLang = new Map();
const userProfile = new Map(); // 'general' | 'pregnancy' | 'mencare' | 'mamacare'

// ===== Telegram SAFE helpers (не падаем на 403)
function isBlockedErr(e) {
  const code = e?.response?.error_code;
  const desc = (e?.response?.description || e?.description || '').toLowerCase();
  return code === 403 && (desc.includes('blocked') || desc.includes('chat not found') || desc.includes('deactivated'));
}
async function replySafe(ctx, text, opts) {
  try { return await ctx.reply(text, opts); }
  catch (e) { if (isBlockedErr(e)) { log(`⚠️ blocked chat ${ctx.chat?.id}`); return null; } throw e; }
}
async function editMsgTextSafe(ctx, text, opts) {
  try { return await ctx.editMessageText(text, opts); }
  catch (e) { if (isBlockedErr(e)) { log(`⚠️ blocked (edit) ${ctx.chat?.id}`); return null; } throw e; }
}
async function answerCbSafe(ctx, text = '', opts) {
  try { return await ctx.answerCbQuery(text, opts); }
  catch (e) { if (isBlockedErr(e)) return null; throw e; }
}
async function sendStickerSafe(ctx, id) {
  if (typeof id !== 'string' || !id) return;
  try { await ctx.replyWithSticker(id); } catch (e) { if (!isBlockedErr(e)) error(e); }
}
bot.catch((err, ctx) => { if (isBlockedErr(err)) log(`⚠️ blocked ${ctx?.chat?.id}`); else error(err); });

// ===== локализация и UI
function t(ctx, key, vars) {
  const lang = userLang.get(ctx.from?.id) || DEFAULT_LANG;
  return i18n.t(lang, key, vars);
}
const L = (key) => [i18n.t('ru', key), i18n.t('uz', key)];

const PROFILE_LABELS = {
  general: '🧠 Общий',
  pregnancy: '🤰 Беременность',
  mencare: '👨 Мужчины',
  mamacare: '👩‍🍼 Мамы и дети'
};
function profilesKeyboard(ctx) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(ctx, 'btn_profile_general'), 'set:general')],
    [Markup.button.callback(t(ctx, 'btn_profile_pregnancy'), 'set:pregnancy')],
    [Markup.button.callback(t(ctx, 'btn_profile_mencare'), 'set:mencare')],
    [Markup.button.callback(t(ctx, 'btn_profile_mamacare'), 'set:mamacare')]
  ]);
}
function replyKeyboard(ctx) {
  return Markup.keyboard([
    [t(ctx, 'btn_symptoms')],
    [t(ctx, 'btn_upload')],
    [t(ctx, 'btn_voice')],
    [t(ctx, 'btn_lang')],
    [t(ctx, 'btn_switch_profile'), t(ctx, 'btn_restart')]
  ]).resize();
}

// ===== профиль и промты
function ensureProfile(id) { if (!userProfile.get(id)) userProfile.set(id, 'general'); }
function profilePromptKey(profile) {
  switch (profile) {
    case 'pregnancy': return 'pregnancy.system.txt';
    case 'mencare':   return 'mencare.system.txt';
    case 'mamacare':  return 'mamacare.system.txt';
    default:          return 'general.system.txt';
  }
}
function readSystem(profile) {
  const file = profilePromptKey(profile);
  return fs.readFileSync(path.resolve(`./shared/ai/prompts/${file}`), 'utf8');
}

// ===== память: встройка в системку + автосжатие
function buildSystemWithMemory(profile, session) {
  const base = readSystem(profile);
  const memory = (session?.summary || '').trim();
  const memBlock = memory ? `\n\n[ПАМЯТЬ ПОЛЬЗОВАТЕЛЯ]\n${memory}\n` : '\n';
  return base + memBlock;
}
async function maybeSummarizeAndSave(userId, profile) {
  if (!mem.shouldSummarize(userId, profile)) return;
  const session = mem.getSession(userId, profile);
  const newSummary = await summarizeMemory({
    summary: session.summary,
    newMessages: session.messages,
    profile
  });
  mem.setSummary(userId, profile, newSummary);
  // подрезаем хвост, чтобы не раздувать историю
  const trimmed = mem.getSession(userId, profile);
  trimmed.messages = trimmed.messages.slice(-6);
  mem.saveSession(userId, profile, trimmed);
}

// ===== decor & risk (стикеры)
const hasSticker = (id) => typeof id === 'string' && id.length > 0;
function inferRiskLevel(answer) {
  const tag = answer.match(/RISK_LEVEL\s*:\s*(HIGH|MEDIUM|LOW)/i)?.[1]?.toLowerCase();
  if (tag) return tag;
  const highRe = /(немедленн|экстренн|скорая|угрож|кровотеч|потер[яя] сознани|сильн(ая|ые) боль в груди|инсульт|нарастающ(ая|ие) боль|выраженн(ая|ые) одышк)/i;
  const medRe  = /(обратит[еья]сь к врачу|в ближайш(ее|ие)\s*(время|24|48|72)|нужно очно|планов(ый|ое) визит)/i;
  if (highRe.test(answer)) return 'high';
  if (medRe.test(answer))  return 'medium';
  return 'low';
}
function stripRiskTag(answer) { return answer.replace(/^.*RISK_LEVEL\s*:\s*(HIGH|MEDIUM|LOW)\s*$/mi, '').trim(); }
async function sendRiskSticker(ctx, level) {
  const map = { high: ST.high, medium: ST.medium, low: ST.low };
  await sendStickerSafe(ctx, map[level] || ST.info);
}
async function maybeSendAlertSticker(ctx, answer) {
  if (/красн(ые|ых)\s+флаг(и|ов)/i.test(answer)) await sendStickerSafe(ctx, ST.alert);
}
async function replyWithDecor(ctx, answer, opts = {}) {
  const level = inferRiskLevel(answer);
  const clean = stripRiskTag(answer);
  await sendRiskSticker(ctx, level);
  await maybeSendAlertSticker(ctx, clean);
  for (const chunk of splitMessage(clean)) {
    await replySafe(ctx, chunk, { disable_web_page_preview: true, ...opts });
  }
}

// ===== старт и команды
bot.start(async (ctx) => {
  const payload = ctx.startPayload || '';
  const pid = ctx.from?.id;
  if (payload.includes('profile=')) {
    const p = (payload.match(/profile=([a-z]+)/)?.[1]) || 'general';
    userProfile.set(pid, p);
  }
  if (payload.includes('lang=uz')) userLang.set(pid, 'uz');
  ensureProfile(pid);
  await replySafe(ctx, t(ctx, 'start'), profilesKeyboard(ctx));
});

bot.command('profile', (ctx) => replySafe(ctx, t(ctx, 'menu_profiles'), profilesKeyboard(ctx)));
bot.command('menu',    (ctx) => replySafe(ctx, t(ctx, 'menu_actions'), replyKeyboard(ctx)));

bot.command(['restart','reset'], async (ctx) => {
  userProfile.delete(ctx.from.id);
  userLang.delete(ctx.from.id);
  mem.resetAllProfiles(ctx.from.id);           // очистили память всех профилей
  await replySafe(ctx, t(ctx, 'restarted'), replyKeyboard(ctx));
  return replySafe(ctx, t(ctx, 'menu_profiles'), profilesKeyboard(ctx));
});

// ===== inline
bot.action(/set:(.+)/, async (ctx) => {
  const p = ctx.match[1];
  userProfile.set(ctx.from.id, p);
  await answerCbSafe(ctx, '');
  await editMsgTextSafe(ctx, t(ctx, 'profile_set', { p: PROFILE_LABELS[p] || p }));
  return replySafe(ctx, t(ctx, 'menu_actions'), replyKeyboard(ctx));
});

// ===== панель
bot.hears(L('btn_symptoms'), (ctx) => replySafe(ctx, t(ctx, 'ask_symptom')));
bot.hears(L('btn_upload'),   (ctx) => replySafe(ctx, t(ctx, 'upload_prompt')));
bot.hears(L('btn_voice'),    (ctx) => replySafe(ctx, t(ctx, 'voice_prompt')));
bot.hears(L('btn_lang'), async (ctx) => {
  const current = userLang.get(ctx.from.id) || DEFAULT_LANG;
  const next = current === 'ru' ? 'uz' : 'ru';
  userLang.set(ctx.from.id, next);
  await replySafe(ctx, i18n.t(next, 'lang_switched', { lang: next.toUpperCase() }), replyKeyboard(ctx));
});
bot.hears(L('btn_switch_profile'), (ctx) => replySafe(ctx, t(ctx, 'menu_profiles'), profilesKeyboard(ctx)));
bot.hears(L('btn_restart'), async (ctx) => {
  userProfile.delete(ctx.from.id);
  userLang.delete(ctx.from.id);
  mem.resetAllProfiles(ctx.from.id);           // очистили память
  await replySafe(ctx, t(ctx, 'restarted'), replyKeyboard(ctx));
  return replySafe(ctx, t(ctx, 'menu_profiles'), profilesKeyboard(ctx));
});

// ===== helpers: IO
async function downloadFile(url, destPath) {
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(destPath, buf);
  return destPath;
}
async function convertToMp3(inputPath, outputPath) {
  if (!ffmpegPath) throw new Error('ffmpeg-static not found');
  await execFile(ffmpegPath, ['-y', '-i', inputPath, '-ar', '16000', '-ac', '1', outputPath], { windowsHide: true });
  return outputPath;
}
async function transcribeWhisper(filePath) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY missing for transcription');
  const bytes = await fs.promises.readFile(filePath);
  const blob = new Blob([bytes], { type: 'audio/mpeg' });
  const form = new FormData();
  form.append('file', blob, 'audio.mp3');
  form.append('model', 'whisper-1');
  form.append('temperature', '0');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: form
  });
  if (!res.ok) throw new Error(`Whisper error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.text?.trim() || '';
}

// ===== Text → AI (с памятью)
bot.on('text', async (ctx) => {
  const text = ctx.message.text?.trim();
  if (!text) return;
  try {
    ensureProfile(ctx.from.id);
    const profile = userProfile.get(ctx.from.id);

    await replySafe(ctx, t(ctx, 'wait_ai'));

    const session = mem.getSession(ctx.from.id, profile);
    const system = buildSystemWithMemory(profile, session);
    const history = session.messages.slice(-12);

    const answer = await generateAI({ system, history, user: text, images: [] });
    await replyWithDecor(ctx, answer);

    mem.append(ctx.from.id, profile, 'user', text);
    mem.append(ctx.from.id, profile, 'assistant', answer);
    await maybeSummarizeAndSave(ctx.from.id, profile);
  } catch (e) { error(e); await replySafe(ctx, t(ctx, 'error')); }
});

// ===== Photo/Document → AI (vision + PDF via pdfjs-dist) + память
bot.on(['photo', 'document'], async (ctx) => {
  try {
    ensureProfile(ctx.from.id);
    const profile = userProfile.get(ctx.from.id);

    await replySafe(ctx, t(ctx, 'wait_ai'));

    const session = mem.getSession(ctx.from.id, profile);
    const system = buildSystemWithMemory(profile, session);
    const history = session.messages.slice(-12);

    const caption = ctx.message.caption || '';
    let images = [];
    let userText = '';
    let metaNote = '';

    if (ctx.message.photo?.length) {
      const ph = ctx.message.photo.slice(-1)[0];
      const link = await ctx.telegram.getFileLink(ph.file_id);
      const href = link?.href ? link.href : String(link);
      images = [href];
      metaNote = `(получено фото, file_id: ${ph.file_id})`;
      userText = `${caption || 'Без подписи.'}\n\nПроанализируй приложенное изображение (анализ/снимок/УЗИ/выписка). Оцени риски и предложи безопасные шаги. ${metaNote}`;
    } else if (ctx.message.document) {
      const doc = ctx.message.document;
      const link = await ctx.telegram.getFileLink(doc.file_id);
      const href = link?.href ? link.href : String(link);

      if ((doc.mime_type || '').startsWith('image/')) {
        images = [href];
        metaNote = `(документ-изображение: ${doc.file_name || ''}, ${doc.mime_type})`;
        userText = `${caption || 'Без подписи.'}\n\nПроанализируй приложенное изображение. Оцени риски и предложи шаги. ${metaNote}`;
      } else if ((doc.mime_type || '').includes('pdf') || (doc.file_name || '').toLowerCase().endsWith('.pdf')) {
        const tmpBase = path.join(TMP_DIR, 'ai-healthbot');
        await fs.promises.mkdir(tmpBase, { recursive: true });
        const pdfPath = path.join(tmpBase, `doc_${ctx.from.id}_${Date.now()}.pdf`);
        await downloadFile(href, pdfPath);

        const buf = await fs.promises.readFile(pdfPath);
        const textRaw = await extractPdfText(buf);
        const textTrim = (textRaw || '').replace(/\u0000/g, '').trim().slice(0, 15000);
        metaNote = `(PDF: ${doc.file_name || ''}, ${doc.mime_type}; длина текста: ${textTrim.length})`;

        userText =
          `${caption || 'Без подписи.'}\n\n` +
          `Ниже извлечённый текст из PDF (фрагменты, до 15k символов). Проанализируй результаты, выдели важные показатели/референсы, ` +
          `оцени риски и предложи безопасные следующие шаги. Если чего-то не хватает, напиши, что уточнить.\n\n` +
          `---[Начало текста из PDF]---\n${textTrim}\n---[Конец текста из PDF]---\n\n${metaNote}`;
      } else {
        metaNote = `(документ: ${doc.file_name || ''}, ${doc.mime_type || 'unknown'}; ссылка: ${href})`;
        userText =
          `${caption || 'Без подписи.'}\n\n` +
          `Это не изображение и не PDF. Вот ссылка на файл: ${href}\n` +
          `Дай общие рекомендации по безопасной интерпретации и когда обращаться к врачу. ${metaNote}`;
      }
    }

    const answer = await generateAI({ system, history, user: userText, images });
    await replyWithDecor(ctx, answer, { disable_web_page_preview: true });

    mem.append(ctx.from.id, profile, 'user', userText);
    mem.append(ctx.from.id, profile, 'assistant', answer);
    await maybeSummarizeAndSave(ctx.from.id, profile);
  } catch (e) { error(e); await replySafe(ctx, t(ctx, 'error')); }
});

// ===== Voice (Whisper) + память
bot.on('voice', async (ctx) => {
  try {
    ensureProfile(ctx.from.id);
    const profile = userProfile.get(ctx.from.id);

    await replySafe(ctx, t(ctx, 'wait_ai'));

    let fileUrl;
    try {
      const link = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
      fileUrl = link?.href ? link.href : String(link);
    } catch {
      const file = await ctx.telegram.getFile(ctx.message.voice.file_id);
      fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
    }

    const tmpBase = path.join(TMP_DIR, 'ai-healthbot');
    await fs.promises.mkdir(tmpBase, { recursive: true });
    const stamp = `${ctx.from.id}_${Date.now()}`;
    const inp = path.join(tmpBase, `voice_${stamp}.ogg`);
    const out = path.join(tmpBase, `voice_${stamp}.mp3`);

    await downloadFile(fileUrl, inp);
    await convertToMp3(inp, out);

    const text = await transcribeWhisper(out);

    const session = mem.getSession(ctx.from.id, profile);
    const system = buildSystemWithMemory(profile, session);
    const history = session.messages.slice(-12);

    const prompt = `Голосовое сообщение (распознано): "${text}"\n\nДай краткую оценку риска и следующие шаги с учётом профиля и предыдущей памяти.`;
    const answer = await generateAI({ system, history, user: prompt });
    await replyWithDecor(ctx, answer);

    mem.append(ctx.from.id, profile, 'user', prompt);
    mem.append(ctx.from.id, profile, 'assistant', answer);
    await maybeSummarizeAndSave(ctx.from.id, profile);
  } catch (e) { error(e); await replySafe(ctx, t(ctx, 'error')); }
});

// ===== launch
bot.launch().then(() => log('AI-HealthBot started')).catch(error);
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
