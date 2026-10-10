const CACHE='linn-shell-v10';
const SHELL=['/index.html','/styles.css','/app.js','/logo.png','/icon-192.png','/icon-512.png','/manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
// Never cache business records, authentication or uploaded files.
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.origin!==self.location.origin||e.request.method!=='GET'||u.pathname.startsWith('/api/')||u.pathname.includes('chatgpt')||u.pathname==='/callback')return;
 if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.match('/index.html')));return;}
 if(SHELL.includes(u.pathname))e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request)));
});
self.addEventListener('push',event=>{let n;try{n=event.data.json();}catch{n={title:'Linn Tasks အသိပေးချက်',body:'အသေးစိတ်ကို app ထဲတွင် ကြည့်ပါ။'};}event.waitUntil(Promise.all([self.registration.showNotification(n.title||'Linn Tasks',{body:n.body||'',icon:'/icon-192.png',badge:'/icon-192.png',tag:n.id||'linn-notice',renotify:true,timestamp:Date.now(),data:{task:n.task||null}}),clients.matchAll({type:'window',includeUncontrolled:true}).then(all=>Promise.all(all.map(client=>client.postMessage({type:'linn-notification',task:n.task||null}))))]));});
self.addEventListener('notificationclick',event=>{event.notification.close();const task=event.notification.data?.task,url='/'+(task?'#task='+encodeURIComponent(task):'');event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async all=>{const existing=all.find(c=>new URL(c.url).origin===self.location.origin);if(existing){await existing.navigate(url);return existing.focus();}return clients.openWindow(url);}));});
