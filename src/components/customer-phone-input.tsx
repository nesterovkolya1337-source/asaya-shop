'use client';
import {useLayoutEffect,useRef,useState,type ChangeEvent,type KeyboardEvent} from 'react';
import {phoneDigits,formatPhoneDigits} from '@/lib/customer-phone-input';
import styles from './customer-account.module.css';

export function CustomerPhoneInput({value,onChange,disabled}:{value:string;onChange:(value:string)=>void;disabled:boolean}) {
 const input=useRef<HTMLInputElement>(null);
 const [caret,setCaret]=useState<{position:number}|null>(null);
 const digits=phoneDigits(value);
 useLayoutEffect(()=>{
  const el=input.current;if(!el||!caret)return;
  let at=0,count=0;
  while(at<el.value.length&&count<caret.position){if(/\d/.test(el.value[at]))count++;at++;}
  el.setSelectionRange(at,at);
 },[value,caret]);
 function update(next:string,position:number) {
  onChange(next?'+7'+next:'');
  setCaret({position});
 }
 function change(event:ChangeEvent<HTMLInputElement>) {
  const raw=event.target.value;
  const count=raw.slice(0,event.target.selectionStart??raw.length).replace(/\D/g,'').length;
  const hasPrefix=raw.trim().startsWith('+7')||(raw.replace(/\D/g,'').length>10&&/^[78]/.test(raw.replace(/\D/g,'')));
  update(phoneDigits(raw),Math.max(0,count-(hasPrefix?1:0)));
 }
 function erase(event:KeyboardEvent<HTMLInputElement>) {
  const el=event.currentTarget,start=el.selectionStart??0,end=el.selectionEnd??0;
  if(start!==end||!['Backspace','Delete'].includes(event.key))return;
  event.preventDefault();
  const before=el.value.slice(0,start).replace(/\D/g,'').length;
  const index=event.key==='Backspace'?before-1:before;
  if(index<0||index>=digits.length)return;
  update(digits.slice(0,index)+digits.slice(index+1),index);
 }
 return <span className={styles.phoneField}><span aria-hidden="true">+7</span><input ref={input} aria-label="Телефон" aria-describedby="phone-prefix" autoComplete="tel-national" inputMode="tel" type="tel" disabled={disabled} required value={formatPhoneDigits(digits)} placeholder="999 123-45-67" onChange={change} onKeyDown={erase}/><span id="phone-prefix" className={styles.srOnly}>Код страны +7</span></span>;
}
