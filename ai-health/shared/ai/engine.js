// shared/ai/engine.js
const DEFAULT_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';
const PROVIDER = (process.env.LLM_PROVIDER || 'openai').toLowerCase();
const BASE = process.env.LLM_BASE_URL?.replace(/\/$/, '');

function buildUserContent(text, images = []) {
  if (images?.length) {
    return [
      { type: 'text', text: text || '' },
      ...images.map((url) => ({ type: 'image_url', image_url: { url } }))
    ];
  }
  return text || '';
}

function buildMessages({ system, history = [], user, images = [] }) {
  const msgs = [{ role: 'system', content: system }];
  for (const m of history) {
    if (m?.role && typeof m.content === 'string') msgs.push(m);
  }
  msgs.push({ role: 'user', content: buildUserContent(user, images) });
  return msgs;
}

async function callOpenAIChat({ system, history, user, images, model = DEFAULT_MODEL, temperature = 0.2 }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is missing');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: buildMessages({ system, history, user, images }),
      temperature
    })
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content?.trim() || '';
}

async function callCompatible({ system, history, user, images, model = DEFAULT_MODEL, temperature = 0.2 }) {
  if (!BASE) throw new Error('LLM_BASE_URL is missing for compatible provider');
  const apiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || '';

  const userText = images?.length
    ? `${user || ''}\n\n[Изображения]\n${images.map((u,i)=>`${i+1}) ${u}`).join('\n')}`
    : (user || '');

  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': apiKey ? `Bearer ${apiKey}` : undefined, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: buildMessages({ system, history, user: userText }),
      temperature
    })
  });
  if (!res.ok) throw new Error(`Compatible LLM error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content?.trim() || '';
}

export async function generateAI(args) {
  if (PROVIDER === 'none') return `⚠️ AI отключен. Запрос: "${(args.user || '').slice(0,200)}"`;
  if (PROVIDER === 'compatible') return callCompatible(args);
  return callOpenAIChat(args);
}

// Сжатие памяти — превращаем хвост диалога в краткую сводку фактов
export async function summarizeMemory({ summary = '', newMessages = [], profile = 'general', model = DEFAULT_MODEL }) {
  const system = [
    'Ты — медицинский ассистент. Суммаризируй диалог для дальнейшей памяти.',
    'Оставь: возраст/пол/срок беременности/жалобы/диагнозы/аллергии/лекарства/важные показатели, противопоказания, согласованные планы.',
    'Пиши кратко, структурно, без советов. Без лишнего текста.'
  ].join(' ');
  const user = [
    `Профиль: ${profile}.`,
    summary ? `Текущая сводка: ${summary}` : 'Текущей сводки нет.',
    'Новые реплики:',
    newMessages.map(m => `- ${m.role.toUpperCase()}: ${m.content}`).join('\n'),
    '',
    'Собери обновлённую сводку (5–10 строк).'
  ].join('\n');

  return callOpenAIChat({ system, history: [], user, images: [], model, temperature: 0.1 });
}
