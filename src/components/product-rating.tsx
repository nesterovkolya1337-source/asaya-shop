import styles from './product-rating.module.css';
export function ProductRating({rating,count,compact=false}:{rating:number;count:number;compact?:boolean}){
 const stars=count?Math.round(rating):0;
 return <p className={`${styles.rating} ${compact?styles.compact:''}`} aria-label={count?`Рейтинг ${rating.toFixed(1)} из 5, отзывов: ${count}`:'0 отзывов'}>
  <span aria-hidden="true">{'★'.repeat(stars)}{'☆'.repeat(5-stars)}</span><span>· {count}<span className={styles.word}> отзывов</span></span>
 </p>;
}
