const {createClient}=require('@supabase/supabase-js');const fs=require('fs');const d=process.env.E2E_DIR;
const URL='https://jpiffvxjzrvigfbxqelo.supabase.co', KEY='sb_publishable_121p9sfc8UFl265XpaygNw_TdwYOBh7', pw=fs.readFileSync(d+'/e2e.pw','utf8').trim();
(async()=>{
  const a=createClient(URL,KEY), b=createClient(URL,KEY), anon=createClient(URL,KEY);
  await a.auth.signInWithPassword({email:fs.readFileSync(d+'/e2e.email','utf8').trim(),password:pw});
  await b.auth.signInWithPassword({email:'e2e-isolation-28a6be@example.com',password:pw});
  const r=await b.rpc('create_organisation',{p_name:'Other School',p_branch:'Main',p_board:'CBSE',p_city:'Pune'}); console.log('school B created:', r.error?r.error.message:'ok');
  const tables=['students','staff','fee_demands','receipts','attendance','assessment_results','report_cards','student_sensitive','growth_records','audit_events','profiles','guardians','payslips','sections'];
  let leaks=0;
  for(const t of tables){const{data,error}=await b.from(t).select('*').limit(1000);const own=(data??[]).filter(x=>x.org_id&&x.org_id!==(data[0]?.org_id));
    const {data:sa}=await a.from(t).select('id').limit(1);const aId=sa?.[0]?.id; let seen=false; if(aId){const{data:x}=await b.from(t).select('id').eq('id',aId);seen=(x??[]).length>0;}
    if(seen) leaks++; console.log(t.padEnd(20), seen?'LEAK: school B can read school A':'isolated', error?('('+error.message+')'):'');}
  // Direct write attempts across tenants
  const {data:stA}=await a.from('students').select('id,first_name').limit(1);
  const up=await b.from('students').update({first_name:'Hacked'}).eq('id',stA[0].id).select(); console.log('B updates A student:', (up.data??[]).length?'LEAK':'blocked');
  const rc=await b.rpc('collect_fee',{p:{allocations:[],payments:[]}}); console.log('B collect_fee on nothing:', rc.error?.message);
  const {data:dA}=await a.from('fee_demands').select('id,amount').eq('status','due').limit(1);
  const rc2=await b.rpc('collect_fee',{p:{allocations:[{demand_id:dA[0].id,amount:1}],payments:[{mode:'cash',amount:1}]}}); console.log('B pays A fee:', rc2.error?'blocked ('+rc2.error.message+')':'LEAK');
  const an=await anon.from('students').select('id').limit(1); console.log('anonymous reads students:', (an.data??[]).length?'LEAK':'blocked');
  const an2=await anon.rpc('collect_fee',{p:{}}); console.log('anonymous calls collect_fee:', an2.error?'blocked':'LEAK');
  // Immutability
  const {data:rA}=await a.from('receipts').select('id,total').eq('status','valid').limit(1);
  const ed=await a.from('receipts').update({total:1}).eq('id',rA[0].id); console.log('admin edits receipt total:', ed.error?'blocked ('+ed.error.message+')':'ALLOWED');
  const del=await a.from('receipts').delete().eq('id',rA[0].id); console.log('admin deletes receipt:', del.error?'blocked ('+del.error.message+')':'ALLOWED');
  const au=await a.from('audit_events').delete().gt('id',0); console.log('admin deletes audit log:', au.error?'blocked':'checked: rows deleted='+(au.count??'n/a'));
  const st=await a.from('students').update({status:'withdrawn'}).eq('id',stA[0].id); console.log('direct status change:', st.error?'blocked ('+st.error.message+')':'ALLOWED');
  console.log('LEAKS:', leaks);
})();
