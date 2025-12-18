// src/config.js
export const CONFIG = {
  // PIN для входа в админ-панель (можно заменить через .env: VITE_ADMIN_PIN)
  adminPin: import.meta?.env?.VITE_ADMIN_PIN || '1107',

  // Лого в шапке (картинку положи в public/assets/)
  logoUrl: '/assets/akfa.png',
  logoSize: 160,

  // ФИО в шапке (Генеральный директор) по языкам — дефолтные значения.
  headerFioByLang: {
    ru: 'Турсункулов Азимджон Назиржонович',
    uz: 'Tursunqulov Azimjon Nazirjonovich',
    en: 'Tursunkulov Azimdjon Nazirjonovich',
  },

  // Подпись под ФИО в шапке
  headerFioCaptionByLang: {
    ru: 'Генеральный директор',
    uz: 'Bosh direktor',
    en: 'General Director',
  },
};

// 🔒 Белый список хостов/доменов
export const SECURITY = {
  enabled: true,
  allowedHosts: [
    // локально
    'localhost', 'localhost:5171',
    '127.0.0.1', '127.0.0.1:5171',

    // твой сервер в ЛС
    '10.1.1.190', '10.1.1.190:5171',

    // прод-домены
    'akfamedline.uz', 'www.akfamedline.uz',
    'akfamedline.com', 'www.akfamedline.com',
  ],
};
