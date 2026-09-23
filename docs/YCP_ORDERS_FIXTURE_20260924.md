# YCP orders: закрытие failing suite, 24.09.2026

Причина — устаревшая цена в общем fixture, не regression production handlers.

## Exact failure
`backend/tests/ycp-orders.test.ts` до правки: fixture строка 28, `await checkout.create(...)`. Первый воспроизведённый test: `admin sees review signals by order without queue secrets; processing an event does not imply resolution` (строка 35). В compiled stack: test 36, fixture 30, `ycp-checkout.js:101:23`.
Это **не failed assertion**: setup бросал YcpConflict до assertions теста. HTTP-equivalent 409, code INVENTORY_CHANGED, checkout_canceled=false. Все 19 исходных тестов вызывали этот fixture и останавливались там же.

## Contract и доказательство
В fixture YCP-A ×2 + YCP-B ×1, canonical base/current 10000 коп. за единицу. Live Marketing по утверждённому правилу 3+ применяет 10% quantity discount. Корректные redirect/checkout final_price: 90 ₽; subtotal 27000 коп. Старый fixture передавал final_price=100 ₽ для обеих строк.
`YcpCheckout.create` вызывает `priceRows` и сравнивает входящую цену с canonical рассчитанной ценой. Отказ защищает от несовпадающей корзины и корректен. Новый негативный test проверяет exact response items: regular_price=100, final_price=90; после отказа 0 orders, 0 reservations и inventory 10/0.
`git diff 867b260af42877525740b4269a9583d6492a8848 HEAD -- backend/src/ycp-checkout.ts backend/src/ycp-orders.ts backend/src/cart-pricing.ts backend/src/marketing.ts` до test commit пустой: эти production handlers совпадают с последним проверенным production image revision. Это исключает regression в этих файлах из текущего пакета. Успешный suite не заменяет реальный provider E2E: отсутствие production CDEK tracking остаётся отдельным gap аудита.

## Минимальная правка
Только `backend/tests/ycp-orders.test.ts`: final_price fixture 100 → 90; literal expectations для persisted subtotal/line prices; негативный test старой цены. Значения не вычисляются тестом через production priceRows, чтобы regression расчёта не скрывался самопроверкой. Ни одного теста не удалено/не skipped. Production code/config/migrations не менялись.

## Результат
Backend TypeScript build прошёл. `node --test dist/tests/ycp-orders.test.js`: **20/20 passed, 0 failed, 0 skipped**. Включены online/COD, full/partial delivery, cancellation, concurrency, rollback, auth/account scope и tracing.
Локальные логи: outputs/specs-20260923-next/ycp-orders-before.log и ycp-orders-after.log. Только временная локальная БД; без deploy, реальных SMS, оплат и CDEK requests.

## Исходные 19 tests (все восстановлены)
- admin sees review signals by order without queue secrets; processing an event does not imply resolution
- YCP reflects a corrected CDEK status without resurrecting a deleted delivered event from legacy history
- YCP order projection is account scoped, always starts with new and contains no customer or payment details
- YCP full delivery consumes stock exactly once and repeated messages leave payments and history unchanged
- YCP partial delivery records refused quantities and queues review without restocking or inventing a refund
- YCP delivery after manual dispatch never consumes the same stock twice
- YCP pre-dispatch cancellation releases once and keeps payment facts for refund review
- YCP cancellation of dispatched goods does not put an in-transit parcel back into stock
- YCP cancellation of an unpaid placed order cancels payment expectation and old cancellation counters project correctly
- YCP cash on delivery completion requires payment reconciliation and full refusal is representable
- YCP validation rejects unknown or excessive purchases, duplicates and released reservations without mutation
- YCP concurrent cancellation and delivery serialize into one valid final outcome
- YCP delivery and order cancellation are fully rolled back if audit recording fails
- YCP order HTTP requires Bearer before parsing, protects account scope and returns contract fields
- confirmed COD can be packed and dispatched once without inventing payment
- unconfirmed, wrong environment, online and failed payments cannot use COD fulfilment
- integration issues are admin-only, paginated, filterable and never expose queue secrets
- YCP trace scopes order resolution and hides raw incoming identifiers including unresolved failures
- HTTP request tracing uses fresh server IDs, correlates authenticated callbacks and ignores spoofed IDs
