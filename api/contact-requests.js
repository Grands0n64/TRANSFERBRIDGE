// Receives a contact request for TRANSFERBRIDGE follow-up.
module.exports = async (req, res) => {
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_ANON_KEY;
 if(!url||!key)return res.status(503).json({error:"Contact request service is not configured."});
 const b=req.body||{};
 const clean=(v,n)=>typeof v==="string"?v.trim().slice(0,n):"";
 const contact_id=clean(b.contact_id,80),requester_name=clean(b.requester_name,120),
 requester_email=clean(b.requester_email,254),requester_phone=clean(b.requester_phone,40),
 country=clean(b.country,80),reason=clean(b.reason,1000);
 if(!contact_id||requester_name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requester_email)||requester_phone.length<6||country.length<2||reason.length<5)
  return res.status(400).json({error:"Please complete every field with valid details."});
 try{
  const endpoint=url.replace(/\\/$/,"")+"/rest/v1/contact_unlock_requests";
  const r=await fetch(endpoint,{method:"POST",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify({contact_id,requester_name,requester_email,requester_phone,country,reason,status:"new"})});
  if(!r.ok){const detail=await r.text();return res.status(r.status).json({error:"Request could not be saved ("+r.status+"): "+detail.slice(0,300)});}
  return res.status(201).json({ok:true});
 }catch(e){return res.status(502).json({error:"Could not send your request: "+String(e.message||e).slice(0,200)});}
};
