// Public club staff directory: approved club_staff records plus clearly labelled
// named professionals sourced in the public club_contacts directory.
module.exports = async (req, res) => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  const club = String(req.query.club || "").trim().slice(0, 120);
  if (!url || !key) return res.status(503).json({ error: "Club staff directory is not connected. Configure SUPABASE_URL and SUPABASE_ANON_KEY in Vercel, then redeploy." });
  if (!club) return res.status(400).json({ error: "Club is required." });

  let baseUrl;
  try { baseUrl = new URL(url).origin; }
  catch { return res.status(500).json({ error: "SUPABASE_URL is invalid. Use the Supabase project URL." }); }

  const headers = { apikey: key, Authorization: "Bearer " + key };
  try {
    const verifiedParams = new URLSearchParams({
      select: "id,club_name,full_name,role,department,profile_url,source_url,verified",
      club_name: "ilike.*" + club + "*",
      verified: "eq.true",
      order: "club_name.asc,full_name.asc",
      limit: "300"
    });
    const sourcedParams = new URLSearchParams({
      select: "id,club_name,contact_name,job_title,department,contact_url,source_url,verification_status,notes",
      club_name: "ilike.*" + club + "*",
      contact_name: "not.eq.",
      department: "ilike.*scouting*",
      verification_status: "eq.source-listed",
      order: "club_name.asc,contact_name.asc",
      limit: "300"
    });

    const [verifiedResponse, sourcedResponse] = await Promise.all([
      fetch(baseUrl + "/rest/v1/club_staff?" + verifiedParams.toString(), { headers }),
      fetch(baseUrl + "/rest/v1/club_contacts?" + sourcedParams.toString(), { headers })
    ]);

    for (const [response, table] of [[verifiedResponse, "club_staff"], [sourcedResponse, "club_contacts"]]) {
      if (!response.ok) {
        const detail = await response.text();
        return res.status(response.status).json({
          error: "Supabase " + table + " query failed (" + response.status + "): " + detail.slice(0, 500)
        });
      }
    }

    const verifiedRows = await verifiedResponse.json();
    const sourcedRows = await sourcedResponse.json();
    const verified = verifiedRows.map(p => ({ ...p, record_status: "Verified" }));
    const sourced = sourcedRows.map(p => ({
      id: p.id,
      club_name: p.club_name,
      full_name: p.contact_name,
      role: p.job_title,
      department: p.department,
      profile_url: p.contact_url,
      source_url: p.source_url,
      verified: false,
      record_status: "Source-listed — current role not independently verified",
      notes: p.notes
    }));
    const seen = new Set(verified.map(p => (p.club_name + "|" + p.full_name).toLowerCase()));
    const staff = verified.concat(sourced.filter(p => {
      const key = (p.club_name + "|" + p.full_name).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }));

    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.status(200).json({
      staff,
      count: staff.length,
      verified_count: verified.length,
      source_listed_count: staff.length - verified.length,
      note: "Verified records and third-party source-listed records are labelled separately. Source-listed roles must be checked for currency."
    });
  } catch (error) {
    return res.status(502).json({ error: "Unable to reach Supabase for club staff: " + String(error.message || error).slice(0, 300) });
  }
};
