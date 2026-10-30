// Isolated authoritative-record and recurrence checks. No production traffic or email.
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('node:assert/strict'),ts=require('typescript');
Object.assign(process.env,{FREMEN_DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'wellness-repeat-unit-')),FREMEN_REQUIRE_SUPABASE:'false',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',ADMIN_SESSION_SECRET:'local-repeat',RESEND_API_KEY:''});
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {saveWellnessEntry,readWellnessState}=require('../lib/modules/personal-wellness/store.ts');
const {wellnessCalendarEvents}=require('../lib/modules/personal-wellness/calendar.ts');
const {eventOccurrences}=require('../lib/modules/planning/calendar-model.ts');
const {wellnessOccurrences}=require('../lib/modules/personal-wellness/schedule.ts');
const {readPlanningState}=require('../lib/modules/planning/store.ts');
(async()=>{
 const before=await readPlanningState(),schedule={start:'2026-10-30T12:00',end:'2026-10-30T13:00',timeZone:'America/New_York',calendarId:'native',repeat:{weekdays:[1,3,5],until:'2026-11-09'}};
 const input={kind:'workout',title:'Repeating strength',date:'2026-10-30',status:'planned',notes:'Private',fields:{minutes:'60'},archived:false,schedule};
 let entry=await saveWellnessEntry('fitness',input);
 const expand=()=>eventOccurrences(wellnessCalendarEvents('fitness',[entry]),'2026-10-29','2026-11-12','America/New_York');
 assert.deepEqual(expand().map(x=>x.start.slice(0,10)),['2026-10-30','2026-11-02','2026-11-04','2026-11-06','2026-11-09']);assert.equal(new Date(expand()[0].startMs).getUTCHours(),16);assert.equal(new Date(expand()[1].startMs).getUTCHours(),17);
 const change=async(data)=>entry=await saveWellnessEntry('fitness',{},entry.id,entry.updatedAt,data);
 await change({date:'2026-11-02',completed:true});assert.equal(expand().filter(x=>x.completed).length,1);assert.equal(expand().find(x=>x.completed).occurrenceKey,'2026-11-02T12:00:00');assert.equal(entry.status,'planned');
 await change({date:'2026-11-04',completed:true});await change({date:'2026-11-02',completed:false});assert.equal(expand().filter(x=>x.completed).length,1);assert.equal(expand().find(x=>x.completed).start.slice(0,10),'2026-11-04');
 await change({date:'2026-11-04',start:'2026-11-05T15:00',end:'2026-11-05T16:30'});assert.equal(expand().filter(x=>x.completed).length,1);assert.equal(expand().find(x=>x.completed).start,'2026-11-05T15:00');assert.equal(expand().length,5);assert.equal(wellnessOccurrences(entry,'2026-11-02','2026-11-08').length,3);
 const stale=entry.updatedAt;await change({date:'2026-11-06',completed:true});await assert.rejects(saveWellnessEntry('fitness',{},entry.id,stale,{date:'2026-11-09',completed:true}),/changed elsewhere/);
 await assert.rejects(saveWellnessEntry('fitness',{},entry.id,entry.updatedAt,{date:'2026-11-03',completed:true}),/scheduled occurrence/);await assert.rejects(saveWellnessEntry('fitness',{},entry.id,entry.updatedAt,{date:'2026-11-11',completed:true}),/scheduled occurrence/);await assert.rejects(saveWellnessEntry('fitness',{status:'completed'},entry.id,entry.updatedAt),/separately/);
 const history=entry.occurrenceOverrides;entry=await saveWellnessEntry('fitness',{schedule:{...schedule,start:'2026-10-30T10:00',end:'2026-10-30T11:00'}},entry.id,entry.updatedAt);assert.deepEqual(entry.occurrenceOverrides,history);assert.equal(expand().filter(x=>x.completed).length,2);assert.equal(expand().find(x=>x.occurrenceKey.startsWith('2026-11-04')).start,'2026-11-05T15:00');
 const savedId=entry.id;entry=await saveWellnessEntry('fitness',{archived:true},entry.id,entry.updatedAt);assert.equal(expand().length,0);entry=await saveWellnessEntry('fitness',{archived:false},entry.id,entry.updatedAt);assert.equal(entry.id,savedId);assert.equal(expand().length,5);assert.equal((await readWellnessState('fitness')).entries.length,1);
 for(const repeat of [{weekdays:[]},{weekdays:[0]},{weekdays:[8]},{weekdays:[1],until:'2026-10-31'},{weekdays:[1],until:'2026-02-30'}])await assert.rejects(saveWellnessEntry('fitness',{...input,schedule:{...schedule,repeat}}));
 const meal=await saveWellnessEntry('meals',{...input,kind:'meal',fields:{},schedule:{...schedule,repeat:{weekdays:[1,1,3]}}});assert.deepEqual(meal.schedule.repeat.weekdays,[1,3]);assert.equal(eventOccurrences(wellnessCalendarEvents('meals',[meal]),'2026-10-29','2026-11-05','UTC').length,2);
 let single=await saveWellnessEntry('fitness',{...input,title:'One-off complete',status:'completed',schedule:{...schedule,repeat:undefined}});single=await saveWellnessEntry('fitness',{schedule},single.id,single.updatedAt);const converted=eventOccurrences(wellnessCalendarEvents('fitness',[single]),'2026-10-29','2026-11-12','UTC');assert.equal(converted.filter(x=>x.completed).length,1);assert(converted[0].completed);
 assert.deepEqual(await readPlanningState(),before);console.log('PASS: selected weekdays, first/last date, timezone/DST, per-occurrence complete/reopen, moved-instance identity, stale writes, series history retention, archive/restore, single-to-repeat conversion, deduplication and unchanged native Calendar data.');
})().catch(e=>{console.error(e);process.exitCode=1;});
