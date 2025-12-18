import React, { useMemo, useState } from 'react';
import { ORG_DATA } from '../orgData';
import { TITLES_I18N } from '../titles.i18n';
import { NAMES_I18N } from '../names.i18n';
import { saveOverrides, clearOverrides } from './overrides';

const LANGS = ['ru','en','uz'];

function makeNodesList() {
  const base = [
    { id: 'ceo', type: 'admin' },
    { id: ORG_DATA.spineOwner.id, type: 'clinic' },
  ];
  const take = arr => arr.map(x => ({ id: x.id, type: x.type || 'admin' }));
  return [
    ...base,
    ...take(ORG_DATA.deputies || []),
    ...take(ORG_DATA.spine || []),
    ...take(ORG_DATA.sideLeft || []),
    ...take(ORG_DATA.sideRight || []),
  ];
}

export default function AdminPanel({
  overrides,
  setOverrides,
  onClose,
  t,
}) {
  const [lang, setLang] = useState('ru');
  const [q, setQ] = useState('');
  const allNodes = useMemo(() => makeNodesList(), []);
  const list = useMemo(() => {
    const n = (s='') => s.toLowerCase();
    if (!q) return allNodes;
    return allNodes.filter(node => {
      const inTitle = (TITLES_I18N?.[lang]?.[node.id] || '').toLowerCase().includes(n(q));
      const inName  = (NAMES_I18N?.[lang]?.[node.id] || '').toLowerCase().includes(n(q));
      const inOvT   = (overrides.titles?.[node.id]?.[lang] || '').toLowerCase().includes(n(q));
      const inOvN   = (overrides.names?.[node.id]?.[lang]  || '').toLowerCase().includes(n(q));
      return inTitle || inName || inOvT || inOvN;
    });
  }, [allNodes, q, lang, overrides]);

  const getTitle = (id) =>
    overrides.titles?.[id]?.[lang] ??
    TITLES_I18N?.[lang]?.[id] ?? '';

  const getName = (id) =>
    overrides.names?.[id]?.[lang] ??
    NAMES_I18N?.[lang]?.[id] ?? '';

  const setTitle = (id, v) => {
    setOverrides(prev => {
      const titles = { ...(prev.titles || {}) };
      const row = { ...(titles[id] || {}) };
      row[lang] = v;
      titles[id] = row;
      const next = { ...prev, titles };
      saveOverrides(next);
      return next;
    });
  };
  const setName = (id, v) => {
    setOverrides(prev => {
      const names = { ...(prev.names || {}) };
      const row = { ...(names[id] || {}) };
      row[lang] = v;
      names[id] = row;
      const next = { ...prev, names };
      saveOverrides(next);
      return next;
    });
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(overrides, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'akfa-org-overrides.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = (file) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target.result);
        setOverrides({
          titles: parsed.titles || {},
          names: parsed.names || {},
        });
        saveOverrides({
          titles: parsed.titles || {},
          names: parsed.names || {},
        });
      } catch {}
    };
    reader.readAsText(file);
  };

  const resetAll = () => {
    clearOverrides();
    setOverrides({ titles: {}, names: {} });
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-[1000] flex items-start justify-center p-4 overflow-auto">
      <div className="bg-white w-full max-w-6xl rounded-2xl shadow-xl">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div className="font-semibold text-lg">Админ-панель (локальные правки)</div>
          <div className="flex items-center gap-2">
            <select value={lang} onChange={e=>setLang(e.target.value)}
                    className="border rounded-md px-2 py-1 text-sm">
              {LANGS.map(l => <option key={l} value={l}>{l.toUpperCase()}</option>)}
            </select>
            <button onClick={onClose} className="px-3 py-1.5 rounded-md border">Закрыть</button>
          </div>
        </div>

        <div className="px-5 py-3 flex items-center gap-3">
          <input
            value={q}
            onChange={e=>setQ(e.target.value)}
            placeholder="Поиск по названию / ФИО…"
            className="flex-1 border rounded-md px-3 py-2"
          />
          <button onClick={exportJson} className="px-3 py-2 rounded-md border bg-slate-50">Экспорт JSON</button>
          <label className="px-3 py-2 rounded-md border bg-slate-50 cursor-pointer">
            Импорт JSON
            <input type="file" accept="application/json" className="hidden"
                   onChange={e=>e.target.files?.[0] && importJson(e.target.files[0])}/>
          </label>
          <button onClick={resetAll} className="px-3 py-2 rounded-md border text-red-600">Сбросить всё</button>
        </div>

        <div className="px-5 pb-5">
          <div className="grid grid-cols-12 gap-3 text-sm font-semibold text-slate-600 mb-2">
            <div className="col-span-2">ID</div>
            <div className="col-span-5">Название отдела ({lang.toUpperCase()})</div>
            <div className="col-span-5">ФИО руководителя ({lang.toUpperCase()})</div>
          </div>

          <div className="divide-y">
            {list.map(n => (
              <div key={n.id} className="grid grid-cols-12 gap-3 py-2 items-start">
                <div className="col-span-2">
                  <div className="font-mono text-xs bg-slate-50 border rounded px-2 py-1 select-all">{n.id}</div>
                </div>
                <div className="col-span-5">
                  <input
                    value={getTitle(n.id)}
                    onChange={e=>setTitle(n.id, e.target.value)}
                    placeholder="Название…"
                    className="w-full border rounded px-2 py-1.5"
                  />
                  <div className="text-[11px] text-slate-500 mt-1">
                    База: {TITLES_I18N?.[lang]?.[n.id] ?? '—'}
                  </div>
                </div>
                <div className="col-span-5">
                  <input
                    value={getName(n.id)}
                    onChange={e=>setName(n.id, e.target.value)}
                    placeholder="ФИО…"
                    className="w-full border rounded px-2 py-1.5"
                  />
                  <div className="text-[11px] text-slate-500 mt-1">
                    База: {NAMES_I18N?.[lang]?.[n.id] ?? '—'}
                  </div>
                </div>
              </div>
            ))}
            {list.length === 0 && (
              <div className="text-slate-500 text-sm py-6">Ничего не найдено…</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
