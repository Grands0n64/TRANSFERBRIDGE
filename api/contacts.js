module.exports = async (req, res) => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(503).json({ error: "Contact directory is not connected: configure SUPABASE_URL and SUPABASE_ANON_KEY in Vercel." });
  const q = String(req.query.q || "").trim().slice(0, 100);
  const league = String(req.query.league || "").trim().slice(0, 80);
  const department = String(req.query.department || "").trim().slice(0, 80);
  try {
    const params = new URLSearchParams({select:"id,league,club_name,contact_name,job_title,department,contact_url,source_url,source_type,verification_status,notes",order:"league.asc,club_name.asc,contact_name.asc",limit:"500"});
    if(q) params.set("or","(club_name.ilike.*"+q+"*,contact_name.ilike.*"+q+"*,job_title.ilike.*"+q+"*)");
    if(league) params.set("league","eq."+league);
    if(department) params.set("department","eq."+department);
    const response=await fetch(url.replace(/\/+$/,"")+"/rest/v1/public_club_contacts?"+params.toString(),{headers:{apikey:key,Authorization:"Bearer "+key}});
    if(!response.ok){const detail=await response.text();return res.status(response.status).json({error:"Supabase contact query failed ("+response.status+"): "+detail.slice(0,400)});}
    const contacts=await response.json();
    res.setHeader("Cache-Control","s-maxage=600, stale-while-revalidate=1800");
    res.status(200).json({contacts:contacts.map(c=>({...c,email:null,phone:null,contact_locked:true})),count:contacts.length});
  }catch(error){res.status(502).json({error:"Unable to load football contacts: "+String(error.message||error).slice(0,250)});}
};
