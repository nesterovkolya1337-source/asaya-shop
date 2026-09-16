'use strict';
const $=id=>document.getElementById(id);
let state=null,busy=false,pendingOrder=null;
const stockDraft=new Map(),basketDraft=new Map();
const messages={UNAUTHENTICATED:'Доступ завершён. Перезапусти тест и открой новую ссылку из PowerShell.',TEST_LINK_EXPIRED:'Ссылка уже использована. Открой тест в том же браузере или перезапусти его.',CSRF_REJECTED:'Обнови страницу и повтори действие.',STOCK_CONFLICT:'Остаток уже изменился. Нажми «Обновить данные» и проверь новое количество.',STOCK_RESERVED:'Количество не может быть меньше резерва. Сначала отмени соответствующий заказ.',INVENTORY_CHANGED:'Для такого заказа не хватает доступного остатка. Обнови данные и уменьши количество.',INSUFFICIENT_STOCK:'Для такого заказа не хватает доступного остатка.',CHECKOUT_CANCELLED:'Этот пробный заказ уже отменён.',ORDER_CANCELLED:'Этот пробный заказ уже отменён.',TEST_PAYMENT_REQUIRED:'Сначала имитируй оплату этого заказа.',DELIVERED_ORDER_REQUIRES_RETURN:'Заказ уже получен. Его нельзя отменить как неотправленный.',INVALID_INPUT:'Проверь числа: остаток от 0 до 1 000 000, количество в заказе от 1 до 100.',INTERNAL_ERROR:'Не удалось выполнить действие. Посмотри окно теста в PowerShell.'};
function notice(text,error=false){$('notice').textContent=text;$('notice').dataset.error=String(error);}
function el(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
function money(minor){return new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0}).format(minor/100);}
async function request(path,method='GET',body,extra={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal,
   headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(state?{'X-CSRF-Token':state.csrfToken}:{}),...extra},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const data=await response.json();
  if(!response.ok){if(response.status===401)$('workspace').hidden=true;throw new Error(messages[data.error]||'Действие не выполнено: '+(data.error||response.status));}
  return data;
 }catch(error){if(error.name==='AbortError')throw new Error('Ответ задержался. Обнови данные перед повтором: действие могло сохраниться.');throw error;}
 finally{clearTimeout(timer);}
}
function markBusy(value){busy=value;document.querySelectorAll('#workspace button,#workspace input').forEach(n=>n.disabled=value);}
async function run(fn){if(busy)return;markBusy(true);notice('Выполняем…');try{const message=await fn();await refresh();notice(message);}catch(error){notice(error.message,true);}finally{markBusy(false);}}
async function refresh(){
 const data=await request('/test-shop/api/state');
 if(data.mode!=='local-test'||typeof data.csrfToken!=='string'||!Array.isArray(data.items)||!Array.isArray(data.orders))throw new Error('Это не тестовый магазин. Данные не загружены.');
 state=data;$('workspace').hidden=false;render();
}
function render(){
 const stock=$('stock'),basket=$('basket');stock.replaceChildren();basket.replaceChildren();
 for(const product of state.items){
  const row=el('tr'),label=el('td',product.name);label.append(el('small',product.sku));row.append(label);
  const input=el('input');input.type='number';input.min='0';input.max='1000000';input.step='1';input.value=stockDraft.get(product.id)??product.onHand;
  input.setAttribute('aria-label','Тестовый остаток: '+product.name);
  const hint=el('small');const showDraft=()=>{hint.textContent=input.value!==''&&Number(input.value)===product.onHand?'':'Не сохранено · сейчас '+product.onHand;};showDraft();
  input.addEventListener('input',()=>{stockDraft.set(product.id,input.value);showDraft();});
  const field=el('td');field.append(input,hint);row.append(field,el('td',String(product.reserved)),el('td',String(product.onHand-product.reserved)),el('td',String(product.ycpAvailable)));
  const save=el('button','Сохранить');save.type='button';save.addEventListener('click',()=>{
   if(!input.reportValidity()||input.value==='')return notice('Укажи целое количество от 0 до 1 000 000.',true);
   void run(async()=>{await request('/test-shop/api/stock/'+product.id,'PUT',{expectedOnHand:product.onHand,onHand:Number(input.value)});stockDraft.delete(product.id);return 'Тестовый остаток сохранён.';});
  });const action=el('td');action.append(save);row.append(action);stock.append(row);
  const basketRow=el('label',undefined,'basket-row'),name=el('span',product.name);name.append(el('small',money(product.priceMinor)+' · доступно '+(product.onHand-product.reserved)));
  const qty=el('input');qty.type='number';qty.min='0';qty.max='100';qty.step='1';qty.value=basketDraft.get(product.sku)??'0';qty.setAttribute('aria-label','В заказ: '+product.name);
  qty.addEventListener('input',()=>{basketDraft.set(product.sku,qty.value);pendingOrder=null;});basketRow.append(name,qty);basket.append(basketRow);
 }
 const orderList=$('orders');orderList.replaceChildren();
 if(state.orders.length===0)orderList.append(el('p','Пробных заказов пока нет.','muted'));
 for(const order of state.orders){
  const row=el('article',undefined,'order'),detail=el('div');
  const status={draft:'В резерве',pending:'В резерве',awaiting_payment:'В резерве',placed:'Оформлен',processing:'В обработке',cancelled:'Отменён',completed:'Получен'}[order.status]||order.status;
  detail.append(el('h3','Заказ №'+order.number+' · '+status),el('p',money(order.totalMinor)+(order.paymentStatus==='paid'?' · Оплата имитирована':' · Без оплаты')),el('p',order.items.map(i=>i.sku+' × '+i.quantity).join(', ')));
  const actions=el('div',undefined,'actions');
  for(const [action,title] of [['pay','Имитировать оплату'],['cancel','Отменить заказ'],['deliver','Имитировать получение']]){
   const button=el('button',title);button.type='button';button.addEventListener('click',()=>void run(async()=>{
    await request('/test-shop/api/sessions/'+order.sessionId+'/'+action,'POST',{});
    return action==='pay'?'Оплата имитирована. Реального списания не было.':action==='cancel'?'Отмена обработана. Проверь доступное количество.':'Получение имитировано. Проверь количество на складе.';
   }));actions.append(button);
  }row.append(detail,actions);orderList.append(row);
 }
 if(busy)markBusy(true);
}
$('refresh').addEventListener('click',()=>void run(async()=> 'Данные обновлены. Несохранённые значения оставлены в полях.'));
$('checkout').addEventListener('submit',event=>{event.preventDefault();if(busy)return;
 const items=state.items.map(p=>({sku:p.sku,quantity:Number(basketDraft.get(p.sku)??0)})).filter(i=>i.quantity!==0);
 if(!items.length||items.some(i=>!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>100))return notice('Укажи от 1 до 100 штук хотя бы для одного товара.',true);
 pendingOrder??={sessionId:crypto.randomUUID(),items};const payload=pendingOrder;
 void run(async()=>{await request('/test-shop/api/sessions','POST',payload);pendingOrder=null;return 'Пробный заказ создан. Товары зарезервированы.';});
});
async function start(){
 const key=location.hash.slice(1);history.replaceState(null,'',location.pathname);
 try{if(key)await request('/test-shop/open','POST',{}, {'X-ASAYA-Test-Key':key});await refresh();notice('Готово. Укажи тестовые остатки и сохрани.');}
 catch(error){notice(error.message,true);}
}
void start();
