// Offline preparation only. Never connects to DB/provider or starts the worker.
// Pass existing FF cabinet credentials via process environment, never command arguments.
import {readFile,writeFile} from 'node:fs/promises';
import {apiStockSettingsSchema} from '../src/cdek-stock-source.js';
try{
 const [profile,output]=process.argv.slice(2);
 if(!profile||!output)throw new Error();
 const settings=apiStockSettingsSchema.parse({...JSON.parse(await readFile(profile,'utf8')),
  login:process.env.CDEK_FF_LOGIN,password:process.env.CDEK_FF_PASSWORD});
 if(settings.environment!=='production'||settings.externalWarehouseId!=='23401'||settings.shopId!==220216||settings.pollSeconds!==300||settings.maxAgeSeconds!==900)throw new Error();
 await writeFile(output,JSON.stringify(settings)+'\n',{encoding:'utf8',mode:0o600,flag:'wx'});
 console.log('STOCK_CONFIG_PREPARED; worker not enabled');
}catch{console.error('STOCK_CONFIG_PREPARATION_FAILED; validate profile, secret environment and non-existing output path');process.exitCode=1;}
