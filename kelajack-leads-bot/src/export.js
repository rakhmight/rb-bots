import ExcelJS from "exceljs";
import fs from "node:fs/promises";
import path from "node:path";

export async function buildLeadsXlsx(leads, outDir = "./data") {
  await fs.mkdir(outDir, { recursive: true });
  const filePath = path.join(outDir, `kelajack_leads_${Date.now()}.xlsx`);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Leads");

  ws.columns = [
    { header: "ID", key: "id", width: 8 },
    { header: "Дата", key: "created_at", width: 22 },
    { header: "ФИО ребёнка", key: "child_name", width: 28 },
    { header: "Возраст", key: "age", width: 10 },
    { header: "Район", key: "district", width: 20 },
    { header: "Телефон", key: "phone", width: 18 },
    { header: "Язык", key: "lang", width: 8 },
    { header: "Telegram", key: "tg", width: 20 },
    { header: "Статус", key: "status", width: 12 },
  ];

  for (const x of leads) {
    ws.addRow({
      id: x.id,
      created_at: x.created_at,
      child_name: x.child_name,
      age: x.age,
      district: x.district,
      phone: x.phone,
      lang: x.lang,
      tg: x.tg_username ? "@" + x.tg_username : String(x.tg_user_id),
      status: x.status,
    });
  }

  ws.getRow(1).font = { bold: true };
  ws.autoFilter = "A1:I1";

  await wb.xlsx.writeFile(filePath);
  return filePath;
}
