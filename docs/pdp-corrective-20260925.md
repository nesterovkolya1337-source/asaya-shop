# PDP corrective pass — 2026-09-25

No deploy. Product info follows the approved mockup; equal CTA geometry, no internal scroll, Gramatika. New unavailable products display Скоро without changing eligibility.

How-to corrections use current Figma frames; six guarded data patches, shared clipped media viewport and aligned captions. No new rich sections. Mask_Spray intentionally has no source image in slots 2/3. Body creams excluded.

- 1S-BA-02-02: Gel1 `440:2890` — Исправлены изображения и геометрия 4 шагов.
- 1S-HK-01: Shampoo `527:5280` — Восстановлены изображения шагов, выровнены media/captions.
- 1S-HK-02: Multi_Spray `520:1929` — Исправлены исходные изображения, crop/scale и высоты карточек.
- 1S-HK-03: Balm `523:4499` — Исправлены исходные изображения и геометрия шагов.
- 1S-HK-04: Mask_Spray `523:3742` — Исправлены 1/4 media, размеры и текст шага 2 по Figma. В шагах 2/3 в самой актуальной Figma нет изображений — оставлены пустые media-слоты; изображения не придуманы.
- 1S-BA-02-01: Gel4 `457:4920` — В первом шаге вместо изображения соседнего шага восстановлен оригинальный розовый флакон. Геометрия приведена к Figma.
- 1S-HK-05: Mask `530:5905` — Проверено отдельно; данные не менялись, применяется общий renderer.
- 1S-BA-02-04: Gel3 `457:4268` — Проверено отдельно; данные не менялись.
- 1S-BA-02-03: Gel5 `457:5317` — Проверено отдельно; данные не менялись.
- 1S-BA-02-05: Gel2 `457:3502` — Проверено отдельно; данные не менялись.
- 1S-FL-01: Glow_Cream_Face `511:3538` — Проверены существующие опубликованные блоки. Отсутствующий how-to не добавлялся.
- 1S-FL-02: Lift_Cream_Face `504:1878` — Проверены существующие опубликованные блоки. Отсутствующий how-to не добавлялся.

Validation: 4 frontend tests + 6 backend correction tests, backend build, Next webpack production build/typecheck. Desktop 1440/mobile 390 screenshots: outputs/pdp-final-corrective-20260925/index.html (workspace artifact).

Future release requires explicit guarded data correction in addition to frontend assets. From backend cwd: DATABASE_URL and ADMIN_ACTOR_ID, node dist/scripts/correct-pdp-howto.js (dry-run); append --apply only for authorized content rollout. No schema migration or startup mutation. Manager content conflicts are skipped and reported. Production has not been changed.
