(() => {
  const $ = s => document.querySelector(s);
  let client = null, authMode = "signup", currentUser = null;
  const safe = v => String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const note = (selector, message) => { const el=$(selector); if(el) el.textContent=message; };
  async function init() {
    try {
      const cfg=await fetch("/api/config").then(r=>r.json());
      if(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase) {
        client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
        const {data}=await client.auth.getSession();
        if(data.session) await showSignedIn(data.session.user);
      }
    } catch(error) { console.error("TRANSFERBRIDGE connection:",error); }
    $("#loginBtn")?.addEventListener("click",()=>setAuthMode("login"));
    ["joinBtn","heroJoin","ctaJoin"].forEach(id=>$("#"+id)?.addEventListener("click",()=>setAuthMode("signup")));
    $("#signupForm")?.addEventListener("submit",async e=>{
      e.preventDefault(); e.stopImmediatePropagation();
      if(!client) return authMessage("Accounts are not connected. Check SUPABASE_URL and SUPABASE_ANON_KEY in Vercel and redeploy.");
      const data=Object.fromEntries(new FormData(e.currentTarget).entries());
      const role=authMode==="signup"?$("#accountType").value.toLowerCase():null;
      let result=authMode==="login"
        ? await client.auth.signInWithPassword({email:data.email,password:data.password})
        : await client.auth.signUp({email:data.email,password:data.password,options:{data:{full_name:data.name,role}}});
      if(result.error) return authMessage(result.error.message);
      if(!result.data.session) return authMessage("Check your email to confirm your account, then log in.");
      const user=result.data.user;
      const profile=await client.from("profiles").upsert({
        id:user.id,full_name:data.name||user.user_metadata?.full_name||user.email,
        role:role||user.user_metadata?.role||"player",country:data.country||null,
        profile_url:data.link||null
      },{onConflict:"id"});
      if(profile.error) return authMessage("Your account is signed in, but profile setup failed: "+profile.error.message);
      await showSignedIn(user);
    });
    $("#searchPlayers")?.addEventListener("click",livePlayerSearch);
    $("#playerSearch")?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();livePlayerSearch();}});
    $("#searchStaff")?.addEventListener("click",liveStaffSearch);
    await loadDirectoryCoverage();
    $("#staffSubmissionForm")?.addEventListener("submit",submitStaffRecord);
    $("#playerApplicationForm")?.addEventListener("submit",submitPlayerApplication);
    $("#scoutProfileForm")?.addEventListener("submit",saveScoutProfile);
    $("#searchContacts")?.addEventListener("click",loadPublicContacts);
    $("#contactSearch")?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();loadPublicContacts();}});
    $("#contactLeague")?.addEventListener("change",loadPublicContacts);
    $("#contactType")?.addEventListener("change",loadPublicContacts);
    await loadPublicContacts();
    await loadScoutDirectory();
  }
  function setAuthMode(mode){
    authMode=mode;
    $("#modalTitle").textContent=mode==="login"?"Welcome back.":"Create your profile.";
    $("#signupForm button[type=submit]").textContent=mode==="login"?"Log in ↗":"Create secure account ↗";
    $('input[name=name]').required=mode==="signup";
    $('input[name=country]').required=mode==="signup";
  }
  function authMessage(msg){const el=$("#signupSuccess");el.hidden=false;el.textContent=msg;}
  async function showSignedIn(user){
    currentUser=user;
    $("#signupForm").hidden=true;$("#signupSuccess").hidden=false;
    $("#signupSuccess").textContent="Signed in as "+(user.email||"TRANSFERBRIDGE member")+". Your account is connected.";
    $("#loginBtn").textContent="Account";
    await loadScoutDirectory();await loadMyApplications();await loadScoutInbox();
  }

  async function loadDirectoryCoverage(){
    const target=$("#directoryCoverage");if(!target)return;
    try{
      const response=await fetch("/api/club-directory-coverage"),data=await response.json();
      if(!response.ok)throw new Error(data.error||"Coverage report unavailable.");
      const rows=(data.leagues||[]).map(l=>'<div class="coverage-row"><div><b>'+safe(l.league)+'</b><small>'+l.clubs_with_named_contacts+' / '+l.target_clubs+' clubs with named contacts · '+l.named_contact_records+' people listed</small></div><span class="tag">'+Math.round(l.clubs_with_named_contacts/Math.max(1,l.target_clubs)*100)+'%</span></div>').join("");
      target.innerHTML='<div class="coverage-summary"><strong>'+safe(data.clubs_with_any_staff_or_contact_record)+' / '+safe(data.target_clubs)+'</strong><span>clubs with at least one staff/contact record</span><p>'+safe(data.named_contact_records)+' named contact records · '+safe(data.verified_staff_records)+' independently verified staff submissions · '+safe(data.clubs_without_any_staff_or_contact_record)+' clubs still without a record</p></div><div class="coverage-list">'+rows+'</div><p class="data-note">'+safe(data.warning)+'</p>';
    }catch(error){target.innerHTML='<p class="data-note">'+safe(error.message)+'</p>';}
  }
  async function livePlayerSearch(){
    const term=$("#playerSearch").value.trim(),grid=$("#playerGrid"),noteEl=$("#playerDataNote");
    if(term.length<2){noteEl.textContent="Enter a club name, for example Arsenal or Real Madrid.";return;}
    grid.innerHTML="<p>Searching live club squads…</p>";
    try{
      const found=await fetch("/api/teams?search="+encodeURIComponent(term)).then(r=>r.json());
      if(!found.teams?.length){grid.innerHTML="<p>No matching clubs found. Check spelling or provider coverage.</p>";return;}
      const team=found.teams[0],data=await fetch("/api/players?team="+team.id).then(r=>r.json());
      if(!data.players)throw new Error(data.error||"Live squad data unavailable.");
      const pos=$("#positionFilter").value.toLowerCase(),age=$("#ageFilter").value;
      const players=data.players.filter(p=>{const position=String(p.position||"").toLowerCase(),a=Number(p.age||0);return(!pos||position.includes(pos))&&(!age||(age==="u18"?a<18:age==="18-23"?a>=18&&a<=23:a>=24));});
      grid.innerHTML=players.map(p=>'<article class="player-card">'+(p.photo?'<img class="player-avatar" src="'+safe(p.photo)+'" alt="" style="object-fit:cover">':'<span class="player-avatar">'+safe((p.name||"?").split(" ").map(x=>x[0]).join("").slice(0,2))+'</span>')+'<span><h3>'+safe(p.name)+'</h3><p>'+safe(p.position)+' · '+safe(p.age||"Age unavailable")+' · '+safe(team.name)+'</p><span class="tag">'+safe(p.number?"Squad no. "+p.number:"Squad member")+'</span></span></article>').join("")||"<p>No squad members match those filters.</p>";
      noteEl.textContent="Source: API-SPORTS · "+team.name+", "+team.country+". Squad listing does not confirm contract status or availability.";
    }catch(err){grid.innerHTML="<p>"+safe(err.message)+"</p>";}
  }
  async function liveStaffSearch(){
    const club=$("#staffClub").value.trim(),grid=$("#staffGrid");
    if(!club){note("#staffNote","Enter a club name first.");return;}
    grid.innerHTML="<p>Checking sourced club professionals…</p>";
    try{
      const response=await fetch("/api/club-staff?club="+encodeURIComponent(club)),data=await response.json();
      if(!response.ok||!Array.isArray(data.staff))throw new Error(data.error||"Staff directory unavailable.");
      grid.innerHTML=data.staff.map(p=>'<article class="player-card"><span class="player-avatar">TB</span><span><h3>'+safe(p.full_name)+'</h3><p>'+safe(p.role)+' · '+safe(p.department||"")+' · '+safe(p.club_name)+'</p><span class="tag">'+safe(p.record_status||"Verified")+'</span> <a class="tag" href="'+safe(p.source_url)+'" target="_blank" rel="noopener">View source ↗</a>'+(p.notes?'<p>'+safe(p.notes)+'</p>':'')+'</span></article>').join("")||"<p>No sourced staff records found for this club yet.</p>";
      note("#staffNote",(data.note||"Staff records are labelled by verification status.")+" Verified: "+(data.verified_count||0)+". Source-listed: "+(data.source_listed_count||0)+".");
    }catch(err){grid.innerHTML="<p>"+safe(err.message)+"</p>";note("#staffNote","The staff search could not complete. Check the database setup and try again.");}
  }
  async function submitStaffRecord(e){
    e.preventDefault();const form=e.currentTarget;
    if(!client)return note("#staffSubmitNote","Database is not connected. Check Supabase settings and redeploy.");
    const {data:{user}}=await client.auth.getUser();
    if(!user)return note("#staffSubmitNote","Please log in before submitting a club professional.");
    const values=Object.fromEntries(new FormData(form).entries());
    const result=await client.from("club_staff").insert({...values,submitted_by:user.id,verified:false});
    if(result.error)return note("#staffSubmitNote","Submission failed: "+result.error.message);
    form.reset();note("#staffSubmitNote","Submitted. The record is pending TRANSFERBRIDGE verification.");
  }
  async function loadPublicContacts(){
    const grid=$("#contactsGrid");if(!grid)return;
    const q=$("#contactSearch")?.value.trim()||"",league=$("#contactLeague")?.value||"",type=$("#contactType")?.value||"";
    grid.innerHTML="<p>Loading football contacts…</p>";
    try{
      const params=new URLSearchParams();if(q)params.set("q",q);if(league)params.set("league",league);if(type)params.set("department",type);
      const response=await fetch("/api/contacts?"+params.toString()),body=await response.json();
      if(!response.ok||!Array.isArray(body.contacts))throw new Error(body.error||"Contact directory unavailable.");
      grid.innerHTML=body.contacts.map(c=>'<article class="contact-row" data-contact-id="'+safe(c.id)+'"><div class="contact-identity"><span class="contact-crest">⚽</span><div><h3>'+safe(c.contact_name||c.club_name)+'</h3><p>'+safe(c.job_title||c.department)+' · '+safe(c.club_name)+'</p><small>'+safe(c.league)+' · '+safe(c.verification_status)+'</small></div></div><div class="contact-actions"><span class="contact-mail-icon" title="Email address locked">✉</span><span class="contact-lock" aria-label="Locked">🔒</span></div><div class="contact-expanded" hidden><form class="contact-request-form" data-id="'+safe(c.id)+'"><h4>Request this contact from TRANSFERBRIDGE</h4><label>Full name<input name="requester_name" required maxlength="120" autocomplete="name" placeholder="Your full name"></label><label>Email address<input name="requester_email" type="email" required maxlength="254" autocomplete="email" placeholder="you@example.com"></label><label>WhatsApp / phone number<input name="requester_phone" required maxlength="40" autocomplete="tel" placeholder="+234…"></label><label>Country<input name="country" required maxlength="80" autocomplete="country-name" placeholder="Your country"></label><label>Why do you need this contact?<textarea name="reason" required maxlength="1000" rows="3" placeholder="Tell us briefly how you intend to use this contact"></textarea></label><button class="btn btn-gold" type="submit">Submit request to TRANSFERBRIDGE ↗</button><p class="data-note request-result" aria-live="polite"></p></form></div></article>').join("")||"<p>No public contact records match those filters yet.</p>";
      grid.querySelectorAll(".contact-row").forEach(row=>row.addEventListener("click",e=>{
        if(e.target.closest("a,button"))return;
        const panel=row.querySelector(".contact-expanded");panel.hidden=!panel.hidden;row.classList.toggle("is-open",!panel.hidden);
      }));
      grid.querySelectorAll(".contact-request-form").forEach(form=>form.addEventListener("submit",async e=>{
        e.preventDefault();
        const submit=form.querySelector('button[type="submit"]'),out=form.querySelector(".request-result");
        const values=Object.fromEntries(new FormData(form).entries());
        values.contact_id=form.dataset.id;
        submit.disabled=true;out.textContent="Sending your request…";
        try{
          const response=await fetch("/api/contact-requests",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(values)});
          const result=await response.json();
          if(!response.ok)throw new Error(result.error||"Your request could not be submitted.");
          form.reset();out.textContent="Your request has been sent to TRANSFERBRIDGE. Our team will contact you by email or phone about the next steps.";
        }catch(error){out.textContent=error.message;submit.disabled=false;}
      }));
      note("#contactsNote","Showing "+body.contacts.length+" contact records. Direct email addresses and phone numbers are locked; click a contact to request release.");
    }catch(error){grid.innerHTML="<p>"+safe(error.message)+"</p>";}
  }
  async function loadScoutDirectory(){
    const grid=$("#scoutDirectory"),select=$("#applicationScout");
    if(!grid)return;
    grid.innerHTML="<p>Loading verified scout profiles…</p>";
    try{
      const response=await fetch("/api/scouts");
      const body=await response.json();
      if(!response.ok||!Array.isArray(body.scouts))throw new Error(body.error||"Scout directory unavailable.");
      const data=body.scouts;
      let ownPending=null;
      if(currentUser){
        const {data:myRole}=await client.from("profiles").select("role,full_name,country").eq("id",currentUser.id).maybeSingle();
        if(myRole?.role==="scout"){
          const {data:mine}=await client.from("scout_profiles").select("user_id,organisation,territory,positions,age_groups,bio,credentials_url,created_at,verified").eq("user_id",currentUser.id).maybeSingle();
          if(mine&&!mine.verified&&!data.some(item=>item.user_id===currentUser.id)) ownPending={...mine,full_name:myRole.full_name,country:myRole.country};
        }
      }
      if(!data.length&&!ownPending){
        grid.innerHTML="<p>No registered scout profiles have been verified yet. See Football Contacts for publicly listed club scouting contacts, including scouts who have not joined TRANSFERBRIDGE.</p>";
        if(select)select.innerHTML='<option value="">No specific scout — TRANSFERBRIDGE review</option>';
        return;
      }
      const verifiedCards=data.map(s=>'<article class="player-card scout-directory-card"><span class="player-avatar">SC</span><span class="scout-card-content"><h3>'+safe(s.full_name||"Verified scout")+'</h3><p>'+safe(s.organisation||"Independent scout")+' · '+safe(s.territory||s.country||"Territory not listed")+'</p><p>'+safe(s.positions||"Positions not specified")+' · '+safe(s.age_groups||"Age groups not specified")+'</p><p>'+safe(s.bio||"")+'</p><span class="tag">TRANSFERBRIDGE verified profile</span><div class="scout-card-actions"><button class="btn btn-gold scout-submit-btn" type="button" data-scout="'+safe(s.user_id)+'">Submit My Player Profile</button><button class="btn btn-quiet scout-unlock-btn" type="button" data-scout="'+safe(s.user_id)+'">Unlock Scout Email 🔒</button></div></span></article>').join("");
      const pendingCard=ownPending?'<article class="player-card scout-directory-card"><span class="player-avatar">SC</span><span class="scout-card-content"><h3>'+safe(ownPending.full_name||"Your scout profile")+'</h3><p>'+safe(ownPending.organisation||"Independent scout")+' · '+safe(ownPending.territory||ownPending.country||"Territory not listed")+'</p><p>'+safe(ownPending.positions||"Positions not specified")+' · '+safe(ownPending.age_groups||"Age groups not specified")+'</p><p>'+safe(ownPending.bio||"")+'</p><span class="tag">Your profile · pending verification (visible only to you)</span></span></article>':"";
      grid.innerHTML=verifiedCards+pendingCard;
      grid.querySelectorAll(".scout-submit-btn").forEach(btn=>btn.addEventListener("click",()=>{const select=$("#applicationScout");if(select)select.value=btn.dataset.scout;$("#player-application")?.scrollIntoView({behavior:"smooth"});note("#applicationNote","Selected scout. Complete your football CV and upload your footage below, then submit to TRANSFERBRIDGE.");}));
      grid.querySelectorAll(".scout-unlock-btn").forEach(btn=>btn.addEventListener("click",()=>{$("#contacts")?.scrollIntoView({behavior:"smooth"});note("#contactsNote","Search for this scout in Football Contacts and submit the contact request form. Email release requires payment and permission to disclose.");}));
      if(select)select.innerHTML='<option value="">No specific scout — TRANSFERBRIDGE review</option>'+data.map(s=>'<option value="'+safe(s.user_id)+'">'+safe(s.full_name||"Scout")+' — '+safe(s.organisation||"Independent")+'</option>').join("");
    }catch(error){
      grid.innerHTML="<p>Scout directory could not load: "+safe(error.message)+"</p>";
    }
  }
  async function saveScoutProfile(e){
    e.preventDefault();if(!client)return note("#scoutProfileNote","Database is not connected. Check Supabase settings and redeploy.");
    const {data:{user}}=await client.auth.getUser();if(!user)return note("#scoutProfileNote","Please log in with your Scout account first.");
    const {data:profile}=await client.from("profiles").select("role").eq("id",user.id).maybeSingle();
    if(profile?.role!=="scout")return note("#scoutProfileNote","This feature is for accounts registered as Scout. Create a Scout account or contact support to correct your role.");
    const values=Object.fromEntries(new FormData(e.currentTarget).entries());
    const result=await client.from("scout_profiles").upsert({user_id:user.id,...values,verified:false,updated_at:new Date().toISOString()},{onConflict:"user_id"});
    if(result.error)return note("#scoutProfileNote","Could not save scout profile: "+result.error.message);
    note("#scoutProfileNote","Scout profile submitted. It will appear in the public-to-members directory after TRANSFERBRIDGE verifies it.");
  }
  async function submitPlayerApplication(e){
    e.preventDefault();const form=e.currentTarget;
    if(!client)return note("#applicationNote","Database is not connected. Check Supabase settings and redeploy.");
    const {data:{user}}=await client.auth.getUser();if(!user)return note("#applicationNote","Please create an account or log in before submitting.");
    const {data:profile}=await client.from("profiles").select("role").eq("id",user.id).maybeSingle();
    if(profile?.role!=="player")return note("#applicationNote","Please use a Player account to submit a player application.");
    const fd=new FormData(form),values=Object.fromEntries(fd.entries()),appId=crypto.randomUUID();
    const files=[["cv_file","cv"],["highlight_file","highlights"],["match_file","full-match"]];
    const paths={};
    for(const [field,folder] of files){
      const file=fd.get(field);if(!(file instanceof File)||!file.size)continue;
      if(file.size>200*1024*1024)return note("#applicationNote",file.name+" is larger than the 200 MB upload limit.");
      const ext=(file.name.split(".").pop()||"bin").toLowerCase().replace(/[^a-z0-9]/g,"");
      const path=user.id+"/"+appId+"/"+folder+"."+ext;
      const upload=await client.storage.from("player-media").upload(path,file,{upsert:false,contentType:file.type||"application/octet-stream"});
      if(upload.error)return note("#applicationNote","Upload failed for "+file.name+": "+upload.error.message);
      paths[field]=path;
    }
    const result=await client.from("player_applications").insert({
      id:appId,submitted_by:user.id,scout_id:values.scout_id||null,
      player_name:values.player_name,target_club:values.target_club||null,date_of_birth:values.date_of_birth||null,
      nationality:values.nationality,position:values.position,
      current_club:values.current_club||null,preferred_foot:values.preferred_foot||null,
      height_cm:values.height_cm?Number(values.height_cm):null,professional_profile_url:values.professional_profile_url||null,bio:values.bio||null,message:values.message||null,
      cv_path:paths.cv_file||null,highlight_path:paths.highlight_file||null,match_path:paths.match_file||null
    });
    if(result.error)return note("#applicationNote","Files uploaded but application could not be saved: "+result.error.message+". Please contact support before submitting again.");
    form.reset();note("#applicationNote",values.scout_id?"Application sent to your selected scout.":"Application submitted to TRANSFERBRIDGE for review.");
    await loadMyApplications();
  }
  async function loadScoutInbox(){
    const target=$("#scoutInbox");if(!target||!client||!currentUser)return;
    const {data:profile}=await client.from("profiles").select("role").eq("id",currentUser.id).maybeSingle();
    if(profile?.role!=="scout"){target.innerHTML="<p>This inbox is available to Scout accounts.</p>";return;}
    const {data,error}=await client.from("player_applications").select("id,player_name,date_of_birth,nationality,position,current_club,preferred_foot,height_cm,bio,message,cv_path,highlight_path,match_path,status,created_at").eq("scout_id",currentUser.id).order("created_at",{ascending:false});
    if(error){target.innerHTML="<p>Could not load scout inbox: "+safe(error.message)+"</p>";return;}
    if(!data?.length){target.innerHTML="<p>No player applications have been assigned to you yet.</p>";return;}
    const cards=[];
    for(const a of data){
      const links=[];
      for(const [path,label] of [[a.cv_path,"Football CV"],[a.highlight_path,"Highlight video"],[a.match_path,"Full-match footage"]]){
        if(!path)continue;
        const signed=await client.storage.from("player-media").createSignedUrl(path,3600);
        if(!signed.error&&signed.data?.signedUrl)links.push('<a class="tag" href="'+safe(signed.data.signedUrl)+'" target="_blank" rel="noopener">'+label+' ↗</a>');
      }
      cards.push('<article class="player-card scout-application"><span class="player-avatar">PL</span><span><h3>'+safe(a.player_name)+'</h3><p>'+safe(a.position)+' · '+safe(a.nationality)+' · '+safe(a.current_club||"Club not supplied")+'</p><p>'+safe(a.bio||a.message||"No additional player introduction.")+'</p><span class="tag">'+safe(a.status)+' · '+safe(new Date(a.created_at).toLocaleDateString())+'</span><div class="application-links">'+links.join(" ")+'</div></span></article>');
    }
    target.innerHTML=cards.join("");
  }
  async function loadMyApplications(){
    const target=$("#myApplications");if(!target||!client||!currentUser)return;
    const {data,error}=await client.from("player_applications").select("id,player_name,position,status,created_at,scout_id").eq("submitted_by",currentUser.id).order("created_at",{ascending:false});
    if(error){target.innerHTML="<p>Could not load applications: "+safe(error.message)+"</p>";return;}
    target.innerHTML=data?.length?data.map(a=>'<article class="player-card"><span><h3>'+safe(a.player_name)+'</h3><p>'+safe(a.position)+' · '+safe(new Date(a.created_at).toLocaleDateString())+'</p><span class="tag">'+safe(a.status)+'</span></span></article>').join(""):"<p>You have not submitted any player applications yet.</p>";
  }
  init();
})();