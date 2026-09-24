// Presentation only: canonical monetary values remain integer kopecks.
export const formatMinorRubles=(minor:number)=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',minimumFractionDigits:minor%100===0?0:2,maximumFractionDigits:2}).format(minor/100);
