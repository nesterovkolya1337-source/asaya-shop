import Link from 'next/link';
import {SMS_CONSENT_VERSION,SMS_CONSENT_TEXT} from '../../../../backend/src/sms-consent-policy';
export const metadata={title:'Согласие на SMS — ASAYA'};
export default function SmsConsentPage(){return <main style={{maxWidth:900,margin:'40px auto',padding:'0 20px',lineHeight:1.7}}>
 <h1>Согласие на авторизационные и сервисные SMS</h1>
 <p>Версия {SMS_CONSENT_VERSION}</p>
 {SMS_CONSENT_TEXT.map((text,i)=><p key={i}>{text}</p>)}
 <p><a href="mailto:hello@asaya.ru">Отозвать согласие: hello@asaya.ru</a></p>
 <Link href="/legal/privacy/">Политика конфиденциальности</Link>
</main>;}
