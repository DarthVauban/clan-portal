# Clan Portal

Стартовый каркас кланового портала Corepunk. Интерфейс проекта работает только на русском языке.

## Запуск через Docker Desktop

Убедитесь, что Docker Desktop запущен, затем выполните в PowerShell:

```powershell
docker compose -f "C:\Users\Dante\OneDrive\Рабочий стол\Clan-portal\compose.yaml" up -d --build
```

После запуска откройте `http://localhost:3000`.

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
pnpm dev
```

Рекомендуемый технологический стек и архитектурный подход описаны в [`docs/TECH_STACK.md`](docs/TECH_STACK.md).

Тестовый импорт предмета и его структура описаны в [`docs/ITEM_IMPORT.md`](docs/ITEM_IMPORT.md).

## Версия 1.0

- управление коллективами и их составом;
- база знаний по предметам;
- управление ресурсами;
- профиль пользователя;
- заявки на получение ресурсов;
- заявки на крафт предметов;
- калькулятор крафта.
