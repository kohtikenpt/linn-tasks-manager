import {buildPushPayload} from '@block65/webcrypto-web-push';
const noticeTitles={task_created:'အလုပ်အသစ် တာဝန်ပေးထားသည်',task_updated:'အလုပ်အခြေအနေ ပြောင်းထားသည်',comment_added:'မှတ်ချက်အသစ် ရေးထားသည်',attachment_added:'ဖိုင်အသစ် တွဲထားသည်',due:'ပြီးစီးချိန် နီးလာပါပြီ',overdue:'သတ်မှတ်ချိန် ကျော်နေပါပြီ',test:'စမ်းသပ် အသိပေးချက်'};
export const pushConfigured=env=>!!(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY&&env.VAPID_SUBJECT);
export const noticeHash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
export function pushEndpointAllowed(endpoint){try{const url=new URL(endpoint);return url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443')&&(url.hostname==='fcm.googleapis.com'||url.hostname==='updates.push.services.mozilla.com'||url.hostname.endsWith('.push.apple.com')||url.hostname==='web.push.apple.com'||url.hostname.endsWith('.notify.windows.com'));}catch{return false;}}
const validBase64=(value,length)=>{try{return typeof value==='string'&&/^[\w-]+$/.test(value)&&atob(value.replaceAll('-','+').replaceAll('_','/')).length===length;}catch{return false;}};
export function validateSubscription(b){if(!b||typeof b.endpoint!=='string'||b.endpoint.length>2048||!pushEndpointAllowed(b.endpoint)||!validBase64(b.keys?.auth,16)||!validBase64(b.keys?.p256dh,65))return false;return true;}
export async function saveSubscription(env,u,req,b){
 if(!validateSubscription(b))return false;
 const token=req.headers.get('cookie')?.match(/(?:^|;\s*)__Host-linn-session=([a-f0-9]{64})(?:;|$)/)?.[1];if(!token)return false;
 await env.DB.prepare('INSERT INTO push_subscriptions VALUES (?,?,?,?,?) ON CONFLICT(endpoint_hash) DO UPDATE SET employee_id=excluded.employee_id,session_hash=excluded.session_hash,subscription=excluded.subscription,created_at=excluded.created_at').bind(await noticeHash(b.endpoint),u.id,await noticeHash(token),JSON.stringify({endpoint:b.endpoint,keys:b.keys}),new Date().toISOString()).run();return true;
}
export async function sendPush(env,employeeId,notice){
 if(!pushConfigured(env))return {sent:0,failed:0};
 const subscriptions=(await env.DB.prepare('SELECT p.* FROM push_subscriptions p JOIN sessions s ON s.token_hash=p.session_hash AND s.employee_id=p.employee_id JOIN employees e ON e.id=p.employee_id JOIN credentials c ON c.employee_id=e.id WHERE p.employee_id=? AND s.expires_at>? AND e.active=1 AND c.must_change=0').bind(employeeId,new Date().toISOString()).all()).results;
 let sent=0,failed=0;
 for(const row of subscriptions){try{
  const sub=JSON.parse(row.subscription);if(!validateSubscription(sub))continue;
  // Keep lock-screen payloads generic; task details require the signed-in application.
  const message={data:JSON.stringify({id:notice.id,title:noticeTitles[notice.kind]||'Linn Tasks အသိပေးချက်',body:'အသေးစိတ်ကို Linn Tasks ထဲတွင် ကြည့်ပါ။',task:notice.task_id}),options:{ttl:86400,urgency:['due','overdue'].includes(notice.kind)?'high':'normal'}};
  const payload=await buildPushPayload(message,sub,{subject:env.VAPID_SUBJECT,publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY});
  const response=await (env.PUSH_FETCH||fetch)(sub.endpoint,{...payload,signal:AbortSignal.timeout(8000),redirect:'error'});
  if(response.ok)sent++;else{failed++;if(response.status===404||response.status===410)await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint_hash=?').bind(row.endpoint_hash).run();}
 }catch{failed++;}}
 return {sent,failed};
}
export async function publishNotice(env,actor,t,taskId,kind,dedupe,ctx){
 const members=new Set([...t.assignees,...t.collaborators]);
 const recipients=(await env.DB.prepare('SELECT * FROM employees WHERE active=1').all()).results.filter(p=>p.id!==actor?.id&&(members.has(p.id)||p.role==='ceo'||p.role==='admin'));
 let created=0;
 for(const p of recipients){const n={id:crypto.randomUUID(),task_id:taskId,kind,body:t.title,created_at:new Date().toISOString()};const inserted=await env.DB.prepare('INSERT OR IGNORE INTO notifications VALUES (?,?,?,?,?,?,NULL,?)').bind(n.id,p.id,taskId,kind,n.body,n.created_at,dedupe).run();if(inserted.meta.changes){created++;await queueNotices(env,ctx,sendPush(env,p.id,n));}}
 return created;
}
export async function collectDueNotices(env,ctx){
 const nowIso=new Date().toISOString(),leaseBefore=new Date(Date.now()-4*60000).toISOString();
 const initial=await env.DB.prepare("INSERT OR IGNORE INTO system_state VALUES ('deadline_sweep',?,?)").bind(nowIso,nowIso).run();
 if(!initial.meta.changes){const acquired=await env.DB.prepare("UPDATE system_state SET value=?,updated_at=? WHERE key='deadline_sweep' AND updated_at<?").bind(nowIso,nowIso,leaseBefore).run();if(!acquired.meta.changes)return {ok:true,skipped:true,created:0,scanned:0};}
 const rows=(await env.DB.prepare('SELECT * FROM tasks WHERE deleted=0').all()).results,now=Date.now();
 let created=0;
 for(const row of rows){const t=JSON.parse(row.data),deadline=Date.parse(t.deadline);if(t.status==='done'||!Number.isFinite(deadline)||deadline-now>t.reminder*60000)continue;
  const kind=deadline<now?'overdue':'due';created+=await publishNotice(env,null,t,row.id,kind,`${kind}:${row.id}:${t.deadline}:${t.reminder}`,ctx);
 }
 return {ok:true,skipped:false,created,scanned:rows.length};
}
export function queueNotices(env,ctx,promise){const safe=promise.catch(()=>console.error('Notification dispatch failed'));if(ctx?.waitUntil){ctx.waitUntil(safe);return Promise.resolve();}return safe;}
