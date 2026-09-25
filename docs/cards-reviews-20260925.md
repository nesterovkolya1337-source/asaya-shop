# ASAYA — asaya_tz (1).docx

Без deploy. Изменены только storefront presentation components.

## Выполнено
- ProductCard: нормальный поток media → rating → title → price → action вместо наложения absolute зон. Shared rule для всех SKU; contain, крупное фото, равные высоты, title clamp 2. Каталог: 3 desktop / 2 mobile. На 390px ширина карточки 173.6px, высота 368.5px, зазор media/rating 10px.
- ProductRating: общий компонент; рейтинг над названием в карточках и PDP, compact mobile count без слова «отзывов».
- PDP benefits: desktop строка без переноса; измеренная высота каждого benefit 18.9px.
- ProductReviews в customer-engagement: Figma 440:2930 (9FHGMEfYWtTfWq9Ny2jxMg), серый фон, aggregate/divider, две desktop колонки, mobile одна колонка; один видимый отзыв, native horizontal scroll-snap, стрелки; существующая API pagination сохраняется, следующая страница загружается стрелкой. Автор/дата/текст не менялись; body в «Достоинства», «Недостатки — Нет», ответ ASAYA внутри карточки; skin type отсутствует. Empty state сохранён.
- CatalogView: rounded sorting disclosure с прежними 4 значениями и прежним comparator, Escape/focus; отдельный control раскрывает существующие category filters. Filtering/query logic не менялась.

## Representative checks
1. Desktop catalog: 3 одинаковые карточки, normal-flow separation.
2. Mobile 390 catalog: 2 карточки, длинное название, compact rating; page scrollWidth 375 при viewport 390.
3. Sorting: раскрытие, смена на Сначала дешевле, порядок цен 525 → 690; исходные варианты сохранены.
4. PDP header: rating выше h1, benefits без переноса.
5. Desktop reviews: стрелка 1→2, виден один отзыв, официальный ответ внутри.
6. Mobile reviews: горизонтальный scroll gesture 0→323.2 при ширине rail 323px; page overflow отсутствует.
7. Recommendations desktop/mobile: тот же компонент, зазор media/content 12/10px, ровная высота; алгоритм и controls не менялись.

## Ограничение / NOT DONE
В исходном коде desktop recommendation rail фактически показывает 4 карточки (правило product-view.module.css), хотя ТЗ называет текущую раскладку «3 карточки». Сохранены существующие ширины и rail behavior согласно прямому запрету менять их; на 3 карточки recommendations не переведены. Каталог соответствует 3/2. Mobile recommendations сохраняют существующий horizontal rail, не заменены отдельной grid. Это единственное расхождение по числу карточек; shared card overlap исправлен.

## Validation
- Targeted tests catalog + pdp-presentation: 8/8.
- Next build --webpack + встроенный TypeScript: PASS (63 pages).
- Отдельный tsc --noEmit: PASS.
- git diff --check: PASS.
- При browser check обнаружен старый локальный CSS cache; чистая сборка подтвердила новые normal-flow styles. Production не затрагивался.
- Только локальный preview с уже существующей временной БД; backend/Admin/reviews data/stock/checkout не изменялись.

## Evidence
outputs/cards-reviews-20260925/index.html — 6 обязательных screenshots + recommendations desktop/mobile.

Shared files: product-card.tsx/.module.css, product-rating.tsx/.module.css, product-view.tsx/.module.css, customer-engagement.tsx, product-reviews.module.css, catalog-view.tsx/.module.css.
