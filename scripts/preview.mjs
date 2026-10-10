import {createServer} from 'node:http';
import {mkdirSync} from 'node:fs';
import {database,bucket} from './local-env.mjs';
import worker from '../dist/server/index.js';
mkdirSync('.local',{recursive:true});
const env={EMPLOYEE_DEFAULT_PASSWORD:process.env.EMPLOYEE_DEFAULT_PASSWORD,DB:database('.local/preview.db'),BUCKET:bucket('.local/uploads'),ADMIN_SETUP_TOKEN:process.env.ADMIN_SETUP_TOKEN,ADMIN_SETUP_EXPIRES_AT:process.env.ADMIN_SETUP_EXPIRES_AT};
if(!env.DB.raw.prepare('SELECT * FROM workspace').get()){env.DB.raw.prepare("INSERT INTO workspace VALUES (1,'local-owner')").run();env.DB.raw.prepare("INSERT INTO employees VALUES ('local-ceo','local-owner','ဦးလင်း','owner@local.test','ceo','Management',1,?)").run(new Date().toISOString());}
const port=process.env.PORT||4173;
createServer(async(req,res)=>{try{
 const url=`http://127.0.0.1:${port}${req.url}`,headers=new Headers();for(const [key,v] of Object.entries(req.headers))if(v&& !key.startsWith('oai-authenticated-'))headers.set(key,Array.isArray(v)?v.join(','):v);
 const chunks=[];for await(const chunk of req)chunks.push(chunk);const content=Buffer.concat(chunks);
 const request=new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:content,duplex:'half'}:{})});
 const result=await worker.fetch(request,env);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
 }catch(e){console.error(e.message);res.writeHead(500);res.end('Preview error');}}).listen(port,'127.0.0.1',()=>console.log(`Local preview: http://127.0.0.1:${port} (email/password, separate local database)`));
