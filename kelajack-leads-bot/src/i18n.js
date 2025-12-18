export const LANGS = ["ru", "uz", "en"];

export const T = {
  ru: {
    choose_lang: "Выберите язык:",
    ru: "Русский язык",
    uz: "O’zbek tili",
    en: "English language",

    ask_child_name: "Введите ФИО (ребёнка):",
    ask_age: "Сколько лет ребёнку? (цифрой)",
    ask_district: "В каком районе проживаете? (можно написать текстом или выбрать кнопку)",
    ask_phone:
      "Номер телефона для обратной связи.\nМожно нажать кнопку «📲 Отправить мой номер» или ввести вручную.",
    consent:
      "Отправляя данные, вы даёте согласие на обработку контактной информации для связи учебного центра.",

    invalid_name: "Пожалуйста, введите ФИО (минимум 3 символа).",
    invalid_age: "Введите возраст цифрой (например: 9).",
    invalid_phone: "Похоже, номер некорректный. Пример: +998901234567",

    done_user: (brand, id) =>
      `Спасибо! Заявка принята ✅\n${brand} свяжется с вами в ближайшее время.\nНомер заявки: #${id}`,

    admin_new: (brand) => `🆕 Новая заявка (${brand})`,
    admin_menu: "Админ-панель:",
    admin_stats: "📊 Статистика",
    admin_export: "📥 Скачать Excel",
    admin_ok: "✅ Обработано",
    admin_marked: "Отмечено как обработано ✅",

    myid: (id) => `Ваш Telegram ID: ${id}`,
  },

  uz: {
    choose_lang: "Tilni tanlang:",
    ru: "Русский язык",
    uz: "O’zbek tili",
    en: "English language",

    ask_child_name: "Bolaning F.I.Sh ni kiriting:",
    ask_age: "Bola necha yoshda? (raqam bilan)",
    ask_district:
      "Qaysi tumanda yashaysiz? (matn bilan yozish yoki tugma tanlash mumkin)",
    ask_phone:
      "Aloqa uchun telefon raqam.\n«📲 Raqamni yuborish» tugmasini bosing yoki qo‘lda kiriting.",
    consent:
      "Ma’lumot yuborish orqali siz o‘quv markazi bog‘lanishi uchun aloqa ma’lumotlarini qayta ishlashga rozilik bildirasiz.",

    invalid_name: "Iltimos, F.I.Sh ni kiriting (kamida 3 ta belgi).",
    invalid_age: "Yoshni raqam bilan kiriting (masalan: 9).",
    invalid_phone: "Telefon raqami noto‘g‘ri ko‘rinadi. Misol: +998901234567",

    done_user: (brand, id) =>
      `Rahmat! Ariza qabul qilindi ✅\n${brand} siz bilan tez orada bog‘lanadi.\nAriza raqami: #${id}`,

    admin_new: (brand) => `🆕 Yangi ariza (${brand})`,
    admin_menu: "Admin panel:",
    admin_stats: "📊 Statistika",
    admin_export: "📥 Excel yuklab olish",
    admin_ok: "✅ Yakunlandi",
    admin_marked: "Yakunlandi deb belgilandi ✅",

    myid: (id) => `Sizning Telegram ID: ${id}`,
  },

  en: {
    choose_lang: "Choose language:",
    ru: "Русский язык",
    uz: "O’zbek tili",
    en: "English language",

    ask_child_name: "Enter the child’s full name:",
    ask_age: "How old is the child? (number)",
    ask_district: "Which district do you live in? (type or pick a button)",
    ask_phone:
      "Phone number for a call back.\nUse «📲 Send my number» button or type it.",
    consent:
      "By sending this, you consent to processing contact info for the training center to reach you.",

    invalid_name: "Please enter a valid name (min 3 characters).",
    invalid_age: "Enter age as a number (e.g., 9).",
    invalid_phone: "Phone looks invalid. Example: +998901234567",

    done_user: (brand, id) =>
      `Thanks! Your request is accepted ✅\n${brand} will contact you soon.\nRequest ID: #${id}`,

    admin_new: (brand) => `🆕 New request (${brand})`,
    admin_menu: "Admin panel:",
    admin_stats: "📊 Stats",
    admin_export: "📥 Download Excel",
    admin_ok: "✅ Done",
    admin_marked: "Marked as done ✅",

    myid: (id) => `Your Telegram ID: ${id}`,
  },
};

export function t(lang, key, ...args) {
  const L = T[lang] ? lang : "ru";
  const v = T[L][key];
  return typeof v === "function" ? v(...args) : v;
}
