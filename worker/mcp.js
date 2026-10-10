import {collectDueNotices} from './notifications.js';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const result=(id,value)=>json({jsonrpc:'2.0',id,result:value});
const error=(id,code,message)=>json({jsonrpc:'2.0',id,error:{code,message}});
const tool={name:'check_deadlines',title:'Check overdue task deadlines',description:'Check Linn Tasks deadlines and create deduplicated notifications for administrators and assigned team members when work is due or overdue.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}};
export async function mcp(req,env,ctx){
 if(req.method!=='POST')return new Response('Method not allowed',{status:405,headers:{Allow:'POST'}});
 let message;try{message=await req.json();}catch{return error(null,-32700,'Parse error');}
 const id=message?.id??null,method=message?.method;
 if(method==='initialize')return result(id,{protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'Linn Tasks Deadline Service',version:'1.0.0'}});
 if(method==='notifications/initialized')return new Response(null,{status:202});
 if(method==='ping')return result(id,{});
 if(method==='tools/list')return result(id,{tools:[tool]});
 if(method==='tools/call'){
  if(message?.params?.name!==tool.name)return error(id,-32602,'Unknown tool');
  const check=collectDueNotices(env,ctx);
  const outcome=ctx?.waitUntil?(ctx.waitUntil(check),{accepted:true}):await check;
  return result(id,{content:[{type:'text',text:outcome.skipped?'A recent deadline check already ran.':'Deadline check completed.'}],structuredContent:outcome,isError:false});
 }
 return error(id,-32601,'Method not found');
}
