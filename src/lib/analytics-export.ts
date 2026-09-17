import {parseAnalytics,type AnalyticsReport,type AnalyticsCounters,type AnalyticsMetrics} from './analytics-client.ts';
const cell=(value:string|number|null)=>{let s=value===null?'Нет подтверждённых данных':String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'');if(/^[\s\uFEFF]*[=+@-]/u.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
const rub=(v:number|null)=>v===null?null:(v/100).toFixed(2).replace('.',',');
const headers=['Заказы','Оплаченные заказы','Оплаченные товары, руб. (до возвратов)','Продано, шт.','Отмены','Возвращено/невыкуплено, шт.','Возврат товаров, руб.','Показы','Просмотры карточки','Клики по карточке','Добавления в корзину','Начало оформления'];
const values=(p:AnalyticsCounters)=>([p.orders,p.paidOrders,rub(p.salesMinor),p.units,p.cancelled,p.returnedUnits,rub(p.returnedMinor),p.impressions,p.opens,p.clicks,p.adds,p.checkouts]);
const extended=['CTR, %','Корзина / просмотры, %','Оплаченные заказы / просмотры, %','Средняя цена продажи, руб.','Средний оплаченный заказ, руб.'];
const metrics=(p:AnalyticsMetrics)=>[p.ctr,p.addRate,p.paidConversion,rub(p.averagePriceMinor),rub(p.aovMinor)];
export function analyticsExport(raw:AnalyticsReport,kind:'summary'|'daily'|'products'){
 const d=parseAnalytics(raw),p=d.period;
 const meta=[p.from,p.to,'Europe/Moscow',p.sku,p.search,p.category,d.generatedAt,'Заказы по дате создания; оплаченная стоимость товаров до возвратов, без доставки; фронтенд: одна сессия/SKU/тип за 30 минут; частичный денежный возврат без товарной разбивки не распределяется'];
 const metaHeaders=['Период с','Период по','Часовой пояс','SKU фильтр','Поиск','Категория фильтр','Сформировано','Правила расчёта'];
 let rows:Array<Array<string|number|null>>;
 if(kind==='daily')rows=[['Дата',...headers,...metaHeaders],...d.daily.map(v=>[v.date,...values(v),...meta])];
 else if(kind==='products')rows=[['SKU (текст)','Товар','Категория',...headers,...extended,...metaHeaders],...d.products.map(v=>["'"+v.sku,v.name,v.category??'Неизвестна',...values(v),...metrics(v),...meta])];
 else if(kind==='summary')rows=[[...headers,...extended,'Подтверждённые денежные возвраты выбранных заказов, включая доставку, руб.','Заказы без суммы возврата',...metaHeaders],[...values(d.summary),...metrics(d.summary),rub(d.quality.confirmedRefundMinor),d.quality.unknownRefundOrders,...meta]];
 else throw Error('INVALID_REPORT');
 return {filename:`ASAYA-${kind}-${p.from}-${p.to}.csv`,content:'\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n')+'\r\n'};
}
