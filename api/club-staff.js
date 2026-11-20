// Club staff records are intentionally sourced from verified TRANSFERBRIDGE entries.
// Public football squad feeds do not reliably publish scouts or club doctors.
module.exports = async (req, res) => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  const club = String(req.query.club || "").trim();
  if (!url || !key) return res.status(503).json({ error: "Staff directory requires the connected TRANSFERBRIDGE database." });
  if (!club) return res.status(400).json({ error: "Club is required." });
  try {
    const endpoint = url.replace(/\/$/, "") + "/rest/v1/club_staff?select=id,club_name,full_name,role,department,profile_url,source_url,verified&club_name=ilike." + encodeURIComponent(club);
    const response = await fetch(endpoint, { headers: { apikey: key, Authorization: "Bearer " + key } });
    if (!response.ok) throw new Error("Database request failed");
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=900");
    res.status(200).json({ staff: await response.json(), note: "Only records submitted to TRANSFERBRIDGE and marked verified are shown." });
  } catch (error) { res.status(502).json({ error: "Unable to load verified club staff." }); }
};