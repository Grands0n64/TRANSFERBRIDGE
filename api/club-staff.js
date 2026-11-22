// Search the public, allow-listed staff directory. Personal email and phone
// fields are never selected from club_contacts.
module.exports = async (req, res) => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  const club = String(req.query.club || "").trim().slice(0, 120);
  if (!url || !key) return res.status(503).json({ error: "Club directory is not connected. Configure SUPABASE_URL and SUPABASE_ANON_KEY in Vercel, then redeploy." });
  if (!club) return res.status(400).json({ error: "Club is required." });
  let baseUrl;
  try { baseUrl = new URL(url).origin; }
  catch { return res.status(500).json({ error: "SUPABASE_URL is invalid. Use the Supabase project URL." }); }
  const headers = { apikey: key, Authorization: "Bearer " + key };
  try {
    const staffParams = new URLSearchParams({
      select: "id,club_name,full_name,role,department,profile_url,source_url,verified",
      club_name: "ilike.*" + club.replace(/[%,]/g, " ") + "*",
      verified: "eq.true",
      order: "club_name.asc,full_name.asc",
      limit: "500"
    });
    const contactParams = new URLSearchParams({
      select: "id,league,club_name,contact_name,job_title,department,contact_url,source_url,verification_status,notes",
      club_name: "ilike.*" + club.replace(/[%,]/g, " ") + "*",
      order: "club_name.asc,contact_name.asc",
      limit: "500"
    });
    const [staffResponse, contactsResponse] = await Promise.all([
      fetch(baseUrl + "/rest/v1/club_staff?" + staffParams, { headers }),
      fetch(baseUrl + "/rest/v1/public_club_contacts?" + contactParams, { headers })
    ]);
    for (const [response, table] of [[staffResponse, "club_staff"], [contactsResponse, "public_club_contacts"]]) {
      if (!response.ok) {
        const detail = await response.text();
        return res.status(response.status).json({ error: "Supabase " + table + " query failed (" + response.status + "): " + detail.slice(0, 500) });
      }
    }
    const approved = (await staffResponse.json()).map(p => ({ ...p, record_status: "Verified" }));
    const directoryContacts = (await contactsResponse.json())
      .filter(p => String(p.contact_name || "").trim())
      .map(p => ({
        id: p.id, league: p.league, club_name: p.club_name, full_name: p.contact_name,
        role: p.job_title || "Club professional", department: p.department || "Club staff",
        profile_url: p.contact_url, source_url: p.source_url, verified: false,
        record_status: p.verification_status === "official-source"
          ? "Official club source"
          : "Source-listed — check current role",
        notes: p.notes
      }));
    const seen = new Set(approved.map(p => (p.club_name + "|" + p.full_name).toLowerCase()));
    const combined = approved.concat(directoryContacts.filter(p => {
      const k = (p.club_name + "|" + p.full_name).toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }));
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.status(200).json({
      staff: combined, count: combined.length, verified_count: approved.length,
      source_listed_count: combined.length - approved.length,
      note: "Shows verified submissions and named, sourced club professionals across leadership, executive, coaching, medical and recruitment roles. Source labels do not imply a current appointment."
    });
  } catch (error) {
    return res.status(502).json({ error: "Unable to reach Supabase for club directory: " + String(error.message || error).slice(0, 300) });
  }
};
