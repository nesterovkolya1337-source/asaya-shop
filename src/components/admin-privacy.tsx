"use client";
import {useState} from 'react';
import {assetPath} from '@/lib/asset-path';
import {createStoreRequest} from '@/lib/auth-client';

const request=createStoreRequest(assetPath('/api/admin/v1'),fetch);
type Preview={revision:string;blocked:string|null;confirmation:string;orders:Array<{id:string;number:string}>;profileId:string|null;alreadyCleared:boolean};
const blockers:Record<string,string>={LEGAL_HOLD:'Удаление запрещено: данные отмечены для обязательного сохранения.',NO_CUSTOMER_PROFILE:'У заказа нет связанного профиля.',ORDER_NOT_DEFINITIVELY_CANCELLED:'Нужно окончательное подтверждение отмены Яндексом и отсутствие успешной оплаты.',RECORDS_REQUIRE_RETENTION_REVIEW:'Есть платёжные или логистические записи. Контакты сохраняются до отдельного рассмотрения.'};
export function AdminPrivacy({orderId,csrf,onChanged}:{orderId:string;csrf:string;onChanged:()=>void}){
 const [scope,setScope]=useState('order_contacts'),[preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false),[confirmation,setConfirmation]=useState(''),[confirmed,setConfirmed]=useState(false),[reason,setReason]=useState('customer_request');
 async function run(apply=false){
  if(busy)return;setBusy(true);setError('');
  try{
   if(apply&&preview){const result=await request(`orders/${orderId}/privacy`,'POST',{scope,revision:preview.revision,confirmation,confirmed:true,permittedContactsConfirmed:true,reason},csrf) as {ok?:boolean};if(result?.ok!==true)throw new Error('Неизвестный результат');setPreview(null);setDone(true);onChanged();}
   else {const r=await request(`orders/${orderId}/privacy?scope=${scope}`,'GET') as Preview;if(!r||!/^[a-f0-9]{64}$/.test(r.revision)||!Array.isArray(r.orders)||typeof r.confirmation!=='string')throw new Error('Не удалось проверить список данных.');setPreview(r);setConfirmed(false);setConfirmation('');setDone(false);}
  }catch{setPreview(null);setConfirmed(false);setError('Операция не подтверждена. Обновите предварительную проверку: данные или права могли измениться. Повторно ничего не отправляем.');}
  finally{setBusy(false);}
 }
 return <section aria-label="Управление персональными данными"><h3>Персональные данные</h3>
  <p>Точечная очистка по рассмотренному обращению. Это не удаление аккаунта целиком. Заказы, товары, суммы, платежи, чеки, история, телефон входа и записи внешних сервисов сохраняются.</p>
  <fieldset disabled={busy}><label>Что очистить <select value={scope} onChange={e=>{setScope(e.target.value);setPreview(null);setConfirmed(false);setDone(false);}}><option value="order_contacts">Контакты отменённого неоплаченного заказа</option><option value="profile_optional">Необязательные имя и email профиля</option></select></label>
  <button type="button" onClick={()=>void run()}>Показать затрагиваемые данные</button>
  {preview&&<div><p>{scope==='order_contacts'?'Будут очищены контакты получателя и доставки в заказе и его черновике. Профиль покупателя сохраняется.':'Будут очищены только имя и email связанного профиля. Контакты в заказах и телефон входа сохраняются.'}</p><p>Связанные заказы:</p><ul>{preview.orders.map(o=><li key={o.id}>{o.number}</li>)}</ul>
   {preview.blocked?<p role="alert">{blockers[preview.blocked]??'Операция запрещена.'}</p>:preview.alreadyCleared?<p>Выбранные данные уже очищены.</p>:<><label>Основание <select value={reason} onChange={e=>{setReason(e.target.value);setConfirmed(false);}}><option value="customer_request">Обращение покупателя</option><option value="correction">Исправление данных</option><option value="duplicate">Дублирующие данные</option></select></label>
    <label>Введите номер {preview.confirmation}<input value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="off"/></label>
    <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Обращение проверено, выбранные контакты разрешено очистить, последствия понятны</label>
    <button type="button" disabled={!confirmed||confirmation!==preview.confirmation} onClick={()=>void run(true)}>Подтвердить очистку</button></>}
  </div>}</fieldset>{error&&<p role="alert">{error}</p>}{done&&<p role="status">Выбранные данные очищены. Действие записано в журнал администратора.</p>}</section>;
}
