// shared/memory/store.js
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.SESSIONS_DIR || path.resolve('./data/sessions');
const MAX_MSGS = Number(process.env.SESSION_MAX_MSGS || 18);      // сколько последних реплик хранить «как есть»
const TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 48);    // «живой» диалог (по умолчанию — 48ч)

function ensureDir() { fs.mkdirSync(BASE, { recursive: true }); }
function filePath(userId, profile) {
  ensureDir();
  const safe = String(userId).replace(/[^a-z0-9_-]/gi, '_');
  const p = String(profile || 'general').replace(/[^a-z0-9_-]/gi, '_');
  return path.join(BASE, `${safe}__${p}.json`);
}

function now() { return Date.now(); }
function hours(ms) { return ms / (1000 * 60 * 60); }

export function getSession(userId, profile) {
  const file = filePath(userId, profile);
  if (!fs.existsSync(file)) return { summary: '', messages: [], updatedAt: 0 };
  try {
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      summary: json.summary || '',
      messages: Array.isArray(json.messages) ? json.messages : [],
      updatedAt: json.updatedAt || 0
    };
  } catch {
    return { summary: '', messages: [], updatedAt: 0 };
  }
}

export function saveSession(userId, profile, session) {
  const file = filePath(userId, profile);
  const data = {
    summary: session.summary || '',
    messages: Array.isArray(session.messages) ? session.messages : [],
    updatedAt: session.updatedAt || now()
  };
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

export function append(userId, profile, role, content) {
  const s = getSession(userId, profile);
  s.messages.push({ role, content: String(content || '') });
  if (s.messages.length > MAX_MSGS) s.messages = s.messages.slice(-MAX_MSGS);
  s.updatedAt = now();
  saveSession(userId, profile, s);
  return s;
}

export function setSummary(userId, profile, summary) {
  const s = getSession(userId, profile);
  s.summary = String(summary || '');
  s.updatedAt = now();
  saveSession(userId, profile, s);
  return s;
}

export function reset(userId, profile) {
  const file = filePath(userId, profile);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

export function resetAllProfiles(userId) {
  for (const p of ['general','pregnancy','mencare','mamacare']) reset(userId, p);
}

export function shouldSummarize(userId, profile, softLimitChars = 6000) {
  const s = getSession(userId, profile);
  const total = s.messages.reduce((acc, m) => acc + (m.content?.length || 0), 0);
  return total > softLimitChars;
}

export function isExpired(userId, profile) {
  const s = getSession(userId, profile);
  if (!s.updatedAt) return false;
  return hours(now() - s.updatedAt) > TTL_HOURS;
}
