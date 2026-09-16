"use client";

import { type FormEvent, useState } from "react";
import Link from 'next/link';
import {useShop} from './shop-provider';
import styles from "./order-status-view.module.css";

export function OrderStatusView() {
  const [checked, setChecked] = useState(false);
  const {catalogOnly}=useShop();
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setChecked(true); }
  if(catalogOnly) return <main className={styles.main}><p>ASAYA / Заказы</p><h1>Статус заказа</h1><span>Состав и статус ваших заказов доступны после входа в личный кабинет.</span><p><Link href="/account#account-orders">Перейти к моим заказам</Link></p></main>;
  return <main className={styles.main}>
    <p>ASAYA / Заказы</p>
    <h1>Статус заказа</h1>
    <span>Введите номер заказа и email, указанный при оформлении.</span>
    <form onSubmit={submit}>
      <label>Номер заказа<input placeholder="ASAYA-0000" required /></label>
      <label>Email<input placeholder="name@example.com" required type="email" /></label>
      <button type="submit">Проверить статус</button>
    </form>
    {checked && <div className={styles.notice} role="status"><strong>Данные не отправлены.</strong><span>Проверка статуса заработает после подключения защищённой базы заказов.</span></div>}
  </main>;
}
