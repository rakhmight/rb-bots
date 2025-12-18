export function nowISO() {
  return new Date().toISOString();
}

export function parseAdminIds(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export function cleanText(s) {
  return String(s || "").trim().replace(/\s+/g, " ");
}

export function isValidName(name) {
  const n = cleanText(name);
  return n.length >= 3 && n.length <= 80;
}

export function parseAge(text) {
  const n = Number(String(text || "").trim());
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 99) return null;
  return Math.floor(n);
}

export function normalizePhone(input) {
  const raw = String(input || "").trim();
  const digits = raw.replace(/[^\d+]/g, "");
  let p = digits;

  if (!p.startsWith("+")) {
    const onlyDigits = p.replace(/[^\d]/g, "");
    p = onlyDigits;
  }

  const justDigits = p.replace(/[^\d]/g, "");
  if (justDigits.length < 9 || justDigits.length > 15) return null;

  if (digits.startsWith("+")) return "+" + justDigits;
  return justDigits;
}

export function fmtLeadCard(lead) {
  return [
    `#${lead.id}`,
    `👶 ФИО: ${lead.child_name}`,
    `🎂 Возраст: ${lead.age}`,
    `📍 Район: ${lead.district}`,
    `📞 Телефон: ${lead.phone}`,
    `🌐 Язык: ${lead.lang}`,
    `👤 Telegram: ${lead.tg_username ? "@" + lead.tg_username : lead.tg_user_id}`,
    `🕒 Дата: ${lead.created_at}`,
    `📌 Статус: ${lead.status}`,
  ].join("\n");
}
