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

let BOT_USERNAME = ''

/* =============== EMOJI THEMES =============== */
const EMOJI_THEMES = [
  { start:'▶️', results:'📊', export:'📤', exportX:'📥', restart:'🔄', lang:'🌐', profile:'🧾', mbi:'🧪' },
  { start:'🚀', results:'📈', export:'🗂️', exportX:'📥', restart:'🔁', lang:'🌍', profile:'🧾', mbi:'🧪' },
  { start:'✨', results:'📘', export:'📦', exportX:'📥', restart:'♻️', lang:'🌐', profile:'🧩', mbi:'🧪' },
  { start:'🎯', results:'📜', export:'💾', exportX:'📥', restart:'🔂', lang:'🌐', profile:'🧾', mbi:'🧪' },
  { start:'🟢', results:'📊', export:'📤', exportX:'📥', restart:'🔄', lang:'🌐', profile:'🧾', mbi:'🧪' },
]
function pickThemeIndex(chatId) {
  const fromEnv = process.env.EMOJI_THEME
  if (fromEnv && /^\d+$/.test(fromEnv)) return Number(fromEnv) % EMOJI_THEMES.length
  try {
    const n = Math.abs(Number(BigInt.asIntN(64, BigInt(chatId || 0))))
    return n % EMOJI_THEMES.length
  } catch { return 0 }
}
function getEmojis(ctx) { return EMOJI_THEMES[pickThemeIndex(ctx.chat?.id || 0)] }

/* =================== I18N =================== */
const TEXTS = {
  ru: {
    app_title: 'Эмоциональное выгорание (MBI)',
    greet: (title) => `Привет! Это тест *${title}*. Он содержит 22 вопроса и займёт ~5–7 минут.`,
    choose_action: 'Выберите действие:',
    buttons: {
      start_mbi: 'Начать',
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
    mbi: {
      instructions:
        'Инструкция.\n' +
        'Ответьте, пожалуйста, как часто вы испытываете перечисленные ниже состояния. ' +
        'Выберите частоту: «никогда» (0), «очень редко» (1), «иногда» (3), «часто» (4), ' +
        '«очень часто» (5), «каждый день» (6).',
      answers: [
        { label: 'Никогда', value: 0 },
        { label: 'Очень редко', value: 1 },
        { label: 'Иногда', value: 3 },
        { label: 'Часто', value: 4 },
        { label: 'Очень часто', value: 5 },
        { label: 'Каждый день', value: 6 },
      ],
      questions: [
        'Я хорошо понимаю, что чувствуют мои пациенты, и использую это для более успешного лечения.',
        'Я умею находить правильное решение в конфликтных ситуациях, возникающих при общении',
        'Я уверена, что моя работа нужна людям',
        'У меня много планов на будущее, и я верю в их осуществление',
        'Я чувствую себя эмоционально опустошенным',
        'После работы я чувствую себя уставшим',
        'Утром я чувствую усталость и хочу остаться дома',
        'После работы мне на некоторое время хочется уединиться',
        'Я чувствую угнетенность и апатию к моей деятельности',
        'Когда думаю о работе, я часто чувствую обиду',
        'Мне кажется, что я слишком много работаю',
        'Мне хочется уединиться и отдохнуть от всего и всех',
        'Я чувствую равнодушие и потерю интереса ко многому, что радовало меня в моей работе',
        'Я чувствую, что общаюсь с некоторыми коллегами, пациентами без теплоты и расположения к ним',
        'В последнее время я стала более черствой по отношению к тем, с кем я работаю',
        'Я замечаю, что моя работа ожесточает меня',
        'Я чувствую безразличие к окружающим',
        'В последнее время мне кажется, что коллеги и пациенты чаще перекладывают на меня груз своих проблем и обязанностей.',
        'Я легко могу создать атмосферу доброжелательности и сотрудничества в коллективе',
        'Во время работы я чувствую приятное оживление',
        'На работе я спокойно справляюсь с эмоциональными проблемами',
        'Благодаря своей работе я уже сделал в жизни много действительно ценного',
      ],
      scales: {
        PA:  { name: 'Редукция личных достижений',  indices: [0,1,2,3,18,19,20,21],    max: 48 },
        EEx: { name: 'Психоэмоциональное истощение', indices: [4,5,6,7,8,9,10,11,12],  max: 54 },
        DP:  { name: 'Деперсонализация',            indices: [13,14,15,16,17],        max: 30 },
      },
      question_title: (i, t) => `Вопрос ${i}/${t}`,
      interpret: ({ EEx, DP, PA }, S) => [
        'Чем выше⤴️ процентов в шкалах EEx и DP, и чем меньше⤵️ процента в шкале PA, то больше вероятность, что вы сейчас переживаете эмоциональное выгорание.',
        '',
        'Если у вас сейчас период эмоционального выгорания, то это не страшно, это естественное состояние любого специалиста.',
        '',
        'Скоро с нашем психологом состоится тренинг «Как преодолеть эмоциональное выгорание?» и вы можете усвоить эффективные техники на эту тему🤍',
      ].join('\n'),
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
    app_title: 'Emotsional kuyish (MBI)',
    greet: (title) => `Salom! Bu test *${title}*. 22 ta savol (~5–7 daqiqa).`,
    choose_action: 'Harakatni tanlang:',
    buttons: {
      start_mbi: 'Boshlash',
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
    mbi: {
      instructions:
        'Ko‘rsatma.\n' +
        'Quyidagi holatlarni qanchalik tez-tez boshdan kechirishingizni belgilang. ' +
        'Tanlang: «Hech qachon» (0), «Juda kamdan-kam» (1), «Ba’zan» (3), «Tez-tez» (4), ' +
        '«Juda tez-tez» (5), «Har kuni» (6).',
      answers: [
        { label: 'Hech qachon', value: 0 },
        { label: 'Juda kamdan-kam', value: 1 },
        { label: "Ba'zan", value: 3 },
        { label: 'Tez-tez', value: 4 },
        { label: 'Juda tez-tez', value: 5 },
        { label: 'Har kuni', value: 6 },
      ],
      questions: [
        'Bemorlarim nimalarni his qilishini yaxshi tushunaman va bundan davolashni samaraliroq qilish uchun foydalanaman.',
        'Muloqot vaqtida yuzaga keladigan nizoli vaziyatlarda to‘g‘ri yechim topa olaman',
        'Ishim odamlar uchun zarur ekanligiga ishonaman',
        'Kelajak uchun ko‘p rejalarga egaman va ularning amalga oshishiga ishonaman',
        'O‘zimni emotsional holdan toygan his qilaman',
        'Ishdan keyin charchagan his qilaman',
        'Ertalab charchoq sezaman va uyda qolishni xohlayman',
        'Ishdan keyin bir muddat yakkalanishni xohlayman',
        'Faoliyatimga nisbatan tushkunlik va befarqlikni his qilaman',
        'Ish haqida o‘ylaganimda ko‘pincha ranjish yoki hafa bo‘lishni his qilaman',
        'Juda ko‘p ishlayotgandek tuyuladi',
        'Hammasidan va hammadan yakkalanib dam olishni xohlayman',
        'Ishimda avval quvontirgan ko‘p narsalarga befarqlik va qiziqishning yo‘qolishini sezaman',
        'Ba’zi hamkasb va bemorlar bilan iliqliksiz, samimiyatsiz muloqot qilayotgandek his qilaman',
        'So‘nggi paytlarda birga ishlaydiganlarga nisbatan ko‘proq sovuqqon bo‘lib qoldim',
        'Ishim meni qattiqroq, qo‘polroq qilib yuborayotganini sezaman',
        'Atrofdagilarga nisbatan befarqlikni his qilaman',
        'So‘nggi paytlarda hamkasblar va bemorlar muammolari va majburiyatlari og‘irligini tez-tez menga yuklayotgandek tuyuladi',
        'Jamoada samimiylik va hamkorlik muhitini oson yarataman',
        'Ish paytida yoqimli jonlanishni his qilaman',
        'Ishda hissiy muammolarni xotirjam hal qila olaman',
        'Ishim tufayli hayotimda haqiqatan qimmatli ko‘p ishlarni amalga oshirdim',
      ],
      scales: {
        PA:  { name: 'Shaxsiy yutuqlar',     indices: [0,1,2,3,18,19,20,21],    max: 48 },
        EEx: { name: 'Emotsional charchash', indices: [4,5,6,7,8,9,10,11,12],  max: 54 },
        DP:  { name: 'Depersonalizatsiya',   indices: [13,14,15,16,17],        max: 30 },
      },
      question_title: (i, t) => `Savol ${i}/${t}`,
      interpret: ({ EEx, DP, PA }, S) => [
        'EEx va DP shkalalarida foiz qancha BALAND ⤴️ bo‘lsa, va PA shkalasida foiz qancha PAST ⤵️ bo‘lsa, emotsional kuyish ehtimoli shuncha yuqori.',
        '',
        'Agar hozir emotsional kuyish davrini boshdan kechirayotgan bo‘lsangiz, bu qo‘rqinchli emas — har bir mutaxassisda uchraydigan tabiiy holat.',
        '',
        'Yaqinda psixologimiz bilan “Emotsional kuyishni qanday yengish mumkin?” treningi bo‘ladi — shu mavzuda samarali texnikalarni o‘rganishingiz mumkin 🤍',
      ].join('\n'),
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

/* ============ STORAGE (safe JSON) ============ */
const dataDir = path.join(__dirname, '..', 'data')
const resultsFile = path.join(dataDir, 'results.json')
const usersFile = path.join(dataDir, 'users.json')
const xlsxFile = path.join(dataDir, 'results.xlsx')
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
if (!fs.existsSync(resultsFile)) fs.writeFileSync(resultsFile, '[]', 'utf8')
if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, '{}', 'utf8')

function safeReadJson(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf8').trim()
    if (!raw) throw new Error('empty')
    return JSON.parse(raw)
  } catch {
    try {
      const bak = file.replace(/\.json$/, `.bad-${Date.now()}.json`)
      fs.copyFileSync(file, bak)
    } catch {}
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2), 'utf8')
    return fallback
  }
}
const loadResults = () => safeReadJson(resultsFile, [])
const saveResults = (arr) => fs.writeFileSync(resultsFile, JSON.stringify(arr, null, 2), 'utf8')
const loadUsers = () => safeReadJson(usersFile, {})
const saveUsers = (obj) => fs.writeFileSync(usersFile, JSON.stringify(obj, null, 2), 'utf8')

/* ============ LANG & PROFILE ============ */
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

/* ================ BOT CORE ================ */
const bot = new Telegraf(BOT_TOKEN)
bot.use(session())

bot.telegram.getMe().then((me) => { BOT_USERNAME = me.username || '' }).catch(()=>{})

/* ============== MBI HELPERS ============== */
function mbiKbForQuestion(ctx, qIndex) {
  const lang = getLang(ctx)
  const answers = TEXTS[lang].mbi.answers
  const rows = [
    [answers[0], answers[1], answers[2]],
    [answers[3], answers[4], answers[5]],
  ].map(row => row.map(o => Markup.button.callback(o.label, `mbi:${qIndex}:${o.value}`)))
  return Markup.inlineKeyboard(rows)
}
function mbiInit(ctx) {
  const lang = getLang(ctx)
  ctx.session ??= {}
  ctx.session.flow = {
    type:'MBI',
    index: 0,
    startedAt: new Date().toISOString(),
    answers: Array(TEXTS[lang].mbi.questions.length).fill(null)
  }
}
async function mbiRender(ctx) {
  const lang = getLang(ctx)
  const T = TEXTS[lang].mbi
  const i = ctx.session.flow.index
  const total = T.questions.length
  const qText = `${(lang==='ru'?'Вопрос':'Savol')} ${i + 1}/${total}\n\n${T.questions[i]}`
  if (typeof ctx.editMessageText === 'function') {
    try { await ctx.editMessageText(qText, mbiKbForQuestion(ctx, i)); return }
    catch {}
  }
  await ctx.reply(qText, mbiKbForQuestion(ctx, i))
}
function computeMbiScores(answers, S) {
  const sumBy = (indices) => indices.reduce((acc, idx) => acc + (answers[idx] ?? 0), 0)
  const EEx = sumBy(S.EEx.indices)
  const DP  = sumBy(S.DP.indices)
  const PA  = sumBy(S.PA.indices)
  const pct = (sum, max) => Math.round((sum / max) * 100)
  return { EEx, EEx_pct: pct(EEx, S.EEx.max), DP, DP_pct: pct(DP, S.DP.max), PA, PA_pct: pct(PA, S.PA.max) }
}
function prettyMbi(ctx, scores) {
  const lang = getLang(ctx)
  const T = TEXTS[lang].mbi
  const S = T.scales
  const lines = [
    `🧪 *${lang==='ru'?'Эмоциональное выгорание (MBI)':'Emotsional kuyish (MBI)'}*`,
    `• EEx: *${scores.EEx}* / ${S.EEx.max} (${scores.EEx_pct}%)`,
    `• DP: *${scores.DP}* / ${S.DP.max} (${scores.DP_pct}%)`,
    `• PA: *${scores.PA}* / ${S.PA.max} (${scores.PA_pct}%)`,
    '',
    T.interpret(scores, S),
  ]
  return lines.join('\n')
}

/* ================= MENU ================= */
const isAdmin = (ctx) => ADMIN_IDS.includes(ctx.from?.id)
function buildMainMenu(ctx) {
  const lang = getLang(ctx)
  const T = TEXTS[lang]
  const E = getEmojis(ctx)
  const rows = [
    [`${E.mbi} ${T.buttons.start_mbi}`],
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

/* ============== PROFILE WIZARD ============== */
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
    if (resume === 'startMBI') { mbiInit(ctx); await mbiRender(ctx) }
    else { await showMainMenu(ctx) }
    return true
  }
  return false
}

/* ============== EXPORT (Excel) ============== */
async function exportToExcel() {
  const all = loadResults()
  const wb = new ExcelJS.Workbook()
  const sh = wb.addWorksheet('MBI')
  const qCount = 22
  const qCols = Array.from({length:qCount}, (_,i)=>({ header:`Q${i+1}`, key:`q${i+1}`, width:5 }))
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
    { header:'startedAt', key:'startedAt', width:22 },
    { header:'finishedAt', key:'finishedAt', width:22 },
    { header:'EEx', key:'EEx', width:6 },
    { header:'DP', key:'DP', width:6 },
    { header:'PA', key:'PA', width:6 },
    { header:'EEx_%', key:'EEx_pct', width:8 },
    { header:'DP_%', key:'DP_pct', width:8 },
    { header:'PA_%', key:'PA_pct', width:8 },
    ...qCols
  ]
  for (const r of all.filter(x=>x.type==='MBI')) {
    const profile = r.user?.profile || {}
    const row = {
      id: r.id,
      user_id: r.user?.id,
      username: r.user?.username || '',
      tg_first: r.user?.first_name || '',
      tg_last: r.user?.last_name || '',
      p_first: profile.first || '',
      p_last: profile.last || '',
      p_pos: profile.pos || profile.position || '',
      lang: r.user?.lang || '',
      startedAt: r.startedAt || '',
      finishedAt: r.finishedAt || '',
      EEx: r.scores?.EEx ?? '',
      DP:  r.scores?.DP  ?? '',
      PA:  r.scores?.PA  ?? '',
      EEx_pct: r.scores?.EEx_pct ?? '',
      DP_pct:  r.scores?.DP_pct  ?? '',
      PA_pct:  r.scores?.PA_pct  ?? '',
    }
    ;(r.answers || []).forEach((v, i) => { row[`q${i+1}`] = v })
    sh.addRow(row)
  }
  await wb.xlsx.writeFile(xlsxFile)
  return xlsxFile
}

/* ================= START ================= */
bot.start(async (ctx) => {
  const lang = getLang(ctx)
  await ctx.reply(TEXTS[lang].greet(TEXTS[lang].app_title), { parse_mode: 'Markdown' })
  if (await ensureProfile(ctx)) await showMainMenu(ctx)
})

/* =============== HEARS/COMMANDS =============== */
/* Шире ловим «Начать» (в т.ч. с эмодзи), «Boshlash», «/start» */
const reStartMBI = /(Начать|Boshlash|boshlash|Эмоциональное\s*выгорание|MBI|\/start|^start$)/i
const reResults  = /(Мои\s*результаты|Natijalarim)/i
const reExport   = /(Экспорт\s*JSON|JSON\s*eksport)/i
const reExportX  = /(Экспорт\s*Excel|Excel\s*eksport)/i
const reRestart  = /(Начать\s*заново|Qayta\s*boshlash)/i
const reLang     = /(Язык|Til)/i
const reProfile  = /(Профиль|Profil)/i

bot.hears(reStartMBI, async (ctx) => {
  if (!(await ensureProfile(ctx, 'startMBI'))) return
  const lang = getLang(ctx)
  await ctx.reply(TEXTS[lang].mbi.instructions)
  mbiInit(ctx)
  await mbiRender(ctx)
})
bot.hears(reResults, async (ctx) => {
  const lang = getLang(ctx)
  const all = loadResults()
  const last = [...all].reverse().find(r => r.type === 'MBI' && r.user?.id === ctx.from?.id)
  if (!last) return ctx.reply(TEXTS[lang].result_labels.none)
  const text = prettyMbi(ctx, last.scores)
  await ctx.reply(text, { parse_mode: 'Markdown' })
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
  const ikb = Markup.inlineKeyboard([
    [Markup.button.callback('Русский', 'lang:ru'), Markup.button.callback('O‘zbek', 'lang:uz')]
  ])
  await ctx.reply(TEXTS[lang].lang_prompt, ikb)
})
bot.action(/^lang:(ru|uz)$/i, async (ctx) => {
  const choice = ctx.match[1].toLowerCase()
  setLang(ctx, choice)
  const msg = choice === 'ru' ? TEXTS.ru.lang_set_ru : TEXTS.uz.lang_set_uz
  await ctx.answerCbQuery(msg, { show_alert: true }).catch(()=>{})
  await showMainMenu(ctx)
})
bot.hears(reProfile, async (ctx) => { await startProfileWizard(ctx) })

/* ================== ANSWERS ================== */
bot.action(/^mbi:(\d+):(\d+)$/, async (ctx) => {
  const lang = getLang(ctx)
  if (!ctx.session?.flow || ctx.session.flow.type !== 'MBI') mbiInit(ctx)

  const qIndex = Number(ctx.match[1])
  const value = Number(ctx.match[2])

  if (qIndex !== ctx.session.flow.index) {
    return ctx.answerCbQuery(TEXTS[lang].recorded, { show_alert: false })
  }

  ctx.session.flow.answers[qIndex] = value
  ctx.session.flow.index++
  await ctx.answerCbQuery(TEXTS[lang].recorded)

  const T = TEXTS[lang].mbi
  if (ctx.session.flow.index >= T.questions.length) {
    const S = T.scales
    const scores = computeMbiScores(ctx.session.flow.answers, S)
    const record = {
      id: uuidv4(),
      type: 'MBI',
      user: {
        id: ctx.from?.id,
        username: ctx.from?.username,
        first_name: ctx.from?.first_name,
        last_name: ctx.from?.last_name,
        lang,
        profile: getProfile(ctx)
      },
      startedAt: ctx.session.flow.startedAt,
      finishedAt: new Date().toISOString(),
      answers: ctx.session.flow.answers,
      scores,
    }
    const all = loadResults(); all.push(record); saveResults(all)
    const text = prettyMbi(ctx, scores)
    await ctx.reply(text, { parse_mode: 'Markdown' })
    ctx.session ??= {}; ctx.session.flow = null
    return showMainMenu(ctx, TEXTS[lang].done_menu)
  }
  await mbiRender(ctx)
})

/* ============== TEXT FALLBACKS ============== */
bot.on('text', async (ctx, next) => {
  const handled = await handleProfileInput(ctx)
  if (!handled) return next()
})
bot.on('message', async (ctx) => {
  if (ctx.session?.flow) return
  await showMainMenu(ctx)
})

/* ============== ERRORS & LAUNCH ============== */
bot.catch((err, ctx) => {
  const lang = getLang(ctx || { session:{ lang:'ru' } })
  console.error('Bot error:', err)
  ctx.reply(TEXTS[lang]?.error || 'Error').catch(()=>{})
})

bot.launch().then(() => { console.log('MBI Bot started…') })
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
