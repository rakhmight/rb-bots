import 'dotenv/config'
import { Telegraf, Markup, session } from 'telegraf'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'
import ExcelJS from 'exceljs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const BOT_TOKEN = process.env.BOT_TOKEN
if (!BOT_TOKEN) throw new Error('Укажите BOT_TOKEN в .env')

const ADMIN_IDS = (process.env.ADMIN_IDS || process.env.ADMIN_CHAT_ID || '')
  .split(',').map(s => s.trim()).filter(Boolean)
  .map(x => Number(x)).filter(n => !Number.isNaN(n))

// Emoji themes
const EMOJI_THEMES = [
  { start:'▶️', results:'📊', export:'📤', exportX:'📥', restart:'🔄', lang:'🌐', profile:'🧾', color:'🎨' },
  { start:'🚀', results:'📈', export:'🗂️', exportX:'📥', restart:'🔁', lang:'🌍', profile:'🧾', color:'🌈' },
  { start:'✨', results:'📘', export:'📦', exportX:'📥', restart:'♻️', lang:'🌐', profile:'🧩', color:'🎨' },
  { start:'🎯', results:'📜', export:'💾', exportX:'📥', restart:'🔂', lang:'🌐', profile:'🧾', color:'🌈' },
  { start:'🟢', results:'📊', export:'📤', exportX:'📥', restart:'🔄', lang:'🌐', profile:'🧾', color:'🎨' },
]
function pickThemeIndex(chatId) {
  const fromEnv = process.env.EMOJI_THEME
  if (fromEnv && /^\d+$/.test(fromEnv)) return Number(fromEnv) % EMOJI_THEMES.length
  const n = Math.abs(Number(BigInt.asIntN(64, BigInt(chatId || 0n))))
  return n % EMOJI_THEMES.length
}
function getEmojis(ctx) { return EMOJI_THEMES[pickThemeIndex(ctx.chat?.id || 0)] }

// i18n
const TEXTS = {
  ru: {
    app_title: 'Какого цвета ваша жизнь?',
    greet: (title) => `Привет! Это опросник *${title}*. Выберите один вариант, который ближе всего к вашим ощущениям сейчас.`,
    choose_action: 'Выберите действие:',
    buttons: {
      start_color: 'Начать опрос',
      results: 'Мои результаты',
      export: 'Экспорт JSON',
      export_xlsx: 'Экспорт Excel',
      restart: 'Начать заново',
      lang: 'Язык / Til',
      profile: 'Профиль',
    },
    profile: {
      need_first: 'Введите имя',
      need_last: 'Введите фамилию',
      need_pos: 'Введите должность (например, врач, администратор)',
      saved: 'Профиль сохранён. Можно начинать.',
      must_fill: 'Перед началом, пожалуйста, заполните профиль: имя, фамилия, должность.',
    },
    color: {
      title: 'Какого цвета ваша жизнь?',
      prompt: 'Представьте: если бы ваша жизнь имела цвет — какой вариант подходит больше всего?',
      options: [
        { key:'warm', label:'Красный / Жёлтый / Оранжевый', result: `У тебя яркая, интересная, насыщенная жизнь...` },
        { key:'green', label:'Зелёный / Коричневый', result: `Нужна стабильность и собственный ритм...` },
        { key:'cool', label:'Голубой / Фиолетовый / Розовый', result: `Идеалист, высокий креативный потенциал...` },
        { key:'bw', label:'Белый / Чёрный', result: `Период перемен. Решения принимай в стабильном состоянии.` },
        { key:'gray', label:'Серый', result: `Не хватает удовольствия и целей... Можно вернуть краски жизни.` },
      ],
      note: 'Важно: выбирайте не любимый цвет, а то, как жизнь ощущается сейчас.',
    },
    result_labels: { last_results: 'Последние результаты', none: 'Результатов не найдено.' },
    admin_only: 'Доступ запрещён: только администратор.',
    recorded: 'Записано',
    done_menu: 'Готово! Можно посмотреть результаты или пройти заново:',
    error: 'Произошла ошибка. Нажмите «Начать заново» или /start.',
    lang_prompt: 'Выберите язык / Tilni tanlang:',
    lang_set_ru: 'Язык переключён на русский.',
    lang_set_uz: 'Язык переключён на узбекский (O‘zbek).',
  },
  uz: {
    app_title: 'Hayot rangi qanaqa?',
    greet: (title) => `Salom! Bu so‘rovnoma *${title}*. Hozirgi holatingizga eng mos bitta variantni tanlang.`,
    choose_action: 'Harakatni tanlang:',
    buttons: {
      start_color: 'So‘rovnomani boshlash',
      results: 'Natijalarim',
      export: 'JSON eksport',
      export_xlsx: 'Excel eksport',
      restart: 'Qayta boshlash',
      lang: 'Til / Язык',
      profile: 'Profil',
    },
    profile: {
      need_first: 'Ismni kiriting',
      need_last: 'Familiyani kiriting',
      need_pos: "Lavozimni kiriting (masalan, shifokor, administrator)",
      saved: 'Profil saqlandi. Boshlashingiz mumkin.',
      must_fill: 'Boshlashdan oldin, iltimos, profilni to‘ldiring: ism, familiya, lavozim.',
    },
    color: {
      title: 'Hayot rangi qanaqa?',
      prompt: 'Tasavvur qiling: hayotingiz rangga ega bo‘lsa — qaysi variant mos keladi?',
      options: [
        { key:'warm', label:'Qizil / Sariq / Olovrang', result: `Yorqin va boy hayot. Energiyani aniq maqsadlarga yo‘naltiring.` },
        { key:'green', label:'Yashil / Jigarrang', result: `Barqarorlik muhim. Sokinlik va yolg‘izlikda dam oling.` },
        { key:'cool', label:'Havorang / Siyoh / Pushti', result: `Idealist va ijodkorsiz. Intuitsiyaga quloq soling.` },
        { key:'bw', label:'Oq / Qora', result: `O‘zgarishlar davri. Qarorlarni vazmin qabul qiling.` },
        { key:'gray', label:'Kulrang', result: `Qiziqish pasaygandek. Hayotni ranglarga qaytarish mumkin.` },
      ],
      note: 'Muhim: sevimli rangingizni emas, hayotingiz qanday sezilishini tanlang.',
    },
    result_labels: { last_results: 'So‘nggi natijalar', none: 'Natijalar topilmadi.' },
    admin_only: 'Kirish taqiqlangan: faqat administrator.',
    recorded: 'Qayd qilindi',
    done_menu: 'Tayyor! Natijalarni ko‘rish yoki qayta o‘tish mumkin:',
    error: 'Xatolik yuz berdi. «Qayta boshlash» yoki /start.',
    lang_prompt: 'Tilni tanlang / Выберите язык:',
    lang_set_ru: 'Til Rus tiliga o‘zgartirildi.',
    lang_set_uz: 'Til O‘zbek tiliga o‘zgartirildi.',
  }
}

// Storage
const dataDir = path.join(__dirname, '..', 'data')
const resultsFile = path.join(dataDir, 'results.json')
const usersFile = path.join(dataDir, 'users.json')
const xlsxFile = path.join(dataDir, 'results.xlsx')
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
if (!fs.existsSync(resultsFile)) fs.writeFileSync(resultsFile, '[]', 'utf8')
if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, '{}', 'utf8')

const loadResults = () => JSON.parse(fs.readFileSync(resultsFile, 'utf8'))
const saveResults = (arr) => fs.writeFileSync(resultsFile, JSON.stringify(arr, null, 2), 'utf8')
const loadUsers = () => JSON.parse(fs.readFileSync(usersFile, 'utf8'))
const saveUsers = (obj) => fs.writeFileSync(usersFile, JSON.stringify(obj, null, 2), 'utf8')

function getLang(ctx) {
  const fallback = 'ru'
  const uid = ctx.from?.id
  if (!uid) return fallback
  if (ctx.session?.lang) return ctx.session.lang
  const users = loadUsers()
  const lang = users[String(uid)]?.lang
  return (lang && TEXTS[lang]) ? lang : fallback
}
function setLang(ctx, lang) {
  if (!TEXTS[lang]) return
  const uid = ctx.from?.id
  ctx.session ??= {}
  ctx.session.lang = lang
  if (uid) {
    const users = loadUsers()
    users[String(uid)] = { ...(users[String(uid)]||{}), lang }
    saveUsers(users)
  }
}
function getProfile(ctx) {
  const uid = ctx.from?.id
  if (!uid) return null
  const users = loadUsers()
  return users[String(uid)]?.profile || null
}
function saveProfile(ctx, profile) {
  const uid = ctx.from?.id
  if (!uid) return
  const users = loadUsers()
  users[String(uid)] = { ...(users[String(uid)]||{}), profile }
  saveUsers(users)
}
function hasProfile(ctx) {
  const p = getProfile(ctx)
  return p && p.first && p.last && p.pos
}

// Bot
const bot = new Telegraf(BOT_TOKEN)
bot.use(session())

// Kb
function colorKb(ctx) {
  const lang = getLang(ctx)
  const opts = TEXTS[lang].color.options
  const rows = opts.map(o => [Markup.button.callback(o.label, `color:${o.key}`)])
  return Markup.inlineKeyboard(rows, { columns: 1 })
}
function prettyColor(ctx, key) {
  const lang = getLang(ctx)
  const T = TEXTS[lang].color
  const found = T.options.find(o => o.key === key)
  if (!found) return ''
  return `🎨 *${T.title}*\n*${found.label}*\n\n${found.result}\n\n_${T.note}_`
}

// Menu
const isAdmin = (ctx) => ADMIN_IDS.includes(ctx.from?.id)
function buildMainMenu(ctx) {
  const lang = getLang(ctx)
  const T = TEXTS[lang]
  const E = getEmojis(ctx)
  const rows = [
    [`${E.color} ${T.buttons.start_color}`],
    [`${E.results} ${T.buttons.results}`],
  ]
  if (isAdmin(ctx)) rows[1].push(`${E.export} ${T.buttons.export}`, `${E.exportX} ${T.buttons.export_xlsx}`)
  rows.push([`${E.restart} ${T.buttons.restart}`])
  rows.push([`${E.lang} ${T.buttons.lang}`, `${E.profile} ${T.buttons.profile}`])
  return Markup.keyboard(rows).resize()
}
async function showMainMenu(ctx, extraMsg) {
  const lang = getLang(ctx)
  const T = TEXTS[lang]
  const text = extraMsg || T.choose_action
  await ctx.reply(text, buildMainMenu(ctx))
}

// Profile
async function startProfileWizard(ctx) {
  const lang = getLang(ctx)
  ctx.session ??= {}
  ctx.session.profileWizard = { step: 'first', draft: {} }
  await ctx.reply(TEXTS[lang].profile.need_first)
}
async function ensureProfile(ctx, resume) {
  if (hasProfile(ctx)) return true
  ctx.session ??= {}
  ctx.session.resumeAfterProfile = resume || null
  const lang = getLang(ctx)
  await ctx.reply(TEXTS[lang].profile.must_fill)
  await startProfileWizard(ctx)
  return false
}
async function handleProfileInput(ctx) {
  if (!ctx.session?.profileWizard) return false
  const lang = getLang(ctx)
  const text = (ctx.message?.text || '').trim()
  const wiz = ctx.session.profileWizard
  if (wiz.step === 'first') {
    wiz.draft.first = text; wiz.step = 'last'
    await ctx.reply(TEXTS[lang].profile.need_last); return true
  }
  if (wiz.step === 'last') {
    wiz.draft.last = text; wiz.step = 'pos'
    await ctx.reply(TEXTS[lang].profile.need_pos); return true
  }
  if (wiz.step === 'pos') {
    wiz.draft.pos = text
    saveProfile(ctx, wiz.draft)
    delete ctx.session.profileWizard
    await ctx.reply(TEXTS[lang].profile.saved)
    const resume = ctx.session.resumeAfterProfile
    ctx.session.resumeAfterProfile = null
    if (resume === 'startCOLOR') { await ctx.reply(TEXTS[lang].color.prompt, colorKb(ctx)) }
    else { await showMainMenu(ctx) }
    return true
  }
  return false
}

// Save
function addResult(ctx, record) { const all = loadResults(); all.push(record); saveResults(all) }

// Excel export
async function exportToExcel() {
  const all = loadResults()
  const wb = new ExcelJS.Workbook()
  const sh = wb.addWorksheet('ColorLife')
  sh.columns = [
    { header:'id', key:'id', width:36 },
    { header:'user_id', key:'user_id', width:14 },
    { header:'username', key:'username', width:20 },
    { header:'tg_first', key:'tg_first', width:14 },
    { header:'tg_last', key:'tg_last', width:14 },
    { header:'profile_first', key:'p_first', width:14 },
    { header:'profile_last', key:'p_last', width:14 },
    { header:'position', key:'p_pos', width:18 },
    { header:'lang', key:'lang', width:8 },
    { header:'at', key:'at', width:22 },
    { header:'choice_key', key:'choiceKey', width:14 },
    { header:'choice_label', key:'choiceLabel', width:30 },
  ]
  function colorLabelByKey(lang, key) {
    const opts = TEXTS[lang]?.color?.options || []
    const f = opts.find(o => o.key === key)
    return f?.label || key
  }
  for (const r of all.filter(x=>x.type==='COLOR')) {
    const profile = r.user?.profile || {}
    const lang = r.user?.lang || 'ru'
    sh.addRow({
      id: r.id,
      user_id: r.user?.id,
      username: r.user?.username || '',
      tg_first: r.user?.first_name || '',
      tg_last: r.user?.last_name || '',
      p_first: profile.first || '',
      p_last: profile.last || '',
      p_pos: profile.pos || profile.position || '',
      lang,
      at: r.at || '',
      choiceKey: r.choiceKey || '',
      choiceLabel: colorLabelByKey(lang, r.choiceKey || ''),
    })
  }
  const xlsxFile = path.join(__dirname, '..', 'data', 'results.xlsx')
  await wb.xlsx.writeFile(xlsxFile)
  return xlsxFile
}

// Start
bot.start(async (ctx) => {
  const lang = getLang(ctx)
  await ctx.reply(TEXTS[lang].greet(TEXTS[lang].app_title), { parse_mode: 'Markdown' })
  if (await ensureProfile(ctx)) await showMainMenu(ctx)
})

// Hears
const reStartColor = /(Начать\s*опрос|So‘rovnomani\s*boshlash)/i
const reResults    = /(Мои\s*результаты|Natijalarim)/i
const reExport     = /(Экспорт\s*JSON|JSON\s*eksport)/i
const reExportX    = /(Экспорт\s*Excel|Excel\s*eksport)/i
const reRestart    = /(Начать\s*заново|Qayta\s*boshlash)/i
const reLang       = /(Язык|Til)/i
const reProfile    = /(Профиль|Profil)/i

bot.hears(reStartColor, async (ctx) => {
  if (!(await ensureProfile(ctx, 'startCOLOR'))) return
  const lang = getLang(ctx)
  await ctx.reply(TEXTS[lang].color.prompt, colorKb(ctx))
})
bot.hears(reResults, async (ctx) => {
  const lang = getLang(ctx)
  const all = loadResults()
  const last = [...all].reverse().find(r => r.type === 'COLOR' && r.user?.id === ctx.from?.id)
  if (!last) return ctx.reply(TEXTS[lang].result_labels.none)
  const opts = TEXTS[lang].color.options
  const label = (opts.find(o => o.key === last.choiceKey)?.label) || last.choiceKey
  await ctx.reply(`🗂 ${TEXTS[lang].result_labels.last_results}\n\n${label}`)
})
bot.hears(reExport, async (ctx) => {
  const lang = getLang(ctx)
  if (!isAdmin(ctx)) return ctx.reply(TEXTS[lang].admin_only)
  await ctx.replyWithDocument({ source: resultsFile, filename: 'results.json' })
})
bot.hears(reExportX, async (ctx) => {
  const lang = getLang(ctx)
  if (!isAdmin(ctx)) return ctx.reply(TEXTS[lang].admin_only)
  try { const f = await exportToExcel(); await ctx.replyWithDocument({ source: f, filename: 'results.xlsx' }) }
  catch (e) { console.error(e); await ctx.reply('Ошибка экспорта Excel.') }
})
bot.hears(reRestart, async (ctx) => { ctx.session ??= {}; ctx.session.flow = null; await showMainMenu(ctx) })
bot.hears(reLang, async (ctx) => {
  const lang = getLang(ctx)
  const ikb = Markup.inlineKeyboard([[
    Markup.button.callback('Русский', 'lang:ru'),
    Markup.button.callback('O‘zbek', 'lang:uz')
  ]])
  await ctx.reply(TEXTS[lang].lang_prompt, ikb)
})
bot.action(/^lang:(ru|uz)$/i, async (ctx) => {
  const choice = ctx.match[1].toLowerCase()
  setLang(ctx, choice)
  const msg = choice === 'ru' ? TEXTS.ru.lang_set_ru : TEXTS.uz.lang_set_uz
  await ctx.answerCbQuery(msg, { show_alert: true })
  await showMainMenu(ctx)
})
bot.hears(reProfile, async (ctx) => { await startProfileWizard(ctx) })

// Actions
bot.action(/^color:(\w+)$/, async (ctx) => {
  const lang = getLang(ctx)
  const key = ctx.match[1]
  const opts = TEXTS[lang].color.options
  const found = opts.find(o => o.key === key)
  if (!found) return ctx.answerCbQuery('⚠️', { show_alert: false })
  const record = {
    id: uuidv4(),
    type: 'COLOR',
    user: { id: ctx.from?.id, username: ctx.from?.username, first_name: ctx.from?.first_name, last_name: ctx.from?.last_name, lang, profile: getProfile(ctx) },
    at: new Date().toISOString(),
    choiceKey: key,
  }
  const all = loadResults(); all.push(record); saveResults(all)
  await ctx.editMessageReplyMarkup()
  const pretty = `🎨 *${TEXTS[lang].color.title}*\n*${found.label}*\n\n${found.result}\n\n_${TEXTS[lang].color.note}_`
  await ctx.reply(pretty, { parse_mode: 'Markdown' })
  ctx.session ??= {}; ctx.session.flow = null
  await showMainMenu(ctx, TEXTS[lang].done_menu)
})

// Text interceptors
bot.on('text', async (ctx, next) => {
  const handled = await handleProfileInput(ctx)
  if (!handled) return next()
})
bot.on('message', async (ctx) => {
  if (ctx.session?.flow) return
  await showMainMenu(ctx)
})

bot.catch((err, ctx) => {
  const lang = getLang(ctx)
  console.error('Bot error:', err)
  ctx.reply(TEXTS[lang]?.error || 'Error')
})

bot.launch().then(() => { console.log('ColorLife Bot started…') })
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
