import fs from 'node:fs';
import path from 'node:path';

export function createI18n({ localesDir, defaultLang = 'ru' }) {
  const cache = new Map();
  function load(lang) {
    if (cache.has(lang)) return cache.get(lang);
    const p = path.join(localesDir, `${lang}.json`);
    let data = {};
    try { data = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
    cache.set(lang, data);
    return data;
  }
  return {
    t(lang, key, vars = {}) {
      const dict = load(lang);
      let str = dict[key] ?? load(defaultLang)[key] ?? key;
      for (const [k, v] of Object.entries(vars)) {
        str = str.replaceAll(`{{${k}}}`, String(v));
      }
      return str;
    }
  };
}
