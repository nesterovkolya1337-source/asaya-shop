import {ServerAccountView} from './server-account-view';

// TЗ v3: customer identity is verified on the server; localStorage is not a login.
export function AccountView(){return <ServerAccountView smsOnly/>;}