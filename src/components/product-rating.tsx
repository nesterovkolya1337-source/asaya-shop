export function ProductRating({rating,count}:{rating:number;count:number}){
 const stars=count?Math.round(rating):0;
 return <p style={{fontSize:14,lineHeight:1.5,margin:'8px 0',color:count?'#333':'#757575'}} aria-label={count?`Рейтинг ${rating.toFixed(1)} из 5, отзывов: ${count}`:'0 отзывов'}>
  <span aria-hidden="true">{'★'.repeat(stars)}{'☆'.repeat(5-stars)}</span> · {count} отзывов
 </p>;
}
