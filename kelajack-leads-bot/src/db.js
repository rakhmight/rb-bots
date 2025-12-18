import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { nowISO } from "./utils.js";

export function initDb(dbPath) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      tg_user_id INTEGER NOT NULL,
      tg_username TEXT,
      lang TEXT NOT NULL,
      child_name TEXT NOT NULL,
      age INTEGER NOT NULL,
      district TEXT NOT NULL,
      phone TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new'
    );

    CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

    CREATE TABLE IF NOT EXISTS drafts (
      tg_user_id INTEGER PRIMARY KEY,
      updated_at TEXT NOT NULL,
      step TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      lang TEXT
    );
  `);

  const stmts = {
    getDraft: db.prepare(`SELECT * FROM drafts WHERE tg_user_id=?`),
    upsertDraft: db.prepare(`
      INSERT INTO drafts (tg_user_id, updated_at, step, payload_json, lang)
      VALUES (@tg_user_id, @updated_at, @step, @payload_json, @lang)
      ON CONFLICT(tg_user_id) DO UPDATE SET
        updated_at=excluded.updated_at,
        step=excluded.step,
        payload_json=excluded.payload_json,
        lang=excluded.lang
    `),
    delDraft: db.prepare(`DELETE FROM drafts WHERE tg_user_id=?`),

    addLead: db.prepare(`
      INSERT INTO leads (created_at, tg_user_id, tg_username, lang, child_name, age, district, phone, status)
      VALUES (@created_at, @tg_user_id, @tg_username, @lang, @child_name, @age, @district, @phone, @status)
    `),
    getLeadById: db.prepare(`SELECT * FROM leads WHERE id=?`),
    setLeadStatus: db.prepare(`UPDATE leads SET status=? WHERE id=?`),

    statsTotal: db.prepare(`SELECT COUNT(*) as c FROM leads`),
    statsByStatus: db.prepare(`SELECT status, COUNT(*) as c FROM leads GROUP BY status`),
    statsByLang: db.prepare(`SELECT lang, COUNT(*) as c FROM leads GROUP BY lang`),
    statsByDistrictTop: db.prepare(`
      SELECT district, COUNT(*) as c
      FROM leads
      GROUP BY district
      ORDER BY c DESC
      LIMIT 10
    `),

    listLeadsAll: db.prepare(`
      SELECT * FROM leads
      ORDER BY id DESC
    `),
  };

  function getDraft(tg_user_id) {
    const row = stmts.getDraft.get(tg_user_id);
    if (!row) return null;
    return {
      tg_user_id: row.tg_user_id,
      updated_at: row.updated_at,
      step: row.step,
      lang: row.lang || "ru",
      payload: JSON.parse(row.payload_json || "{}"),
    };
  }

  function upsertDraft({ tg_user_id, step, lang, payload }) {
    stmts.upsertDraft.run({
      tg_user_id,
      updated_at: nowISO(),
      step,
      lang: lang || "ru",
      payload_json: JSON.stringify(payload || {}),
    });
  }

  function deleteDraft(tg_user_id) {
    stmts.delDraft.run(tg_user_id);
  }

  function createLead({ tg_user_id, tg_username, lang, child_name, age, district, phone }) {
    const info = stmts.addLead.run({
      created_at: nowISO(),
      tg_user_id,
      tg_username: tg_username || null,
      lang: lang || "ru",
      child_name,
      age,
      district,
      phone,
      status: "new",
    });
    return stmts.getLeadById.get(info.lastInsertRowid);
  }

  function setLeadStatus(id, status) {
    stmts.setLeadStatus.run(status, id);
    return stmts.getLeadById.get(id);
  }

  function getLeadById(id) {
    return stmts.getLeadById.get(id);
  }

  function getStats() {
    return {
      total: stmts.statsTotal.get().c,
      byStatus: stmts.statsByStatus.all(),
      byLang: stmts.statsByLang.all(),
      topDistricts: stmts.statsByDistrictTop.all(),
    };
  }

  function listLeadsAll() {
    return stmts.listLeadsAll.all();
  }

  return {
    db,
    getDraft,
    upsertDraft,
    deleteDraft,
    createLead,
    setLeadStatus,
    getLeadById,
    getStats,
    listLeadsAll,
  };
}
