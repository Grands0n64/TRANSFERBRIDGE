// Public directory of TRANSFERBRIDGE-verified scout profiles.
// Public club/scout contacts are displayed separately by /api/contacts.
module.exports = async (req, res) => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(503).json({ error: "Scout directory is not connected. Configure SUPABASE_URL and SUPABASE_ANON_KEY in Vercel." });
  try {
    const endpoint = url.replace(/\/+$/, "") + "/rest/v1/public_scout_directory?select=user_id,full_name,country,organisation,territory,positions,age_groups,bio,credentials_url,created_at&order=created_at.desc&limit=300";
    const response = await fetch(endpoint, { headers: { apikey: key, Authorization: "Bearer " + key } });
    if (!response.ok) {
      const detail = await response.text();
      return res.status(response.status).json({ error: "Supabase scout directory query failed (" + response.status + "): " + detail.slice(0, 350) });
    }
    const scouts = await response.json();
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.status(200).json({ scouts, count: scouts.length });
  } catch (error) {
    res.status(502).json({ error: "Unable to reach the scout directory: " + String(error.message || error).slice(0, 250) });
  }
};
