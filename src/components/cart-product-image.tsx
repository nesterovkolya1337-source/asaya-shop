"use client";
import Link from 'next/link';
import {useState} from 'react';
import {CroppedImage} from './cropped-image';
import type {Product} from '@/lib/store-data';
import styles from './server-cart-view.module.css';
export function CartProductImage({product,sizes="(max-width: 760px) 80px, (max-width: 1000px) 90px, 120px"}:{product?:Product;sizes?:string}){
 const [failed,setFailed]=useState<string|null>(null);
 const content=product?.image&&failed!==product.image
  ?<CroppedImage src={product.image} crop={product.imageCrops?.[product.image]} alt={product.name} fill sizes={sizes} style={{objectFit:'contain'}} onError={()=>setFailed(product.image)}/>
  :<span className={styles.placeholder} role="img" aria-label="Фото товара отсутствует">Нет фото</span>;
 return product?<Link className={styles.image} href={`/product/${product.id}`} aria-label={'Открыть '+product.name}>{content}</Link>:<div className={styles.image}>{content}</div>;
}
