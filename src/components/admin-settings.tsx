'use client';
import {useState} from 'react';
import type {StaffSession} from '@/lib/admin-client';
import {AdminSales} from './admin-sales';
import {AdminBanner} from './admin-storefront-controls';
import {AdminIntegration} from './admin-integration';
import {AdminReadiness} from './admin-readiness';
import styles from './server-admin.module.css';
export function AdminSettings({session,onExpired,onOrder}:{session:StaffSession;onExpired:()=>void;onOrder:(id:string)=>void}){
 const [tab,setTab]=useState('store');
 return <section aria-label="Настройки"><h1>Настройки</h1><nav className={styles.productTabs} aria-label="Разделы настроек">{[['store','Магазин'],['integrations','Интеграции'],['system','Системное']].map(([id,label])=><button key={id} type="button" aria-pressed={tab===id} aria-controls={'settings-'+id} onClick={()=>setTab(id)}>{label}</button>)}</nav>
 <div id="settings-store" hidden={tab!=='store'}><AdminSales session={session} onExpired={onExpired}/><AdminBanner csrf={session.csrfToken} onExpired={onExpired}/></div>
 {tab==='integrations'&&<div id="settings-integrations"><AdminIntegration onExpired={onExpired} onOrder={onOrder}/></div>}
 {tab==='system'&&<div id="settings-system"><AdminReadiness onExpired={onExpired}/></div>}
 </section>;
}
