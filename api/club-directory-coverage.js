// Directory coverage report. Counts only records actually present in Supabase;
// it does not invent empty-club staff or treat missing records as verified.
module.exports = async (req, res) => {
  const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_ANON_KEY;
  if(!url||!key)return res.status(503).json({error:"Directory coverage is not connected. Configure SUPABASE_URL and SUPABASE_ANON_KEY in Vercel."});
  let base;try{base=new URL(url).origin;}catch{return res.status(500).json({error:"SUPABASE_URL is invalid."});}
  const headers={apikey:key,Authorization:"Bearer "+key};
  try{
    const [contactsRes,staffRes]=await Promise.all([
      fetch(base+"/rest/v1/public_club_contacts?select=league,club_name,contact_name,verification_status&limit=10000",{headers}),
      fetch(base+"/rest/v1/club_staff?select=club_name,verified&verified=eq.true&limit=10000",{headers})
    ]);
    for(const [r,n] of [[contactsRes,"public_club_contacts"],[staffRes,"club_staff"]])if(!r.ok){const d=await r.text();return res.status(r.status).json({error:"Supabase "+n+" query failed ("+r.status+"): "+d.slice(0,350)});}
    const contacts=await contactsRes.json(),staff=await staffRes.json();
    const leagueTargets={"Premier League":20,"La Liga":20,"Bundesliga":18,"Serie A":20,"Ligue 1":18,"Primeira Liga":18,"Eredivisie":18,"Belgian Pro League":16};
    const rows=Object.entries(leagueTargets).map(([league,target_clubs])=>{
      const matching=contacts.filter(x=>String(x.league||"").toLowerCase()===league.toLowerCase());
      const clubs=[...new Set(matching.map(x=>x.club_name).filter(Boolean))].sort();
      return {league,target_clubs,clubs_with_named_contacts:clubs.length,contact_records:matching.filter(x=>String(x.contact_name||"").trim()).length,clubs};
    });
    const unique=new Set([...contacts.map(x=>x.club_name),...staff.map(x=>x.club_name)].filter(Boolean));
    res.setHeader("Cache-Control","no-store, max-age=0");
    return res.status(200).json({
      target_clubs:148,clubs_with_any_directory_record:unique.size,
      named_contact_records:contacts.filter(x=>String(x.contact_name||"").trim()).length,
      verified_staff_records:staff.length,
      leagues:rows,
      warning:"Coverage counts reflect records currently stored in Supabase. Clubs absent from this report have no directory records yet; no staff names or contact details are fabricated."
    });
  }catch(e){return res.status(502).json({error:"Unable to calculate directory coverage: "+String(e.message||e).slice(0,250)});}
};
