export function todayYMD() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function parseLines(text) {
  if (!text) return [];
  return String(text)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
