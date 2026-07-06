# Clan Portal

Стартовый каркас кланового портала Corepunk. Интерфейс проекта работает только на русском языке.

## Запуск через Docker Desktop

Убедитесь, что Docker Desktop запущен, затем выполните в PowerShell:

```powershell
docker compose -f "C:\Users\Dante\OneDrive\Рабочий стол\Clan-portal\compose.yaml" up -d --build
```

Docker Compose запускает веб-приложение и PostgreSQL. Перед стартом веб-сервера автоматически применяются SQL-миграции и импортируется актуальная база предметов. После запуска откройте `http://localhost:3000`.

Если порт `3000` занят, можно выбрать другой, например `3010`:

```powershell
$env:CLAN_PORT=3010
docker compose -f "C:\Users\Dante\OneDrive\Рабочий стол\Clan-portal\compose.yaml" up -d --build
```

Остановить контейнер:

```powershell
docker compose -f "C:\Users\Dante\OneDrive\Рабочий стол\Clan-portal\compose.yaml" down
```

## Локальный запуск без Docker

```powershell
pnpm install
$env:DATABASE_URL="postgresql://clan_portal:clan_portal_dev@localhost:5432/clan_portal"
pnpm dev
```

Миграции можно выполнить отдельно:

```powershell
pnpm db:migrate
```

Применённые миграции фиксируются в таблице `schema_migrations`. Повторный импорт выполняется только при изменении исходного набора предметов или локализации.

Рекомендуемый технологический стек и архитектурный подход описаны в [`docs/TECH_STACK.md`](docs/TECH_STACK.md).

Полный импорт базы предметов и его структура описаны в [`docs/ITEM_IMPORT.md`](docs/ITEM_IMPORT.md).

Схема PostgreSQL и порядок миграций описаны в [`docs/DATABASE.md`](docs/DATABASE.md).

Словарь и процесс русской локализации описаны в [`docs/LOCALIZATION.md`](docs/LOCALIZATION.md).

## Версия 1.0

- управление коллективами и их составом;
- база знаний по предметам;
- управление ресурсами;
- профиль пользователя;
- заявки на получение ресурсов;
- заявки на крафт предметов;
- калькулятор крафта.
