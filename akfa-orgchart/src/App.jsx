import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Shield, LineChart, PiggyBank, Settings, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { ORG_DATA } from './orgData';
import { CONFIG } from './config';
import { TITLES_I18N } from './titles.i18n';
import { NAMES_I18N } from './names.i18n';

// ---------- ТЕМА ----------
const THEME = {
  clinic:      { bg:'bg-cyan-50',     border:'border-cyan-300',     title:'text-cyan-900',     chip:'bg-cyan-100 text-cyan-800',     icon:'text-cyan-700' },
  development: { bg:'bg-indigo-50',   border:'border-indigo-300',   title:'text-indigo-900',   chip:'bg-indigo-100 text-indigo-800', icon:'text-indigo-700' },
  finance:     { bg:'bg-emerald-50',  border:'border-emerald-300',  title:'text-emerald-900',  chip:'bg-emerald-100 text-emerald-800',icon:'text-emerald-700' },
  admin:       { bg:'bg-slate-50',    border:'border-slate-300',    title:'text-slate-900',    chip:'bg-slate-100 text-slate-800',    icon:'text-slate-700' },
  nursing:     { bg:'bg-amber-50',    border:'border-amber-300',    title:'text-amber-900',    chip:'bg-amber-100 text-amber-800',    icon:'text-amber-700' },
};
const iconByType = (type, cls) =>
  type==='clinic'      ? <Building2 className={cls}/> :
  type==='development' ? <LineChart  className={cls}/> :
  type==='finance'     ? <PiggyBank  className={cls}/> :
  type==='nursing'     ? <Shield     className={cls}/> :
                         <Settings   className={cls}/>;

const norm = s => (s||'').toLowerCase();
const matchQ = (title, owner, items, groups, q) => {
  if (!q) return true;
  const n = norm(q);
  if (norm(title).includes(n)) return true;
  if (owner && norm(owner).includes(n)) return true;
  if ((items||[]).some(i => norm(i).includes(n))) return true;
  if ((groups||[]).some(g => norm(g.title).includes(n) || (g.items||[]).some(i => norm(i).includes(n)))) return true;
  return false;
};

// ---------- ИНДЕКС ОРГСТРУКТУРЫ ----------
function useOrgIndex() {
  const nodes = useMemo(() => {
    const base = [
      { id: 'ceo', title: ORG_DATA.head.title, owner: ORG_DATA.head.owner, type: 'admin' },
      { id: ORG_DATA.spineOwner.id, title: ORG_DATA.spineOwner.title, owner: ORG_DATA.spineOwner.owner, type: 'clinic', reportsTo: ORG_DATA.spineOwner.reportsTo || 'ceo' },
    ];
    const pick = a => a.map(x => ({ id:x.id, title:x.title, owner:x.owner, ownerKey:x.ownerKey, type:x.type, reportsTo:x.reportsTo }));
    return [...base, ...pick(ORG_DATA.deputies||[]), ...pick(ORG_DATA.spine||[]), ...pick(ORG_DATA.sideLeft||[]), ...pick(ORG_DATA.sideRight||[])];
  }, []);
  const dict = useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])), [nodes]);
  const children = useMemo(() => {
    const m = {};
    nodes.forEach(n => { if (!n.reportsTo) return; (m[n.reportsTo]||(m[n.reportsTo]=[])).push(n.id); });
    return m;
  }, [nodes]);
  return { dict, children };
}

// ---------- ПЕРЕОПРЕДЕЛЕНИЯ ФИО В localStorage ----------
const LS_NAMES_KEY = 'org_names_overrides_v1';
const loadNameOverrides = () => { try { return JSON.parse(localStorage.getItem(LS_NAMES_KEY)||'{}'); } catch { return {}; } };
const saveNameOverrides = obj => localStorage.setItem(LS_NAMES_KEY, JSON.stringify(obj));

const getNameFromAny = (lang, key, fallbackByLang) => {
  const ov = loadNameOverrides();
  if (ov?.[key]?.[lang]) return ov[key][lang];
  if (fallbackByLang?.[lang]) return fallbackByLang[lang];
  return fallbackByLang?.ru || '';
};

// ФИО в шапке (ГД)
const resolveHeaderFio = lang => getNameFromAny(lang, 'header.ceo', CONFIG.headerFioByLang);

// ФИО руководителя блока
const resolveOwner = (lang, block) => {
  const key = block.ownerKey || block.id;
  const fallbackByLang = (NAMES_I18N && NAMES_I18N[key]) || { ru: block.owner || '' };
  return getNameFromAny(lang, key, fallbackByLang);
};

// ---------- SVG-СТРЕЛКИ ----------
function ConnectionsLayer({ containerRef, childrenMap, focus }) {
  const [paths, setPaths] = useState([]);
  const recalc = () => {
    const wrap = containerRef.current; if (!wrap) return;
    const base = wrap.getBoundingClientRect();
    const getRect = id => {
      const el = document.getElementById(`card-${id}`); if (!el) return null;
      const r = el.getBoundingClientRect(); return { x:r.left-base.left, y:r.top-base.top, w:r.width, h:r.height };
    };
    const segs = [];
    Object.entries(childrenMap).forEach(([p, kids]) => {
      const pr = getRect(p); if (!pr) return;
      kids.forEach(c => {
        const cr = getRect(c); if (!cr) return;
        const x1 = pr.x + pr.w/2, y1 = pr.y + pr.h;
        const x2 = cr.x + cr.w/2, y2 = cr.y;
        const dy = Math.max(40, Math.abs(y2-y1)/2);
        const d  = `M${x1},${y1} C ${x1},${y1+dy} ${x2},${y2-dy} ${x2},${y2}`;
        const isFocus = !!focus && (focus===p || focus===c);
        segs.push({ d, isFocus });
      });
    });
    setPaths(segs);
  };
  useEffect(() => {
    recalc();
    const onR = () => recalc();
    window.addEventListener('resize', onR, { passive:true });
    window.addEventListener('scroll', onR, { passive:true });
    const mo = new MutationObserver(onR);
    if (containerRef.current) mo.observe(containerRef.current, { childList:true, subtree:true, attributes:true });
    return () => { window.removeEventListener('resize', onR); window.removeEventListener('scroll', onR); mo.disconnect(); };
  }, [containerRef, childrenMap, focus]);
  return (
    <svg className="absolute inset-0 pointer-events-none -z-10">
      <defs>
        <marker id="arrowHead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" className="fill-slate-400"/>
        </marker>
      </defs>
      {paths.map((p,i)=>(
        <path key={i} d={p.d} fill="none"
          className={p.isFocus?'stroke-indigo-500':'stroke-slate-300'}
          strokeWidth={p.isFocus?2.6:1.8} markerEnd="url(#arrowHead)"
          opacity={p.isFocus?1:(focus?0.35:0.85)} />
      ))}
    </svg>
  );
}

// ---------- КАРТОЧКА ----------
function Card({ id, type='admin', title, owner, items=[], groups=[], open, onToggle, parentTitle, focus, isChild, isFocus, hasChildren, onFocus, roleLabel }) {
  const t = THEME[type] || THEME.admin;
  const hasContent = (items?.length||0)+(groups?.length||0)>0;
  const dim = focus && !(isChild||isFocus);
  return (
    <div id={`card-${id}`} className={`relative z-10 rounded-2xl border ${t.border} bg-white shadow-sm overflow-hidden ${isChild?'ring-2 ring-cyan-300':isFocus?'ring-2 ring-indigo-400':''} ${dim?'opacity-40':''}`}>
      <button onClick={()=>onToggle(id)} className={`w-full text-left flex items-center justify-between gap-3 px-4 py-3 ${t.bg} ${t.title}`} aria-expanded={open}>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            {iconByType(type,`w-5 h-5 ${t.icon}`)}
            <span className="font-semibold text-slate-900">{title}</span>
            {hasChildren && (
              <span onClick={(e)=>{e.stopPropagation();onFocus(id);}} className="ml-2 text-[11px] px-2 py-0.5 rounded-full border border-cyan-300 bg-cyan-50 text-cyan-800 cursor-pointer">подчинённые</span>
            )}
          </div>
          {owner && <div className="text-xs text-slate-600">{roleLabel}: {owner}</div>}
          {parentTitle && <div className="text-[11px] text-slate-500">Подчиняется: <span className="font-medium">{parentTitle}</span></div>}
        </div>
        {hasContent ? (open?<ChevronUp className="w-5 h-5 text-slate-600"/>:<ChevronDown className="w-5 h-5 text-slate-600"/>)
                   : <span className="text-xs text-slate-500"/>}
      </button>
      {open && hasContent && (
        <div className={`border-t ${t.border} px-4 py-3`}>
          {items?.length>0 && (<ul className="flex flex-wrap gap-2 mb-2">{items.map((i,idx)=>(<li key={idx} className={`text-sm px-2.5 py-1 rounded-full ${t.chip}`}>{i}</li>))}</ul>)}
          {groups?.length>0 && (
            <div className="space-y-2">
              {groups.map((g,gi)=>(
                <div key={gi}>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{g.title}</div>
                  <ul className="flex flex-wrap gap-2">{g.items.map((it,ii)=>(<li key={ii} className={`text-sm px-2.5 py-1 rounded-full ${t.chip}`}>{it}</li>))}</ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- КОЛОНКА ----------
function Column({ themeKey, blocks, openMap, onToggle, query, dict, childrenMap, focus, setFocus, lang, roleLabel }) {
  const filtered = useMemo(()=>blocks.filter(b=>matchQ(b.title, b.owner, b.items, b.groups, query)),[blocks,query]);
  return (
    <div className="space-y-3">
      <div className={`px-3 py-2 rounded-xl border ${THEME[themeKey].border} ${THEME[themeKey].bg} font-semibold ${THEME[themeKey].title}`}/>
      {filtered.length===0 ? (
        <div className="text-sm text-slate-500">Ничего не найдено…</div>
      ) : filtered.map(b=>{
          const parentTitle = b.reportsTo ? dict[b.reportsTo]?.title : null;
          const isChild = focus && b.reportsTo===focus;
          const isFocus = focus===b.id;
          const hasChildren = !!childrenMap[b.id]?.length;
          return (
            <Card key={b.id}
              id={b.id}
              type={themeKey}
              title={TITLES_I18N?.[b.id]?.[lang] || b.title}
              owner={resolveOwner(lang, b)}
              items={b.items}
              groups={b.groups}
              open={!!openMap[b.id]}
              onToggle={onToggle}
              parentTitle={parentTitle}
              focus={focus}
              isChild={!!isChild}
              isFocus={!!isFocus}
              hasChildren={hasChildren}
              onFocus={setFocus}
              roleLabel={roleLabel}
            />
          );
        })
      }
    </div>
  );
}

// ---------- АДМИН-ПАНЕЛЬ (редактор ФИО) ----------
function AdminPanelInline({ open, onClose, onChanged }) {
  const [pin, setPin] = useState('');
  const [authed, setAuthed] = useState(localStorage.getItem('org_admin_authed') === '1');
  const expectedPin = String(CONFIG?.adminPin ?? '1357');
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || i18n.language || 'ru';

  useEffect(()=>{ if(!open) setPin(''); }, [open]);

  const login = (e) => {
    e.preventDefault();
    if (String(pin).trim() === expectedPin) {
      setAuthed(true);
      localStorage.setItem('org_admin_authed','1');
    } else {
      alert('Неверный PIN');
    }
  };
  const logout = () => { setAuthed(false); localStorage.removeItem('org_admin_authed'); onClose?.(); };

  const blocksWithOwners = useMemo(() => {
    const arr = [ ORG_DATA.spineOwner, ...(ORG_DATA.deputies||[]), ...(ORG_DATA.spine||[]), ...(ORG_DATA.sideLeft||[]), ...(ORG_DATA.sideRight||[]) ].filter(Boolean);
    return arr.filter(b => !!(b.owner || b.ownerKey));
  }, []);

  const [form, setForm] = useState(()=>loadNameOverrides());
  const setName = (key, L, value) => setForm(prev => ({ ...prev, [key]: { ...(prev[key]||{}), [L]: value } }));

  const saveAll   = () => { saveNameOverrides(form); onChanged?.(); alert('Сохранено'); };
  const exportJson= () => {
    const blob = new Blob([JSON.stringify(form,null,2)], {type:'application/json;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'names-overrides.json'; a.click(); URL.revokeObjectURL(a.href);
  };
  const importJson= (file) => { const r=new FileReader(); r.onload=e=>{ try{ setForm(JSON.parse(e.target.result)); }catch{ alert('Некорректный JSON'); } }; r.readAsText(file); };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-black/30 grid place-items-center" onClick={onClose}>
      <div className="bg-white rounded-2xl w-[min(1000px,95vw)] max-h-[92vh] overflow-auto shadow-xl" onClick={(e)=>e.stopPropagation()}>
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div className="text-lg font-semibold">Админ-панель</div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800">✕</button>
        </div>

        {!authed ? (
          <form onSubmit={login} className="p-5 flex gap-3 items-center">
            <div className="text-sm text-slate-600">Введите пароль <code></code></div>
            <input value={pin} onChange={e=>setPin(e.target.value)} placeholder="Пароль" className="px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
            <button type="submit" className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800">Войти</button>
          </form>
        ) : (
          <div className="p-5 space-y-6">
            <div className="flex items-center justify-between">
              <div className="font-medium">Вы авторизованы</div>
              <button onClick={logout} className="text-sm px-3 py-1.5 rounded-lg border border-slate-300">Выйти</button>
            </div>

            {/* ФИО в шапке (ГД) */}
            <div className="border rounded-xl p-4">
              <div className="font-semibold mb-3">ФИО в шапке (Генеральный директор)</div>
              {['ru','uz','en'].map(L=>{
                const key='header.ceo';
                const placeholder = resolveHeaderFio(L);
                const value = form?.[key]?.[L] ?? '';
                return (
                  <label key={L} className="block mb-2">
                    <span className="text-xs text-slate-600 mr-2 uppercase">{L}</span>
                    <input className="w-full px-3 py-2 rounded-lg border border-slate-300" placeholder={placeholder} value={value} onChange={e=>setName(key,L,e.target.value)} />
                  </label>
                );
              })}
            </div>

            {/* Руководители отделов */}
            <div className="border rounded-xl p-4">
              <div className="font-semibold mb-3">Руководители отделов</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {blocksWithOwners.map(b=>{
                  const key = b.ownerKey || b.id;
                  const title = TITLES_I18N?.[b.id]?.[lang] || b.title;
                  return (
                    <div key={key} className="rounded-lg border border-slate-200 p-3">
                      <div className="text-sm font-medium mb-2">{title}</div>
                      {['ru','uz','en'].map(L=>{
                        const placeholder = resolveOwner(L,b);
                        const value = form?.[key]?.[L] ?? '';
                        return (
                          <label key={`${key}-${L}`} className="block mb-2">
                            <span className="text-xs text-slate-600 mr-2 uppercase">{L}</span>
                            <input className="w-full px-3 py-2 rounded-lg border border-slate-300" placeholder={placeholder} value={value} onChange={e=>setName(key,L,e.target.value)} />
                          </label>
                        );
                      })}
                      <div className="text-[10px] text-slate-500">key: {key}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button onClick={saveAll} className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800">Сохранить</button>
              <button onClick={exportJson} className="px-4 py-2 rounded-lg border border-slate-300">Экспорт JSON</button>
              <label className="px-4 py-2 rounded-lg border border-slate-300 cursor-pointer">
                Импорт JSON
                <input type="file" accept="application/json" className="hidden" onChange={e=>e.target.files?.[0] && importJson(e.target.files[0])}/>
              </label>
              <button onClick={()=>{ saveNameOverrides({}); setForm({}); onChanged?.(); }} className="px-4 py-2 rounded-lg border border-rose-300 text-rose-700">
                Сбросить переопределения
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- ПРИЛОЖЕНИЕ ----------
export default function App() {
  const gridRef = useRef(null);
  const { dict, children:childrenMap } = useOrgIndex();
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || i18n.language || 'ru';

  const [query, setQuery] = useState('');
  const [openMap, setOpenMap] = useState({});
  const [focus, setFocus] = useState(null);
  const [showLinks] = useState(true);
  const [adminOpen, setAdminOpen] = useState(false);
  const [namesVersion, setNamesVersion] = useState(0); // для форс-рендера после сохранения

  const allIds = useMemo(()=>[
    ORG_DATA.spineOwner.id,
    ...(ORG_DATA.deputies||[]).map(x=>x.id),
    ...(ORG_DATA.spine||[]).map(x=>x.id),
    ...(ORG_DATA.sideLeft||[]).map(x=>x.id),
    ...(ORG_DATA.sideRight||[]).map(x=>x.id),
  ],[]);

  const toggle = id => setOpenMap(m=>({...m, [id]: !m[id]}));
  const expandAll = () => setOpenMap(Object.fromEntries(allIds.map(id=>[id,true])));
  const collapseAll= () => setOpenMap({});

  useEffect(()=>{
    if (!query) return;
    const next = {};
    const pushIf = b => next[b.id] = matchQ(b.title,b.owner,b.items,b.groups,query);
    (ORG_DATA.deputies||[]).forEach(pushIf);
    (ORG_DATA.spine||[]).forEach(pushIf);
    (ORG_DATA.sideLeft||[]).forEach(pushIf);
    (ORG_DATA.sideRight||[]).forEach(pushIf);
    setOpenMap(m=>({...m,...next}));
  },[query]);

  const leftNursing = (ORG_DATA.sideLeft||[]).filter(b=>b.type==='nursing');
  const leftAdmin   = (ORG_DATA.sideLeft||[]).filter(b=>b.type!=='nursing');
  const rightDev    = (ORG_DATA.sideRight||[]).filter(b=>b.type==='development');
  const rightFin    = (ORG_DATA.sideRight||[]).filter(b=>b.type==='finance');

  // подпись роли (по задаче: везде «Заведующий отделением», кроме двух исключений)
  const roleLabelFor = id =>
    (id==='nursing-head' || id==='residency') ? '' : 'Заведующий отделением';

  return (
    <div key={namesVersion} className="min-h-screen p-4 md:p-8 bg-slate-50">
      <header className="max-w-7xl mx-auto mb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              {TITLES_I18N?.appTitle?.[lang] || 'Организационная структура Университетской клиники ООО «AKFA MEDLINE»'}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <select value={lang} onChange={e=>i18n.changeLanguage(e.target.value)} className="border rounded-lg px-2 py-1">
              <option value="ru">RU</option><option value="uz">UZ</option><option value="en">EN</option>
            </select>
            {CONFIG.logoUrl
              ? <img src={CONFIG.logoUrl} alt="Логотип" style={{width:CONFIG.logoSize,height:CONFIG.logoSize}} className="object-contain rounded-xl border border-slate-200 bg-white shadow"/>
              : <div style={{width:CONFIG.logoSize,height:CONFIG.logoSize}} className="rounded-xl border border-slate-200 bg-white grid place-items-center text-slate-400">LOGO</div>}
            <div className="leading-tight text-right">
              <div className="font-semibold">{resolveHeaderFio(lang)}</div>
              <div className="text-xs text-slate-600">{CONFIG.headerFioCaptionByLang?.[lang] || CONFIG.headerFioCaptionByLang?.ru}</div>
              <button onClick={()=>setAdminOpen(true)} className="mt-1 text-xs px-2 py-1 rounded-lg border border-slate-300 bg-white">⚙️ Админ</button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto relative" ref={gridRef}>
        {/* Генеральный директор */}
        <div id="card-ceo" className="relative z-10 rounded-2xl border border-slate-300 bg-white shadow-sm px-4 py-3 mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-slate-700"/><span className="font-semibold">{TITLES_I18N?.ceo?.[lang] || ORG_DATA.head.title}</span>
          </div>
          <div className="text-xs text-slate-600 mt-1">ФИО: {resolveHeaderFio(lang)}</div>
        </div>

        {/* Медицинский директор */}
        <div id={`card-${ORG_DATA.spineOwner.id}`} className="relative z-10 rounded-2xl border border-cyan-300 bg-cyan-50 shadow-sm px-4 py-3 font-semibold text-cyan-900 mb-2">
          {TITLES_I18N?.[ORG_DATA.spineOwner.id]?.[lang] || ORG_DATA.spineOwner.title}
          <div className="text-sm text-cyan-900/80 font-normal">ФИО: {resolveOwner(lang, ORG_DATA.spineOwner)}</div>
          <div className="text-[11px] text-cyan-900/80">Подчиняется: <span className="font-medium">{TITLES_I18N?.ceo?.[lang] || 'Генеральный директор'}</span></div>
        </div>

        {/* Заместители мед. директора (если есть) */}
        {(ORG_DATA.deputies||[]).length>0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {(ORG_DATA.deputies||[]).map(d=>{
              const parentTitle = dict[d.reportsTo||ORG_DATA.spineOwner.id]?.title || '';
              const isChild = focus && d.reportsTo===focus;
              const isFocus = focus===d.id;
              return (
                <Card key={d.id} id={d.id} type="clinic"
                  title={TITLES_I18N?.[d.id]?.[lang] || d.title}
                  owner={resolveOwner(lang,d)}
                  open={!!openMap[d.id]}
                  onToggle={toggle}
                  parentTitle={parentTitle}
                  focus={focus}
                  isChild={!!isChild}
                  isFocus={!!isFocus}
                  hasChildren={false}
                  onFocus={setFocus}
                  roleLabel={'Заведующий отделением'}
                />
              );
            })}
          </div>
        )}

        {/* Панель управления */}
        <div className="flex flex-col gap-3 mb-6">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Поиск по отделам, ФИО…" className="w-full md:max-w-xl px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-300 bg-white shadow-sm"/>
            <div className="flex gap-2">
              <button onClick={expandAll} className="px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 shadow-sm">Развернуть всё</button>
              <button onClick={collapseAll} className="px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50">Свернуть всё</button>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-slate-500">Иерархия:</span>
            {['ceo','med-dir','nursing-head','dev-dir','fin-dir'].filter(id=>dict[id]).map(id=>{
              const active = focus===id; const hasKids = !!childrenMap[id]?.length;
              return (
                <button key={id} onClick={()=>setFocus(active?null:id)} className={`text-xs px-2.5 py-1.5 rounded-full border ${active?'border-indigo-400 bg-indigo-50 text-indigo-800':'border-slate-300 bg-white text-slate-700'} ${hasKids?'':'opacity-50'}`}>
                  {dict[id].title}
                </button>
              );
            })}
            {focus && <button onClick={()=>setFocus(null)} className="text-xs px-2 py-1.5 rounded-full border border-slate-300 bg-white text-slate-600">Сбросить подсветку</button>}
          </div>
        </div>

        {/* Слой стрелок */}
        {showLinks && <ConnectionsLayer containerRef={gridRef} childrenMap={childrenMap} focus={focus}/>}

        {/* Три колонки */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-3">
            <Column themeKey="nursing" blocks={leftNursing} openMap={openMap} onToggle={toggle} query={query} dict={dict} childrenMap={childrenMap} focus={focus} setFocus={setFocus} lang={lang} roleLabel={'Директор по сестринскому делу'}/>
            <div className="mt-6">
              <Column themeKey="admin" blocks={leftAdmin}   openMap={openMap} onToggle={toggle} query={query} dict={dict} childrenMap={childrenMap} focus={focus} setFocus={setFocus} lang={lang} roleLabel={'Начальник отдела'}/>
            </div>
          </section>

          <section className="lg:col-span-6">
            <div className="space-y-3">
              {(ORG_DATA.spine||[]).filter(b=>matchQ(b.title,b.owner,b.items,b.groups,query)).map(b=>{
                const parentTitle = b.reportsTo ? dict[b.reportsTo]?.title : null;
                const isChild = focus && b.reportsTo===focus;
                const isFocus = focus===b.id;
                const hasChildren = !!childrenMap[b.id]?.length;
                return (
                  <Card key={b.id}
                    id={b.id}
                    type="clinic"
                    title={TITLES_I18N?.[b.id]?.[lang] || b.title}
                    owner={resolveOwner(lang,b)}
                    items={b.items}
                    groups={b.groups}
                    open={!!openMap[b.id]}
                    onToggle={toggle}
                    parentTitle={parentTitle}
                    focus={focus}
                    isChild={!!isChild}
                    isFocus={!!isFocus}
                    hasChildren={hasChildren}
                    onFocus={setFocus}
                    roleLabel={roleLabelFor(b.id) || 'Заведующий отделением'}
                  />
                );
              })}
            </div>
          </section>

          <section className="lg:col-span-3">
            <Column themeKey="development" blocks={rightDev} openMap={openMap} onToggle={toggle} query={query} dict={dict} childrenMap={childrenMap} focus={focus} setFocus={setFocus} lang={lang} roleLabel={'Начальник отдела'}/>
            <div className="mt-6">
              <Column themeKey="finance"     blocks={rightFin} openMap={openMap} onToggle={toggle} query={query} dict={dict} childrenMap={childrenMap} focus={focus} setFocus={setFocus} lang={lang} roleLabel={'Начальник отдела'}/>
            </div>
          </section>
        </div>

        <div className="text-xs text-slate-500 mt-8">Все права защищены. © Рахмонбердиев Б.Б.</div>
      </main>

      {/* Админ-панель */}
      <AdminPanelInline open={adminOpen} onClose={()=>setAdminOpen(false)} onChanged={()=>setNamesVersion(v=>v+1)} />
    </div>
  );
}
