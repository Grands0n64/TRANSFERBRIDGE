// Public directory combines verified TRANSFERBRIDGE scouts with sourced external club scouts.
// Email addresses are never returned by this endpoint.
module.exports = async (req,res) => {
 const url=process.env.SUPABASE_URL, anon=process.env.SUPABASE_ANON_KEY, service=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!anon||!service)return res.status(503).json({error:"Scout directory requires SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in Vercel."});
 let base;try{base=new URL(url).origin;}catch{return res.status(500).json({error:"SUPABASE_URL is invalid."});}
 const headers={apikey:service,Authorization:"Bearer "+service};
 try{
  const [profilesRes,contactsRes]=await Promise.all([
   fetch(base+"/rest/v1/public_scout_directory?select=user_id,full_name,country,organisation,territory,positions,age_groups,bio,credentials_url,created_at&order=created_at.desc&limit=500",{headers:{apikey:anon,Authorization:"Bearer "+anon}}),
   fetch(base+"/rest/v1/club_contacts?select=id,league,club_name,contact_name,job_title,department,email,contact_url,source_url,verification_status,notes&contact_name=not.is.null&order=league.asc,club_name.asc,contact_name.asc&limit=500",{headers})
  ]);
  for(const [r,n] of [[profilesRes,"registered scout profiles"],[contactsRes,"sourced scouting contacts"]])if(!r.ok){const d=await r.text();return res.status(r.status).json({error:"Could not load "+n+" ("+r.status+"): "+d.slice(0,300)});}
  const registered=(await profilesRes.json()).map(s=>({...s,kind:"registered",email_locked:true}));
  const external=(await contactsRes.json()).filter(c=>{
   const role=(String(c.department||"")+" "+String(c.job_title||"")).toLowerCase();
   return /scout|scouting|recruit|talent identification|player identification/.test(role)&&String(c.contact_name||"").trim();
  }).map(c=>({
   contact_id:c.id,full_name:c.contact_name,organisation:c.club_name,territory:c.league,
   positions:c.job_title||c.department,bio:c.notes||"",credentials_url:c.contact_url||c.source_url,
   source_url:c.source_url,verification_status:c.verification_status,kind:"external",
   email_locked:true,has_email:Boolean(String(c.email||"").trim())
  }));
  const registeredKeys=new Set(registered.map(s=>(s.full_name+"|"+(s.organisation||"")).toLowerCase()));
  const combined=registered.concat(external.filter(s=>!registeredKeys.has((s.full_name+"|"+s.organisation).toLowerCase())));
  res.setHeader("Cache-Control","no-store, max-age=0");
  return res.status(200).json({scouts:combined,count:combined.length,registered_count:registered.length,external_count:external.length});
 }catch(e){return res.status(502).json({error:"Unable to load sourced scout directory: "+String(e.message||e).slice(0,250)});}
};
