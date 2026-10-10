import {spawnSync} from 'node:child_process';
import {mkdirSync,readdirSync,readFileSync,writeFileSync,existsSync,copyFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT||'C:/Users/Mr.Linn/AppData/Local/Android/Sdk';
const jdk=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin'):'C:/Users/Mr.Linn/.jdks/jdk-17.0.20+8/bin';
const tools=path.join(sdk,'build-tools','35.0.0'),jar=path.join(sdk,'platforms','android-34','android.jar');
const build=path.resolve('android/build'),local=path.resolve('.local');mkdirSync(build,{recursive:true});mkdirSync(local,{recursive:true});for(const folder of ['generated','classes','dex'])mkdirSync(path.join(build,folder),{recursive:true});
function run(file,args,cwd=process.cwd()){let p;if(file.endsWith('.bat')){const cmd='"'+file+'" '+args.map(a=>'"'+a+'"').join(' ');p=spawnSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c',cmd],{cwd,encoding:'utf8',env:{...process.env,JAVA_HOME:path.dirname(jdk)}});}else p=spawnSync(file,args,{cwd,encoding:'utf8'});if(p.status!==0)throw Error((p.stderr||p.stdout||p.error?.message||'Android build failed').slice(0,4000));if(p.stdout)console.log(p.stdout.trim());if(p.stderr&&!file.includes('keytool'))console.log(p.stderr.trim());}
run(tools+'/aapt2.exe',['compile','--dir',path.resolve('android/res'),'-o',build+'/resources.zip']);
run(tools+'/aapt2.exe',['link','-o',build+'/base.apk','-I',jar,'--manifest',path.resolve('android/AndroidManifest.xml'),'--java',build+'/generated','--min-sdk-version','24','--target-sdk-version','35',build+'/resources.zip']);
function files(dir,ext){return readdirSync(dir,{withFileTypes:true}).flatMap(f=>f.isDirectory()?files(path.join(dir,f.name),ext):f.name.endsWith(ext)?[path.join(dir,f.name)]:[]);}
run(jdk+'/javac.exe',['-encoding','UTF-8','--release','8','-classpath',jar,'-d',build+'/classes',...files(path.resolve('android/src'),'.java'),...files(build+'/generated','.java')]);
// Invoke D8's Java entrypoint directly to avoid shell quoting through d8.bat.
run(jdk+'/java.exe',['-cp',tools+'/lib/d8.jar','com.android.tools.r8.D8','--lib',jar,'--min-api','24','--output',build+'/dex',...files(build+'/classes','.class')]);
run(jdk+'/jar.exe',['uf',build+'/base.apk','-C',build+'/dex','classes.dex']);
run(tools+'/zipalign.exe',['-f','-p','4',build+'/base.apk',build+'/aligned.apk']);
const ks=local+'/android-signing.p12',password=local+'/android-signing-password.txt';
if(!existsSync(ks)){const secret=randomBytes(32).toString('hex');writeFileSync(password,secret,{mode:0o600});run(jdk+'/keytool.exe',['-genkeypair','-keystore',ks,'-storetype','PKCS12','-storepass:file',password,'-keypass:file',password,'-alias','linn-it','-keyalg','RSA','-keysize','3072','-validity','3650','-dname','CN=Linn IT Solutions, O=Linn IT Solutions, C=MM']);}
const out=path.resolve('outputs/Linn-Tasks-1.0.0.apk');
mkdirSync(path.dirname(out),{recursive:true});
run(jdk+'/java.exe',['-jar',tools+'/lib/apksigner.jar','sign','--ks',ks,'--ks-pass','file:'+password,'--out',out,build+'/aligned.apk']);
run(jdk+'/java.exe',['-jar',tools+'/lib/apksigner.jar','verify','--verbose',out]);
run(tools+'/aapt2.exe',['dump','badging',out]);
console.log('Signed APK: '+out);
