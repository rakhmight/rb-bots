import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  throw new Error('Укажи BOT_TOKEN в .env');
}

const bot = new Telegraf(BOT_TOKEN);

function mainKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.url(
        '💻 Офисная техника (IT)',
        'https://t.me/IT_Akfamedlinebot?start=from_hub_it'
      ),
    ],
    [
      Markup.button.url(
        '📊 Программа ACCURACYMed',
        'https://t.me/AccuracyTeam_bot?start=from_hub_accuracy'
      ),
    ],
    [
      Markup.button.url(
        '🏥 Здание / медоборудование / JCI / ISO 9001',
        'https://t.me/AkfaMedlineHelp_bot?start=from_hub_facility'
      ),
    ],
    [
      Markup.button.url(
        '😶‍🌫️ Анонимные жалобы и предложения',
        'https://t.me/AkfamedlineTG_bot?start=from_hub_anon'
      ),
    ],
  ]);
}

const GREETING =
  '👋 Добро пожаловать в единый бот техподдержки Akfa Medline.\n\n' +
  'Выберите направление, по которому у вас есть вопрос:\n\n' +
  '1️⃣ Офисная техника (компьютеры, телефоны, принтеры и др.)\n' +
  '2️⃣ Программа ACCURACY Med\n' +
  '3️⃣ Проблемы в здании / медоборудовании / вопросы по JCI и ISO 9001\n' +
  '4️⃣ Анонимные жалобы, предложения и идеи по рабочему процессу';

bot.start((ctx) => {
  return ctx.reply(GREETING, mainKeyboard());
});

bot.command('menu', (ctx) =>
  ctx.reply('Выберите нужное направление обращения 👇', mainKeyboard())
);

bot.hears(
  ['меню', 'Меню', 'главное меню', 'Главное меню', 'start', 'Старт'],
  (ctx) => ctx.reply('Выберите нужное направление обращения 👇', mainKeyboard())
);

bot.command('help', (ctx) =>
  ctx.reply(
    'Это единый бот техподдержки.\n' +
      'Нажмите на нужный раздел — откроется профильный бот, где можно оставить обращение.',
    mainKeyboard()
  )
);

bot.on('message', (ctx) =>
  ctx.reply(
    'Чтобы обратиться в поддержку, выберите нужное направление по кнопке ниже 👇',
    mainKeyboard()
  )
);

bot
  .launch()
  .then(() => console.log('Support Hub bot started'))
  .catch((err) => console.error('Bot launch error:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
