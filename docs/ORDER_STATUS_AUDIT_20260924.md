# Статусы Yandex → ASAYA → CDEK → Account: read-only audit

Проверено 23–24 сентября 2026. По этому ТЗ код, migrations, secrets/config, подписки webhook и production не менялись. Изменения в общей ветке относятся только к трём другим одновременно заказанным ТЗ.

## Exact production
| Сервис | Image revision | Health |
|---|---|---|
| API | 867b260af42877525740b4269a9583d6492a8848 | healthy |
| Storefront | 867b260af42877525740b4269a9583d6492a8848 | healthy |
| Admin | 8c9bb3a5f21cbac40161d101aa5def978c255ca4 | healthy |

Источник: docker inspect image labels и read-only SQL. В production **0 orders, 0 ycp_sessions**. В доступных JSON logs за 24h не обнаружено записей checkout/orders/CDEK; request logging отключён в приложении, поэтому отсутствие записей НЕ доказывает отсутствие запросов/401/404/500. Реальная provider delivery не подтверждена.

## Yandex — IMPLEMENTED_NOT_VERIFIED
`backend/src/app.ts`: одинаковые Bearer-protected routes под `/api/v1` и `/api/ycp/v1`:
- POST `/checkout` → `YcpCheckout.create`: проверяет canonical цену/остаток, создаёт draft/pending order и reserve.
- POST `/checkout/placed` → `YcpCheckout.placed`: online означает paid; сохраняет payment row, order=placed, историю. COD не превращается в paid.
- POST `/checkout/cancel`, GET `/order`, POST `/order/delivered`, POST `/order/cancel` → существующие YCP handlers.

Корреляция create/placed: `(account_id, environment, session_id)` в `ycp_sessions` → `orders.id`; после placed также external order_id/order_number. `acquiring_id` optional: внутренний reference `placement:order_id` не выдаётся за ID эквайринга. Request/placement hash + transaction locks исключают повторное применение callback, несовпадающий replay даёт conflict. Orders, payments, order_status_history, integration inbox/outbox сохраняют факты. CloudKassir не является источником оплаты.

`YCP_SETTINGS_FILE` и `YCP_TOKEN` присутствуют в production; значений в отчёте нет. Фактический оплаченный callback на production ещё не доказан. Наличие handlers само по себе не означает готовую end-to-end интеграцию.

## CDEK — BLOCKED на production, локальная push-цепочка WORKING
`POST /api/integrations/cdek/:key` создаётся только при `options.cdekTracking`. `cdekTrackingFromEnv` по умолчанию выключен. В production container env отсутствуют tracking keys; присутствует только независимый `CDEK_STOCK_SETTINGS_FILE`. Следовательно stock sync НЕ включает order webhook, tracking handler сейчас не смонтирован.

Для существующей реализации нужны `CDEK_TRACKING_ENABLED`, `CDEK_API_ACCOUNT`, `CDEK_CLIENT_ID`, `CDEK_CLIENT_SECRET`, `CDEK_ENVIRONMENT`, независимый `CDEK_WEBHOOK_SECRET`; provider подписка на правильный URL отдельно не подтверждена. Ничего из этого не включалось и не регистрировалось.

`OrderTracking.webhook` → `applyCdekPush` (`backend/src/cdek-push.ts`): `attributes.number` точно совпадает с ASAYA `orders.public_number`; дополнительно account/environment, placed YCP session, service_type=cdek. Не phone/SKU/time heuristic. Неизвестный номер не создаёт order/shipment. UUID и tracking number сохраняются после корреляции и защищены от подмены. Event hash, inbox и upsert истории исключают повторный эффект; late/deleted events учитываются. Outgoing CDEK order creation не вызывается.

| CDEK code | ASAYA delivery |
|---|---|
| CREATED, ACCEPTED | created |
| RECEIVED_AT_SHIPMENT_WAREHOUSE | handed_to_cdek |
| ACCEPTED_AT_PICK_UP_POINT, POSTOMAT_POSTED | ready_for_pickup |
| TAKEN_BY_COURIER | out_for_delivery |
| DELIVERED, POSTOMAT_RECEIVED | delivered |
| NOT_DELIVERED, POSTOMAT_SEIZED | returning |
| REMOVED | cancelled |
| INVALID / unknown | review |
| transport/transit/customs codes из `cdek-status.ts` | in_transit |

Отдельного завершённого returned webhook mapping нет. Return/reverse/client_return события сейчас игнорируются; это PARTIAL, не подтверждённая обработка возвратов. FF warehouse statuses не доказываются delivery webhook; FF stock adapter не является источником сборки заказа.

## Account — IMPLEMENTED_NOT_VERIFIED в production
GET `/api/store/v1/orders` и `/orders/:id`: auth session → claimPhoneOrders только по SMS-verified identity → `CommerceService.orders/order`. Exact detail выбирается `id AND user_id`, чужой order=404. Источник UI — сохранённые server fields, не локальная имитация статусов.
`src/components/server-orders.tsx` показывает status/payment/delivery, историю с датами, tracking label/number, обновление `tracking.updatedAt`, плановую дату при наличии и ссылку на страницу трекинга CDEK (номер показан отдельно, ссылка без подстановки номера). При отсутствии tracking нет отдельного updatedAt для общего заказа, остаётся created_at/history.

## Доказательство на временной базе
Без внешних вызовов и настоящих SMS/платежей/отгрузок:
`audit-session` → `yandex-audit-order` → ASAYA `ASAYA-10001` (internal `0e222a2d-1092-4d2a-9d3f-c73ecc5692fb`) → CDEK `attributes.number=ASAYA-10001` → тот же Account order.
Вызваны реальные create/placed handlers, затем push DELIVERED и customer projection; результат `completed / paid / delivered`, «Получен», tracking `1234567890`. Повтор placed/push: 1 payment, 1 logistics event, 0 созданных shipments. Чужой user: ORDER_NOT_FOUND. Это fixture proof, **не production E2E**.

## Gaps и минимальные следующие действия
| Gap | Статус | Следующее действие (не выполнено) |
|---|---|---|
| CDEK tracking config/route отсутствуют | BLOCKED | Отдельно разрешить protected tracking config + проверку/регистрацию provider subscription |
| Нет реального Yandex placed и CDEK callback | IMPLEMENTED_NOT_VERIFIED | После настройки провести разрешённый реальный тест и сопоставить exact номера |
| Возвраты/reverse и FF assembly stages | PARTIAL | Отдельный контракт и ТЗ на недостающие состояния |
| Redemption intent не связан с финальным YCP order | BLOCKED | Получить подтверждённый сквозной идентификатор, не подменять корреляцию |
| Старый suite ycp-orders.test.ts падает на fixture create | PARTIAL (test coverage) | Fixture присылает 3 единицы по 100 ₽ при активной quantity скидке; согласовать fixture с canonical pricing отдельным исправлением |

Аудит не исправлял эти gaps. CDEK push suite 14 tests проходит; старый ycp-orders suite не считается успешно пройденным. STOP для audit-задачи.
