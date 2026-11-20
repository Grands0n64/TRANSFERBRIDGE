module.exports = async (req, res) => {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return res.status(503).json({ error: "Player data provider is not configured yet. Add API_FOOTBALL_KEY in Vercel environment variables." });
  const team = String(req.query.team || "").trim();
  const season = String(req.query.season || new Date().getFullYear());
  if (!/^\d+$/.test(team)) return res.status(400).json({ error: "A valid club team ID is required." });
  try {
    const response = await fetch("https://v3.football.api-sports.io/players/squads?team=" + encodeURIComponent(team), { headers: { "x-apisports-key": key } });
    if (!response.ok) throw new Error("Player provider returned " + response.status);
    const body = await response.json();
    const squad = (body.response || []).flatMap(x => x.players || []);
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json({ source: "API-SPORTS", players: squad, note: "Squad list supplied by the connected football data provider. Verify registration and availability with the club." });
  } catch (error) { res.status(502).json({ error: "Unable to retrieve the live squad right now." }); }
};