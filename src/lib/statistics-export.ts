import {parseStatistics,type Statistics} from './admin-statistics-client.ts';
export type StatisticsReport='daily'|'top-products';
const cell=(raw:string|number)=>{
 let text=String(raw).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'');
 // Spreadsheet formulas remain plain text even after leading whitespace.
 if(/^[\s\uFEFF]*[=+@-]/u.test(text))text="'"+text;
 return '"'+text.replaceAll('"','""')+'"';
};
const rubles=(minor:number)=>Math.floor(minor/100)+','+String(minor%100).padStart(2,'0');
export function statisticsExport(raw:Statistics,kind:StatisticsReport){
 const data=parseStatistics(raw),from=data.daily[0].date,to=data.daily.at(-1)!.date;
 const rule='Оплаченные заказы без отмен, возвратов и отказов; без доставки; по дате создания заказа';
 const meta=[from,to,'Europe/Moscow',data.generatedAt,rule];
 const headers=['Период с','Период по','Часовой пояс периода','Сформировано (ISO 8601)','Правила расчёта продаж'];
 let rows:Array<Array<string|number>>;
 if(kind==='daily')rows=[['Дата','Все заказы','Продажи товаров, руб.','Продано, шт.',...headers],...data.daily.map(d=>[d.date,d.orders,rubles(d.salesMinor),d.units,...meta])];
 else if(kind==='top-products')rows=[['Место','Артикул (текст)','Товар','Продано, шт.','Продажи товаров, руб.',...headers],...data.topProducts.map((p,i)=>[i+1,"'"+p.sku,p.name,p.units,rubles(p.salesMinor),...meta])];
 else throw new Error('INVALID_REPORT');
 return {filename:`ASAYA-${kind}-${from}-${to}.csv`,content:'\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n')+'\r\n'};
}
