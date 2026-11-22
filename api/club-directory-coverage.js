// Report actual coverage against the seeded 148-club registry.
module.exports = async (req, res) => {
  const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_ANON_KEY;
  if(!url||!key)return res.status(503).json({error:"Directory coverage is not connected. Configure SUPABASE_URL and SUPABASE_ANON_KEY in Vercel."});
  let base;try{base=new URL(url).origin;}catch{return res.status(500).json({error:"SUPABASE_URL is invalid."});}
  const headers={apikey:key,Authorization:"Bearer "+key};
  try{
    const paths=[
      "/rest/v1/club_directory?select=league,country,club_name&order=league.asc,club_name.asc&limit=500",
      "/rest/v1/public_club_contacts?select=league,club_name,contact_name,verification_status&limit=10000",
      "/rest/v1/club_staff?select=club_name,verified&verified=eq.true&limit=10000"
    ];
    const responses=await Promise.all(paths.map(p=>fetch(base+p,{headers})));
    for(let i=0;i<responses.length;i++)if(!responses[i].ok){const d=await responses[i].text();return res.status(responses[i].status).json({error:"Directory query "+(i+1)+" failed ("+responses[i].status+"): "+d.slice(0,350)});}
    const [clubs,contacts,staff]=await Promise.all(responses.map(r=>r.json()));
    const leagueRows=[...new Set(clubs.map(c=>c.league))].map(league=>{
      const leagueClubs=clubs.filter(c=>c.league===league);
      const named=contacts.filter(c=>c.league===league&&String(c.contact_name||"").trim());
      const covered=new Set(named.map(c=>c.club_name));
      return {league,target_clubs:leagueClubs.length,clubs_with_named_contacts:covered.size,named_contact_records:named.length,clubs_without_named_contacts:leagueClubs.filter(c=>!covered.has(c.club_name)).map(c=>c.club_name)};
    });
    const clubsWithAny=new Set([...contacts.map(c=>c.club_name),...staff.map(s=>s.club_name)].filter(Boolean));
    const directoryClubCount=clubs.filter(c=>clubsWithAny.has(c.club_name)).length;
    res.setHeader("Cache-Control","no-store, max-age=0");
    return res.status(200).json({
      target_clubs:clubs.length,clubs_with_any_staff_or_contact_record:directoryClubCount,
      clubs_without_any_staff_or_contact_record:clubs.length-directoryClubCount,
      named_contact_records:contacts.filter(c=>String(c.contact_name||"").trim()).length,
      verified_staff_records:staff.length,leagues:leagueRows,
      warning:"The club registry lists all target clubs. Staff/contact coverage counts only records actually stored in Supabase; an empty club does not mean it has no staff."
    });
  }catch(e){return res.status(502).json({error:"Unable to calculate directory coverage: "+String(e.message||e).slice(0,250)});}
};
