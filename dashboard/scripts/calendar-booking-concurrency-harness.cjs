/* Simulated Supabase compare-and-set conflict. No network or provider writes. */
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),{randomUUID}=require('node:crypto');
process.env.RESEND_API_KEY = '';
Object.assign(process.env,{SUPABASE_URL:'https://booking-store.example.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-test-key',FREMEN_REQUIRE_SUPABASE:'true',ADMIN_SESSION_SECRET:'synthetic-booking-key'});
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const {emptyPlanningState}=require('../lib/modules/planning/types.ts');
let state=emptyPlanningState(),revision='2030-01-01T00:00:00.000Z',inject=false,conflicts=0;
global.fetch=async(url,init={})=>{
  const parsed=new URL(url);assert.equal(parsed.origin,'https://booking-store.example.test');assert.equal(parsed.pathname,'/rest/v1/app_state');
  const answer=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
  if(!init.method||init.method==='GET')return answer([{value:structuredClone(state),updated_at:revision}]);
  assert.equal(init.method,'PATCH');const body=JSON.parse(init.body);
  if(inject && body.value.bookingData?.receipts.length>state.bookingData.receipts.length){
    inject=false;conflicts++;
    const rival=structuredClone(body.value.events.at(-1));rival.id='simultaneous-other-writer';rival.title='Another appointment';
    state.events.push(rival);revision='2030-01-01T00:00:01.000Z';return answer([]);
  }
  if(parsed.searchParams.get('updated_at')!=='eq.'+revision)return answer([]);
  state=body.value;revision=body.updated_at;return answer([{value:state,updated_at:revision}]);
};
const {changeBookingLink,publicBooking,reserveBooking}=require('../lib/modules/planning/calendar-booking.ts');
(async()=>{
  const link=await changeBookingLink({operation:'create',name:'Concurrency test',description:'',location:'',calendarId:'native',conflictCalendarIds:['native'],timeZone:'UTC',durationMinutes:30,bufferMinutes:0,noticeHours:0,mode:'automatic',from:'2030-01-07',through:'2030-01-07',weekdays:[1],dayStart:'09:00',dayEnd:'11:00',manualStarts:[]});
  const token=link.path.split('/').pop(),slots=(await publicBooking(token)).slots;
  inject=true;
  await assert.rejects(()=>reserveBooking(token,{requestId:randomUUID(),start:slots[0].start,name:'Guest',email:'guest@example.test'},'192.0.2.1'),error=>error.status===409);
  assert.equal(conflicts,1);assert.equal(state.events.length,1);assert.equal(state.events[0].id,'simultaneous-other-writer');assert.equal(state.bookingData.receipts.length,0);
  const input={requestId:randomUUID(),start:slots[1].start,name:'Guest',email:'guest@example.test'};
  await reserveBooking(token,input,'192.0.2.1');await reserveBooking(token,input,'192.0.2.1');
  assert.equal(state.events.length,2);assert.equal(state.bookingData.receipts.length,1);
  console.log('PASS: simulated Supabase CAS conflict reloads calendar availability before retry; failed contender writes neither event nor receipt; successful retries are idempotent.');
})().catch(error=>{console.error(error);process.exitCode=1;});
