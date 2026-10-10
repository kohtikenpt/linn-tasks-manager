import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync,mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
export function database(filename=':memory:'){
 const db=new DatabaseSync(filename);db.exec('PRAGMA foreign_keys=ON');
 if(!db.prepare("SELECT name FROM sqlite_master WHERE name='workspace'").get())db.exec(readFileSync('drizzle/0000_linn.sql','utf8').replaceAll('--> statement-breakpoint',''));
 if(!db.prepare("SELECT name FROM sqlite_master WHERE name='credentials'").get())db.exec(readFileSync('drizzle/0001_email_auth.sql','utf8').replaceAll('--> statement-breakpoint',''));
 if(!db.prepare('PRAGMA table_info(credentials)').all().some(c=>c.name==='must_change'))db.exec(readFileSync('drizzle/0002_temporary_password.sql','utf8'));
 if(!db.prepare("SELECT name FROM sqlite_master WHERE name='notifications'").get())db.exec(readFileSync('drizzle/0003_notifications.sql','utf8').replaceAll('--> statement-breakpoint',''));
 if(!db.prepare("SELECT name FROM sqlite_master WHERE name='system_state'").get())db.exec(readFileSync('drizzle/0004_pwa_deadline_schedule.sql','utf8'));
 if(!db.prepare("SELECT name FROM sqlite_master WHERE name='employee_photos'").get())db.exec(readFileSync('drizzle/0005_employee_photos.sql','utf8'));
 const wrap=(sql,values=[])=>({bind(...v){return wrap(sql,v);},async first(){return db.prepare(sql).get(...values)||null;},async all(){return {results:db.prepare(sql).all(...values)};},async run(){const r=db.prepare(sql).run(...values);return {meta:{changes:Number(r.changes)}};}});
 return {raw:db,prepare:sql=>wrap(sql),async batch(statements){db.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
}
export function bucket(directory){mkdirSync(directory,{recursive:true});return {async put(id,stream){const data=await new Response(stream).arrayBuffer();writeFileSync(path.join(directory,id),new Uint8Array(data));},async get(id){const file=path.join(directory,id);return existsSync(file)?{body:readFileSync(file)}:null;},async delete(id){const file=path.join(directory,id);if(existsSync(file))unlinkSync(file);}};}
