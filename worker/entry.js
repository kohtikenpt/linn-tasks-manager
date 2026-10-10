import {AuthError} from './auth.js';
import {api,HttpError} from './api.js';
import {assets} from './assets.js';
import {collectDueNotices} from './notifications.js';
import {mcp} from './mcp.js';
const security={'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com"};
export default {async scheduled(event,env,ctx){ctx.waitUntil(collectDueNotices(env,ctx));},async fetch(req,env,ctx){
 let response;try{
  const path=new URL(req.url).pathname;
  if(path==='/mcp')response=await mcp(req,env,ctx);
  else if(path.startsWith('/api/'))response=await api(req,env,ctx);
  else if(['GET','HEAD'].includes(req.method)){
   const asset=assets[path==='/'?'/index.html':path];
   if(!asset)response=new Response('Not found',{status:404});
   else {const headers={'Content-Type':asset.type,'Cache-Control':path==='/sw.js'?'no-cache':'private, no-cache'};if(path==='/sw.js')headers['Service-Worker-Allowed']='/';response=new Response(req.method==='HEAD'?null:(asset.base64?Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0)):asset.body),{headers});}
  }else response=new Response('Method not allowed',{status:405});
 }catch(e){if(!(e instanceof HttpError)&&!(e instanceof AuthError))console.error('Application request failed');response=new Response(JSON.stringify({error:e instanceof HttpError||e instanceof AuthError?e.message:'ဆာဗာအမှား ဖြစ်နေသည်။ ခဏစောင့်ပြီး ပြန်ကြိုးစားပါ',...(e.code?{code:e.code}:{}),...(e instanceof AuthError&&e.me?{me:e.me}:{})}),{status:e.status||500,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store'}});}
 const headers=new Headers(response.headers);for(const [k,v] of Object.entries(security))headers.set(k,v);return new Response(response.body,{status:response.status,headers});
}};
