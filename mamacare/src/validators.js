
// src/validators.js
const DOSAGE_REGEX = /\b\d+(?:[\.,]\d+)?\s?(?:mg|мг|ml|мл|кап(?:ель|)|капли|таб(?:летк|)|дозы?)\b/i;

export function extractZone(text) {
  const m = text.match(/^\s*\[(RED|AMBER|GREEN)\]/i);
  return m?.[1]?.toUpperCase() || "UNKNOWN";
}

export function containsDosage(text) {
  return DOSAGE_REGEX.test(text || "");
}

export const SAFE_FALLBACK = (
  `[AMBER] Я не могу давать дозировки и назначения. Если состояние вызывает сомнения — обратитесь к врачу в ближайшие 24 часа.\n` +
  `**Что сделать сейчас:**\n• Обеспечьте питьё маленькими порциями\n• Поддерживайте прохладный влажный воздух\n• Наблюдайте за дыханием и активностью\n` +
  `**На что наблюдать:**\n• Тяжёлое дыхание, вялость, отказ от питья\n• Сыпь с точечными кровоизлияниями\n• Лихорадка у младенца до 3 мес ≥38.0°C\n` +
  `**Пояснение:** дозировки назначает только врач с учётом возраста/веса/сопутствующих состояний.\n` +
  `**Напоминание:** Я не заменяю врача.`
);

export function enforceSafety(text) {
  if (!text) return SAFE_FALLBACK;
  if (containsDosage(text)) return SAFE_FALLBACK;
  return text;
}
