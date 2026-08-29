"use client";

import { type FormEvent, useState } from "react";
import styles from "./order-status-view.module.css";

export function OrderStatusView() {
  const [checked, setChecked] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setChecked(true); }
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
