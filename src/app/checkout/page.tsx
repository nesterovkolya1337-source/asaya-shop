import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/site-shell";
import styles from "./checkout.module.css";

export const metadata: Metadata = {
  title: "Оформление заказа",
};

export default function CheckoutPage() {
  return (
    <>
      <div className={styles.page}>
        <SiteHeader />
        <main>
          <header className={styles.heading}>
            <p>Figma / Frame 7790 / node 110:1236</p>
            <h1>Оформление заказа</h1>
          </header>

          <div className={styles.checkoutGrid}>
            <section className={styles.formCard} aria-labelledby="customer-heading">
              <h2 id="customer-heading">Информация о получателе</h2>
              <div className={styles.fieldGrid}>
                <label>
                  Имя
                  <input placeholder="Ваше имя" type="text" />
                </label>
                <label>
                  Телефон
                  <input placeholder="+7 000 000-00-00" type="tel" />
                </label>
                <label className={styles.fullWidth}>
                  Почта
                  <input placeholder="name@example.com" type="email" />
                </label>
              </div>

              <div className={styles.deliveryBlock}>
                <h2>Доставка</h2>
                <p>Здесь появятся ПВЗ и расчёт доставки Ozon через сервер ASAYA.</p>
                <button type="button">Выбрать пункт выдачи</button>
              </div>
            </section>

            <aside className={styles.summary} aria-labelledby="summary-heading">
              <p className={styles.status}>Каркас checkout готов</p>
              <h2 id="summary-heading">Ваш заказ</h2>
              <div className={styles.summaryRow}>
                <span>Товары</span>
                <strong>0 ₽</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>Доставка</span>
                <strong>—</strong>
              </div>
              <div className={`${styles.summaryRow} ${styles.total}`}>
                <span>Итого</span>
                <strong>0 ₽</strong>
              </div>
              <button className={styles.submit} disabled type="button">
                Перейти к оплате
              </button>
              <p className={styles.note}>
                Кнопка будет активна после подключения корзины, доставки и оплаты.
              </p>
            </aside>
          </div>
        </main>
      </div>
      <SiteFooter />
    </>
  );
}
