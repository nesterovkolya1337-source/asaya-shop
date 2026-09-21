// Read-only source diagnostic. No database connection or mutations.
import {readFile} from 'node:fs/promises';
import {createStockSource,sourceKind} from '../src/cdek-stock-source.js';
try{
 const path=process.env.CDEK_STOCK_SETTINGS_FILE;if(!path)throw new Error('STOCK_SETTINGS_REQUIRED');
 const source=createStockSource(JSON.parse(await readFile(path,'utf8'))),snapshot=await source.read();
 const checkedAt=new Date(),fresh=+snapshot.generatedAt<=+checkedAt+60000&&+snapshot.generatedAt+source.settings.maxAgeSeconds*1000>+checkedAt;
 console.log(JSON.stringify({checkedAt,sourceKind:sourceKind(source.settings),warehouseId:source.settings.warehouseId,environment:source.settings.environment,generatedAt:snapshot.generatedAt,
  fresh,pollSeconds:source.settings.pollSeconds,maxAgeSeconds:source.settings.maxAgeSeconds,
  offers:snapshot.items.length,positive:snapshot.items.filter(i=>i.quantity>0).length,items:snapshot.items,changed:false}));
 if(!fresh)process.exitCode=1;
}catch{console.error('STOCK_SOURCE_CHECK_FAILED');process.exitCode=1;}
