import 'dotenv/config';
import { Telegraf, Markup, session } from 'telegraf';
import http from 'http';

/* ========= SINGLE INSTANCE LOCK (можно переопределить через .env LOCK_PORT) ========= */
const LOCK_PORT = process.env.LOCK_PORT || 39469;
http.createServer(() => {}).listen(LOCK_PORT, '127.0.0.1', () => {
  console.log(`Single-instance lock on :${LOCK_PORT}, PID ${process.pid}`);
}).on('error', () => {
  console.error(`❌ Another instance is already running (port ${LOCK_PORT}).`);
  process.exit(1);
});

/* ========= BOOT ========= */
const BUILD = 'buttons-only-ru-2-no-anon-no-publish';
if (!process.env.BOT_TOKEN) throw new Error('BOT_TOKEN is required');

const bot = new Telegraf(process.env.BOT_TOKEN);
let OWNER_GROUP_ID_RAW = (process.env.OWNER_GROUP_ID || '').trim(); // @username или -100...
let RESOLVED_CHAT_ID = null;

/* ========= LOGS ========= */
bot.use((ctx, next) => {
  const t = ctx.updateType;
  const chat = ctx.chat ? `${ctx.chat.type}:${ctx.chat.id}` : '-';
  const text = ctx.message?.text || ctx.channelPost?.text || ctx.callbackQuery?.data || '';
  console.log(`update=${t} chat=${chat} text="${text}"`);
  return next();
});
process.on('unhandledRejection', e => console.error('unhandledRejection:', e));
process.on('uncaughtException',  e => console.error('uncaughtException:',  e));
bot.catch(err => console.error('❗ Unhandled bot error:', err));

/* ========= SESSION ========= */
bot.use(session({
  defaultSession: () => ({
    stage: 'media',          // 'media' -> 'qa'
    step: 0,
    answers: { liked: [], _tgFullName: '' },
    media: [],               // [{type:'photo'|'video', id}]
    waitingText: false,
    _needQualityNote: false,
    _expectingQualityNote: false,
  })
}));

/* ========= SPRAVOCHNIK ========= */
const MAP = {
  impressions: { great: 'Отличные', good: 'Хорошие', ok: 'Нормальные', bad: 'Нужно улучшить (укажу в комментарии)' },
  liked: {
    quality: 'Качество', timing: 'Сроки', comms: 'Коммуникация',
    tidy: 'Аккуратность', price: 'Цена', other: 'Другое (укажу в комментарии)'
  },
  pain: { no: 'Нет', yes_comment: 'Да (укажу в комментарии)' },
  match: { full: 'Полностью соответствует', mostly: 'В целом нормально, есть нюансы', not: 'Не совсем соответствует' },
  pro: { great: 'Отлично', good: 'Хорошо', meh: 'Можно лучше (укажу в комментарии)' },
  wish: { ok: 'Все устроило', ideas: 'Есть идеи (укажу в комментарии)' },
  reco: { def_yes: 'Да, безусловно', yes: 'Скорее да', unsure: 'Не уверен(а)', no: 'Скорее нет' }
};

/* ========= QUESTIONS (без имени и без публикации) ========= */
/*
Порядок:
  1) impressions (rating5)
  2) liked (multi)
  3) pain (single)
  4) quality (rating10) → если <=8, спросим quality_note (text)
  5) match (single)
  6) pro (single)
  7) wish (single)
  8) reco (single)
  9) free (text) + кнопка “Отправить отзыв”
*/
const QUESTIONS = [
  { key: 'impressions', type: 'rating5', required: true, text: '1) Общие впечатления о сотрудничестве:', options: [
      ['🌟 Отличные','great'], ['👍 Хорошие','good'], ['🙂 Нормальные','ok'], ['🛠️ Нужно улучшить (укажу в комментарии)','bad']
  ]},
  { key: 'liked', type: 'multi', required: false, text: '2) Что особенно понравилось? (можно несколько):', options: [
      ['Качество','quality'], ['Сроки','timing'], ['Коммуникация','comms'], ['Аккуратность','tidy'], ['Цена','price'], ['Другое (укажу в комментарии)','other']
  ]},
  { key: 'pain', type: 'single', required: true, text: '3) Были ли неудобства?', options: [
      ['❌ Нет','no'], ['⚠️ Да (укажу в комментарии)','yes_comment']
  ]},
  { key: 'quality', type: 'rating10', required: true, text: '4) Оцените качество мебели (1–10):' },
  { key: 'match', type: 'single', required: true, text: '5) Соответствие ожиданиям:', options: [
      ['✅ Полностью','full'], ['🙂 В целом нормально, есть нюансы','mostly'], ['⚠️ Не совсем','not']
  ]},
  { key: 'pro', type: 'single', required: true, text: '6) Общение и профессионализм мастера:', options: [
      ['⭐️ Отлично','great'], ['👍 Хорошо','good'], ['🛠️ Можно лучше (укажу в комментарии)','meh']
  ]},
  { key: 'wish', type: 'single', required: true, text: '7) Что изменить в будущем?', options: [
      ['✅ Все устроило','ok'], ['📝 Есть идеи (в комментарии)','ideas']
  ]},
  { key: 'reco', type: 'single', required: true, text: '8) Порекомендуете нас знакомым?', options: [
      ['💯 Да, безусловно','def_yes'], ['👍 Скорее да','yes'], ['🤔 Не уверен(а)','unsure'], ['👎 Скорее нет','no']
  ]},
  { key: 'free', type: 'text', required: false, text: '9) Комментарий в свободной форме:' }
];


const BTN_SEND = Markup.inlineKeyboard([[Markup.button.callback('➡️ Отправить отзыв', 'submit')]]);

/* ========= KEYBOARDS ========= */
function rating10Keyboard() {
  const labels = [['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣'], ['6️⃣','7️⃣','8️⃣','9️⃣','🔟']];
  const values = [['1','2','3','4','5'], ['6','7','8','9','10']];
  const rows = labels.map((row, r) => row.map((label, c) => Markup.button.callback(label, 'rate10:' + values[r][c])));
  return Markup.inlineKeyboard(rows);
}
const rating5Keyboard = () => (opts) => Markup.inlineKeyboard(opts.map(([l,v]) => [Markup.button.callback(l,'single:'+v)]));
const singleKeyboard  = (opts) => Markup.inlineKeyboard(opts.map(([l,v]) => [Markup.button.callback(l,'single:'+v)]));
function multiKeyboard(all, picked) {
  const rows = all.map(([l,v]) => [Markup.button.callback((picked.includes(v)?'✅ ':'☐ ')+l, 'multi:'+v)]);
  rows.push([Markup.button.callback('➡️ Далее', 'multi_done')]);
  return Markup.inlineKeyboard(rows);
}

/* ========= UTILS ========= */
const esc = (s) => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const friendly = (k,v) => (k==='quality' ? (v?`${v}/10`: '') : (MAP[k] ? (MAP[k][v]||'') : (v||'')));

function answersToHtml(a) {
  const displayName = a._tgFullName || 'Клиент';
  const likedHuman = Array.isArray(a.liked) ? a.liked.map(x=>MAP.liked[x]).filter(Boolean).join(', ') : '';
  const rows = [];
  rows.push(['Имя', displayName]);
  rows.push(['1. Впечатления', friendly('impressions', a.impressions) || '—']);
  if (likedHuman) rows.push(['2. Понравилось', likedHuman]);
  rows.push(['3. Неудобства', friendly('pain', a.pain) || '—']);
  rows.push(['4. Качество', a.quality ? `${a.quality}/10` : '—']);
  if (a.quality_note?.trim()) rows.push(['4.1 Пояснение к качеству', a.quality_note.trim()]);
  rows.push(['5. Соответствие', friendly('match', a.match) || '—']);
  rows.push(['6. Профессионализм', friendly('pro', a.pro) || '—']);
  rows.push(['7. Пожелания', friendly('wish', a.wish) || '—']);
  rows.push(['8. Рекомендации', friendly('reco', a.reco) || '—']);
  if (a.free?.trim()) rows.push(['9. Комментарий', a.free.trim()]);
  return rows.map(([k,v]) => `<b>${esc(k)}:</b> ${esc(v)}`).join('\n');
}

/* ========= TARGET RESOLVER ========= */
function normalizeRawTarget(str) {
  if (!str) return '';
  let s = str.trim();
  const m = s.match(/t\.me\/([A-Za-z0-9_]+)/i);
  if (m) s = '@' + m[1];
  return s;
}
async function resolveTargetChatId() {
  if (RESOLVED_CHAT_ID) return RESOLVED_CHAT_ID;
  OWNER_GROUP_ID_RAW = normalizeRawTarget(OWNER_GROUP_ID_RAW);
  if (!OWNER_GROUP_ID_RAW) throw new Error('OWNER_GROUP_ID пуст. Используйте /forcebind @username или -100…');

  if (/^-100\d{5,}$/.test(OWNER_GROUP_ID_RAW)) {
    RESOLVED_CHAT_ID = OWNER_GROUP_ID_RAW;
    return RESOLVED_CHAT_ID;
  }
  if (/^@[A-Za-z0-9_]{5,}$/.test(OWNER_GROUP_ID_RAW)) {
    const chat = await bot.telegram.getChat(OWNER_GROUP_ID_RAW);
    if (chat?.type !== 'channel') throw new Error('OWNER_GROUP_ID указывает не на канал (тип: '+chat?.type+').');
    RESOLVED_CHAT_ID = String(chat.id);
    return RESOLVED_CHAT_ID;
  }
  throw new Error('Неверный формат OWNER_GROUP_ID.');
}

/* ========= COMMANDS ========= */
bot.command('here', (ctx) => ctx.reply(`chat.id = ${ctx.chat.id}\nТип: ${ctx.chat.type}`));
bot.command('bindgroup', (ctx) => {
  if (!['group','supergroup','channel'].includes(ctx.chat.type)) return ctx.reply('Выполните /bindgroup в нужной группе/КАНАЛЕ.');
  OWNER_GROUP_ID_RAW = String(ctx.chat.id);
  RESOLVED_CHAT_ID = null;
  ctx.reply(`ОК, теперь публикации будут идти сюда: ${OWNER_GROUP_ID_RAW}`);
});
bot.command('forcebind', async (ctx) => {
  const arg = (ctx.message.text || '').split(' ').slice(1).join(' ').trim();
  if (!arg) return ctx.reply('Использование: /forcebind -100... | @username | https://t.me/username');
  OWNER_GROUP_ID_RAW = arg; RESOLVED_CHAT_ID = null;
  await ctx.reply('OWNER_GROUP_ID_RAW = ' + OWNER_GROUP_ID_RAW + '\nПолезно: /checkgroup');
});
bot.command('checkgroup', async (ctx) => {
  try {
    const id = await resolveTargetChatId();
    const me = await bot.telegram.getMe();
    const chat = await bot.telegram.getChat(id);
    const member = await bot.telegram.getChatMember(id, me.id);
    await ctx.reply(
      `Target type: ${chat.type}\n` +
      `Title/username: ${chat.title || chat.username || '-'}\n` +
      `Resolved ID: ${id}\n` +
      `My status: ${member.status}`
    );
  } catch (e) {
    await ctx.reply('checkgroup error: ' + (e?.message || e));
  }
});

/* ========= START ========= */
bot.start(async (ctx) => {
  const full = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ')
              || ctx.from?.first_name || 'Клиент';
  ctx.session = { stage: 'media', step: 0, answers: { liked: [], _tgFullName: full }, media: [], waitingText: false };

  await ctx.reply(
    'Здравствуйте! Прежде всего, прикрепите 1–5 фото/видео вашей мебели, ' +
    'либо нажмите «➡️ Продолжить без медиа».',
    Markup.inlineKeyboard([[Markup.button.callback('➡️ Продолжить без медиа', 'media_next')]])
  );
});

/* ========= MEDIA STAGE ========= */
bot.action('media_next', async (ctx) => {
  if (ctx.session.stage !== 'media') return ctx.answerCbQuery();
  ctx.session.stage = 'qa';
  await ctx.answerCbQuery('Продолжаем к вопросам');
  await askQuestion(ctx);
});

bot.on('photo', async (ctx) => {
  if (ctx.session.stage !== 'media') return;
  if (ctx.session.media.length >= 5) return ctx.reply('Можно добавить не более 5 файлов.');
  const file = ctx.message.photo.at(-1);
  ctx.session.media.push({ type: 'photo', id: file.file_id });
  ctx.reply(`✅ Файл принят (${ctx.session.media.length}/5). Можно добавить ещё или нажмите «➡️ Продолжить без медиа».`);
});

bot.on('video', async (ctx) => {
  if (ctx.session.stage !== 'media') return;
  if (ctx.session.media.length >= 5) return ctx.reply('Можно добавить не более 5 файлов.');
  ctx.session.media.push({ type: 'video', id: ctx.message.video.file_id });
  ctx.reply(`✅ Видео принято (${ctx.session.media.length}/5). Можно добавить ещё или нажмите «➡️ Продолжить без медиа».`);
});

/* ========= QA STAGE ========= */
bot.on('callback_query', async (ctx) => {
  const s = ctx.session;
  const data = ctx.callbackQuery.data;

  if (s.stage === 'media') {
    return ctx.answerCbQuery('Прикрепите медиа или нажмите «Продолжить без медиа».');
  }

  if (data === 'submit') return handleSubmit(ctx);

  const q = QUESTIONS[s.step];
  if (!q) return ctx.answerCbQuery();

  if (q.type === 'multi') {
    if (data === 'multi_done') { s.step++; return askQuestion(ctx); }
    if (data.startsWith('multi:')) {
      const val = data.split(':')[1];
      const arr = s.answers.liked || [];
      const i = arr.indexOf(val); if (i>=0) arr.splice(i,1); else arr.push(val);
      s.answers.liked = arr;
      await ctx.editMessageReplyMarkup(multiKeyboard(q.options, arr).reply_markup).catch(()=>{});
      return ctx.answerCbQuery('Обновлено');
    }
  }

  if (q.type === 'rating10' && data.startsWith('rate10:')) {
    const val = data.split(':')[1];
    s.answers[q.key] = val;
    s._needQualityNote = Number(val) <= 8;
    s.step++; await ctx.answerCbQuery('Выбрано'); return askQuestion(ctx);
  }

  if (q.type === 'rating5' && data.startsWith('single:')) {
    s.answers[q.key] = data.split(':')[1];
    s.step++; await ctx.answerCbQuery('Выбрано'); return askQuestion(ctx);
  }

  if (q.type === 'single' && data.startsWith('single:')) {
    s.answers[q.key] = data.split(':')[1];
    s.step++; await ctx.answerCbQuery('Выбрано'); return askQuestion(ctx);
  }

  await ctx.answerCbQuery();
});

bot.on('text', async (ctx) => {
  const s = ctx.session;
  if (s.stage !== 'qa') return;

  // промежуточный текст для quality_note
  if (s._expectingQualityNote) {
    s.answers.quality_note = (ctx.message.text || '').trim();
    s._expectingQualityNote = false;
    s.step++; return askQuestion(ctx);
  }

  const q = QUESTIONS[s.step];
  if (!q || q.type !== 'text') return;
  s.answers[q.key] = (ctx.message.text || '').trim();
  s.step++;
  await askQuestion(ctx);
});

/* ========= ASK ========= */
async function askQuestion(ctx) {
  const s = ctx.session;

  // динамический подпункт 4.1 (после quality, перед match)
  if (s._needQualityNote && QUESTIONS[s.step]?.key === 'match') {
    s._needQualityNote = false;
    s._expectingQualityNote = true;
    await ctx.reply('4.1) Кратко: что можно улучшить?', BTN_SEND);
    return;
  }

  if (s.step >= QUESTIONS.length) {
    await ctx.reply('Готово. Нажмите «Отправить отзыв».', BTN_SEND);
    return;
  }

  const q = QUESTIONS[s.step];
  if (q.type === 'text')  return ctx.reply(q.text, BTN_SEND);
  if (q.type === 'rating10') return ctx.reply(q.text, rating10Keyboard());
  if (q.type === 'rating5')  return ctx.reply(q.text, rating5Keyboard()(q.options));
  if (q.type === 'single')   return ctx.reply(q.text, singleKeyboard(q.options));
  if (q.type === 'multi') {
    const picked = s.answers.liked || [];
    return ctx.reply(q.text, multiKeyboard(q.options, picked));
  }
}

/* ========= SUBMIT / PUBLISH ========= */
async function handleSubmit(ctx) {
  const s = ctx.session;
  if (s.stage !== 'qa') return ctx.answerCbQuery('Сначала ответьте на вопросы');

  const a = s.answers;
  const displayName = a._tgFullName || 'Клиент';
  const html = `\n<b>Отзыв от клиента:</b>\n${answersToHtml(a, displayName)}\n`;

  try {
    const chatId = await resolveTargetChatId();
    await bot.telegram.sendMessage(chatId, html, { parse_mode: 'HTML' });

    if (s.media.length > 0) {
      const media = s.media.map(m => ({ type: m.type, media: m.id }));
      try { await bot.telegram.sendMediaGroup(chatId, media); }
      catch (e) {
        console.error('sendMediaGroup error:', e?.response?.description || e);
        await bot.telegram.sendMessage(chatId, '⚠️ Не удалось отправить альбом медиа.');
      }
    }

    await ctx.reply('Спасибо! Ваш отзыв отправлен 🙏✨');
  } catch (e) {
    console.error('Ошибка отправки:', e?.response || e);
    await ctx.reply('❌ Не удалось отправить отзыв в канал. Проверьте права и ID канала.');
    await ctx.reply(html, { parse_mode: 'HTML' });
  }

  // reset
  ctx.session = { stage: 'media', step: 0, answers: { liked: [], _tgFullName: displayName }, media: [], waitingText: false, _needQualityNote: false, _expectingQualityNote: false };
}
bot.action('submit', (ctx) => handleSubmit(ctx));

/* ========= STARTUP (webhook cleanup + online ping) ========= */
(async () => {
  try {
    const info = await bot.telegram.getWebhookInfo();
    if (info.url) {
      console.log('Webhook detected:', info.url, '→ deleting…');
      await bot.telegram.deleteWebhook({ drop_pending_updates: false });
    }
    const me = await bot.telegram.getMe();
    console.log('Bot username:', '@' + me.username);

    if (OWNER_GROUP_ID_RAW) {
      try {
        const id = await resolveTargetChatId();
        RESOLVED_CHAT_ID = id;
        const chat = await bot.telegram.getChat(id);
        console.log('Target chat:', { type: chat.type, title: chat.title || chat.username, id });
        try {
          await bot.telegram.sendMessage(id, `🤖 Bot online (${BUILD})`);
          console.log('online message sent to target');
        } catch (e) {
          console.error('send-online error:', e?.response?.description || e);
        }
      } catch (e) {
        console.warn('⚠️ Проверка цели:', e?.message || e);
      }
    }

    await bot.launch();
    console.log('✅ Feedback bot запущен и слушает обновления.');
  } catch (e) {
    console.error('Launch error:', e);
    process.exit(1);
  }
})();

process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
