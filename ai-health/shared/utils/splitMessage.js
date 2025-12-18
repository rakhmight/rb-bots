export function splitMessage(text, max = 4000) {
  if (!text) return [];
  const chunks = [];
  let rest = String(text);
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max * 0.6) cut = rest.lastIndexOf(' ', max);
    if (cut <= 0) cut = max;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest.length) chunks.push(rest);
  return chunks;
}
