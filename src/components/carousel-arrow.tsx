import Image from "next/image";
import { assetPath } from "@/lib/asset-path";
import styles from "./carousel-arrow.module.css";

// Figma 137:839: use the original outlined circle and chevron together.
export function CarouselArrow({ previous = false }: { previous?: boolean }) {
  return <Image alt="" aria-hidden="true" className={`${styles.icon} ${previous ? styles.previous : ""}`} width={60} height={60} src={assetPath("/images/figma/carousel-next.svg")} />;
}
