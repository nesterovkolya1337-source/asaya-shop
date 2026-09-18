'use client';
import {useState} from 'react';
import {ImageCropEditor} from './image-crop-editor';
export function ProductCropEditor({source,value,disabled,onSave}:{source:string;value?:string;disabled:boolean;onSave:(crop:string|undefined)=>void}){
 const [open,setOpen]=useState(false),[draft,setDraft]=useState(value),[device,setDevice]=useState<'desktop'|'mobile'>('desktop');
 return <><button type="button" disabled={disabled} onClick={()=>{setDraft(value);setOpen(true);}}>Кадрирование</button>{open&&<div role="dialog" aria-label="Кадрирование фотографии"><ImageCropEditor source={source} value={draft} type="product" device={device} ratio={1} onDevice={setDevice} onChange={setDraft}/><button type="button" disabled={disabled} onClick={()=>{onSave(draft);setOpen(false);}}>Применить кадр</button><button type="button" onClick={()=>setDraft(undefined)}>Исходный кадр</button><button type="button" onClick={()=>setOpen(false)}>Отмена</button><p>Затем сохраните карточку товара. Исходный файл не изменяется.</p></div>}</>;
}
