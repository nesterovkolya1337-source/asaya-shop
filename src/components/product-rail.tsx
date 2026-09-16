"use client";

import {placedProducts} from '@/lib/product-placement';
import Link from "next/link";
import { type MouseEvent, type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { ProductCard } from "@/components/product-card";
import { CarouselArrow } from "@/components/carousel-arrow";
import { useShop } from "@/components/shop-provider";
import styles from "./product-rail.module.css";

type FeaturedState = "Бестселлер" | "Новинка";

export function ProductRail() {
  const { products } = useShop();
  const [state, setState] = useState<FeaturedState>("Бестселлер");
  const [dragging, setDragging] = useState(false);
  const [railState, setRailState] = useState({ hasOverflow: false, canScrollLeft: false, canScrollRight: false });
  const railRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, moved: false, pointerId: -1, startX: 0, startY: 0, scrollLeft: 0 });
  const visibleProducts = placedProducts(products,state==='Бестселлер'?'bestsellers':'new');
  const updateRailState = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
    setRailState({
      hasOverflow: maxScroll > 2,
      canScrollLeft: rail.scrollLeft > 2,
      canScrollRight: rail.scrollLeft < maxScroll - 2,
    });
  }, []);

  useEffect(() => {
    const animationFrame = requestAnimationFrame(updateRailState);
    window.addEventListener("resize", updateRailState);
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", updateRailState);
    };
  }, [state, visibleProducts.length, updateRailState]);

  const scrollRail = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction * Math.max(280, rail.clientWidth * 0.86), behavior: "smooth" });
  };
  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.pointerType !== "mouse" || event.button !== 0) return;
    drag.current = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: event.currentTarget.scrollLeft,
    };
  };
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active || drag.current.pointerId !== event.pointerId) return;
    const distanceX = event.clientX - drag.current.startX;
    const distanceY = event.clientY - drag.current.startY;
    if (!drag.current.moved && Math.abs(distanceX) < 6) return;
    if (!drag.current.moved && Math.abs(distanceY) > Math.abs(distanceX)) return;
    if (!drag.current.moved) {
      drag.current.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }
    event.preventDefault();
    event.currentTarget.scrollLeft = drag.current.scrollLeft - distanceX;
  };
  const stopDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    drag.current.active = false;
    drag.current.pointerId = -1;
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
        <div className={styles.headingActions}>
          {railState.hasOverflow && <div className={styles.railControls} aria-label="Навигация по товарам">
            <button aria-label="Предыдущие товары" disabled={!railState.canScrollLeft} onClick={() => scrollRail(-1)} type="button"><CarouselArrow previous /></button>
            <button aria-label="Следующие товары" disabled={!railState.canScrollRight} onClick={() => scrollRail(1)} type="button"><CarouselArrow /></button>
          </div>}
          <Link href="/catalog">
            <span>Весь каталог</span>
            <svg aria-hidden="true" viewBox="0 0 18 18"><path d="M3 9h11M10 5l4 4-4 4" /></svg>
          </Link>
        </div>
      </div>
      <div
        className={`${styles.rail} ${dragging ? styles.dragging : ""}`}
        onClickCapture={blockDraggedClick}
        onDragStart={(event) => event.preventDefault()}
        onPointerCancel={stopDrag}
        onPointerDown={startDrag}
        onLostPointerCapture={stopDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onScroll={updateRailState}
        ref={railRef}
      >
        {visibleProducts.map((product) => <ProductCard key={product.id} product={product} />)}
      </div>
    </>
  );
}
