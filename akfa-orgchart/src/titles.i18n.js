// Переводы названий подразделений по их id.
// Если ключа нет — берётся исходный title из ORG_DATA.
export const TITLES_I18N = {
  en: {
    // Верхний уровень
    'ceo': 'General Director',
    'med-dir': 'Medical Director',
    'dev-dir': 'Director of Development',
    'fin-dir': 'Financial Director',
    'nursing-head': 'Head of Nursing (Chief Nurse)',

    // Замы меддиректора
    'dep-1': 'Deputy Medical Director',
    'dep-2': 'Deputy Medical Director',

    // «Хребет» (клинические отделения)
    'lab': 'Clinical Diagnostic Laboratory',
    'oncology': 'Oncology Department',
    'cardiology': 'Cardiology Department',
    'spine-neuro': 'Spinal Neurosurgery Department',
    'icu': 'Intensive Care Unit (ICU)',
    'neurology': 'Neurology Department',
    'trauma-ortho': 'Traumatology & Orthopedics Department',
    'rehab-therapy': 'Rehabilitation Therapy',
    'gynecology': 'Gynecology Department',
    'cardiac-surgery': 'Cardiac Surgery Department',
    'polyclinic': 'Consultative & Diagnostic Department (Polyclinic)',
    'anesth': 'Anesthesiology Department',
    'therapy': 'Internal Medicine Department',
    'peds-cardiac': 'Pediatric Cardiac Surgery Department',
    'angio': 'Angiosurgery Department',
    'surgery': 'General Surgery Department',
    'cardio-icu': 'Cardiac ICU & Cardioanesthesiology Department',
    'vascular-1': 'Vascular Surgery Department 1',
    'physio': 'Physiotherapy Department',
    'radiology': 'Radiology Department',
    'cardiac-surgery-2': 'Cardiac Surgery Department 2',
    'urology': 'Urology Department',
    'operating': 'Operating Unit',

    // Левый борт (админ/сестринский контур)
    'quality-safety': 'Quality Management & Patient Safety',
    'aho': 'Administrative & Maintenance Department',
    'impl': 'Project Implementation Department',
    'science': 'Research Department',
    'patient-exp': 'Patient Experience & Staff Training',
    'bioeng': 'Bioengineering Department',
    'procurement': 'Procurement Department',
    'spa': 'SPA',
    'hr': 'HR Department',
    'it': 'IT Department',
    'security': 'Security Service',
    'nursing-staff': 'Middle & Junior Medical Staff',
    'residency': 'Residency',

    // Правый борт (развитие/финансы)
    'dev-strategy': 'Director of Strategic Development',
    'marketing': 'Marketing & PR Department',
    'service': 'Service Support Department',
    'pm': 'Project Management Department',
    'intl': 'International Department',
    'insurance': 'Insurance & Corporate Clients Department',
    'finance-dept': 'Financial & Economic Department',
    'accounting': 'Accounting (Deputy Chief Accountant)',
    'warehouse': 'Materials Warehouse'
  },

  uz: {
    // Yuqori daraja
    'ceo': 'Bosh direktor',
    'med-dir': 'Bosh shifokor — tibbiy direktor',
    'dev-dir': 'Rivojlanish direktori',
    'fin-dir': 'Moliya direktori',
    'nursing-head': 'Hamshiralik ishi direktori (Bosh hamshira)',

    // Meddirektor o‘rinbosarlari
    'dep-1': 'Tibbiy direktor o‘rinbosari',
    'dep-2': 'Tibbiy direktor o‘rinbosari',

    // Klinik bo‘linmalar
    'lab': 'Klinik-diagnostik laboratoriya',
    'oncology': 'Onkologiya bo‘limi',
    'cardiology': 'Kardiologiya bo‘limi',
    'spine-neuro': 'Orqa miya neyroxirurgiyasi bo‘limi',
    'icu': 'Reanimatsiya va intensiv terapiya bo‘limi',
    'neurology': 'Nevrologiya bo‘limi',
    'trauma-ortho': 'Travmatologiya va ortopediya bo‘limi',
    'rehab-therapy': 'Reabilitatsiya terapiyasi',
    'gynecology': 'Ginekologiya bo‘limi',
    'cardiac-surgery': 'Kardioxirurgiya bo‘limi',
    'polyclinic': 'Maslahat-diagnostika bo‘limi (poliklinika)',
    'anesth': 'Anesteziologiya bo‘limi',
    'therapy': 'Terapiya (ichki kasalliklar) bo‘limi',
    'peds-cardiac': 'Bola kardioxirurgiyasi bo‘limi',
    'angio': 'Angioxirurgiya bo‘limi',
    'surgery': 'Jarrohlik bo‘limi',
    'cardio-icu': 'Kardio reanimatsiya va kardioanesteziologiya bo‘limi',
    'vascular-1': 'Tomir jarrohlik bo‘limi 1',
    'physio': 'Fizioterapiya bo‘limi',
    'radiology': 'Radiologiya bo‘limi',
    'cardiac-surgery-2': 'Kardioxirurgiya bo‘limi 2',
    'urology': 'Urologiya bo‘limi',
    'operating': 'Operatsion blok',

    // Chap bort
    'quality-safety': 'Sifat menejmenti va bemor xavfsizligi',
    'aho': 'Ma’muriy-xo‘jalik bo‘limi',
    'impl': 'Loyihalarni joriy etish bo‘limi',
    'science': 'Ilmiy bo‘lim',
    'patient-exp': 'Bemor tajribasi va xodimlarni o‘qitish bo‘limi',
    'bioeng': 'Bioinjiniring bo‘limi',
    'procurement': 'Ta’minot bo‘limi',
    'spa': 'SPA',
    'hr': 'HR bo‘limi',
    'it': 'IT bo‘limi',
    'security': 'Xavfsizlik xizmati',
    'nursing-staff': 'O‘rta va kichik tibbiyot xodimlari',
    'residency': 'Rezidentura',

    // O‘ng bort
    'dev-strategy': 'Strategik rivojlanish direktori',
    'marketing': 'Marketing va PR bo‘limi',
    'service': 'Xizmat ko‘rsatishni ta’minlash bo‘limi',
    'pm': 'Loyihalarni boshqarish bo‘limi',
    'intl': 'Xalqaro bo‘lim',
    'insurance': 'Sug‘urta va korporativ mijozlar bo‘limi',
    'finance-dept': 'Moliyaviy-iqtisodiy bo‘lim',
    'accounting': 'Buxgalteriya (bosh buxgalter o‘rinbosari)',
    'warehouse': 'TMS ombori'
  }
}
