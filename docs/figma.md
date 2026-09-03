# Figma source map

Основной дизайн: [Website Copy — Page 2](https://www.figma.com/design/4w8Dr2nHxdoxu6uOGmAtYR/Website--Copy-?node-id=1-2)

| Экран | Figma node | Ссылка | Маршрут |
| --- | --- | --- | --- |
| Page 2 canvas | `1:2` | [Page 2](https://www.figma.com/design/4w8Dr2nHxdoxu6uOGmAtYR/Website--Copy-?node-id=1-2) | — |
| Галерея крема с кокосом | `21:72` (`Frame 24`) | [Frame 24](https://www.figma.com/design/4w8Dr2nHxdoxu6uOGmAtYR/Website--Copy-?node-id=21-72) | `/product/coconut-body-cream` |
| Галерея крема с авокадо | `146:4027` | [Frame](https://www.figma.com/design/4w8Dr2nHxdoxu6uOGmAtYR/Website--Copy-?node-id=146-4027) | `/product/avocado-body-cream` |
| Галерея бальзама | `97:1906` | [Frame](https://www.figma.com/design/4w8Dr2nHxdoxu6uOGmAtYR/Website--Copy-?node-id=97-1906) | `/product/hair-balm` |
| Галерея маски | `146:4087` | [Frame](https://www.figma.com/design/4w8Dr2nHxdoxu6uOGmAtYR/Website--Copy-?node-id=146-4087) | `/product/hair-mask` |
| Галерея шампуня | `146:4229` | [Frame](https://www.figma.com/design/4w8Dr2nHxdoxu6uOGmAtYR/Website--Copy-?node-id=146-4229) | `/product/hair-shampoo` |
| Галерея мульти-спрея | `146:5078` | [Frame](https://www.figma.com/design/4w8Dr2nHxdoxu6uOGmAtYR/Website--Copy-?node-id=146-5078) | `/product/multi-hair-spray` |
| Галерея крем-спрея | `146:5238` | [Frame](https://www.figma.com/design/4w8Dr2nHxdoxu6uOGmAtYR/Website--Copy-?node-id=146-5238) | `/product/hair-cream-spray` |
| Главная | `1:6` (`Frame 6`) | [Frame 6](https://www.figma.com/design/4w8Dr2nHxdoxu6uOGmAtYR/Website--Copy-?node-id=1-6) | `/` |
| Каталог | `140:1442` (`All shop`) | [All shop](https://www.figma.com/design/4w8Dr2nHxdoxu6uOGmAtYR/Website--Copy-?node-id=140-1442) | `/catalog` |
| Волосы | `92:2417` (`Hair`) | [Hair](https://www.figma.com/design/4w8Dr2nHxdoxu6uOGmAtYR/Website--Copy-?node-id=92-2417) | `/catalog?category=hair` |
| Тело | `92:1383` (`Body`) | [Body](https://www.figma.com/design/4w8Dr2nHxdoxu6uOGmAtYR/Website--Copy-?node-id=92-1383) | `/catalog?category=body` |
| Лицо | `92:3305` (`Face`) | [Face](https://www.figma.com/design/4w8Dr2nHxdoxu6uOGmAtYR/Website--Copy-?node-id=92-3305) | `/catalog?category=face` |
| Наборы | `137:860` (`Sets`) | [Sets](https://www.figma.com/design/4w8Dr2nHxdoxu6uOGmAtYR/Website--Copy-?node-id=137-860) | `/catalog?category=sets` |
| Корзина | `97:1997` (`Frame 88`) | [Cart](https://www.figma.com/design/4w8Dr2nHxdoxu6uOGmAtYR/Website--Copy-?node-id=97-1997) | `/cart` |
| Оформление заказа | `110:1236` (`Frame 7790`) | [Checkout](https://www.figma.com/design/4w8Dr2nHxdoxu6uOGmAtYR/Website--Copy-?node-id=110-1236) | `/checkout` |
| Пустое избранное | `113:1776` (`Frame 7793`) | [Empty favorites](https://www.figma.com/design/4w8Dr2nHxdoxu6uOGmAtYR/Website--Copy-?node-id=113-1776) | `/favorites` |
| Избранное | `114:1940` (`Frame 7795`) | [Favorites](https://www.figma.com/design/4w8Dr2nHxdoxu6uOGmAtYR/Website--Copy-?node-id=114-1940) | `/favorites` |

## Подтверждённые токены

- `Color/Pink`: `#FFCFEB`
- `Color/Black`: `#202020`
- `Color/Gray`: `#9C9C9B`
- `Color/Light grey`: `#F0F0F0`
- Основной шрифт: Involve
- Скругление основных карточек: 10 px

## Правило работы с ассетами

Ссылки `figma.com/api/mcp/asset/...` временные. Перед использованием в коде изображения и иконки нужно скачать без изменений и сохранить в `public/images` или `public/icons`.

На Page 2 отдельные четырёхкадровые продуктовые галереи собраны для семи товаров. Для остальных товаров сайт использует точный packshot из Page 2 и дополнительные реальные кадры из соответствующих разделов Page 2; сгенерированных банок в каталоге нет.
