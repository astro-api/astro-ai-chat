# Design: Автоматический CHANGELOG через release-please

**Дата:** 2026-06-26
**Статус:** одобрено к реализации

## Проблема

Сейчас в проекте нет автоматического чанжлога:

- Файл `CHANGELOG.md` отсутствует.
- Версия в `package.json` бампается вручную коммитом вида `1.0.1`.
- Тег `vX.Y.Z` ставится вручную; его push триггерит `.github/workflows/release.yml`.
- Тело GitHub Release — **статичный хардкод-шаблон** в `release.yml` (таблица установки + ссылки на API-ключи), одинаковый для каждого релиза. Список изменений между версиями нигде не показывается.

Коммиты уже пишутся в формате conventional commits (`feat:`, `fix:`, `docs:`, …), но эта информация никак не агрегируется.

## Цель

Внедрить **release-please** (`googleapis/release-please-action@v4`), который:

- агрегирует conventional commits и ведёт `CHANGELOG.md` в репозитории;
- автоматически бампает версию в `package.json`;
- создаёт GitHub Release с телом из CHANGELOG и тег `vX.Y.Z`.

Существующий `release.yml` остаётся «сборщиком артефактов»: срабатывает на готовый тег и **дописывает** установочные файлы к уже созданному релизу.

## Архитектура и поток

```
PR с conventional commits → merge в main
        │
        ▼
[release-please.yml]  ← новый workflow, on: push to main
        │  агрегирует feat/fix/... с прошлого релиза
        │  открывает/обновляет "release PR" (бамп version в package.json + CHANGELOG.md)
        ▼
   merge release-PR
        │  release-please создаёт GitHub Release + тег vX.Y.Z, пишет тело из CHANGELOG
        ▼
[release.yml]  ← существующий, on: push tag 'v*' — логику сборки НЕ трогаем
        │  собирает .pkg/.dmg/.exe/.AppImage/.deb
        ▼
   дописывает артефакты к уже созданному релизу (тому же тегу)
```

Ключевая идея: **release-please владеет версией, CHANGELOG.md, релизом и тегом.** `release.yml` владеет только сборкой и аттачем артефактов. Ручной бамп `package.json` и ручная простановка тегов больше не нужны.

## Компоненты

| Файл | Действие | Назначение |
|---|---|---|
| `.github/workflows/release-please.yml` | создать | `on: push: branches: [main]`. Запускает `googleapis/release-please-action@v4`. Владеет версией, CHANGELOG.md, релизом и тегом. |
| `release-please-config.json` | создать | `release-type: node`, секции CHANGELOG, `include-v-in-tag: true` → тег `vX.Y.Z`. |
| `.release-please-manifest.json` | создать | `{ ".": "1.0.1" }` — фиксирует текущую версию как стартовую, чтобы следующий релиз был `1.0.2`/`1.1.0`. |
| `.github/workflows/release.yml` | изменить | Только job `release`: `action-gh-release` переводим в режим «дописать артефакты к существующему релизу». Build-джобы (mac/win/linux) — без изменений. |
| `CLAUDE.md` | изменить | Короткая заметка про новый релизный флоу. |

`CHANGELOG.md` вручную **не создаём** — его создаст и будет вести release-please в первом release-PR.

### release-please-config.json

- `release-type: node` — читает и пишет `version` в `package.json`.
- `include-v-in-tag: true` — формат тега `vX.Y.Z` (совместимо с триггером `release.yml` `on: push: tags: ['v*']`).
- Секции changelog (видимые): `feat` → Features, `fix` → Bug Fixes, `perf` → Performance, `refactor` → Refactors, `docs` → Documentation, `chore` → Miscellaneous. (`docs`/`chore`/`refactor`/`perf` включаем как отдельные секции — полезно для desktop-проекта.)
- Тело GitHub Release = **чистый changelog**. Никакой пост-обработки/footer. Инструкция по установке остаётся в README.

### .github/workflows/release-please.yml

```yaml
name: release-please
on:
  push:
    branches: [main]
permissions:
  contents: write
  pull-requests: write
jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
```

### Изменение release.yml (job `release`)

Текущий шаг создаёт релиз со статичным телом. Переводим в режим аттача к уже существующему релизу:

```yaml
- name: Attach installers to release
  uses: softprops/action-gh-release@v2
  with:
    files: artifacts/**/*
    fail_on_unmatched_files: false
    # name/body/draft/prerelease УБИРАЕМ — релиз и его тело уже созданы release-please из CHANGELOG
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Убираем: `name:`, весь блок `body:` (таблица установки/API-ключей), `draft:`, `prerelease:`. `softprops/action-gh-release@v2` матчит существующий релиз по тегу и дописывает `files`, не трогая тело, если `body` не передан. Build-джобы (`build-mac`, `build-windows`, `build-linux`) не меняются.

## Риски и edge-cases

1. **Default branch.** Конфиги и worktree сейчас на ветке `claude/...`, release-please слушает `main`. Изменения должны попасть в `main` (через PR), иначе ничего не сработает.
2. **Стартовая версия.** `.release-please-manifest.json` = `1.0.1`. Первый merged release-PR даст `1.0.2` (только fix) или `1.1.0` (есть feat). Прошлые коммиты release-please задним числом **не** пересчитывает — changelog начнётся с изменений после внедрения. Ожидаемо.
3. **Гонка двух workflow.** release-please создаёт релиз+тег → push тега триггерит `release.yml` → артефакты дописываются к уже существующему релизу. `action-gh-release` без `body` не перезатирает notes (матч по тегу, мердж files).
4. **prerelease.** Логика `prerelease: contains(ref_name, '-')` уходит. release-please сам помечает пререлизы по версии (`1.0.0-rc.1`). Для текущего проекта приемлемо — пререлизов нет.
5. **Права токена (предусловие репозитория).** Нужны `contents: write` + `pull-requests: write`. В Settings → Actions → General репозитория должна быть включена опция «Allow GitHub Actions to create and approve pull requests», иначе release-please не сможет открыть release-PR. Это настройка репо, не код.

## Тестирование

- YAML-линт обоих workflow.
- Валидация JSON-схемы `release-please-config.json` и `.release-please-manifest.json` (корректный `release-type`, наличие записи `"."`).
- Diff `release.yml` затрагивает только job `release` — build-джобы без изменений.
- Реальная проверка флоу — только после merge в `main`: должен создаться release-PR. Ручной шаг для владельца репозитория.

## Вне scope

- Перенос инструкции по установке из README в тело релиза (решено: остаётся в README).
- Подписанные/нотаризованные сборки.
- Монорепо/несколько пакетов (проект — один пакет).
