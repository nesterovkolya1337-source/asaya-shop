import {readFile,writeFile} from 'node:fs/promises';
import {Database} from '../src/db.js';
import {planLegalPublication,applyLegalPublication,type LegalPublicationPlan} from '../src/legal-publication.js';

// Separate deployment permission and a database backup are required before --apply.
// The default is help, not a connection or a database write.
const [mode,file,actor]=process.argv.slice(2);
if(!['--plan','--apply'].includes(mode??'')||!file||mode==='--apply'&&!actor){
 console.log('Usage: publish-legal-v10.js --plan PRIVATE_SNAPSHOT.json | --apply PRIVATE_SNAPSHOT.json ADMIN_UUID');
 process.exitCode=1;
}else{
 if(!process.env.DATABASE_URL)throw Error('DATABASE_URL is required');
 const db=new Database(process.env.DATABASE_URL);
 try{
  if(mode==='--plan'){
   const plan=await planLegalPublication(db);
   await writeFile(file,JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});
   console.log('Legal publication plan saved. No database changes. Pages:',plan.pages.length);
  }else{
   const plan=JSON.parse(await readFile(file,'utf8')) as LegalPublicationPlan;
   console.log(await applyLegalPublication(db,actor!,plan));
  }
 }finally{await db.close();}
}
