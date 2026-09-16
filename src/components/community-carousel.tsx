"use client";
import { CarouselArrow } from "@/components/carousel-arrow";

import {CroppedImage} from './cropped-image';
import {defaultImageCrop} from '../../backend/src/image-crop';
import { useRef } from "react";
import styles from "@/app/page.module.css";

type CommunityPhoto = { image: string; alt: string; crop?:string };

export function CommunityCarousel({ photos, titleId, title='Ты + ASAYA' }: { photos: CommunityPhoto[]; titleId: string; title?: string }) {
  const railRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction * Math.max(260, rail.clientWidth * 0.72), behavior: "smooth" });
  };

  return (
    <>
      <div className={styles.communityHeading}>
        <h2 id={titleId}>{title}</h2>
        <div className={styles.communityControls} aria-label="Навигация по фотографиям">
          <button aria-label="Предыдущие фотографии" onClick={() => scroll(-1)} type="button"><CarouselArrow previous /></button>
          <button aria-label="Следующие фотографии" onClick={() => scroll(1)} type="button"><CarouselArrow /></button>
        </div>
      </div>
      <div className={styles.communityGrid} ref={railRef}>
        {photos.map((photo) => (
          <div className={styles.communityPhoto} key={photo.image}>
            <CroppedImage alt={photo.alt} className={styles.coverImage} fill sizes="(max-width: 760px) 72vw, 430px" src={photo.image} crop={photo.crop} defaultCrop={defaultImageCrop('gallery',photo.image)} />
          </div>
        ))}
      </div>
    </>
  );
}
