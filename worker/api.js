import {authRoutes,sessionIdentity,requirePasswordChange,temporaryHash} from './auth.js';
import {pushConfigured,validateSubscription,saveSubscription,noticeHash,sendPush,publishNotice,collectDueNotices,queueNotices} from './notifications.js';
const iso=()=>new Date().toISOString();
const uuid=()=>crypto.randomUUID();
export class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
const fail=(status,msg)=>{throw new HttpError(status,msg);};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store'}});
const admin=u=>u.role==='admin'||u.role==='ceo';
const previewImageTypes=new Set(['image/jpeg','image/png','image/gif','image/webp','image/avif']);
const publicEmployee=e=>({id:e.id,name:e.name,email:e.email,role:e.role,department:e.department,active:!!e.active,linked:!!e.password_ready,mustChangePassword:!!e.must_change});
const text=(v,max,required=false)=>{if(typeof v!=='string'||v.length>max||(required&&!v.trim()))fail(400,'ဖြည့်သွင်းထားသော အချက်အလက်ကို ပြန်စစ်ပါ');return v.trim();};
const audit=(db,u,task,action)=>db.prepare('INSERT INTO audit VALUES (?,?,?,?,?)').bind(uuid(),u.id,task,action,iso());
async function body(req){if(Number(req.headers.get('content-length')||0)>100000)fail(413,'အချက်အလက်ပမာဏ များလွန်းသည်');const raw=await req.text();if(raw.length>100000)fail(413,'အချက်အလက်ပမာဏ များလွန်းသည်');try{return JSON.parse(raw);}catch{fail(400,'အချက်အလက်ပုံစံ မှားနေသည်');}}
export async function identity(req,db){const u=await sessionIdentity(req,db);if(!u)fail(401,'Email နှင့် password ဖြင့် ဝင်ရောက်ပါ');return u;}
const unpack=r=>({...JSON.parse(r.data),id:r.id,version:r.version,createdAt:r.created_at,updatedAt:r.updated_at});
export const canRead=(u,t)=>admin(u)||t.assignees.includes(u.id)||t.collaborators.includes(u.id);
async function taskFor(db,u,id){const r=await db.prepare('SELECT * FROM tasks WHERE id=? AND deleted=0').bind(id).first();if(!r)fail(404,'အလုပ် မတွေ့ပါ');const t=unpack(r);if(!canRead(u,t))fail(403,'ဤအလုပ်ကို ကြည့်ခွင့်မရှိပါ');return t;}
export function validateTask(b,people){
 const title=text(b.title,160,true),details=text(b.details??'',10000);
 if(!['todo','doing','review','done','blocked'].includes(b.status)||!['low','normal','high','urgent'].includes(b.priority))fail(400,'အခြေအနေ သို့မဟုတ် ဦးစားပေးအဆင့် မှားနေသည်');
 const start=new Date(b.start),deadline=new Date(b.deadline);
 if(!Number.isFinite(+start)||!Number.isFinite(+deadline)||deadline<=start)fail(400,'ပြီးစီးချိန်သည် စတင်ချိန်ထက် နောက်ကျရပါမည်');
 const ids=new Set(people.filter(p=>p.active).map(p=>p.id));
 if(!Array.isArray(b.assignees)||!b.assignees.length||b.assignees.length>100||!Array.isArray(b.collaborators)||b.collaborators.length>100)fail(400,'တာဝန်ယူသူ အနည်းဆုံးတစ်ဦး ရွေးပါ');
 if([...b.assignees,...b.collaborators].some(id=>!ids.has(id)))fail(400,'ရွေးထားသော ဝန်ထမ်းကို ပြန်စစ်ပါ');
 if(!Number.isInteger(b.progress)||b.progress<0||b.progress>100)fail(400,'တိုးတက်မှု 0 မှ 100 အတွင်း ဖြစ်ရပါမည်');
 if(![0,15,30,60,1440].includes(b.reminder))fail(400,'သတိပေးချိန် မှားနေသည်');
 return {title,details,assignees:[...new Set(b.assignees)],collaborators:[...new Set(b.collaborators)].filter(id=>!b.assignees.includes(id)),start:start.toISOString(),deadline:deadline.toISOString(),status:b.status,priority:b.priority,progress:b.status==='done'?100:b.progress,reminder:b.reminder};
}
export async function api(req,env,ctx){
 const db=env.DB;if(!db)fail(503,'ဒေတာဘေ့စ် ချိတ်ဆက်မှု မရှိသေးပါ');
 const url=new URL(req.url),path=url.pathname,method=req.method;
 if(method!=='GET'&&method!=='HEAD'){
  if(req.headers.get('origin')!==url.origin||req.headers.get('x-linn-client')!=='1')fail(403,'ခွင့်မပြုသော request');
 }
 const authResponse=await authRoutes(req,env);if(authResponse)return authResponse;
 const u=await identity(req,db);requirePasswordChange(u);
 if(path==='/api/profile'&&method==='PATCH'){
  const b=await body(req);if(Object.keys(b).some(k=>!['name','department'].includes(k)))fail(400,'အမည်နှင့် ဌာနကိုသာ ပြင်နိုင်သည်');
  const name=text(b.name,100,true),department=text(b.department??u.department,100);
  await db.batch([db.prepare('UPDATE employees SET name=?,department=? WHERE id=?').bind(name,department,u.id),audit(db,u,null,'profile_updated')]);return json({ok:true});
 }
 if(path==='/api/notifications'&&method==='GET'){
  await collectDueNotices(env,ctx);
  const tasks=(await db.prepare('SELECT * FROM tasks WHERE deleted=0').all()).results.map(unpack),allowed=new Set(tasks.filter(t=>canRead(u,t)).map(t=>t.id));
  const items=(await db.prepare('SELECT * FROM notifications WHERE employee_id=? ORDER BY created_at DESC LIMIT 200').bind(u.id).all()).results.filter(n=>!n.task_id||allowed.has(n.task_id));
  return json({items,pushConfigured:pushConfigured(env),publicKey:env.VAPID_PUBLIC_KEY||null});
 }
 if(path==='/api/notifications/read'&&method==='POST'){
  const b=await body(req);if(b.all===true)await db.prepare('UPDATE notifications SET read_at=? WHERE employee_id=? AND read_at IS NULL').bind(iso(),u.id).run();
  else {const id=text(b.id,100,true);await db.prepare('UPDATE notifications SET read_at=? WHERE id=? AND employee_id=?').bind(iso(),id,u.id).run();}return json({ok:true});
 }
 if(path==='/api/notifications/subscription'&&method==='POST'){
  if(!pushConfigured(env))fail(503,'ဖုန်းအသိပေးချက် service မချိတ်ဆက်ရသေးပါ');const b=await body(req);if(!validateSubscription(b)||!await saveSubscription(env,u,req,b))fail(400,'ဖုန်းအသိပေးချက် မှတ်ပုံတင်မှု မှားနေသည်');return json({ok:true});
 }
 if(path==='/api/notifications/subscription'&&method==='DELETE'){
  const b=await body(req);await db.prepare('DELETE FROM push_subscriptions WHERE endpoint_hash=? AND employee_id=?').bind(await noticeHash(text(b.endpoint,2048,true)),u.id).run();return json({ok:true});
 }
 if(path==='/api/notifications/test'&&method==='POST'){
  const now=iso(),id=uuid();await db.prepare('INSERT INTO notifications VALUES (?,?,NULL,?,?,?,NULL,?)').bind(id,u.id,'test','ဖုန်းသတိပေးချက် စမ်းသပ်မှု',now,'test:'+id).run();return json({ok:true,...await sendPush(env,u.id,{id,kind:'test',task_id:null})});
 }
 if(path==='/api/state'&&method==='GET'){
  const people=(await db.prepare('SELECT e.*,c.must_change, CASE WHEN c.employee_id IS NOT NULL THEN 1 ELSE 0 END AS password_ready FROM employees e LEFT JOIN credentials c ON c.employee_id=e.id ORDER BY e.created_at').all()).results;
  const tasks=(await db.prepare('SELECT * FROM tasks WHERE deleted=0 ORDER BY updated_at DESC').all()).results.map(unpack).filter(t=>canRead(u,t));
  const allowed=new Set(tasks.map(t=>t.id));
  const comments=(await db.prepare('SELECT * FROM comments ORDER BY created_at').all()).results.filter(c=>allowed.has(c.task_id));
  const attachments=(await db.prepare('SELECT * FROM attachments ORDER BY created_at').all()).results.filter(a=>allowed.has(a.task_id));
  const activity=(await db.prepare('SELECT * FROM audit ORDER BY created_at DESC LIMIT 100').all()).results.filter(a=>admin(u)||(a.task_id&&allowed.has(a.task_id)));
  // Employees see colleague display data, but not others' account email addresses.
  return json({me:publicEmployee(u),people:people.map(p=>({...publicEmployee(p),email:admin(u)||p.id===u.id?p.email:''})),tasks,comments,attachments,activity,filesReady:!!env.BUCKET,serverTime:iso()});
 }
 if(path==='/api/employees'&&method==='POST'){
  if(!admin(u))fail(403,'Admin ခွင့်လိုအပ်သည်');const b=await body(req);
  const name=text(b.name,100,true),email=text(b.email,254,true).toLowerCase(),department=text(b.department??'',100);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'အီးမေးလ်ကို ပြန်စစ်ပါ');
  if(!['admin','employee'].includes(b.role)||(b.role==='admin'&&u.role!=='ceo'))fail(403,'Admin ခန့်အပ်ရန် CEO ခွင့်လိုသည်');
  const existing=await db.prepare('SELECT id FROM employees WHERE email=?').bind(email).first();if(existing)fail(409,'ဤအီးမေးလ် ရှိပြီးသားဖြစ်သည်');
  const id=uuid(),hash=env.EMPLOYEE_DEFAULT_PASSWORD?await temporaryHash(env):null;
  await db.batch([db.prepare('INSERT INTO employees VALUES (?,?,?,?,?,?,1,?)').bind(id,null,name,email,b.role,department,iso()),...(hash?[db.prepare('INSERT INTO credentials (employee_id,password_hash,updated_at,must_change) VALUES (?,?,?,1)').bind(id,hash,iso())]:[]),audit(db,u,null,'employee_added')]);return json({ok:true,id,...(hash?{email,temporaryPassword:env.EMPLOYEE_DEFAULT_PASSWORD,mustChangePassword:true}:{})},201);
 }
 if(path.startsWith('/api/employees/')&&method==='PATCH'){
  if(u.role!=='ceo')fail(403,'CEO ခွင့်လိုအပ်သည်');const id=path.split('/')[3],b=await body(req);
  if(Object.keys(b).some(k=>!['name','department','role','active'].includes(k)))fail(400,'အချက်အလက်ကို ပြန်စစ်ပါ');
  const e=await db.prepare('SELECT * FROM employees WHERE id=?').bind(id).first();if(!e)fail(404,'ဝန်ထမ်း မတွေ့ပါ');
  const name=text(b.name??e.name,100,true),department=text(b.department??e.department,100),role=b.role??e.role,active=b.active??!!e.active;
  if(typeof active!=='boolean'||!['ceo','admin','employee'].includes(role))fail(400,'ခွင့်ပြုချက်ကို ပြန်စစ်ပါ');
  if(e.role==='ceo'&&(role!=='ceo'||active!==!!e.active))fail(400,'CEO ခွင့်ကို ပြောင်းမရပါ');
  if(e.role!=='ceo'&&role==='ceo')fail(403,'CEO အသစ် ခန့်မရပါ');
  await db.batch([db.prepare('UPDATE employees SET name=?,department=?,role=?,active=? WHERE id=?').bind(name,department,role,active?1:0,id),audit(db,u,null,'employee_updated')]);return json({ok:true});
 }
 if(path==='/api/tasks'&&method==='POST'){
  if(!admin(u))fail(403,'အလုပ်တာဝန်ပေးရန် Admin ခွင့်လိုသည်');const b=await body(req),people=(await db.prepare('SELECT * FROM employees').all()).results;
  const t={...validateTask(b,people),createdBy:u.id},id=uuid(),now=iso();
  await db.batch([db.prepare('INSERT INTO tasks VALUES (?,?,1,0,?,?)').bind(id,JSON.stringify(t),now,now),audit(db,u,id,'task_created')]);await queueNotices(env,ctx,publishNotice(env,u,t,id,'task_created','created:'+id));return json({id},201);
 }
 const match=path.match(/^\/api\/tasks\/([^/]+)(?:\/(comments|attachments))?$/);
 if(match){
  const id=match[1],sub=match[2],t=await taskFor(db,u,id);
  if(!sub&&method==='PATCH'){
   const b=await body(req);if(b.version!==t.version)fail(409,'ဤအလုပ်ကို တခြားသူ ပြောင်းထားသည်။ ပြန်တင်ပြီး ထပ်သိမ်းပါ');
   if(!admin(u)&&Object.keys(b).some(k=>!['version','status','progress'].includes(k)))fail(403,'အလုပ်အသေးစိတ် ပြင်ရန် Admin ခွင့်လိုသည်');
   const people=(await db.prepare('SELECT * FROM employees').all()).results;
   // Retain historical inactive members during progress edits; reassignment still requires active people.
   const all=people.map(p=>({...p,active:p.active||t.assignees.includes(p.id)||t.collaborators.includes(p.id)}));
   const updated={...validateTask({...t,...b},all),createdBy:t.createdBy};
   const changed=await db.prepare('UPDATE tasks SET data=?,version=version+1,updated_at=? WHERE id=? AND version=? AND deleted=0').bind(JSON.stringify(updated),iso(),id,t.version).run();
   if(!changed.meta.changes)fail(409,'အချက်အလက် ပြောင်းလဲနေသည်။ ပြန်တင်ပါ');await audit(db,u,id,'task_updated').run();await queueNotices(env,ctx,publishNotice(env,u,updated,id,'task_updated',`updated:${id}:${t.version+1}`));return json({ok:true});
  }
  if(!sub&&method==='DELETE'){
   if(!admin(u))fail(403,'Admin ခွင့်လိုအပ်သည်');await db.batch([db.prepare('UPDATE tasks SET deleted=1,version=version+1,updated_at=? WHERE id=?').bind(iso(),id),audit(db,u,id,'task_deleted')]);return json({ok:true});
  }
  if(sub==='comments'&&method==='POST'){
   const b=await body(req),cid=uuid();await db.batch([db.prepare('INSERT INTO comments VALUES (?,?,?,?,?)').bind(cid,id,u.id,text(b.body,4000,true),iso()),audit(db,u,id,'comment_added')]);await queueNotices(env,ctx,publishNotice(env,u,t,id,'comment_added','comment:'+cid));return json({ok:true},201);
  }
  if(sub==='attachments'&&method==='POST'){
   if(!env.BUCKET)fail(503,'ဖိုင်သိမ်းဆည်းမှု မချိတ်ဆက်ရသေးပါ');if(Number(req.headers.get('content-length')||0)>11*1024*1024)fail(413,'ဖိုင်တစ်ဖိုင် 10 MB အများဆုံးသာ တင်နိုင်သည်');
   const form=await req.formData(),file=form.get('file');if(!file||typeof file==='string'||file.size===0||file.size>10*1024*1024)fail(400,'10 MB အောက် ဖိုင်တစ်ဖိုင် ရွေးပါ');
   const name=text(file.name.replace(/[\r\n\\/]/g,'_'),240,true),fid=uuid(),type=file.type||'application/octet-stream';await env.BUCKET.put(fid,file.stream(),{httpMetadata:{contentType:previewImageTypes.has(type)?type:'application/octet-stream'}});
   try{await db.batch([db.prepare('INSERT INTO attachments VALUES (?,?,?,?,?,?,?)').bind(fid,id,u.id,name,file.size,file.type||'application/octet-stream',iso()),audit(db,u,id,'attachment_added')]);}catch(e){await env.BUCKET.delete(fid);throw e;}await queueNotices(env,ctx,publishNotice(env,u,t,id,'attachment_added','attachment:'+fid));return json({ok:true},201);
  }
 }
 if(path.startsWith('/api/files/')&&method==='GET'){
  const fid=path.split('/')[3],a=await db.prepare('SELECT * FROM attachments WHERE id=?').bind(fid).first();if(!a)fail(404,'ဖိုင် မတွေ့ပါ');await taskFor(db,u,a.task_id);if(!env.BUCKET)fail(503,'ဖိုင်သိုလှောင်မှု မရှိပါ');const object=await env.BUCKET.get(fid);if(!object)fail(404,'ဖိုင် မတွေ့ပါ');const preview=url.searchParams.get('preview')==='1'&&previewImageTypes.has(a.content_type),disposition=preview?'inline':'attachment';return new Response(object.body,{headers:{'Content-Type':preview?a.content_type:'application/octet-stream','Content-Disposition':`${disposition}; filename="attachment"; filename*=UTF-8''${encodeURIComponent(a.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 fail(404,'မတွေ့ပါ');
}
