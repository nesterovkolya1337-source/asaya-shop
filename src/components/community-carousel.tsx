"use client";

import Image from "next/image";
import { useRef } from "react";
import styles from "@/app/page.module.css";

type CommunityPhoto = { image: string; alt: string };

export function CommunityCarousel({ photos, titleId }: { photos: CommunityPhoto[]; titleId: string }) {
  const railRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction * Math.max(260, rail.clientWidth * 0.72), behavior: "smooth" });
  };

  return (
    <>
      <div className={styles.communityHeading}>
        <h2 id={titleId}>Ты + ASAYA</h2>
        <div className={styles.communityControls} aria-label="Навигация по фотографиям">
          <button aria-label="Предыдущие фотографии" onClick={() => scroll(-1)} type="button">←</button>
          <button aria-label="Следующие фотографии" onClick={() => scroll(1)} type="button">→</button>
        </div>
      </div>
      <div className={styles.communityGrid} ref={railRef}>
        {photos.map((photo) => (
          <div className={styles.communityPhoto} key={photo.image}>
            <Image alt={photo.alt} className={styles.coverImage} fill sizes="(max-width: 760px) 72vw, 430px" src={photo.image} />
          </div>
        ))}
      </div>
    </>
  );
}
