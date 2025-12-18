export const ORG_DATA = {
  head: { id: "ceo", title: "Генеральный директор", owner: "Турсункулов Азимджон Назиржонович" },

  spineOwner: {
    id: "med-dir",
    title: "Медицинский директор",
    owner: "Умарова Гулнора Касимовна",
    reportsTo: "ceo"
  },

  // ДВА ЗАМЕСТИТЕЛЯ МЕДДИРЕКТОРА — НОВОЕ
  deputies: [
    {
      id: "dep-1",
      type: "clinic",
      title: "Заместитель медицинского директора",
      owner: "Маматов Джамшид Фуркатович",
      reportsTo: "med-dir"
    },
    {
      id: "dep-2",
      type: "clinic",
      title: "Заместитель медицинского директора",
      owner: "Аскаров Равшан Тахирович",
      reportsTo: "med-dir"
    }
  ],

  // Центральный клинический «хребет» (как раньше)
  spine: [
    { id: "rehab-therapy", type: "clinic", title: "Реабилитационная терапия", owner: "Бахадиров Саид Комилович", reportsTo: "med-dir" },
    { id: "urology", type: "clinic", title: "Отделение урологии", owner: "Юнусов Дилмурод Самихович", reportsTo: "med-dir" },
    { id: "surgery", type: "clinic", title: "Отделение хирургии", owner: "Саметдинов Нарходжа Юлдашевич", reportsTo: "med-dir" },
    { id: "trauma-ortho", type: "clinic", title: "Отделение травматологии и ортопедии", owner: "Бабакулов Абдуазиз Шадиевич", reportsTo: "med-dir" },
    { id: "neurology", type: "clinic", title: "Отделение неврологии", owner: "Азимов Фахриддин Зухриддинович", reportsTo: "med-dir" },
    { id: "spine-neuro", type: "clinic", title: "Отделение спинальной нейрохирургии с палатами", owner: "Арипходжаев Фузулиддин Зиявиддинович", reportsTo: "med-dir" },
    { id: "therapy", type: "clinic", title: "Отделение терапии", owner: "Нурединов Камолиддин Джамолиддинович", reportsTo: "med-dir" },
    { id: "ent", type: "clinic", title: "Отделение оториноларингологии", reportsTo: "med-dir" },
    { id: "cardiac-surgery", type: "clinic", title: "Отделение кардиохирургии", owner: "Ирмухамедов Ахмаджон Рустамович", reportsTo: "med-dir" },
    { id: "vascular-1", type: "clinic", title: "Отделение сосудистой хирургии", owner: "Суннатов Равшан Джалилович", reportsTo: "med-dir" },
    { id: "ophthalmology", type: "clinic", title: "Отделение офтальмологии", reportsTo: "med-dir" },
    { id: "gynecology", type: "clinic", title: "Отделение гинекологии", owner: "Фозилбеков Рузикул Анаркулович", reportsTo: "med-dir" },
    { id: "oncology", type: "clinic", title: "Отделение онкологии", owner: "Абдусатторов Равшан Абдурауф угли", reportsTo: "med-dir",
      items: ["Научный руководитель: Абдурахмонов Отабек Бахтиёрович"] },
    { id: "peds-cardiac", type: "clinic", title: "Отделение детской кардиохирургии", owner: "Пирназаров Джамшиджон Тулкинович", reportsTo: "med-dir" },
    { id: "cardiology", type: "clinic", title: "Отделение кардиологии", owner: "Аминов Санжар Абдуазимович", reportsTo: "med-dir" },
    { id: "transport", type: "clinic", title: "Служба медицинской помощи для транспортировки пациентов", reportsTo: "med-dir" },

    { id: "icu", type: "clinic", title: "Отделение реанимации и интенсивной терапии", owner: "Аскаров Равшан Тахирович", reportsTo: "med-dir" },
    { id: "anesth", type: "clinic", title: "Отделение анестезиологии", owner: "Мирахмедов Гайрат Мирахмедович", reportsTo: "med-dir" },
    { id: "operating", type: "clinic", title: "Операционное отделение", owner: "Юнусов Дилмурод Самихович", reportsTo: "med-dir" },
    { id: "consult", type: "clinic", title: "Консультативно-диагностическое отделение (поликлиника)", owner: "Маматов Джамшид Фуркатович", reportsTo: "med-dir" },
    { id: "er", type: "clinic", title: "Приёмный покой", reportsTo: "med-dir" },
    { id: "lab", type: "clinic", title: "Клинико-диагностическая лаборатория", owner: "Хайбатиллаев Дилшодбек Шавкатбек угли", reportsTo: "med-dir" },
    { id: "physio", type: "clinic", title: "Отделение физиотерапии", owner: "Туляганова Диларам Халиловна", reportsTo: "med-dir" },
    { id: "derm-cos", type: "clinic", title: "Отделение дерматокосметологии", reportsTo: "med-dir" },
    { id: "dentistry", type: "clinic", title: "Отделение стоматологии", reportsTo: "med-dir" },
    { id: "radiology", type: "clinic", title: "Отделение радиологии", owner: "Хусанходжаев Жасур Улмасович", reportsTo: "med-dir" },
    { id: "angio", type: "clinic", title: "Отделение ангиохирургии", owner: "Сабиров Сардорбек Илхамбаевич", reportsTo: "med-dir" },
    { id: "pharmacy", type: "clinic", title: "Централизованная аптека", reportsTo: "med-dir" },
    { id: "common-staff", type: "clinic", title: "Общебольничный персонал: эпидемиолог, врач-диетолог, диет. медсестра", reportsTo: "med-dir" }
  ],

  // Левый блок (сестринский + прямые гендиру)
  sideLeft: [
    { id: "nursing-head", type: "nursing", title: "Директор по сестринскому делу (Главная медсестра)", owner: "Сунатуллаева Ёдгора Нигматовна", reportsTo: "ceo" },
    { id: "quality-safety", type: "nursing", title: "Отдел менеджмента качества и безопасности пациентов", owner: "Бегалиева Севара Рахматали кызы", reportsTo: "ceo" },
    { id: "nursing-staff", type: "nursing", title: "Средний и младший медицинский персонал", owner: "Шарафиева Гузаль Хабибуллаевна", reportsTo: "nursing-head" },

    { id: "legal", type: "admin", title: "Юридический отдел", reportsTo: "ceo" },
    { id: "nk", type: "admin", title: "HR отдел", owner: "Шукурова Эркиной Мураткуловна", reportsTo: "ceo" },
    { id: "bioeng", type: "admin", title: "Отдел биоинженерии", owner: "Мурадосилова Эльвина Энверовна", reportsTo: "ceo" },
    { id: "patient-exp", type: "admin", title: "Отдел по изучению опыта пациента и обучению персонала", owner: "Маматкулов Адхамжон Рустамжонович", reportsTo: "ceo" },
    { id: "aho", type: "admin", title: "АХО", owner: "Махкамов Иззатилла Суннатулла угли", reportsTo: "ceo" },
    { id: "spa", type: "admin", title: "СПА", owner: "Сайдджалалова Гузал Наржиевна", reportsTo: "ceo" },
    { id: "it", type: "admin", title: "IT отдел", owner: "Юсупов Дамир Хасанович", reportsTo: "ceo" },
    { id: "impl", type: "admin", title: "Отдел по внедрению проектов", owner: "Алимов Джамшид Махмуджонович", reportsTo: "ceo" },
    { id: "science", type: "admin", title: "Научный отдел", owner: "Курбанов Фуат Мукаддасович", reportsTo: "ceo" },
    { id: "security", type: "admin", title: "Служба безопасности", owner: "Расулов Равшанджан Исраилжанович", reportsTo: "ceo" },
    { id: "residency", type: "admin", title: "Резидентура", reportsTo: "ceo" }
  ],

  // Правый блок: развитие + финансы
  sideRight: [
    { id: "dev-dir", type: "development", title: "Директор по развитию", owner: "Зокиров Эркин Эргаш угли", reportsTo: "ceo" },
    { id: "marketing", type: "development", title: "Отдел маркетинга и PR", owner: "Хамракулова Шахноза Шавкатовна", reportsTo: "dev-dir" },
    { id: "sales", type: "development", title: "Отдел продаж", reportsTo: "dev-dir" },
    { id: "intl", type: "development", title: "Международный отдел", owner: "Рахимова Наргиза Шухратовна", reportsTo: "dev-dir" },
    { id: "insurance", type: "development", title: "Отдел по страхованию и работе с корпоративными клиентами", owner: "Мухамедов Шавкат Эргашевич", reportsTo: "dev-dir" },
    { id: "service", type: "development", title: "Отдел обеспечения сервиса", owner: "Абдулбориев Хабибулло Хайрулло угли", reportsTo: "dev-dir" },

    { id: "fin-dir", type: "finance", title: "Финансовый директор", owner: "Тилляходжаев Давир Темурович", reportsTo: "ceo" },
    { id: "finance-dept", type: "finance", title: "Финансово-экономический отдел", owner: "Алимов Малик Олимжон угли", reportsTo: "fin-dir" },
    { id: "accounting", type: "finance", title: "Бухгалтерия", owner: "Хайруллаев Бунёдхужа Хабибулла угли", reportsTo: "fin-dir" },
    { id: "procurement", type: "finance", title: "Отдел снабжения", owner: "Ризаев Мухаммад Бобур Мирзо Ахмаджон угли", reportsTo: "fin-dir" },
    { id: "warehouse", type: "finance", title: "Склад ТМЦ", owner: "Джалилов Жавлон Мирямол угли", reportsTo: "fin-dir" }
  ]
}
