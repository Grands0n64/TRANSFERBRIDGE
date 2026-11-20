module.exports = async (req, res) => {
  const key = process.env.API_FOOTBALL_KEY;
  const search = String(req.query.search || "").trim();
  if (!key) return res.status(503).json({ error: "Live club/player data is not configured. Add API_FOOTBALL_KEY in Vercel." });
  if (search.length < 2) return res.status(400).json({ error: "Enter a club name." });
  try {
    const response = await fetch("https://v3.football.api-sports.io/teams?search=" + encodeURIComponent(search), { headers: { "x-apisports-key": key } });
    if (!response.ok) throw new Error("Provider error");
    const data = await response.json();
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json({ teams: (data.response || []).map(x => ({ id: x.team.id, name: x.team.name, logo: x.team.logo, country: x.team.country })) });
  } catch { res.status(502).json({ error: "Could not search live club data." }); }
};