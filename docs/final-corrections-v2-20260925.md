# ASAYA Final Corrections v2 — scope freeze, 2026-09-25

Без deploy. База: 424a10156d3333f2dd01fa2243ebb24f3143b260.

## Выполнено
- Customer-facing typography: Involve VF / Oblique VF из предоставленного архива. Существующие файлы шрифта совпали с архивом; изменены ссылки CSS. В браузере computed font Involve на PDP, catalog, home, cart, account и delivery.
- Общие purchase actions: Quick Buy → Add/stepper; inline и floating используют ShopProvider. Третьего checkout action нет. Canonical checkout protocol не менялся.
- Одинаковые размеры CTA, центрированные desktop benefits; mobile sticky скрывается при возврате к inline CTA.
- Карточки: contain без сохранённого zoom/crop; прозрачные поля двух packshot-assets нормализованы через bounding frame. Геометрия карточки не меняется при Add.
- Recommendations: без Quick Buy/description; центрированный heading, горизонтальный rail, native touch-action. Добавленный товар остаётся на месте для управления shared-cart stepper.
- «Новинка» + недоступность отображается как «Скоро», покупка остаётся disabled.
- Desktop Rich Content: Involve/Oblique, разделители, типографическая иерархия, ширина текстовых колонок; существующие описания активов кремов для лица разделены на группы только при однозначном соответствии названиям. Canonical copy и published data не изменены. Mobile layout не переделан.

## Проверки
14/14 targeted tests: pdp-presentation, rich-desktop-presentation, cart-presentation, yandex-checkout.
Next production build --webpack и встроенный TypeScript check: PASS после последней правки.
git diff --check: PASS.
Browser 390: recommendation Add → 1 → 2, высота до/после 340 px, Quick Buy отсутствует, page overflow false.
Browser: inline/floating qty синхронны; sticky false → true → false при прокрутке/возврате. Rail scrollLeft 0 → 360, touch-action pan-x pan-y.

## Rich Content inventory
Все 12 опубликованных RC SKU просмотрены на desktop по индивидуальным Figma frames файла 9FHGMEfYWtTfWq9Ny2jxMg. Общие renderer-корректировки применены; отсутствие ещё не опубликованных блоков не исправлялось добавлением контента.

| SKU | Frame | Node |
|---|---|---|
|1S-BA-02-01|Gel4 / Marshmallow|457:4920|
|1S-BA-02-02|Gel1 / Guava|440:2890|
|1S-BA-02-03|Gel5 / Blueberry|457:5317|
|1S-BA-02-04|Gel3 / Kiwi|457:4268|
|1S-BA-02-05|Gel2 / Yuzu|457:3502|
|1S-FL-01|Glow_Cream_Face|511:3538|
|1S-FL-02|Lift_Cream_Face|504:1878|
|1S-HK-01|Shampoo|527:5280|
|1S-HK-02|Multi_Spray|520:1929|
|1S-HK-03|Balm|523:4499|
|1S-HK-04|Mask_Spray|523:3742|
|1S-HK-05|Mask|530:5905|

## Not addressed / follow-up
- Физический iPhone с пальцевым жестом не проверен: проверен 390px browser viewport и native horizontal scrolling.
- Отдельный итоговый сравнительный screenshot single / wide / 2-pack / 3-pack не завершён до scope freeze. Изменения framing реализованы; полную визуальную эквивалентность массы всех форм не заявляем.
- Figma и canonical claims некоторых hair/face блоков различаются. Существующие факты сохранены; полного текстового/пиксельного совпадения не заявляем. Дополнительная полировка прекращена по scope freeze.
- Длинные stitched screenshots браузера содержат артефакты повторных полос. Для отчёта выбраны обычные viewport screenshots.
- Новые аудиты, дополнительные улучшения, production deploy не выполнялись. Backend, migrations и production data не менялись.
