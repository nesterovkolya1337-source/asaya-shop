"use client";
import { useShop } from './shop-provider';
import { usePathname } from 'next/navigation';

export function CatalogStatus() {
 const {catalogStatus,products,reloadCatalog,checkoutEnabled,yandexCheckoutEnabled}=useShop();
 const pathname=usePathname();
 if(pathname==='/admin'||pathname.startsWith('/admin/'))return null;
 if(catalogStatus==='demo') return null;
 return <div role={catalogStatus==='error'?'alert':'status'} aria-live="polite" className="catalog-status">
  <p>{catalogStatus==='loading'?'Загружаем каталог…':catalogStatus==='error'?
   'Не удалось загрузить каталог. Попробуйте ещё раз.':products.length?
   yandexCheckoutEnabled?'Соберите корзину для оформления в Яндексе.':checkoutEnabled?'Тестовый режим: заказы сохраняются без реальной оплаты.':'Каталог доступен для просмотра. Оформление заказов пока закрыто.':'Товары готовятся к продаже. Каталог появится после обновления ассортимента.'}</p>
  {catalogStatus!=='loading' && <button type="button" onClick={reloadCatalog}>{catalogStatus==='error'?'Повторить':'Обновить каталог'}</button>}
 </div>;
}
