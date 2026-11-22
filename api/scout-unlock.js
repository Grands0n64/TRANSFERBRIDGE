// Paystack-backed scout email unlock. The contact's email is only returned after server-side payment verification.
module.exports = async (req,res) => {
 const url=process.env.SUPABASE_URL,service=process.env.SUPABASE_SERVICE_ROLE_KEY,anon=process.env.SUPABASE_ANON_KEY,paystack=process.env.PAYSTACK_SECRET_KEY;
 if(!url||!service||!anon||!paystack)return res.status(503).json({error:"Configure SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and PAYSTACK_SECRET_KEY in Vercel."});
 const base=new URL(url).origin,dbHeaders={apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json"};
 const reference=String(req.body?.reference||req.query?.reference||"").slice(0,100);
 const origin=(req.headers["x-forwarded-proto"]||"https")+"//"+req.headers.host;
 async function notify(email,scoutName,playerEmail,club){
  if(!process.env.RESEND_API_KEY||!process.env.TRANSFERBRIDGE_FROM_EMAIL)return false;
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+process.env.RESEND_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({
   from:process.env.TRANSFERBRIDGE_FROM_EMAIL,to:[email],subject:"A player has unlocked your scouting contact on TRANSFERBRIDGE",
   html:"<p>Hello "+String(scoutName||"Scout").replace(/[&<>"]/g,"")+",</p><p>A TRANSFERBRIDGE member has completed payment to unlock your publicly listed scouting contact for "+String(club||"your club").replace(/[&<>"]/g,"")+".</p><p>The member may now contact you using the publicly listed email address associated with your professional listing.</p><p>Player/member account: "+String(playerEmail||"").replace(/[&<>"]/g,"")+"</p><p>— TRANSFERBRIDGE</p>"
  })});
  return response.ok;
 }
 if(req.method==="POST"&&req.body?.action==="status"){
  const token=String(req.headers.authorization||"").replace(/^Bearer\\s+/i,"");
  if(!token)return res.status(401).json({error:"Log in to view unlocked scout emails."});
  const auth=await fetch(base+"/auth/v1/user",{headers:{apikey:anon,Authorization:"Bearer "+token}});
  if(!auth.ok)return res.status(401).json({error:"Your login session is invalid."});
  const user=await auth.json();
  const rowsRes=await fetch(base+"/rest/v1/scout_contact_unlocks?select=contact_id,status&user_id=eq."+user.id+"&status=eq.paid",{headers:dbHeaders});
  if(!rowsRes.ok)return res.status(502).json({error:"Could not load your unlocks."});
  const rows=await rowsRes.json(),ids=rows.map(x=>x.contact_id);
  if(!ids.length)return res.status(200).json({unlocked:[]});
  const contactsRes=await fetch(base+"/rest/v1/club_contacts?select=id,email&id=in.("+ids.join(",")+")",{headers:dbHeaders});
  if(!contactsRes.ok)return res.status(502).json({error:"Could not load unlocked email addresses."});
  return res.status(200).json({unlocked:await contactsRes.json()});
 }
 if(req.method==="POST"&&req.body?.action==="initialize"){
  const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
  if(!token)return res.status(401).json({error:"Log in before unlocking a scout email."});
  const auth=await fetch(base+"/auth/v1/user",{headers:{apikey:anon,Authorization:"Bearer "+token}});
  if(!auth.ok)return res.status(401).json({error:"Your login session is invalid. Please log in again."});
  const user=await auth.json(),contactId=String(req.body.contact_id||"");
  if(!contactId)return res.status(400).json({error:"Select a scout contact first."});
  const contactRes=await fetch(base+"/rest/v1/club_contacts?select=id,contact_name,club_name,department,email&id=eq."+encodeURIComponent(contactId),{headers:dbHeaders});
  if(!contactRes.ok)return res.status(502).json({error:"Could not load scout contact."});
  const contacts=await contactRes.json(),contact=contacts[0];
  if(!contact||!contact.email||!/scout|scouting|recruit|talent identification|player identification/i.test(String(contact.department||"")))return res.status(404).json({error:"This scout does not have a publicly sourced email available to unlock."});
  const existingRes=await fetch(base+"/rest/v1/scout_contact_unlocks?select=id,status&user_id=eq."+user.id+"&contact_id=eq."+contactId,{headers:dbHeaders});
  const existing=existingRes.ok?(await existingRes.json())[0]:null;
  if(existing?.status==="paid")return res.status(409).json({error:"You have already unlocked this scout. Refresh the directory to view the email."});
  const reference="TBSCOUT_"+crypto.randomUUID().replace(/-/g,"");
  const amount=Number(process.env.SCOUT_EMAIL_UNLOCK_PRICE_KOBO||100000);
  const callback=origin+"/api/scout-unlock?reference="+encodeURIComponent(reference);
  const init=await fetch("https://api.paystack.co/transaction/initialize",{method:"POST",headers:{Authorization:"Bearer "+paystack,"Content-Type":"application/json"},body:JSON.stringify({email:user.email,amount,currency:"NGN",reference,callback_url:callback,metadata:{user_id:user.id,contact_id:contactId,product:"scout_email_unlock"}})});
  const pay=await init.json();
  if(!init.ok||!pay.status)return res.status(502).json({error:pay.message||"Payment could not be initialized."});
  const save=await fetch(base+"/rest/v1/scout_contact_unlocks",{method:"POST",headers:{...dbHeaders,Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({user_id:user.id,contact_id:contactId,payment_reference:reference,amount_kobo:amount,currency:"NGN",status:"pending",updated_at:new Date().toISOString()})});
  if(!save.ok){const detail=await save.text();return res.status(502).json({error:"Could not save unlock request: "+detail.slice(0,250)});}
  return res.status(200).json({authorization_url:pay.data.authorization_url,reference,amount_kobo:amount});
 }
 if(req.method==="GET"&&reference){
  const verify=await fetch("https://api.paystack.co/transaction/verify/"+encodeURIComponent(reference),{headers:{Authorization:"Bearer "+paystack}});
  const result=await verify.json();
  if(!verify.ok||!result.status||result.data?.status!=="success"){
   res.status(303).setHeader("Location","/?unlock=failed#scout-network");return res.end();
  }
  const meta=result.data.metadata||{},userId=String(meta.user_id||""),contactId=String(meta.contact_id||"");
  const rowRes=await fetch(base+"/rest/v1/scout_contact_unlocks?select=id,user_id,contact_id,status,amount_kobo&payment_reference=eq."+encodeURIComponent(reference),{headers:dbHeaders});
  const rows=rowRes.ok?await rowRes.json():[],row=rows[0];
  if(!row||row.user_id!==userId||row.contact_id!==contactId||Number(result.data.amount)!==Number(row.amount_kobo)||result.data.currency!=="NGN"){
   res.status(303).setHeader("Location","/?unlock=failed#scout-network");return res.end();
  }
  const contactRes=await fetch(base+"/rest/v1/club_contacts?select=contact_name,club_name,email& id=eq."+encodeURIComponent(contactId),{headers:dbHeaders});
  const contact=(await contactRes.json())[0];
  const userRes=await fetch(base+"/auth/v1/admin/users/"+userId,{headers:dbHeaders});
  const user=userRes.ok?await userRes.json():null;
  const update=row.status==="paid"?{ok:true}:await fetch(base+"/rest/v1/scout_contact_unlocks?id=eq."+row.id+"&status=eq.pending",{method:"PATCH",headers:{...dbHeaders,Prefer:"return=minimal"},body:JSON.stringify({status:"paid",paid_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
  if(!update.ok){res.status(303).setHeader("Location","/?unlock=failed#scout-network");return res.end();}
  if(contact?.email&&row.status!=="paid"){
   const sent=await notify(contact.email,contact.contact_name,user?.email,contact.club_name);
   if(sent)await fetch(base+"/rest/v1/scout_contact_unlocks?id=eq."+row.id,{method:"PATCH",headers:{...dbHeaders,Prefer:"return=minimal"},body:JSON.stringify({scout_notified_at:new Date().toISOString()})});
  }
  res.status(303).setHeader("Location","/?unlock=success#scout-network");return res.end();
 }
 return res.status(405).json({error:"Method not allowed."});
};
