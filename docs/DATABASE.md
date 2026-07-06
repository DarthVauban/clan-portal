# База данных предметов

## Запуск

PostgreSQL 17 запускается сервисом `db` из `compose.yaml`. Веб-приложение ожидает успешную проверку состояния БД, после чего перед стартом сервера выполняет:

```text
node scripts/migrate-and-seed.mjs
```

Скрипт последовательно применяет SQL-файлы из `database/migrations`, фиксирует имя и SHA-256 каждой миграции в `schema_migrations` и не применяет уже выполненные миграции повторно.

## Первичный импорт

Файлы `corepunk-items.json`, русская локализация и словарь используются только как источник первичного заполнения. Хэш источников хранится в `corepunk_datasets`. Если данные не изменились, повторный запуск пропускает импорт.

После импорта интерфейс базы знаний, карточки предметов, список ресурсов и калькулятор крафта получают данные из PostgreSQL.

## Основные таблицы

- `corepunk_items` — предметы, варианты качества, русские и английские тексты;
- `corepunk_item_ingredients` — базовые компоненты предметов;
- `corepunk_item_recipes` и `corepunk_recipe_ingredients` — варианты рецептов и их компоненты;
- `corepunk_item_stats` и `corepunk_item_secondary_stats` — характеристики;
- `corepunk_item_modifications`, `corepunk_item_tags`, `corepunk_item_special_effects`, `corepunk_item_prices` — дополнительные данные карточек;
- `corepunk_media_assets` — локальные пути и метаданные иконок;
- `corepunk_relation_targets` и `corepunk_relation_edges` — связи между предметами;
- `corepunk_datasets` — версия и контрольный хэш импорта;
- `schema_migrations` — журнал применённых миграций.

Оригинальная запись также хранится в `corepunk_items.raw_data`, чтобы новые поля источника не терялись до появления отдельной миграции.
