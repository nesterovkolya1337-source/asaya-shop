export const orderStatuses = [
  { id: "created", label: "Создан" },
  { id: "awaiting_payment", label: "Ждёт оплату" },
  { id: "paid", label: "Оплачен" },
  { id: "fulfillment_pending", label: "Ждёт передачи на склад" },
  { id: "sent_to_fulfillment", label: "Передан на склад" },
  { id: "assembling", label: "Собирается" },
  { id: "shipped", label: "Отправлен" },
  { id: "delivered", label: "Доставлен" },
  { id: "cancelled", label: "Отменён" },
] as const;

export const integrationReadiness = [
  {
    name: "Витрина и корзина",
    status: "ready",
    label: "Готово для проверки",
    detail: "Каталог, карточки, корзина и checkout работают в демонстрационном режиме.",
  },
  {
    name: "Сервер и база заказов",
    status: "waiting",
    label: "Нужен production-сервер",
    detail: "Заказ должен сохраняться в базе ASAYA до обращения к оплате и фулфилменту.",
  },
  {
    name: "СДЭК",
    status: "waiting",
    label: "Нужны договор и API-доступ",
    detail: "Подключается официальный виджет ПВЗ, серверный расчёт тарифа и проверка выбранного пункта.",
  },
  {
    name: "Оплата",
    status: "waiting",
    label: "Нужно выбрать провайдера",
    detail: "Robokassa и CloudPayments изучены как варианты. Подключаем один после получения тестовых ключей.",
  },
  {
    name: "СДЭК Фулфилмент",
    status: "waiting",
    label: "Нужна документация по договору",
    detail: "Доставка и складской фулфилмент остаются двумя отдельными интеграциями.",
  },
] as const;

