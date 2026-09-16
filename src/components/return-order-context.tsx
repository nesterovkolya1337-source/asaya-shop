'use client';
import {useEffect,useState} from 'react';
export function ReturnOrderContext(){
 const [number,setNumber]=useState(''),[copied,setCopied]=useState(false);
 useEffect(()=>{const value=new URLSearchParams(window.location.search).get('order');if(value&&/^ASAYA-\d{1,20}$/.test(value))queueMicrotask(()=>setNumber(value));},[]);
 if(!number)return null;
 const text='Здравствуйте! Хочу обратиться по возврату / претензии к заказу '+number+'.';
 return <aside style={{margin:'24px 28px',padding:24,background:'#f4f4f4',borderRadius:16,lineHeight:1.7}} aria-label="Обращение по заказу"><strong>Заказ {number}</strong><p>Номер добавлен в обращение. Опишите ситуацию в сообщении службе заботы.</p><a href={'mailto:hello@asaya.ru?subject='+encodeURIComponent('Возврат / претензия: '+number)+'&body='+encodeURIComponent(text)}>Написать на e-mail</a>{' · '}<a href={'https://t.me/asayahelp?text='+encodeURIComponent(text)} target="_blank" rel="noreferrer">Написать в Telegram</a>{' · '}<button type="button" onClick={()=>void navigator.clipboard.writeText(number).then(()=>setCopied(true)).catch(()=>setCopied(false))}>{copied?'Номер скопирован':'Скопировать номер'}</button></aside>;
}
