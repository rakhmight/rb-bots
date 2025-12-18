import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const saved = localStorage.getItem('lang') || 'ru'

const resources = {
  ru: {
    translation: {
      orgTitle: 'Организационная структура Университетской клиники ООО «AKFA MEDLINE»',
      chooseLeadHint: 'Выберите руководителя — подсветятся его подразделения.',
      searchPlaceholder: 'Поиск по отделам, ФИО…',
      expandAll: 'Развернуть всё',
      collapseAll: 'Свернуть всё',
      hierarchy: 'Иерархия:',
      subordinates: 'подчинённые',
      reportsTo: 'Подчиняется',
      fio: 'ФИО',
      notFound: 'Ничего не найдено…',
      resetHighlight: 'Сбросить подсветку',
      rightsFooter: 'Все права защищены. © Рахмонбердиев Б.Б.',
      logoAlt: 'Логотип',
      role: {
        clinic: 'Заведующий отделением',
        nursingStaff: 'Заведующий отделением',
        residency: 'Руководитель',
        default: 'Начальник отдела'
      }
    }
  },
  en: {
    translation: {
      orgTitle: 'AKFA MEDLINE University Clinic — Org Structure',
      chooseLeadHint: 'Pick a manager to highlight their sub-units.',
      searchPlaceholder: 'Search by department or name…',
      expandAll: 'Expand all',
      collapseAll: 'Collapse all',
      hierarchy: 'Hierarchy:',
      subordinates: 'subordinates',
      reportsTo: 'Reports to',
      fio: 'Full name',
      notFound: 'Nothing found…',
      resetHighlight: 'Clear highlight',
      rightsFooter: 'All rights reserved. © Rakhmonberdiev B.B.',
      logoAlt: 'Logo',
      role: {
        clinic: 'Head of Department',
        nursingStaff: 'Head of Department',
        residency: 'Supervisor',
        default: 'Department Head'
      }
    }
  },
  uz: {
    translation: {
      orgTitle: 'AKFA MEDLINE universitet klinikasi — Tashkiliy tuzilma',
      chooseLeadHint: 'Rahbarni tanlang — uning bo‘linmalari ajratib ko‘rsatiladi.',
      searchPlaceholder: 'Bo‘linma yoki F.I.Sh. bo‘yicha qidiring…',
      expandAll: 'Hammasini ochish',
      collapseAll: 'Hammasini yopish',
      hierarchy: 'Ierarxiya:',
      subordinates: 'bo‘ysunuvchilar',
      reportsTo: 'Kimga bo‘ysunadi',
      fio: 'F.I.Sh.',
      notFound: 'Hech narsa topilmadi…',
      resetHighlight: 'Ajratishni tozalash',
      rightsFooter: 'Barcha huquqlar himoyalangan. © Raxmonberdiyev B.B.',
      logoAlt: 'Logotip',
      role: {
        clinic: 'Bo‘lim mudiri',
        nursingStaff: 'Bo‘lim mudiri',
        residency: 'Rahbar',
        default: 'Bo‘lim boshlig‘i'
      }
    }
  }
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: saved,
    fallbackLng: 'ru',
    interpolation: { escapeValue: false }
  })

export default i18n
