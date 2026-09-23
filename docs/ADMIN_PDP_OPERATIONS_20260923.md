# Admin / PDP — 23.09.2026

Выполнены четыре ТЗ: PDP Final Corrections; Product Editor Rich Content UX Visibility; Admin Prices; Admin Merchandising UX. Без deploy.

## Изменения
- Product Editor: подтверждаемое сохранение применяет контент опубликованного товара сразу; скрытый остаётся скрытым, новый черновик — черновиком. Publish/Hide управляют видимостью и недоступны при несохранённых изменениях. Это намеренное изменение прежнего Save ≠ Publish по новому ТЗ. Старый draft-only API оставлен совместимым для существующих инструментов.
- Rich Content: отдельные accordion-карточки, общая и индивидуальная видимость, добавление скрытого блока с раскрытием. Скрытие не уничтожает содержимое. Legacy поля отдельно. Рекомендации больше не редактируются в Rich Content; прежние данные не удалены.
- Цены: отдельный раздел, фильтры и сортировки, явное сохранение строки; canonical product_prices и существующая одиночная метка. Остальное содержимое draft/published не переписывается.
- Выдача: шесть вкладок, библиотека Published товаров, drag-and-drop с вставкой, перемещение кнопками, категории, поиск, запрет дублей, явное сохранение и revision/CSRF/manager permissions.
- Рекомендации: центральные приоритеты, общая логика PDP/корзины, paid-sales ranking и fallback по категориям; исключены отсутствующие, скрытые, текущий товар и товары корзины. Четыре видимых desktop позиции, остальные в ленте.
- Product Editor: независимая прокрутка списка; выбор открывает редактор в видимой области. Остатки: поиск, категории, нулевые/положительные/отсутствующие записи, сортировки.
- PDP: сохранён уже реализованный порядок top → reviews → rich content → recommendations → footer, lazy variants и mobile steps rail. Исправлен случай резкой прокрутки мимо основной CTA.

## Проверки
- Backend: admin-operations (3), pdp-content (4), ранее запущенный admin (14) — проходят на временной БД.
- Frontend: admin-client, cart-presentation, merchandising, pdp-presentation, product-placement — 16 проходят.
- Typecheck, backend build, Next production build --webpack — проходят.
- Локальный браузер под manager: цена/метка, порядок, drag-and-drop, приоритет, поиск, Published/Hidden/Draft Save, видимость Rich Content после reload; фильтры zero/missing stock. Все проверки без production mutations.
- PDP 1440 desktop / 390 mobile: порядок, отсутствие горизонтального overflow страницы, lazy images, steps horizontal rail, sticky hidden at top / shown after CTA / hidden on return. Console errors не обнаружены.
- Локальный HTTP byte meter: desktop initial images 750272 B; после просмотра 911511 B. Mobile initial 449398 B; суммарно уникальные image responses за проверку с reload/full-page capture 1080880 B (включает варианты после capture; не чистый single-navigation total). Это размеры image response bodies, не Core Web Vitals. Скриншоты и JSON измерений сохранены в workspace outputs/admin-operations.

## Будущий rollout
Migration: backend/migrations/039_merchandising.sql, затем согласованно API + Admin + storefront. Миграция создаёт merchandising и переносит существующий порядок; цены, stock, публикации, YCP/CDEK не меняет. Secrets/workers не требуются. Production не менялся.
