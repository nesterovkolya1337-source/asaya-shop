"use client";
import {useRef,useState,type PointerEvent,type MouseEvent} from 'react';
import Link from 'next/link';
import {CarouselArrow} from './carousel-arrow';
import {ProductCard} from './product-card';
import type {Product} from '@/lib/store-data';
import styles from './product-view.module.css';
export function ProductRecommendations({products:recommendations,interactionsDisabled=false}:{products:Product[];interactionsDisabled?:boolean}){
  const [recommendationDragging, setRecommendationDragging] = useState(false);
  const recommendationDrag = useRef({ active: false, moved: false, pointerId: -1, startX: 0, startY: 0, scrollLeft: 0 });
  const recommendationRail = useRef<HTMLDivElement>(null);
  const startRecommendationDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || !event.isPrimary || event.button !== 0) return;
    recommendationDrag.current = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: event.currentTarget.scrollLeft,
    };
  };
  const moveRecommendationDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!recommendationDrag.current.active || recommendationDrag.current.pointerId !== event.pointerId) return;
    const distanceX = event.clientX - recommendationDrag.current.startX;
    const distanceY = event.clientY - recommendationDrag.current.startY;
    if (!recommendationDrag.current.moved && Math.abs(distanceX) < 6) return;
    if (!recommendationDrag.current.moved && Math.abs(distanceY) > Math.abs(distanceX)) return;
    if (!recommendationDrag.current.moved) {
      recommendationDrag.current.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setRecommendationDragging(true);
    }
    event.preventDefault();
    event.currentTarget.scrollLeft = recommendationDrag.current.scrollLeft - distanceX;
  };
  const stopRecommendationDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (recommendationDrag.current.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    recommendationDrag.current.active = false;
    recommendationDrag.current.pointerId = -1;
    setRecommendationDragging(false);
  };
  const blockRecommendationClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!recommendationDrag.current.moved) return;
    event.preventDefault();
    event.stopPropagation();
    recommendationDrag.current.moved = false;
  };

  const scrollRecommendations = (direction: -1 | 1) => {
    recommendationRail.current?.scrollBy({ left: direction * Math.max(300, recommendationRail.current.clientWidth * 0.72), behavior: "smooth" });
  };

return <>
      {recommendations.length>0&&<section className={styles.recommendations} aria-labelledby="recommendations-title">
        <div className={styles.sectionHeading}>
          <h2 id="recommendations-title">Рекомендуем</h2>
          <div className={styles.recommendationActions}>
            <Link href="/catalog">Весь каталог</Link>
            <div className={styles.sliderArrows}>
              <button aria-label="Предыдущие рекомендации" onClick={() => scrollRecommendations(-1)} type="button"><CarouselArrow previous /></button>
              <button aria-label="Следующие рекомендации" onClick={() => scrollRecommendations(1)} type="button"><CarouselArrow /></button>
            </div>
          </div>
        </div>
        <div
          className={`${styles.recommendationGrid} ${recommendationDragging ? styles.recommendationDragging : ""}`}
          onClickCapture={blockRecommendationClick}
          onDragStart={(event) => event.preventDefault()}
          onLostPointerCapture={stopRecommendationDrag}
          onPointerCancel={stopRecommendationDrag}
          onPointerDown={startRecommendationDrag}
          onPointerMove={moveRecommendationDrag}
          onPointerUp={stopRecommendationDrag}
          ref={recommendationRail}
        >
          {recommendations.map((item) => <ProductCard key={item.id} product={item} recommendation interactionsDisabled={interactionsDisabled} />)}
        </div>
      </section>
      }

</>;
}
