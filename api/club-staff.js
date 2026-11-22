// Public directory of TRANSFERBRIDGE-verified club staff.
module.exports = async (req, res) => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  const club = String(req.query.club || "").trim().slice(0, 120);
  if (!url || !key) {
    return res.status(503).json({ error: "Club staff directory is not connected. Configure SUPABASE_URL and SUPABASE_ANON_KEY in Vercel, then redeploy." });
  }
  if (!club) return res.status(400).json({ error: "Club is required." });

  let baseUrl;
  try {
    baseUrl = new URL(url).origin;
  } catch {
    return res.status(500).json({ error: "SUPABASE_URL is invalid. Use the Supabase project URL." });
  }

  try {
    const params = new URLSearchParams({
      select: "id,club_name,full_name,role,department,profile_url,source_url,verified",
      club_name: "ilike.*" + club + "*",
      verified: "eq.true",
      order: "club_name.asc,full_name.asc",
      limit: "300"
    });
    const response = await fetch(baseUrl + "/rest/v1/club_staff?" + params.toString(), {
      headers: { apikey: key, Authorization: "Bearer " + key }
    });
    if (!response.ok) {
      const detail = await response.text();
      return res.status(response.status).json({
        error: "Supabase club_staff query failed (" + response.status + "): " + detail.slice(0, 500)
      });
    }
    const staff = await response.json();
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.status(200).json({
      staff,
      count: staff.length,
      note: "Only sourced records marked verified are shown."
    });
  } catch (error) {
    return res.status(502).json({
      error: "Unable to reach Supabase for club staff: " + String(error.message || error).slice(0, 300)
    });
  }
};
