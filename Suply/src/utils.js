import dayjs from "dayjs";

export function todayYMD() {
  return dayjs().format("YYYY-MM-DD");
}

export function parseLines(text) {
  const bullet = /^(?:[\-\u2212\u2013\u2014\u2022*\s])+/u;
  return text
    .split(/\r?\n/)
    .map((s) => s.replace(bullet, "").trim())
    .filter(Boolean);
}
