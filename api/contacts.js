module.exports = async (req, res) => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(503).json({ error: "Contact directory requires Supabase configuration." });
  const q = String(req.query.q || "").trim().replace(/[(),.*]/g," ").replace(/\s+/g," ").slice(0,100);
  const league = String(req.query.league || "").trim().slice(0,80);
  const department = String(req.query.department || "").trim().slice(0,80);
  try {
    const params = new URLSearchParams({
      select: "id,league,club_name,contact_name,job_title,department,email,phone,contact_url,source_url,source_type,verification_status,notes",
      order: "league.asc,club_name.asc,contact_name.asc",
      limit: "500"
    });
    if (q) params.set("or", "(club_name.ilike.*"+q+"*,contact_name.ilike.*"+q+"*,job_title.ilike.*"+q+"*)");
    if (league) params.set("league", "eq."+league);
    if (department) params.set("department", "eq."+department);
    const response = await fetch(url.replace(/\/$/,"")+"/rest/v1/club_contacts?"+params.toString(), {
      headers: { apikey:key, Authorization:"Bearer "+key }
    });
    if (!response.ok) throw new Error("Supabase contact query failed: "+response.status);
    const contacts = await response.json();
    res.setHeader("Cache-Control","s-maxage=900, stale-while-revalidate=3600");
    res.status(200).json({contacts, count:contacts.length});
  } catch (error) {
    res.status(502).json({error:"Unable to load public football contacts."});
  }
};