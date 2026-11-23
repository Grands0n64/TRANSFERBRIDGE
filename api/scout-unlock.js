// Scout email unlock. Contact emails are only returned after server-side payment verification; scout outreach is handled manually by TRANSFERBRIDGE.
module.exports = async (req,res) => {
 const url=process.env.SUPABASE_URL,service=process.env.SUPABASE_SERVICE_ROLE_KEY,anon=process.env.SUPABASE_ANON_KEY,paystack=process.env.PAYSTACK_SECRET_KEY;
 if(!url||!service||!anon||!paystack)return res.status(503).json({error:"Configure SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and PAYSTACK_SECRET_KEY in Vercel."});
 const base=new URL(url).origin,dbHeaders={apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json"};
 const reference=String(req.body?.reference||req.query?.reference||"").slice(0,100);
 const origin=process.env.TRANSFERBRIDGE_SITE_URL||(req.headers["x-forwarded-proto"]||"https")+"//"+req.headers.host;
 if(req.method==="POST"&&req.body?.action==="status"){
  const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
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
  const contactRes=await fetch(base+"/rest/v1/club_contacts?select=id,contact_name,club_name,department,job_title,email&id=eq."+encodeURIComponent(contactId),{headers:dbHeaders});
  if(!contactRes.ok)return res.status(502).json({error:"Could not load scout contact."});
  const contacts=await contactRes.json(),contact=contacts[0];
  if(!contact||!contact.email||!/scout|scouting|recruit|talent identification|player identification/i.test(String(contact.department||"")+" "+String(contact.job_title||"")))return res.status(404).json({error:"This scout does not have a publicly sourced email available to unlock."});
  const existingRes=await fetch(base+"/rest/v1/scout_contact_unlocks?select=id,status&user_id=eq."+user.id+"&contact_id=eq."+contactId,{headers:dbHeaders});
  const existing=existingRes.ok?(await existingRes.json())[0]:null;
  if(existing?.status==="paid")return res.status(409).json({error:"You have already unlocked this scout. Refresh the directory to view the email."});
  const reference="TBSCOUT_"+crypto.randomUUID().replace(/-/g,"");
  const amount=Number(process.env.SCOUT_EMAIL_UNLOCK_PRICE_KOBO||100000);
  const callback=origin+"/api/scout-unlock?reference="+encodeURIComponent(reference);
  const init=await fetch("https://api.paystack.co/transaction/initialize",{method:"POST",headers:{Authorization:"Bearer "+paystack,"Content-Type":"application/json"},body:JSON.stringify({email:user.email,amount,currency:"NGN",reference,callback_url:callback,metadata:{user_id:user.id,contact_id:contactId,product:"scout_email_unlock"}})});
  const pay=await init.json();
  if(!init.ok||!pay.status)return res.status(502).json({error:pay.message||"Payment could not be initialized."});
  const save=await fetch(base+"/rest/v1/scout_contact_unlocks?on_conflict=user_id,contact_id",{method:"POST",headers:{...dbHeaders,Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({user_id:user.id,contact_id:contactId,payment_reference:reference,amount_kobo:amount,currency:"NGN",status:"pending",updated_at:new Date().toISOString()})});
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
  const rowRes=await fetch(base+"/rest/v1/scout_contact_unlocks?select=id,user_id,contact_id,status,amount_kobo,scout_notified_at&payment_reference=eq."+encodeURIComponent(reference),{headers:dbHeaders});
  const rows=rowRes.ok?await rowRes.json():[],row=rows[0];
  if(!row||row.user_id!==userId||row.contact_id!==contactId||Number(result.data.amount)!==Number(row.amount_kobo)||result.data.currency!=="NGN"){
   res.status(303).setHeader("Location","/?unlock=failed#scout-network");return res.end();
  }
  res.status(303).setHeader("Location","/?unlock=success#scout-network");return res.end();
 }
 return res.status(405).json({error:"Method not allowed."});
};
