(() => {
  const $ = s => document.querySelector(s);
  let client = null, authMode = "signup";
  const safe = v => String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function init() {
    try {
      const cfg = await fetch("/api/config").then(r => r.json());
      if (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase) {
        client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
        const { data } = await client.auth.getSession();
        if (data.session) showSignedIn(data.session.user);
      }
    } catch {}
    document.querySelectorAll("#loginBtn").forEach(b => b.addEventListener("click", () => { authMode="login"; $("#modalTitle").textContent="Welcome back."; $("#signupForm button[type=submit]").textContent="Log in ↗"; $("input[name=name]").required=false; $("input[name=country]").required=false; }));
    ["joinBtn","heroJoin","ctaJoin"].forEach(id => $("#"+id)?.addEventListener("click", () => { authMode="signup"; $("#modalTitle").textContent="Create your profile."; $("#signupForm button[type=submit]").textContent="Create secure account ↗"; $("input[name=name]").required=true; $("input[name=country]").required=true; }));
    $("#signupForm").addEventListener("submit", async e => {
      e.preventDefault(); e.stopImmediatePropagation();
      if (!client) return authMessage("Live accounts are not connected yet. Add SUPABASE_URL and SUPABASE_ANON_KEY in Vercel, then redeploy.");
      const data = Object.fromEntries(new FormData(e.currentTarget).entries());
      const role = (authMode === "login" ? null : $("#accountType").value.toLowerCase());
      let result;
      if (authMode === "login") {
        result = await client.auth.signInWithPassword({email:data.email,password:data.password});
      } else {
        result = await client.auth.signUp({email:data.email,password:data.password,options:{data:{full_name:data.name,role}}});
      }
      if (result.error) return authMessage(result.error.message);
      if (result.data.user && result.data.session) {
        const user = result.data.user;
        const saved = await client.from("profiles").upsert({id:user.id,full_name:data.name || user.user_metadata?.full_name || user.email,role:role || user.user_metadata?.role || "player",country:data.country || null,profile_url:data.link || null},{onConflict:"id",ignoreDuplicates:true});
        if (saved.error) return authMessage("Account created, but profile setup needs attention: "+saved.error.message);
        showSignedIn(user);
      } else authMessage("Check your email to confirm your account, then log in.");
    }, true);
    $("#searchPlayers").addEventListener("click", livePlayerSearch);
    $("#playerSearch").addEventListener("keydown", e => { if(e.key==="Enter"){e.preventDefault();livePlayerSearch();} });
    $("#searchStaff").addEventListener("click", liveStaffSearch);
    $("#staffSubmissionForm")?.addEventListener("submit", submitStaffRecord);
  }
  function authMessage(msg) { $("#signupSuccess").hidden=false; $("#signupSuccess").textContent=msg; }
  function showSignedIn(user) {
    $("#signupForm").hidden=true; $("#signupSuccess").hidden=false;
    $("#signupSuccess").textContent="Signed in as "+(user.email || "TRANSFERBRIDGE member")+". Your account is connected.";
    $("#loginBtn").textContent="Account";
  }
  async function livePlayerSearch() {
    const term=$("#playerSearch").value.trim(), grid=$("#playerGrid"), note=$("#playerDataNote");
    if(term.length<2){note.textContent="Enter a club name, for example Arsenal or Real Madrid.";return;}
    grid.innerHTML="<p>Searching live club squads…</p>";
    try {
      const found=await fetch("/api/teams?search="+encodeURIComponent(term)).then(r=>r.json());
      if(!found.teams?.length) {grid.innerHTML="<p>No matching clubs found. Check the spelling or provider coverage.</p>";return;}
      const team=found.teams[0];
      const data=await fetch("/api/players?team="+team.id).then(r=>r.json());
      if(!data.players) throw new Error(data.error || "Live squad data unavailable.");
      const pos=$("#positionFilter").value.toLowerCase();
      const age=$("#ageFilter").value;
      const players=data.players.filter(p=>{
        const position=String(p.position||"").toLowerCase();
        const a=Number(p.age||0);
        return (!pos || position.includes(pos)) && (!age || (age==="u18"?a<18:age==="18-23"?a>=18&&a<=23:a>=24));
      });
      grid.innerHTML=players.map(p=>'<article class="player-card">'+(p.photo?'<img class="player-avatar" src="'+safe(p.photo)+'" alt="" style="object-fit:cover">':'<span class="player-avatar">'+safe((p.name||"?").split(" ").map(x=>x[0]).join("").slice(0,2))+'</span>')+'<span><h3>'+safe(p.name)+'</h3><p>'+safe(p.position)+' · '+safe(p.age||"Age unavailable")+' · '+safe(team.name)+'</p><span class="tag">'+safe(p.number ? "Squad no. "+p.number : "Squad member")+'</span></span></article>').join("") || "<p>No squad members match those filters.</p>";
      note.textContent="Source: API-SPORTS live squad endpoint · "+team.name+", "+team.country+". Squad data is not proof of contract status or transfer availability.";
    } catch(err) {grid.innerHTML="<p>"+safe(err.message)+"</p>";}
  }
  async function submitStaffRecord(e) {\n    e.preventDefault();\n    const note=$("#staffSubmitNote");\n    if(!client){note.textContent="Staff submissions need the connected Supabase database. Configure the Supabase environment variables and redeploy.";return;}\n    const {data:{user}}=await client.auth.getUser();\n    if(!user){note.textContent="Please create an account or log in before submitting a club professional.";return;}\n    const values=Object.fromEntries(new FormData(e.currentTarget).entries());\n    const result=await client.from("club_staff").insert({...values,submitted_by:user.id,verified:false});\n    if(result.error){note.textContent="Submission could not be saved: "+result.error.message;return;}\n    e.currentTarget.reset(); note.textContent="Submitted successfully. This record is pending verification and will appear publicly only after approval.";\n  }\n  async function liveStaffSearch() {
    const club=$("#staffClub").value.trim(), grid=$("#staffGrid"), note=$("#staffNote");
    if(!club){note.textContent="Enter a club name first.";return;}
    grid.innerHTML="<p>Checking verified staff directory…</p>";
    try {
      const data=await fetch("/api/club-staff?club="+encodeURIComponent(club)).then(r=>r.json());
      if(!data.staff) throw new Error(data.error || "Staff directory unavailable.");
      grid.innerHTML=data.staff.map(p=>'<article class="player-card"><span class="player-avatar">TB</span><span><h3>'+safe(p.full_name)+'</h3><p>'+safe(p.role.replaceAll("_"," "))+' · '+safe(p.club_name)+'</p><a class="tag" href="'+safe(p.source_url)+'" target="_blank" rel="noopener">View source ↗</a></span></article>').join("") || "<p>No verified staff records for this club yet. We will not invent scout or doctor names.</p>";
      note.textContent=data.note;
    } catch(err){grid.innerHTML="<p>"+safe(err.message)+"</p>";}
  }
  init();
})();