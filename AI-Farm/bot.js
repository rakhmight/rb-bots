const express = require('express');
const { Telegraf, session, Markup } = require('telegraf');
const dotenv = require('dotenv');
const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const path = require('path');
const OpenAI = require('openai');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const fetch = require('node-fetch');

dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

i18next.use(Backend).init({
  fallbackLng: 'ru',
  backend: { loadPath: './locales/{{lng}}.json' }
});

bot.use(session());
bot.use(async (ctx, next) => {
  if (!ctx.session) ctx.session = {};
  const lang = ctx.session.lang || 'ru';
  ctx.i18n = i18next.getFixedT(lang);
  await next();
});

bot.start(async (ctx) => {
  const greeting = ctx.i18n('greeting_message');
  await ctx.reply(greeting, Markup.keyboard([
    ['🇷🇺 Русский', '🇺🇿 Ўзбекча', '🇬🇧 English']
  ]).resize());
});

bot.hears(['🚀 Старт', '🔄 Рестарт'], async (ctx) => {
  ctx.session = {};
  await ctx.reply(ctx.i18n('greeting_message'), Markup.keyboard([
    ['🇷🇺 Русский', '🇺🇿 Ўзбекча', '🇬🇧 English']
  ]).resize());
});

bot.hears(['🇷🇺 Русский', '🇺🇿 Ўзбекча', '🇬🇧 English'], async (ctx) => {
  const langMap = {
    '🇷🇺 Русский': 'ru',
    '🇺🇿 Ўзбекча': 'uz',
    '🇬🇧 English': 'en'
  };
  const langCode = langMap[ctx.message.text];
  ctx.session.lang = langCode;
  ctx.i18n = i18next.getFixedT(langCode);
  await ctx.replyWithChatAction('typing');
  await ctx.reply(ctx.i18n('main_menu_title'), Markup.keyboard([
    [ctx.i18n('menu.effects')],
    [ctx.i18n('menu.analysis')],
    [ctx.i18n('menu.dose')],
    [ctx.i18n('menu.search')],
    [ctx.i18n('start'), ctx.i18n('restart')]
  ]).resize());
});

bot.hears(/^📋/, async (ctx) => {
  ctx.session.mode = 'effects';
  await ctx.replyWithChatAction('typing');
  await ctx.reply(ctx.i18n('input_drugs'));
});

bot.hears(/^🧪/, async (ctx) => {
  ctx.session.mode = 'analysis_menu';
  await ctx.reply(ctx.i18n('select_analysis_type'), Markup.keyboard([
    ['🔬 Лабораторные', '🧲 Инструментальные'],
    ['📄 Загрузить PDF']
  ]).resize());
});

bot.hears(/^💊/, async (ctx) => {
  ctx.session.mode = 'dose';
  await ctx.replyWithChatAction('typing');
  await ctx.reply(ctx.i18n('input_dose_data'));
});

bot.hears('🔬 Лабораторные', async (ctx) => {
  ctx.session.mode = 'lab';
  await ctx.replyWithChatAction('typing');
  await ctx.reply(ctx.i18n('input_lab_data'));
});

bot.hears('🧲 Инструментальные', async (ctx) => {
  ctx.session.mode = 'inst';
  await ctx.replyWithChatAction('typing');
  await ctx.reply(ctx.i18n('input_inst_data'));
});

bot.hears('🔍 Поиск лекарства', async (ctx) => {
  ctx.session.mode = 'search_meds';
  await ctx.replyWithChatAction('typing');
  await ctx.reply(ctx.i18n('input_search_query'));
});

bot.on('document', async (ctx) => {
  if (ctx.message.document?.mime_type === 'application/pdf') {
    const fileLink = await ctx.telegram.getFileLink(ctx.message.document.file_id);
    const response = await fetch(fileLink.href);
    const buffer = Buffer.from(await response.arrayBuffer());
    const data = await pdfParse(buffer);
    let text = data.text;

    text = text
      .replace(/[А-ЯЁ][а-яё]+ [А-ЯЁ][а-яё]+(?: [А-ЯЁ][а-яё]+)?/g, '[ФИО]')
      .replace(/\d{2}\.\d{2}\.\d{4}/g, '[дата]')
      .replace(/\d{4}-\d{2}-\d{2}/g, '[дата]')
      .replace(/\d{10,12}/g, '[номер]')
      .replace(/\+7\s?\(?\d{3}\)?[\s-]?\d{3}-?\d{2}-?\d{2}/g, '[телефон]')
      .replace(/паспорт\s?\d{4}\s?\d{6}/gi, '[паспорт]')
      .replace(/ИНН\s?\d{10}/gi, '[ИНН]')
      .replace(/СНИЛС\s?\d{3}-\d{3}-\d{3}\s?\d{2}/gi, '[СНИЛС]')
      .replace(/[А-Яа-я]+\sд[.]\s?\d+,\s?[кв|оф][.]\s?\d+/gi, '[адрес]');

    const gptPrompt = `${ctx.i18n('prompt.pdf')}\n\n${text}`;
    await ctx.replyWithChatAction('typing');
    await ctx.reply('⏳ Ожидайте ответа...');
    const gptResp = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: gptPrompt }],
      max_tokens: 800,
      temperature: 0.5
    });

    const replyText = (gptResp.choices[0].message?.content || '⚠️ Ошибка при анализе PDF.')
      .replace(/Важно/gi, '❗ Важно')
      .replace(/Опасно/gi, '☠️ Опасно')
      .replace(/Рекомендац(ия|ии)/gi, '💡 Рекомендация')
      .replace(/Внимание/gi, '⚠️ Внимание');

    await ctx.reply(replyText);
  } else {
    await ctx.reply('📄 Пожалуйста, отправьте PDF-файл.');
  }
});

bot.on('text', async (ctx) => {
  const mode = ctx.session.mode;
  const text = ctx.message.text;

  if (mode === 'search_meds') {
    try {
      const db = JSON.parse(fs.readFileSync('./meds_db.json', 'utf8'));
      const query = text.toLowerCase().trim();
      const results = db[query];

      if (results && results.length > 0) {
        const reply = results.map((item, i) =>
          `🔹 *Вариант ${i + 1}:*\n` +
          `• МНН: ${item['МНН'] || '—'}\n` +
          `• Дженерики: ${item['Дженерики'] || '—'}\n` +
          `• Форма: ${item['Лек. форма'] || '—'}\n` +
          `• Выпуск: ${item['Выпуск'] || '—'}\n` +
          `• Ед. изм.: ${item['Ед. изм.'] || '—'}`
        ).join('\n\n');
        return await ctx.replyWithMarkdown(reply);
      } else {
        return await ctx.reply('❌ Ничего не найдено. Проверьте правильность ввода МНН.');
      }
    } catch (err) {
      console.error(err);
      return await ctx.reply('⚠️ Ошибка при поиске в базе лекарств.');
    }
  }

  let gptPrompt = '';
  if (mode === 'effects') {
    gptPrompt = `${ctx.i18n('prompt.effects')} ${text}`;
  } else if (mode === 'lab') {
    gptPrompt = `${ctx.i18n('prompt.lab')} ${text}`;
  } else if (mode === 'inst') {
    gptPrompt = `${ctx.i18n('prompt.inst')} ${text}`;
  } else if (mode === 'dose') {
    gptPrompt = `${ctx.i18n('prompt.dose')} ${text}`;
  } else return;

  await ctx.replyWithChatAction('typing');
  await ctx.reply('⏳ Ожидайте ответа...');

  const gptResp = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: gptPrompt }],
    max_tokens: 800,
    temperature: 0.5
  });

  const replyText = (gptResp.choices[0].message?.content || '⚠️ GPT не дал ответ.')
    .replace(/Важно/gi, '❗ Важно')
    .replace(/Опасно/gi, '☠️ Опасно')
    .replace(/Рекомендац(ия|ии)/gi, '💡 Рекомендация')
    .replace(/Внимание/gi, '⚠️ Внимание');

  await ctx.reply(replyText);
});

bot.launch().then(() => console.log('🤖 Бот запущен в режиме polling'));
