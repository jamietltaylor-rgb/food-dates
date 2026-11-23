// Food Date Tracker — single Cloudflare Worker
// Bindings needed: KV namespace "FOOD", Send Email binding "MAILER"
// Variables: PASSWORD (secret), TO_EMAIL, FROM_EMAIL
import { EmailMessage } from "cloudflare:email";

const WARN_DAYS = 60;   // first email ~2 months before
const FINAL_DAYS = 7;   // second reminder 1 week before

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/") return new Response(HTML, { headers: { "content-type": "text/html; charset=utf-8" } });

    if (url.pathname.startsWith("/api/")) {
      if (req.headers.get("x-pass") !== env.PASSWORD) return json({ error: "Wrong password" }, 401);
      let items = await load(env);

      if (url.pathname === "/api/items" && req.method === "GET") return json(items);

      if (url.pathname === "/api/items" && req.method === "POST") {
        const b = await req.json();
        if (!b.name || !/^\d{4}-\d{2}-\d{2}$/.test(b.date || "")) return json({ error: "Name and date needed" }, 400);
        items.push({ id: crypto.randomUUID(), name: String(b.name).slice(0, 100), qty: Number(b.qty) || 1,
          date: b.date, notes: String(b.notes || "").slice(0, 200), w60: false, w7: false });
        await save(env, items);
        return json(items);
      }

      if (url.pathname === "/api/delete" && req.method === "POST") {
        const { id } = await req.json();
        items = items.filter(i => i.id !== id);
        await save(env, items);
        return json(items);
      }

      if (url.pathname === "/api/emails" && req.method === "GET") return json(await loadEmails(env));

      if (url.pathname === "/api/emails" && req.method === "POST") {
        const { email } = await req.json();
        const e = String(email || "").trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return json({ error: "That email doesn't look right" }, 400);
        const list = await loadEmails(env);
        if (!list.includes(e)) list.push(e);
        await env.FOOD.put("emails", JSON.stringify(list));
        return json(list);
      }

      if (url.pathname === "/api/emails/delete" && req.method === "POST") {
        const { email } = await req.json();
        const list = (await loadEmails(env)).filter(x => x !== email);
        await env.FOOD.put("emails", JSON.stringify(list));
        return json(list);
      }

      if (url.pathname === "/api/test-email" && req.method === "POST") {
        try { await sendMail(env, "Food tracker test", "If you can read this, email alerts are working."); }
        catch (e) { return json({ error: e.message }, 500); }
        return json({ ok: true });
      }

      if (url.pathname === "/api/check-now" && req.method === "POST") {
        const sent = await checkDates(env);
        return json({ sent });
      }
    }
    return new Response("Not found", { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkDates(env));
  },
};

async function checkDates(env) {
  const items = await load(env);
  const soon = [], final = [];
  for (const i of items) {
    const d = daysLeft(i.date);
    if (d <= FINAL_DAYS && !i.w7) { final.push(i); i.w7 = true; i.w60 = true; }
    else if (d <= WARN_DAYS && !i.w60) { soon.push(i); i.w60 = true; }
  }
  if (!soon.length && !final.length) return 0;

  const line = i => `- ${i.name} (x${i.qty}) — use by ${fmt(i.date)} (${label(daysLeft(i.date))})${i.notes ? " — " + i.notes : ""}`;
  let body = "";
  if (final.length) body += "USE THIS WEEK:\n" + final.map(line).join("\n") + "\n\n";
  if (soon.length) body += "Going out of date in the next 2 months:\n" + soon.map(line).join("\n") + "\n\n";
  body += "Open the tracker to see everything.";

  await sendMail(env, `Food alert: ${soon.length + final.length} item(s) going out of date`, body);
  await save(env, items); // only mark as warned once the email has sent
  return soon.length + final.length;
}

async function sendMail(env, subject, body) {
  let to = await loadEmails(env);
  if (!to.length && env.TO_EMAIL) to = [env.TO_EMAIL];
  if (!to.length) throw new Error("No emails added yet");
  const failed = [];
  if (env.RESEND_KEY) {
    for (const addr of to) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: `Food Tracker <${env.FROM_EMAIL}>`, to: [addr], subject, text: body }),
      });
      if (!r.ok) failed.push(`${addr} (${(await r.text()).slice(0, 120)})`);
    }
    if (failed.length === to.length) throw new Error("Couldn't send to: " + failed.join(", "));
    return;
  }
  if (!env.MAILER) throw new Error("Email sending isn't switched on yet");
  const domain = env.FROM_EMAIL.split("@")[1];
  for (const addr of to) {
    const raw = [
      `From: Food Tracker <${env.FROM_EMAIL}>`,
      `To: ${addr}`,
      `Subject: ${subject}`,
      `Message-ID: <${crypto.randomUUID()}@${domain}>`,
      `Date: ${new Date().toUTCString()}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "",
      body,
    ].join("\r\n");
    try { await env.MAILER.send(new EmailMessage(env.FROM_EMAIL, addr, raw)); }
    catch (e) { failed.push(`${addr} (${e.message})`); }
  }
  if (failed.length === to.length) throw new Error("Couldn't send to: " + failed.join(", "));
}

const loadEmails = async env => JSON.parse((await env.FOOD.get("emails")) || "[]");

const load = async env => JSON.parse((await env.FOOD.get("items")) || "[]");
const save = (env, items) => env.FOOD.put("items", JSON.stringify(items));
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json" } });
function daysLeft(date) {
  const t = new Date(); t.setUTCHours(0, 0, 0, 0);
  return Math.round((new Date(date + "T00:00:00Z") - t) / 86400000);
}
const fmt = d => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const label = d => d < 0 ? `expired ${-d} days ago` : d === 0 ? "today" : `${d} days left`;

const HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Food Date Tracker</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:#f4f1ea;color:#222}
header{background:#2f5d3a;color:#fff;padding:18px 20px}h1{margin:0;font-size:22px}
main{max-width:760px;margin:0 auto;padding:16px}
.card{background:#fff;border-radius:12px;padding:16px;margin-bottom:14px;box-shadow:0 1px 3px #0002}
form{display:grid;grid-template-columns:2fr 70px 1fr;gap:8px}form .notes{grid-column:1/3}
input,button{font:inherit;padding:10px;border:1px solid #ccc;border-radius:8px}
button{background:#2f5d3a;color:#fff;border:0;cursor:pointer}button.ghost{background:#eee;color:#222}
.item{display:flex;align-items:center;gap:12px;padding:10px;border-radius:8px;margin-bottom:6px;border-left:6px solid #3a9d4f;background:#fafafa}
.item.soon{border-color:#e0a100;background:#fff8e6}.item.week{border-color:#e06100;background:#fff0e3}.item.gone{border-color:#c62828;background:#fdecec}
.item .grow{flex:1}.item small{color:#666}.del{background:#ddd;color:#333;padding:6px 10px}
.stats{display:flex;gap:10px;flex-wrap:wrap}.stat{flex:1;min-width:110px;text-align:center}.stat b{display:block;font-size:24px}
.row{display:flex;gap:8px;flex-wrap:wrap}#msg{color:#2f5d3a;margin-top:8px}
@media(max-width:560px){form{grid-template-columns:1fr 70px}form .date{grid-column:1/3}}
</style></head><body>
<header><h1>🥫 Food Date Tracker</h1></header><main>
<div class="card" id="login"><p>Enter the password:</p><div class="row"><input type="password" id="pw"><button onclick="login()">Open</button></div><p id="err" style="color:#c62828"></p></div>
<div id="app" hidden>
<div class="card stats"><div class="stat"><b id="sTotal">0</b>items</div><div class="stat"><b id="sSoon">0</b>within 2 months</div><div class="stat"><b id="sGone">0</b>expired</div></div>
<div class="card"><form id="f">
<input name="name" placeholder="Food (e.g. Baked beans)" required>
<input name="qty" type="number" min="1" value="1" title="How many">
<input name="date" class="date" type="date" required>
<input name="notes" class="notes" placeholder="Notes (optional, e.g. top shelf)">
<button>Add</button></form></div>
<div class="card"><input id="search" placeholder="Search..." style="width:100%;margin-bottom:10px" oninput="draw()"><div id="list"></div></div>
<div class="card"><b>Who gets the alert emails</b><div class="row" style="margin:10px 0"><input id="em" type="email" placeholder="you@example.com" style="flex:1"><button onclick="addEmail()">Add email</button></div><div id="emails"></div><small>Anyone added here gets the alert emails.</small></div>
<div class="card row"><button class="ghost" onclick="act('test-email','Test email sent — check your inbox')">Send test email</button>
<button class="ghost" onclick="act('check-now','Checked dates')">Check dates now</button>
<button class="ghost" onclick="localStorage.removeItem('fpw');location.reload()">Log out</button><div id="msg"></div></div>
</div></main>
<script>
let pw=localStorage.getItem('fpw')||'',items=[];
const api=(p,o={})=>fetch('/api/'+p,{...o,headers:{'content-type':'application/json','x-pass':pw}}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);return d});
function days(d){const t=new Date();t.setHours(0,0,0,0);return Math.round((new Date(d+'T00:00:00')-t)/864e5)}
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
async function login(){pw=document.getElementById('pw').value||pw;try{items=await api('items');localStorage.setItem('fpw',pw);login_ok()}catch(e){document.getElementById('err').textContent=e.message}}
let emails=[];
function drawEmails(){document.getElementById('emails').innerHTML=emails.map(e=>'<div class="item"><div class="grow">'+esc(e)+'</div><button class="del" data-e="'+esc(e)+'" onclick="delEmail(this.dataset.e)">Remove</button></div>').join('')||'<p>No emails yet.</p>'}
async function addEmail(){const i=document.getElementById('em');try{emails=await api('emails',{method:'POST',body:JSON.stringify({email:i.value})});i.value='';drawEmails()}catch(e){alert(e.message)}}
async function delEmail(e){emails=await api('emails/delete',{method:'POST',body:JSON.stringify({email:e})});drawEmails()}
function login_ok(){api('emails').then(e=>{emails=e;drawEmails()});document.getElementById('login').hidden=true;document.getElementById('app').hidden=false;draw()}
function draw(){const q=document.getElementById('search').value.toLowerCase();
 const s=[...items].sort((a,b)=>a.date.localeCompare(b.date));let soon=0,gone=0;
 document.getElementById('list').innerHTML=s.filter(i=>i.name.toLowerCase().includes(q)).map(i=>{const d=days(i.date);
  const c=d<0?'gone':d<=7?'week':d<=60?'soon':'';
  const l=d<0?'Expired '+(-d)+' days ago':d===0?'Today!':d+' days left';
  const date=new Date(i.date+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  return '<div class="item '+c+'"><div class="grow"><b>'+esc(i.name)+'</b> ×'+i.qty+'<br><small>'+date+' · '+l+(i.notes?' · '+esc(i.notes):'')+'</small></div><button class="del" onclick="del(\\''+i.id+'\\')">Used</button></div>'}).join('')||'<p>No food added yet.</p>';
 items.forEach(i=>{const d=days(i.date);if(d<0)gone++;else if(d<=60)soon++});
 sTotal.textContent=items.length;sSoon.textContent=soon;sGone.textContent=gone}
document.getElementById('f').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);
 items=await api('items',{method:'POST',body:JSON.stringify(Object.fromEntries(f))});e.target.reset();e.target.qty.value=1;draw()};
async function del(id){items=await api('delete',{method:'POST',body:JSON.stringify({id})});draw()}
async function act(p,m){const el=document.getElementById('msg');el.textContent='...';try{await api(p,{method:'POST'});el.textContent=m}catch(e){el.textContent='Error: '+e.message}}
if(pw)login();
</script></body></html>`;
