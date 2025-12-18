export const STORAGE_KEY = 'akfa_org_overrides_v1';

export function loadOverrides() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { titles: {}, names: {} };
    const parsed = JSON.parse(raw);
    return {
      titles: parsed.titles || {},
      names: parsed.names || {},
    };
  } catch {
    return { titles: {}, names: {} };
  }
}

export function saveOverrides(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

export function clearOverrides() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
