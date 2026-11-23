// Food Date Tracker — accounts + groups, Cloudflare Worker
// Bindings: KV "FOOD". Vars: FROM_EMAIL. Secret: RESEND_KEY (Resend API key)
const WARN_DAYS = 60;   // first email ~2 months before
const FINAL_DAYS = 7;   // second reminder 1 week before
const SITE = "https://food.jamietaylor.org";
const VERSION = "6";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;
    if (p === "/api/version") return new Response(JSON.stringify({ version: VERSION }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
    if (p === "/") return new Response(HTML.replaceAll("__VERSION__", VERSION), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
    if (!p.startsWith("/api/")) return new Response("Not found", { status: 404 });
    try {
      const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

      // ---- no login needed ----
      if (p === "/api/signup") {
        const email = cleanEmail(body.email), name = String(body.name || "").trim().slice(0, 40);
        if (!email) return err("Enter a valid email");
        if (!name) return err("Enter your name");
        if (String(body.password || "").length < 6) return err("Password must be at least 6 characters");
        if (await getUser(env, email)) return err("There's already an account with that email — log in instead");
        const salt = rand(16);
        const user = { email, name, salt, hash: await hashPw(body.password, salt), alerts: true, groups: [] };
        // join any groups they were invited to
        const invites = JSON.parse((await env.FOOD.get("invite:" + email)) || "[]");
        for (const gid of invites) {
          const g = await getGroup(env, gid);
          if (!g) continue;
          g.invited = g.invited.filter(e => e !== email);
          if (!g.members.includes(email)) g.members.push(email);
          await putGroup(env, g);
          user.groups.push(gid);
        }
        await env.FOOD.delete("invite:" + email);
        if (!user.groups.length) user.groups.push((await newGroup(env, `${name}'s food`, email)).id);
        await putUser(env, user);
        return ok({ token: await newSession(env, email) });
      }

      if (p === "/api/login") {
        const user = await getUser(env, cleanEmail(body.email));
        if (!user || (await hashPw(String(body.password || ""), user.salt)) !== user.hash) return err("Wrong email or password", 401);
        return ok({ token: await newSession(env, user.email) });
      }

      // ---- login needed ----
      const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
      const email = token && (await env.FOOD.get("sess:" + token));
      if (!email) return err("Please log in", 401);
      const me = await getUser(env, email);
      if (!me) return err("Please log in", 401);

      if (p === "/api/logout") { await env.FOOD.delete("sess:" + token); return ok({}); }

      if (p === "/api/me") {
        const groups = [];
        for (const gid of me.groups) { const g = await getGroup(env, gid); if (g) groups.push({ id: g.id, name: g.name, owner: g.owner }); }
        return ok({ name: me.name, email: me.email, alerts: me.alerts, groups });
      }

      if (p === "/api/settings") { me.alerts = !!body.alerts; await putUser(env, me); return ok({ alerts: me.alerts }); }

      if (p === "/api/test-email") {
        await sendMail(env, [me.email], "Food tracker test", `Hi ${me.name}, if you can read this, email alerts are working.`);
        return ok({});
      }

      if (p === "/api/groups" && req.method === "POST") {
        const name = String(body.name || "").trim().slice(0, 40);
        if (!name) return err("Give the group a name");
        const g = await newGroup(env, name, me.email);
        me.groups.push(g.id); await putUser(env, me);
        return ok({ id: g.id });
      }

      const m = p.match(/^\/api\/groups\/([a-z0-9]+)(\/.*)?$/);
      if (m) {
        const g = await getGroup(env, m[1]);
        if (!g || !g.members.includes(me.email)) return err("You're not in that group", 403);
        const sub = m[2] || "";

        if (sub === "" && req.method === "GET") {
          const members = [];
          for (const e of g.members) { const u = await getUser(env, e); members.push({ email: e, name: u ? u.name : e, owner: e === g.owner }); }
          return ok({ id: g.id, name: g.name, owner: g.owner, items: g.items, members, invited: g.invited });
        }

        if (sub === "/items") {
          if (!body.name || !/^\d{4}-\d{2}-\d{2}$/.test(body.date || "")) return err("Food name and date needed");
          g.items.push({ id: rand(8), name: String(body.name).slice(0, 100), qty: Math.max(1, Number(body.qty) || 1),
            date: body.date, notes: String(body.notes || "").slice(0, 200), by: me.name, w60: false, w7: false });
          await putGroup(env, g); return ok(g.items);
        }

        if (sub === "/items/delete") { g.items = g.items.filter(i => i.id !== body.id); await putGroup(env, g); return ok(g.items); }

        if (sub === "/rename") {
          const name = String(body.name || "").trim().slice(0, 40);
          if (!name) return err("Give the group a name");
          g.name = name; await putGroup(env, g); return ok({});
        }

        if (sub === "/members") {
          const e = cleanEmail(body.email);
          if (!e) return err("Enter a valid email");
          if (g.members.includes(e) || g.invited.includes(e)) return err("They're already in this group");
          const u = await getUser(env, e);
          if (u) {
            g.members.push(e); u.groups.push(g.id); await putUser(env, u);
          } else {
            g.invited.push(e);
            const inv = JSON.parse((await env.FOOD.get("invite:" + e)) || "[]");
            inv.push(g.id); await env.FOOD.put("invite:" + e, JSON.stringify(inv));
          }
          await putGroup(env, g);
          const msg = u
            ? `${me.name} added you to the "${g.name}" group on the food tracker.\n\nLog in to see it: ${SITE}`
            : `${me.name} invited you to the "${g.name}" group on the food tracker, to keep track of food use-by dates.\n\nMake an account with this email address to join: ${SITE}`;
          let emailed = true;
          try { await sendMail(env, [e], `${me.name} added you to "${g.name}"`, msg); } catch { emailed = false; }
          return ok({ joined: !!u, emailed });
        }

        if (sub === "/members/remove") {
          const e = cleanEmail(body.email);
          if (e !== me.email && me.email !== g.owner) return err("Only the group owner can remove other people");
          if (e === g.owner) return err("The owner can't be removed");
          if (g.invited.includes(e)) {
            g.invited = g.invited.filter(x => x !== e);
            const inv = JSON.parse((await env.FOOD.get("invite:" + e)) || "[]").filter(x => x !== g.id);
            await env.FOOD.put("invite:" + e, JSON.stringify(inv));
          } else {
            g.members = g.members.filter(x => x !== e);
            const u = await getUser(env, e);
            if (u) { u.groups = u.groups.filter(x => x !== g.id); await putUser(env, u); }
          }
          await putGroup(env, g); return ok({});
        }

        if (sub === "/delete") {
          if (me.email !== g.owner) return err("Only the group owner can delete it");
          for (const e of g.members) { const u = await getUser(env, e); if (u) { u.groups = u.groups.filter(x => x !== g.id); await putUser(env, u); } }
          await env.FOOD.delete("group:" + g.id);
          const all = JSON.parse((await env.FOOD.get("groups")) || "[]").filter(x => x !== g.id);
          await env.FOOD.put("groups", JSON.stringify(all));
          return ok({});
        }

        if (sub === "/check") return ok({ sent: await checkGroup(env, g) });
      }
      return err("Not found", 404);
    } catch (e) {
      return err(e.message || "Something went wrong", 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const all = JSON.parse((await env.FOOD.get("groups")) || "[]");
      for (const gid of all) { const g = await getGroup(env, gid); if (g) await checkGroup(env, g).catch(() => {}); }
    })());
  },
};

async function checkGroup(env, g) {
  const soon = [], final = [];
  for (const i of g.items) {
    const d = daysLeft(i.date);
    if (d <= FINAL_DAYS && !i.w7) final.push(i);
    else if (d <= WARN_DAYS && !i.w60) soon.push(i);
  }
  if (!soon.length && !final.length) return 0;
  const to = [];
  for (const e of g.members) { const u = await getUser(env, e); if (u && u.alerts) to.push(e); }
  if (!to.length) return 0;

  const line = i => `- ${i.name} (x${i.qty}) — use by ${fmt(i.date)} (${label(daysLeft(i.date))})${i.notes ? " — " + i.notes : ""}`;
  let body = `Food alert for "${g.name}":\n\n`;
  if (final.length) body += "USE THIS WEEK:\n" + final.map(line).join("\n") + "\n\n";
  if (soon.length) body += "Going out of date in the next 2 months:\n" + soon.map(line).join("\n") + "\n\n";
  body += `See everything: ${SITE}`;
  await sendMail(env, to, `Food alert: ${soon.length + final.length} item(s) going out of date (${g.name})`, body);

  // only mark as warned once the email has gone
  for (const i of final) { i.w7 = true; i.w60 = true; }
  for (const i of soon) i.w60 = true;
  await putGroup(env, g);
  return soon.length + final.length;
}

async function sendMail(env, to, subject, text) {
  if (!env.RESEND_KEY) throw new Error("Email sending isn't switched on yet (RESEND_KEY missing)");
  const failed = [];
  for (const addr of to) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `Food Tracker <${env.FROM_EMAIL}>`, to: [addr], subject, text }),
    });
    if (!r.ok) failed.push(`${addr}: ${(await r.text()).slice(0, 150)}`);
  }
  if (failed.length === to.length) throw new Error("Couldn't send email — " + failed.join("; "));
}

// ---- storage helpers ----
const getUser = async (env, e) => e ? JSON.parse((await env.FOOD.get("user:" + e)) || "null") : null;
const putUser = (env, u) => env.FOOD.put("user:" + u.email, JSON.stringify(u));
const getGroup = async (env, id) => JSON.parse((await env.FOOD.get("group:" + id)) || "null");
const putGroup = (env, g) => env.FOOD.put("group:" + g.id, JSON.stringify(g));
async function newGroup(env, name, owner) {
  const g = { id: rand(8), name, owner, members: [owner], invited: [], items: [] };
  await putGroup(env, g);
  const all = JSON.parse((await env.FOOD.get("groups")) || "[]");
  all.push(g.id); await env.FOOD.put("groups", JSON.stringify(all));
  return g;
}
async function newSession(env, email) {
  const t = rand(24);
  await env.FOOD.put("sess:" + t, email, { expirationTtl: 60 * 60 * 24 * 60 });
  return t;
}
function rand(n) { return [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, "0")).join(""); }
async function hashPw(pw, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 100000 }, key, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function cleanEmail(e) { e = String(e || "").trim().toLowerCase(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : ""; }
const ok = d => new Response(JSON.stringify(d), { headers: { "content-type": "application/json" } });
const err = (m, s = 400) => new Response(JSON.stringify({ error: m }), { status: s, headers: { "content-type": "application/json" } });
function daysLeft(date) { const t = new Date(); t.setUTCHours(0, 0, 0, 0); return Math.round((new Date(date + "T00:00:00Z") - t) / 86400000); }
const fmt = d => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const label = d => d < 0 ? `expired ${-d} days ago` : d === 0 ? "today" : `${d} days left`;

const HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Food Date Tracker</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:#f4f1ea;color:#222}
header{background:#2f5d3a;color:#fff;padding:14px 20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}h1{margin:0;font-size:22px;flex:1}
header small{opacity:.85}
main{max-width:760px;margin:0 auto;padding:16px}
.card{background:#fff;border-radius:12px;padding:16px;margin-bottom:14px;box-shadow:0 1px 3px #0002}
.card h2{margin:0 0 10px;font-size:17px}
form.add{display:grid;grid-template-columns:2fr 70px 1fr;gap:8px}form.add .notes{grid-column:1/3}
input,button,select{font:inherit;padding:10px;border:1px solid #ccc;border-radius:8px}
button{background:#2f5d3a;color:#fff;border:0;cursor:pointer}button.ghost{background:#eee;color:#222}button.link{background:none;color:#2f5d3a;padding:4px;text-decoration:underline}
.item{display:flex;align-items:center;gap:12px;padding:10px;border-radius:8px;margin-bottom:6px;border-left:6px solid #3a9d4f;background:#fafafa}
.item.soon{border-color:#e0a100;background:#fff8e6}.item.week{border-color:#e06100;background:#fff0e3}.item.gone{border-color:#c62828;background:#fdecec}
.item.person{border-color:#7a8ca0}
.item .grow{flex:1}.item small{color:#666}.del{background:#ddd;color:#333;padding:6px 10px}
.stats{display:flex;gap:10px;flex-wrap:wrap}.stat{flex:1;min-width:110px;text-align:center}.stat b{display:block;font-size:24px}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.col{display:flex;flex-direction:column;gap:8px}
.msg{color:#2f5d3a;margin-top:8px}.bad{color:#c62828}
.tag{font-size:12px;background:#e6efe8;color:#2f5d3a;padding:2px 8px;border-radius:10px;margin-left:6px}
@media(max-width:560px){form.add{grid-template-columns:1fr 70px}form.add .date{grid-column:1/3}}
</style></head><body>
<header><h1>🥫 Food Date Tracker</h1><small id="who"></small></header><main>

<div class="card" id="auth" hidden>
 <h2 id="authTitle">Log in</h2>
 <div class="col">
  <input id="aName" placeholder="Your name" hidden>
  <input id="aEmail" type="email" placeholder="Email">
  <input id="aPw" type="password" placeholder="Password">
  <button onclick="doAuth()" id="authBtn">Log in</button>
  <div class="row"><span id="authSwapText">No account yet?</span><button class="link" onclick="swapAuth()" id="authSwap">Sign up</button></div>
  <p class="bad" id="authErr"></p>
 </div>
</div>

<div id="app" hidden>
 <div class="card row">
  <select id="groupSel" onchange="openGroup(this.value)" style="flex:1"></select>
  <button class="ghost" onclick="newGroupPrompt()">+ New group</button>
 </div>
 <div class="card stats"><div class="stat"><b id="sTotal">0</b>items</div><div class="stat"><b id="sSoon">0</b>within 2 months</div><div class="stat"><b id="sGone">0</b>expired</div></div>
 <div class="card"><h2>Add food</h2><form class="add" id="f">
  <input name="name" placeholder="Food (e.g. Baked beans)" required>
  <input name="qty" type="number" min="1" value="1" title="How many">
  <input name="date" class="date" type="date" required>
  <input name="notes" class="notes" placeholder="Notes (optional, e.g. top shelf)">
  <button>Add</button></form></div>
 <div class="card"><input id="search" placeholder="Search..." style="width:100%;margin-bottom:10px" oninput="draw()"><div id="list"></div></div>
 <div class="card"><h2>People in this group</h2>
  <div id="members"></div>
  <div class="row" style="margin-top:10px"><input id="addEm" type="email" placeholder="Their email" style="flex:1"><button onclick="addMember()">Add person</button></div>
  <small>If they don't have an account yet, they'll get an email inviting them to sign up, and they'll join this group as soon as they do.</small>
  <div class="row" style="margin-top:10px"><button class="ghost" onclick="renameGroup()">Rename group</button><button class="ghost" onclick="leaveGroup()" id="leaveBtn">Leave group</button><button class="ghost" onclick="deleteGroup()" id="delBtn">Delete group</button></div>
  <div class="msg" id="gMsg"></div>
 </div>
 <div class="card"><h2>My settings</h2>
  <label class="row"><input type="checkbox" id="alerts" onchange="saveAlerts()"> Email me when food is going out of date</label>
  <div class="row" style="margin-top:10px"><button class="ghost" onclick="act('test-email','Test email sent — check your inbox')">Send me a test email</button>
  <button class="ghost" onclick="act('groups/'+gid+'/check','Checked dates')">Check dates now</button>
  <button class="ghost" onclick="logout()">Log out</button></div><div class="msg" id="msg"></div>
 </div>
</div>
</main>
<footer style="text-align:center;padding:10px 16px 30px;color:#666">
 <button class="ghost" onclick="checkUpdates()">Check for updates</button>
 <div id="upd" style="margin-top:8px;font-size:14px">Version __VERSION__</div>
</footer>
<script>
const MY_VERSION='__VERSION__';
async function checkUpdates(){const u=document.getElementById('upd');u.textContent='Checking...';
 try{const r=await fetch('/api/version?t='+Date.now(),{cache:'no-store'}).then(r=>r.json());
  if(r.version!==MY_VERSION){u.textContent='Updating to version '+r.version+'...';setTimeout(()=>location.replace('/?v='+r.version),600)}
  else u.textContent='You\\'re on the latest version (version '+MY_VERSION+')'}
 catch(e){u.textContent='Couldn\\'t check for updates, try again'}}
let tok=localStorage.getItem('ftok')||'',me=null,gid=localStorage.getItem('fgid')||'',grp=null,signup=false;
const $=id=>document.getElementById(id);
const api=(p,b)=>fetch('/api/'+p,{method:b?'POST':'GET',headers:{'content-type':'application/json',authorization:'Bearer '+tok},body:b&&JSON.stringify(b)})
 .then(async r=>{const d=await r.json();if(r.status===401&&p!=='login'){showAuth();throw new Error(d.error)}if(!r.ok)throw new Error(d.error);return d});
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function days(d){const t=new Date();t.setHours(0,0,0,0);return Math.round((new Date(d+'T00:00:00')-t)/864e5)}
function showAuth(){tok='';localStorage.removeItem('ftok');$('app').hidden=true;$('auth').hidden=false;$('who').textContent=''}
function swapAuth(){signup=!signup;$('aName').hidden=!signup;$('authTitle').textContent=$('authBtn').textContent=signup?'Sign up':'Log in';
 $('authSwapText').textContent=signup?'Already have an account?':'No account yet?';$('authSwap').textContent=signup?'Log in':'Sign up';$('authErr').textContent=''}
async function doAuth(){try{const d=await api(signup?'signup':'login',{name:$('aName').value,email:$('aEmail').value,password:$('aPw').value});
 tok=d.token;localStorage.setItem('ftok',tok);$('aPw').value='';start()}catch(e){$('authErr').textContent=e.message}}
async function start(){me=await api('me');$('auth').hidden=true;$('app').hidden=false;$('who').textContent=me.name;$('alerts').checked=me.alerts;
 if(!me.groups.find(g=>g.id===gid))gid=me.groups[0]?me.groups[0].id:'';drawGroups();if(gid)openGroup(gid)}
function drawGroups(){$('groupSel').innerHTML=me.groups.map(g=>'<option value="'+g.id+'"'+(g.id===gid?' selected':'')+'>'+esc(g.name)+'</option>').join('')||'<option>No groups yet</option>'}
async function openGroup(id){gid=id;localStorage.setItem('fgid',id);grp=await api('groups/'+id);draw();drawMembers()}
function draw(){if(!grp)return;const q=$('search').value.toLowerCase();const items=grp.items;
 const s=[...items].sort((a,b)=>a.date.localeCompare(b.date));let soon=0,gone=0;
 $('list').innerHTML=s.filter(i=>i.name.toLowerCase().includes(q)).map(i=>{const d=days(i.date);
  const c=d<0?'gone':d<=7?'week':d<=60?'soon':'';
  const l=d<0?'Expired '+(-d)+' days ago':d===0?'Today!':d+' days left';
  const date=new Date(i.date+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  return '<div class="item '+c+'"><div class="grow"><b>'+esc(i.name)+'</b> ×'+i.qty+'<br><small>'+date+' · '+l+(i.notes?' · '+esc(i.notes):'')+(i.by?' · added by '+esc(i.by):'')+'</small></div><button class="del" data-id="'+i.id+'" onclick="delItem(this.dataset.id)">Used</button></div>'}).join('')||'<p>No food added yet.</p>';
 items.forEach(i=>{const d=days(i.date);if(d<0)gone++;else if(d<=60)soon++});
 sTotal.textContent=items.length;sSoon.textContent=soon;sGone.textContent=gone}
function drawMembers(){const owner=grp.owner===me.email;
 $('members').innerHTML=grp.members.map(m=>'<div class="item person"><div class="grow"><b>'+esc(m.name)+'</b>'+(m.owner?'<span class="tag">owner</span>':'')+'<br><small>'+esc(m.email)+'</small></div>'+
  (owner&&!m.owner?'<button class="del" data-e="'+esc(m.email)+'" onclick="removeMember(this.dataset.e)">Remove</button>':'')+'</div>').join('')+
  grp.invited.map(e=>'<div class="item person"><div class="grow">'+esc(e)+'<span class="tag">invited</span><br><small>Hasn\\'t signed up yet</small></div>'+
  (owner?'<button class="del" data-e="'+esc(e)+'" onclick="removeMember(this.dataset.e)">Cancel</button>':'')+'</div>').join('');
 $('leaveBtn').hidden=owner;$('delBtn').hidden=!owner}
$('f').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);
 try{grp.items=await api('groups/'+gid+'/items',Object.fromEntries(f));e.target.reset();e.target.qty.value=1;draw()}catch(x){alert(x.message)}};
async function delItem(id){grp.items=await api('groups/'+gid+'/items/delete',{id});draw()}
async function addMember(){const el=$('addEm');try{const r=await api('groups/'+gid+'/members',{email:el.value});
 $('gMsg').textContent=(r.joined?'Added! ':'Invited — they\\'ll join when they sign up. ')+(r.emailed?'They\\'ve been emailed.':'(Couldn\\'t send them an email.)');el.value='';openGroup(gid)}catch(e){$('gMsg').textContent=e.message}}
async function removeMember(e){if(!confirm('Remove '+e+' from this group?'))return;await api('groups/'+gid+'/members/remove',{email:e});openGroup(gid)}
async function leaveGroup(){if(!confirm('Leave this group?'))return;await api('groups/'+gid+'/members/remove',{email:me.email});gid='';start()}
async function deleteGroup(){if(!confirm('Delete this group and its whole food list for everyone?'))return;await api('groups/'+gid+'/delete',{});gid='';start()}
async function renameGroup(){const n=prompt('New group name',grp.name);if(!n)return;await api('groups/'+gid+'/rename',{name:n});start()}
async function newGroupPrompt(){const n=prompt('Name for the new group (e.g. Dad\\'s cupboard)');if(!n)return;try{const r=await api('groups',{name:n});gid=r.id;start()}catch(e){alert(e.message)}}
async function saveAlerts(){await api('settings',{alerts:$('alerts').checked})}
async function act(p,m){$('msg').textContent='...';try{await api(p,{});$('msg').textContent=m}catch(e){$('msg').textContent='Error: '+e.message}}
async function logout(){await api('logout',{}).catch(()=>{});showAuth()}
if(tok)start().catch(()=>showAuth());else showAuth();
</script></body></html>`;
