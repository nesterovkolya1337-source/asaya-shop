"use client";
import Link from 'next/link';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {useShop} from './shop-provider';
import {checkoutCart} from '@/lib/checkout-cart';
import {assetPath} from '@/lib/asset-path';
import {AuthClientError,createAuthClient,createCheckoutClient,type ServerSession,type DeliveryQuote,type CheckoutBody,type CheckoutResult} from '@/lib/auth-client';
import {rubles} from './server-cart-view';
import styles from './server-checkout.module.css';
const base=assetPath('/api/store/v1'),auth=createAuthClient(base),api=createCheckoutClient(base);
type Attempt={key:string;signature:string};
const attemptKey=(id:string)=>'asaya-checkout-attempt:'+id;
const knownRejections=new Set(['INVALID_INPUT','PRODUCT_UNAVAILABLE','INSUFFICIENT_STOCK','PRICE_CHANGED','INVALID_DELIVERY_QUOTE','UNAUTHENTICATED','CSRF_REJECTED','ORIGIN_REJECTED']);
export function ServerCheckoutView(){
 const {cart,products,clearCart,catalogStatus}=useShop();
 const basket=checkoutCart(cart,products);
 const current=useRef({signature:basket.signature,clearCart});
 useEffect(()=>{current.current={signature:basket.signature,clearCart};},[basket.signature,clearCart]);
 const [session,setSession]=useState<ServerSession|null>(null),[ready,setReady]=useState(false);
 const [notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[result,setResult]=useState<CheckoutResult|null>(null);
 const [city,setCity]=useState(''),[address,setAddress]=useState(''),[name,setName]=useState(''),[phone,setPhone]=useState(''),[consent,setConsent]=useState(false);
 const [quote,setQuote]=useState<(DeliveryQuote&{signature:string})|null>(null),[now,setNow]=useState(0);
 const [uncertain,setUncertain]=useState(false);
 const attempt=useRef<Attempt|null>(null),body=useRef<CheckoutBody|null>(null),lock=useRef(false);
 const inputSignature=JSON.stringify([basket.signature,city.trim(),address.trim()]);
 const validQuote=quote?.signature===inputSignature&&Date.parse(quote.expiresAt)>now?quote:null;
 useEffect(()=>{
  let active=true;
  async function init(){
   try{
    const s=await auth.me();if(!active)return;setSession(s);
    if(s){
     const saved=sessionStorage.getItem(attemptKey(s.user.id));
     if(saved){
      const a:Attempt=JSON.parse(saved);
      if(!a||typeof a.key!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(a.key)||typeof a.signature!=='string')throw new Error('Не удалось прочитать незавершённую попытку. Не оформляйте повторно; проверьте историю заказов.');
      attempt.current=a;
      const found=await api.recover(a.key);if(!active)return;
      if(found){
       setResult(found);
       if(current.current.signature===a.signature)current.current.clearCart();
       try{sessionStorage.removeItem(attemptKey(s.user.id));}catch{}
      }
     }
    }
    setReady(true);
   }catch(e){if(active)setNotice(e instanceof Error?e.message:'Не удалось проверить прошлую попытку.');}
  }
  void init();const timer=setInterval(()=>setNow(Date.now()),1000);
  return()=>{active=false;clearInterval(timer);};
 },[]);
 function finish(found:CheckoutResult){
  setResult(found);setUncertain(false);
  if(attempt.current?.signature===current.current.signature)current.current.clearCart();
  if(session)try{sessionStorage.removeItem(attemptKey(session.user.id));}catch{}
 }
 async function delivery(event:FormEvent){
  event.preventDefault();if(lock.current||!session||!basket.valid)return;
  lock.current=true;setBusy(true);setNotice('');setQuote(null);
  try{const q=await api.quote(basket.items,{city:city.trim(),address:address.trim()},session.csrfToken);setNow(Date.now());setQuote({...q,signature:inputSignature});}
  catch(e){setNotice(e instanceof Error?e.message:'Не удалось рассчитать доставку.');}
  finally{lock.current=false;setBusy(false);}
 }
 async function recover(){
  if(lock.current||!attempt.current)return;lock.current=true;setBusy(true);setNotice('');
  try{
   const found=await api.recover(attempt.current.key);
   if(found)finish(found);
   else setNotice('Сохранённый заказ пока не найден. Можно повторить эту же попытку — второй заказ с тем же номером попытки не создастся.');
  }catch(e){setNotice(e instanceof Error?e.message:'Не удалось проверить результат.');}
  finally{lock.current=false;setBusy(false);}
 }
 async function submit(event:FormEvent){
  event.preventDefault();if(lock.current||!session)return;
  if(!body.current&&(!validQuote||!basket.valid||!consent))return;
  lock.current=true;setBusy(true);setNotice('');
  try{
   if(!body.current){
    const a=attempt.current??{key:crypto.randomUUID(),signature:basket.signature};
    // Persist only the attempt identity, never contacts or the session token.
    sessionStorage.setItem(attemptKey(session.user.id),JSON.stringify(a));attempt.current=a;
    body.current={items:basket.items,deliveryQuoteId:validQuote!.deliveryQuoteId,customer:{name:name.trim(),phone:phone.trim()},
     consent:{offerVersion:'test-v1',privacyVersion:'test-v1',marketing:false},expectedTotalMinor:basket.subtotalMinor+validQuote!.amountMinor};
   }
   setUncertain(true);
   finish(await api.create(body.current,attempt.current!.key,session.csrfToken));
  }catch(e){
   if(e instanceof AuthClientError&&knownRejections.has(e.code)){body.current=null;setUncertain(false);setQuote(null);}
   setNotice(e instanceof Error?e.message:'Не удалось подтвердить результат. Проверьте заказ перед повторным оформлением.');
  }finally{lock.current=false;setBusy(false);}
 }
 if(result)return <main className={styles.main}><h1>Тестовый заказ сохранён</h1><p>Номер: <strong>{result.publicNumber}</strong></p><p>Сумма: {rubles(result.totalMinor)}</p><p>Оплата не выполнена. Реальная отправка не оформляется.</p><Link className={styles.primary} href="/account#account-orders">Перейти к моим заказам</Link></main>;
 return <main className={styles.main}><p>ASAYA / Оформление</p><h1>Тестовый заказ</h1><p>Без реальной оплаты и отправки. Используйте вымышленные контактные данные.</p>
 {notice&&<p className={styles.notice} role="alert">{notice}</p>}
 {!ready?<><p>Проверяем вход и незавершённые попытки…</p>{notice&&<button onClick={()=>window.location.reload()}>Повторить проверку</button>}</>:!session?<><p>Для оформления войдите в личный кабинет, затем вернитесь сюда. Корзина сохранится в этой вкладке.</p><Link className={styles.primary} href="/account">Войти</Link></>:uncertain?<><p>Результат отправки нужно подтвердить. Состав этой попытки сохранён до получения ответа.</p><div className={styles.actions}><button disabled={busy} onClick={()=>void recover()}>Проверить результат</button><form onSubmit={submit}><button disabled={busy}>Повторить ту же попытку</button></form></div></>:catalogStatus!=='ready'||!basket.valid?<><p>Проверьте доступность товаров и количество в корзине.</p><Link href="/cart">Вернуться в корзину</Link></>:<>
 <div className={styles.summary}>{basket.rows.map(({id,quantity,product})=><p key={id}>{product!.name} × {quantity}</p>)}<p>Товары: <strong>{rubles(basket.subtotalMinor)}</strong></p></div>
 <form onSubmit={delivery}><fieldset disabled={busy}><legend><h2>Доставка</h2></legend>
 <label>Город<input required maxLength={100} value={city} onChange={e=>setCity(e.target.value)} /></label>
 <label>Адрес<input required minLength={3} maxLength={300} value={address} onChange={e=>setAddress(e.target.value)} /></label>
 <button type="submit">Рассчитать доставку</button></fieldset></form>
 {validQuote?<><div className={styles.summary}><p>{validQuote.label}: {rubles(validQuote.amountMinor)}</p><p>Итого: <strong>{rubles(basket.subtotalMinor+validQuote.amountMinor)}</strong></p></div>
 <form onSubmit={submit}><fieldset disabled={busy}><legend><h2>Получатель</h2></legend>
 <label>Имя<input required maxLength={200} value={name} onChange={e=>setName(e.target.value)} /></label>
 <label>Телефон в международном формате<input type="tel" required pattern="\+[1-9][0-9]{7,14}" placeholder="+79990000000" value={phone} onChange={e=>setPhone(e.target.value)} /></label>
 <label className={styles.consent}><input type="checkbox" required checked={consent} onChange={e=>setConsent(e.target.checked)} /><span>Подтверждаю тестовое оформление с вымышленными данными. Реальной покупки и доставки не будет.</span></label>
 <button className={styles.primary} type="submit">Создать тестовый заказ</button></fieldset></form></>:<p>Рассчитайте доставку для текущего адреса и корзины. Расчёт действует ограниченное время.</p>}
 </>}<p><Link href="/account#account-orders">История заказов</Link> · <Link href="/cart">Корзина</Link></p></main>;
}
