# RoleBot (clean build)

Функции:
- Ежедневные задачи (каждый день)
- Перенос невыполненных задач на следующий день
- Назначение задач (списком/одна/голос/медиа)
- Экспорт XLSX/PDF
- Команды админа: /admins, /addadmin <id>, /rmadmin <id>, /daily_now

Запуск:
1) Скопируй `.env.example` в `.env` и поставь BOT_TOKEN.
2) npm i
3) npm run dev

Настройки — правь `INITIAL_ADMIN_IDS`, `EXECUTORS`, `DAILY_TEMPLATES_BY_DAY` в `src/index.js`.
