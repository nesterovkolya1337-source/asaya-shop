import styles from './carousel-arrow.module.css';
export function CarouselArrow({previous=false}:{previous?:boolean}){
 return <svg aria-hidden="true" className={`${styles.icon} ${previous?styles.previous:''}`} viewBox="0 0 40 40"><path d="m17 13 7 7-7 7"/></svg>;
}
