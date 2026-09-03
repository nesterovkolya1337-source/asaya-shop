"use client";

import Link from "next/link";
import { type MouseEvent, type PointerEvent, useRef, useState } from "react";
import { ProductCard } from "@/components/product-card";
import { useShop } from "@/components/shop-provider";
import styles from "./product-rail.module.css";

type FeaturedState = "Бестселлер" | "Новинка";

export function ProductRail() {
  const { products } = useShop();
  const [state, setState] = useState<FeaturedState>("Бестселлер");
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ active: false, moved: false, startX: 0, scrollLeft: 0 });
  const visibleProducts = products.filter((product) => product.active && product.badge === state);
  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    drag.current = { active: true, moved: false, startX: event.clientX, scrollLeft: event.currentTarget.scrollLeft };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    const distance = event.clientX - drag.current.startX;
    if (Math.abs(distance) > 5) drag.current.moved = true;
    event.currentTarget.scrollLeft = drag.current.scrollLeft - distance;
  };
  const stopDrag = () => {
    drag.current.active = false;
    setDragging(false);
  };
  const blockDraggedClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!drag.current.moved) return;
    event.preventDefault();
    event.stopPropagation();
    drag.current.moved = false;
  };

  return (
    <>
      <div className={styles.heading}>
        <div className={styles.tabs} aria-label="Подборка товаров">
          {(["Бестселлер", "Новинка"] as FeaturedState[]).map((item) => <button aria-pressed={state === item} className={state === item ? styles.active : ""} key={item} onClick={() => setState(item)} type="button">{item === "Бестселлер" ? "Бестселлеры" : "Новинки"}</button>)}
        </div>
        <Link href="/catalog">Весь каталог →</Link>
      </div>
      <div
        className={`${styles.rail} ${dragging ? styles.dragging : ""}`}
        onClickCapture={blockDraggedClick}
        onPointerCancel={stopDrag}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
      >
        {visibleProducts.map((product) => <ProductCard key={product.id} product={product} />)}
      </div>
    </>
  );
}
