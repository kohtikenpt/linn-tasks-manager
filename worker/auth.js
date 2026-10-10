import bcrypt from 'bcryptjs';

// Passwords and raw session/activation tokens never enter task records or browser storage.
const encoder=new TextEncoder();
const authNow=()=>new Date().toISOString();
const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
const secureEqual=(a,b)=>{if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;};
const sessionCookie='__Host-linn-session';
const cookie=(value,maxAge=86400)=>`${sessionCookie}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
const rawSession=req=>(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(sessionCookie+'='))?.slice(sessionCookie.length+1);
const authJSON=(value,status=200,setCookie)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store',...(setCookie?{'Set-Cookie':setCookie}:{})}});
export class AuthError extends Error {constructor(status,message){super(message);this.status=status;}}
const authFailure=(status,message)=>{throw new AuthError(status,message);};
const safeUser=u=>({id:u.id,name:u.name,email:u.email,role:u.role,department:u.department,active:!!u.active,linked:true,mustChangePassword:!!u.must_change});
const validToken=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const passwordValid=p=>{if(typeof p!=='string'||[...p].length<8||encoder.encode(p).length>72)authFailure(400,'Password ကို အနည်းဆုံး စာလုံး ၈ လုံး၊ UTF-8 ၇၂ bytes အတွင်း သတ်မှတ်ပါ။');};
export function requirePasswordChange(u){if(u.must_change){const e=new AuthError(403,'ယာယီ password ကို အရင်ပြောင်းပါ');e.code='PASSWORD_CHANGE_REQUIRED';e.me=safeUser(u);throw e;}}
export async function temporaryHash(env){if(!env.EMPLOYEE_DEFAULT_PASSWORD)authFailure(503,'ယာယီ password မသတ်မှတ်ရသေးပါ');passwordValid(env.EMPLOYEE_DEFAULT_PASSWORD);return bcrypt.hash(env.EMPLOYEE_DEFAULT_PASSWORD,12);}
async function authBody(req){const raw=await req.text();if(raw.length>4096)authFailure(413,'အချက်အလက်များလွန်းသည်');try{return JSON.parse(raw);}catch{authFailure(400,'အချက်အလက်ပုံစံ မှားနေသည်');}}

// Atomic fixed-window limits across all Worker instances, including unsuccessful requests.
async function limit(db,key,max){const now=Date.now(),until=now+900000;
 const row=await db.prepare('INSERT INTO auth_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END, expires_at=CASE WHEN expires_at<=? THEN ? ELSE expires_at END RETURNING count').bind(key,until,now,now,until).first();
 if(row.count>max)authFailure(429,'ကြိုးစားမှုများလွန်းသည်။ ၁၅ မိနစ်အကြာ ပြန်ကြိုးစားပါ။');
 await db.prepare('DELETE FROM auth_limits WHERE expires_at<?').bind(now-86400000).run();
}
async function authLimit(req,db,email){const ip=req.headers.get('cf-connecting-ip')||'unknown';await limit(db,'ip:'+await digest(ip),60);if(email)await limit(db,'email:'+await digest(email),10);}
export async function sessionIdentity(req,db){const token=rawSession(req);if(!validToken(token))return null;
 return db.prepare('SELECT e.*,c.must_change,1 AS password_ready FROM sessions s JOIN employees e ON e.id=s.employee_id JOIN credentials c ON c.employee_id=e.id WHERE s.token_hash=? AND s.expires_at>? AND e.active=1').bind(await digest(token),authNow()).first();
}
async function createSession(db,u,expectedHash){const token=randomToken(),now=authNow();const results=await db.batch([
 db.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(now),
 db.prepare('INSERT INTO sessions SELECT ?,e.id,?,? FROM employees e JOIN credentials c ON c.employee_id=e.id WHERE e.id=? AND e.active=1 AND c.password_hash=?').bind(await digest(token),new Date(Date.now()+86400000).toISOString(),now,u.id,expectedHash)
 ]);if(!results[1].meta.changes)authFailure(401,'အကောင့်အချက်အလက် ပြောင်းလဲနေသည်။ ပြန်ဝင်ပါ');return cookie(token);
}
async function activation(db,env,token){if(!validToken(token))return null;const tokenHash=await digest(token);
 // The existing CEO can initialize once using a private, expiring deployment secret.
 // There is no public registration and no first-visitor owner creation.
 if(env.ADMIN_SETUP_TOKEN&&validToken(env.ADMIN_SETUP_TOKEN)&&secureEqual(tokenHash,await digest(env.ADMIN_SETUP_TOKEN))&&env.ADMIN_SETUP_EXPIRES_AT>authNow()){
  const owner=await db.prepare("SELECT e.* FROM employees e LEFT JOIN credentials c ON c.employee_id=e.id WHERE e.role='ceo' AND e.active=1 AND c.employee_id IS NULL").first();
  if(owner)await db.prepare('INSERT OR IGNORE INTO auth_links (token_hash,employee_id,expires_at) VALUES (?,?,?)').bind(tokenHash,owner.id,env.ADMIN_SETUP_EXPIRES_AT).run();
 }
 return db.prepare('SELECT l.*,e.name,e.email,e.active FROM auth_links l JOIN employees e ON e.id=l.employee_id WHERE l.token_hash=? AND l.used_at IS NULL AND l.expires_at>? AND e.active=1').bind(tokenHash,authNow()).first();
}
export async function authRoutes(req,env){const db=env.DB,path=new URL(req.url).pathname,method=req.method;
 if(path==='/api/session'&&method==='GET'){const u=await sessionIdentity(req,db);return authJSON(u?{signedIn:true,me:safeUser(u)}:{signedIn:false});}
 if(!path.startsWith('/api/auth/'))return null;
 if(method!=='POST')authFailure(405,'ခွင့်မပြုသော request');
 if(path==='/api/auth/logout'){const token=rawSession(req);if(validToken(token))await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run();return authJSON({ok:true},200,cookie('',0));}
 const b=await authBody(req);
 if(path==='/api/auth/login'){
  const email=typeof b.email==='string'?b.email.trim().toLowerCase():'';
  if(!email||email.length>254||typeof b.password!=='string'||b.password.length>256)authFailure(400,'Email နှင့် password ကို ဖြည့်ပါ');
  await authLimit(req,db,email);
  let u=await db.prepare('SELECT e.*,c.password_hash,c.must_change FROM employees e JOIN credentials c ON c.employee_id=e.id WHERE e.email=? COLLATE NOCASE').bind(email).first();
  if(!u&&env.EMPLOYEE_DEFAULT_PASSWORD){
   const existing=await db.prepare("SELECT e.* FROM employees e LEFT JOIN credentials c ON c.employee_id=e.id WHERE e.email=? COLLATE NOCASE AND e.active=1 AND e.role!='ceo' AND c.employee_id IS NULL").bind(email).first();
   if(existing){const hash=await temporaryHash(env);await db.prepare('INSERT OR IGNORE INTO credentials (employee_id,password_hash,updated_at,must_change) VALUES (?,?,?,1)').bind(existing.id,hash,authNow()).run();u=await db.prepare('SELECT e.*,c.password_hash,c.must_change FROM employees e JOIN credentials c ON c.employee_id=e.id WHERE e.id=?').bind(existing.id).first();}
  }
  // Dummy bcrypt work for unknown accounts prevents an obvious account-existence timing leak.
  const verified=await bcrypt.compare(b.password,u?.password_hash||'$2b$12$abcdefghijklmnopqrstuuBx.TD/8P7unRIsENx6FHMrxzfLmCxEy');
  const ok=encoder.encode(b.password).length<=72&&verified;
  if(!u||!u.active||!ok)authFailure(401,'Email သို့မဟုတ် password မှားနေသည်။ မသတ်မှတ်ရသေးပါက Admin ထံ link တောင်းပါ။');
  return authJSON({me:safeUser(u)},200,await createSession(db,u,u.password_hash));
 }
 if(path==='/api/auth/activation'||path==='/api/auth/activate'){
  await authLimit(req,db);const link=await activation(db,env,b.token);if(!link)authFailure(400,'ဤ link သည် သက်တမ်းကုန် သို့မဟုတ် အသုံးပြုပြီးဖြစ်သည်။ Admin ထံ link အသစ်တောင်းပါ။');
  if(path.endsWith('/activation'))return authJSON({email:link.email,name:link.name});
  passwordValid(b.password);const hash=await bcrypt.hash(b.password,12),now=authNow(),claim=crypto.randomUUID();
  const results=await db.batch([
   db.prepare('UPDATE auth_links SET used_at=?,claim=? WHERE token_hash=? AND used_at IS NULL AND expires_at>?').bind(now,claim,link.token_hash,now),
   db.prepare('INSERT INTO credentials (employee_id,password_hash,updated_at,must_change) SELECT employee_id,?,?,0 FROM auth_links WHERE token_hash=? AND claim=? ON CONFLICT(employee_id) DO UPDATE SET password_hash=excluded.password_hash,updated_at=excluded.updated_at,must_change=0').bind(hash,now,link.token_hash,claim),
   db.prepare('DELETE FROM sessions WHERE employee_id IN (SELECT employee_id FROM auth_links WHERE token_hash=? AND claim=?)').bind(link.token_hash,claim)
  ]);
  if(!results[0].meta.changes)authFailure(409,'ဤ link ကို အသုံးပြုပြီးဖြစ်သည်');
  const u=await db.prepare('SELECT * FROM employees WHERE id=? AND active=1').bind(link.employee_id).first();if(!u)authFailure(403,'အကောင့်ကို ပိတ်ထားသည်');
  return authJSON({me:safeUser(u)},200,await createSession(db,u,hash));
 }
 const u=await sessionIdentity(req,db);if(!u)authFailure(401,'Email နှင့် password ဖြင့် ပြန်ဝင်ပါ');
 if(path==='/api/auth/change-password'){
  await authLimit(req,db,u.email);passwordValid(b.password);
  const c=await db.prepare('SELECT * FROM credentials WHERE employee_id=?').bind(u.id).first();
  if(!c||(!u.must_change&&(typeof b.currentPassword!=='string'||b.currentPassword.length>256||!await bcrypt.compare(b.currentPassword,c.password_hash))))authFailure(401,'လက်ရှိ password မှားနေသည်');
  if(await bcrypt.compare(b.password,c.password_hash))authFailure(400,'Password အသစ်သည် လက်ရှိ / ယာယီ password နှင့် မတူရပါ');
  const hash=await bcrypt.hash(b.password,12);
  const results=await db.batch([db.prepare('UPDATE credentials SET password_hash=?,updated_at=?,must_change=0 WHERE employee_id=? AND password_hash=?').bind(hash,authNow(),u.id,c.password_hash),db.prepare('DELETE FROM sessions WHERE employee_id=?').bind(u.id),db.prepare('DELETE FROM auth_links WHERE employee_id=?').bind(u.id)]);
  if(!results[0].meta.changes)authFailure(409,'Password ပြောင်းလဲနေသည်။ ပြန်ဝင်ပါ');
  return authJSON({ok:true},200,await createSession(db,u,hash));
 }
 requirePasswordChange(u);
 if(path==='/api/auth/temporary-password'){
  if(!['ceo','admin'].includes(u.role))authFailure(403,'Admin ခွင့်လိုအပ်သည်');
  const target=await db.prepare('SELECT * FROM employees WHERE id=? AND active=1').bind(b.employeeId).first();
  if(!target)authFailure(404,'ဝန်ထမ်း မတွေ့ပါ');
  if(target.id===u.id||target.role==='ceo'||(target.role==='admin'&&u.role!=='ceo'))authFailure(403,'ဤအကောင့်၏ password ပြန်သတ်မှတ်ခွင့် မရှိပါ');
  await limit(db,'invite:'+u.id,20);const hash=await temporaryHash(env);
  await db.batch([db.prepare('INSERT INTO credentials (employee_id,password_hash,updated_at,must_change) VALUES (?,?,?,1) ON CONFLICT(employee_id) DO UPDATE SET password_hash=excluded.password_hash,updated_at=excluded.updated_at,must_change=1').bind(target.id,hash,authNow()),db.prepare('DELETE FROM sessions WHERE employee_id=?').bind(target.id),db.prepare('DELETE FROM auth_links WHERE employee_id=?').bind(target.id)]);
  return authJSON({email:target.email,temporaryPassword:env.EMPLOYEE_DEFAULT_PASSWORD,mustChangePassword:true});
 }
 if(path==='/api/auth/invite'){
  if(!['ceo','admin'].includes(u.role))authFailure(403,'Admin ခွင့်လိုအပ်သည်');
  const target=await db.prepare('SELECT * FROM employees WHERE id=? AND active=1').bind(b.employeeId).first();
  if(!target)authFailure(404,'ဝန်ထမ်း မတွေ့ပါ');
  if(target.id===u.id||target.role==='ceo'||(target.role==='admin'&&u.role!=='ceo'))authFailure(403,'ဤအကောင့်၏ password ပြန်သတ်မှတ်ခွင့် မရှိပါ');
  await limit(db,'invite:'+u.id,20);const token=randomToken(),expiresAt=new Date(Date.now()+86400000).toISOString();
  await db.batch([db.prepare('DELETE FROM auth_links WHERE employee_id=?').bind(target.id),db.prepare('INSERT INTO auth_links (token_hash,employee_id,expires_at) VALUES (?,?,?)').bind(await digest(token),target.id,expiresAt)]);
  return authJSON({url:new URL(req.url).origin+'/#activate='+token,email:target.email,expiresAt});
 }
 authFailure(404,'မတွေ့ပါ');
}
