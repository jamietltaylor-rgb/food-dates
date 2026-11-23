// Food Date Tracker — accounts + groups, Cloudflare Worker
// Bindings: KV "FOOD". Vars: FROM_EMAIL. Secret: RESEND_KEY (Resend API key)
const DEFAULT_WARN = 60;  // start emailing ~2 months before (each person can change this)
const DEFAULT_EVERY = 7;  // then remind every week until ticked off or muted
const WARN_CHOICES = [7, 14, 30, 60, 90, 180];
const EVERY_CHOICES = [1, 3, 7, 14];
const SITE = "https://food.jamietaylor.org";
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="112" fill="#2f5d3a"/>
<rect x="136" y="132" width="240" height="268" rx="18" fill="#d9dee2"/>
<ellipse cx="256" cy="132" rx="120" ry="34" fill="#eef1f3" stroke="#aab3ba" stroke-width="8"/>
<ellipse cx="256" cy="132" rx="92" ry="22" fill="#c9d0d6"/>
<path d="M136 400 a120 34 0 0 0 240 0" fill="#b9c2c9"/>
<rect x="136" y="196" width="240" height="140" fill="#e0a100"/>
<rect x="136" y="196" width="240" height="10" fill="#c98f00"/>
<rect x="136" y="326" width="240" height="10" fill="#c98f00"/>
<rect x="178" y="226" width="156" height="80" rx="12" fill="#fff"/>
<text x="256" y="282" font-family="Arial,Helvetica,sans-serif" font-size="46" font-weight="bold" text-anchor="middle" fill="#2f5d3a">DATE</text>
<circle cx="376" cy="392" r="62" fill="#c62828" stroke="#2f5d3a" stroke-width="10"/>
<path d="M376 356 v40 l26 16" stroke="#fff" stroke-width="14" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;
const PNG = { "/icon-192.png": "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", "/icon-512.png": "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", "/apple-touch-icon.png": "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" };
const MANIFEST = JSON.stringify({ name: "Food Date Tracker", short_name: "Food Dates", start_url: "/", display: "standalone",
  background_color: "#f4f1ea", theme_color: "#2f5d3a",
  icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }] });
const VERSION = "15";
const SESSION_TTL = 60 * 60 * 24 * 365; // stay logged in for a year, renewed whenever you use it

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;
    if (p === "/favicon.ico") return new Response(Uint8Array.from(atob(PNG["/icon-192.png"]), c => c.charCodeAt(0)), { headers: { "content-type": "image/png" } });
    if (p === "/icon.svg") return new Response(ICON_SVG, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } });
    if (PNG[p] || p === "/apple-touch-icon-precomposed.png") return new Response(Uint8Array.from(atob(PNG[p] || PNG["/apple-touch-icon.png"]), c => c.charCodeAt(0)), { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
    if (p === "/manifest.webmanifest") return new Response(MANIFEST, { headers: { "content-type": "application/manifest+json" } });
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
        await env.FOOD.put("sess:" + token, me.email, { expirationTtl: SESSION_TTL }); // keep them logged in
        const groups = [];
        for (const gid of me.groups) { const g = await getGroup(env, gid); if (g) groups.push({ id: g.id, name: g.name, owner: g.owner }); }
        return ok({ name: me.name, email: me.email, alerts: me.alerts, warnDays: me.warnDays || DEFAULT_WARN, every: me.every || DEFAULT_EVERY, look: me.look || null, groups });
      }

      if (p === "/api/settings") {
        if ("alerts" in body) me.alerts = !!body.alerts;
        if (WARN_CHOICES.includes(Number(body.warnDays))) me.warnDays = Number(body.warnDays);
        if (EVERY_CHOICES.includes(Number(body.every))) me.every = Number(body.every);
        if (body.look && typeof body.look === "object") me.look = { theme: String(body.look.theme || "green").slice(0, 20), mode: String(body.look.mode || "light").slice(0, 10), font: String(body.look.font || "system").slice(0, 20), size: String(body.look.size || "normal").slice(0, 20) };
        await putUser(env, me); return ok({ alerts: me.alerts, look: me.look || null });
      }

      if (p === "/api/remind-me") return ok({ sent: await runReminders(env, me.email) });

      if (p === "/api/test-email") {
        await sendMail(env, [me.email], "Food tracker test email", `Hi ${me.name}, if you can read this, email alerts are working.`,
          emailLayout({ preheader: "Your email alerts are working", heading: `Hi ${me.name}, it works! ✅`,
            intro: "This is a test email from the Food Date Tracker. When food in your groups is about 2 months from going out of date, and again a week before, you'll get an email like this:",
            content: emailItems("Example", "#b77900", [{ name: "Baked beans", qty: 3, date: new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10), notes: "Top shelf" }]),
            button: { label: "Open the food tracker", url: SITE }, footer: "You asked for this test email from Settings." }));
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
            date: body.date, notes: String(body.notes || "").slice(0, 200), by: me.name, mutedBy: [], sent: {} });
          await putGroup(env, g); return ok(g.items);
        }

        if (sub === "/items/delete") { g.items = g.items.filter(i => i.id !== body.id); await putGroup(env, g); return ok(g.items); }

        if (sub === "/items/bulk") {
          const list = Array.isArray(body.items) ? body.items.slice(0, 300) : [];
          let added = 0;
          for (const it of list) {
            if (!it || !it.name || !/^\d{4}-\d{2}-\d{2}$/.test(it.date || "")) continue;
            g.items.push({ id: rand(8), name: String(it.name).slice(0, 100), qty: Math.max(1, Math.min(999, Number(it.qty) || 1)),
              date: it.date, notes: String(it.notes || "").slice(0, 200), by: me.name, mutedBy: [], sent: {} });
            added++;
          }
          if (!added) return err("Nothing to add — check the format");
          await putGroup(env, g); return ok({ added, items: g.items });
        }

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
          const html = emailLayout({ preheader: `${me.name} shared a food list with you`,
            heading: u ? `You've been added to "${g.name}"` : `${me.name} invited you to "${g.name}"`,
            intro: u ? `<b>${h(me.name)}</b> added you to the <b>${h(g.name)}</b> group, so you can see its food list and get reminders before things go out of date.`
                     : `<b>${h(me.name)}</b> wants to share the <b>${h(g.name)}</b> food list with you. It keeps track of use-by dates and emails everyone in the group before food goes out of date.<br><br>Make a free account using <b>${h(e)}</b> and you'll join the group straight away.`,
            button: { label: u ? "Open the food tracker" : "Make my account", url: SITE },
            footer: `${h(me.name)} added this email address. If you weren't expecting this, you can ignore it.` });
          try { await sendMail(env, [e], `${me.name} added you to "${g.name}"`, msg, html); } catch { emailed = false; }
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

        if (sub === "/items/mute") {
          const it = g.items.find(i => i.id === body.id);
          if (!it) return err("That food isn't in the list any more");
          it.mutedBy = (it.mutedBy || []).filter(e => e !== me.email);
          if (body.mute) it.mutedBy.push(me.email);
          await putGroup(env, g); return ok(g.items);
        }
      }
      return err("Not found", 404);
    } catch (e) {
      return err(e.message || "Something went wrong", 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      await runReminders(env);
    })());
  },
};

// Daily: for every person, collect food (across all their groups) that's inside their chosen window,
// not muted by them, and not emailed to them within their repeat gap. One email per person.
// onlyEmail = run just for one person now ("Send my reminder now"), ignoring the repeat gap.
async function runReminders(env, onlyEmail) {
  const today = new Date().toISOString().slice(0, 10);
  const all = JSON.parse((await env.FOOD.get("groups")) || "[]");
  const users = {}, perUser = {}, groups = {};
  for (const gid of all) {
    const g = await getGroup(env, gid); if (!g) continue; groups[gid] = g;
    for (const e of g.members) {
      if (onlyEmail && e !== onlyEmail) continue;
      if (!(e in users)) users[e] = await getUser(env, e);
      const u = users[e]; if (!u || (!u.alerts && !onlyEmail)) continue;
      const warn = u.warnDays || DEFAULT_WARN, every = u.every || DEFAULT_EVERY;
      for (const i of g.items) {
        if (daysLeft(i.date) > warn || (i.mutedBy || []).includes(e)) continue;
        const last = (i.sent || {})[e];
        if (!onlyEmail && last && (Date.parse(today) - Date.parse(last)) / 864e5 < every) continue;
        (perUser[e] = perUser[e] || []).push({ g, i });
      }
    }
  }
  let sent = 0;
  for (const [e, list] of Object.entries(perUser)) {
    const u = users[e];
    try { await sendReminder(env, u, list); } catch { continue; }
    for (const { i } of list) { i.sent = i.sent || {}; i.sent[e] = today; }
    sent += list.length;
  }
  for (const g of Object.values(groups)) if (g.items.some(i => i.sent && Object.values(i.sent).includes(today))) await putGroup(env, g);
  return sent;
}

const everyText = n => n === 1 ? "every day" : n === 7 ? "every week" : n === 14 ? "every 2 weeks" : `every ${n} days`;
const warnText = n => ({ 7: "1 week", 14: "2 weeks", 30: "1 month", 60: "2 months", 90: "3 months", 180: "6 months" }[n] || n + " days");

async function sendReminder(env, u, list) {
  const warn = u.warnDays || DEFAULT_WARN, every = u.every || DEFAULT_EVERY;
  const byGroup = new Map();
  for (const { g, i } of list) { if (!byGroup.has(g.id)) byGroup.set(g.id, { g, items: [] }); byGroup.get(g.id).items.push(i); }
  const sortD = a => a.sort((x, y) => x.date.localeCompare(y.date));
  let content = "", text = `Hi ${u.name},\n\n`;
  const line = i => `- ${i.name} (x${i.qty}) — use by ${fmt(i.date)} (${label(daysLeft(i.date))})${i.notes ? " — " + i.notes : ""}`;
  let anyUrgent = false;
  for (const { g, items } of byGroup.values()) {
    const gone = sortD(items.filter(i => daysLeft(i.date) < 0)), week = sortD(items.filter(i => daysLeft(i.date) >= 0 && daysLeft(i.date) <= 7)), later = sortD(items.filter(i => daysLeft(i.date) > 7));
    if (gone.length || week.length) anyUrgent = true;
    if (byGroup.size > 1) content += `<h2 style="margin:18px 0 6px;font-size:17px;color:#2f5d3a">${h(g.name)}</h2>`;
    content += emailItems("Already out of date", "#8e1b1b", gone) + emailItems("Use this week", "#c62828", week) + emailItems(`Within ${warnText(warn)}`, "#b77900", later);
    text += `${g.name}:\n` + [...gone, ...week, ...later].map(line).join("\n") + "\n\n";
  }
  const n = list.length, names = [...byGroup.values()].map(x => x.g.name);
  text += `You'll get a reminder ${everyText(every)} until each item is ticked off as eaten or muted.\nOpen the tracker: ${SITE}`;
  const html = emailLayout({
    preheader: `${n} item(s) to use soon`,
    heading: anyUrgent ? "Some food needs using now" : "Food to use soon",
    intro: `Hi ${h(u.name)}, here's what's coming up in <b>${names.map(h).join("</b> and <b>")}</b>.`,
    content,
    button: { label: "Open the food tracker", url: SITE },
    footer: `You'll get this ${everyText(every)} until each item is ticked off as eaten, or you tap 🔕 on it in the tracker. You can change how early and how often in Settings.`,
  });
  await sendMail(env, [u.email], `Food reminder: ${n} item(s) to use soon`, text, html);
}

async function sendMail(env, to, subject, text, html) {
  if (!env.RESEND_KEY) throw new Error("Email sending isn't switched on yet (RESEND_KEY missing)");
  const failed = [];
  for (const addr of to) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ from: `Food Date Tracker <${env.FROM_EMAIL}>`, to: [addr], subject, text },
        html ? { html, attachments: [{ filename: "food-tracker-logo.png", content: PNG["/icon-192.png"], content_id: "foodlogo", content_type: "image/png" }] } : {})),
    });
    if (!r.ok) failed.push(`${addr}: ${(await r.text()).slice(0, 150)}`);
  }
  if (failed.length === to.length) throw new Error("Couldn't send email — " + failed.join("; "));
}

// ---- email design ----
const h = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function emailLayout({ preheader = "", heading, intro = "", content = "", button, footer = "" }) {
  const btn = button ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 4px"><tr><td style="background:#2f5d3a;border-radius:8px">
    <a href="${h(button.url)}" style="display:inline-block;padding:13px 26px;color:#ffffff;font-weight:bold;text-decoration:none;font-size:15px">${h(button.label)}</a></td></tr></table>` : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${h(heading)}</title></head>
<body style="margin:0;padding:0;background:#f4f1ea;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#222">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${h(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea"><tr><td align="center" style="padding:24px 12px">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
  <tr><td style="background:#2f5d3a;padding:18px 24px">
   <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="padding-right:12px"><img src="cid:foodlogo" width="44" height="44" alt="Food Date Tracker" style="display:block;border-radius:10px;border:0"></td>
    <td style="color:#ffffff;font-size:20px;font-weight:bold">Food Date Tracker</td></tr></table></td></tr>
  <tr><td style="padding:26px 24px 8px">
   <h1 style="margin:0 0 10px;font-size:22px;line-height:1.3;color:#222">${h(heading)}</h1>
   ${intro ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#444">${intro}</p>` : ""}
   ${content}${btn}</td></tr>
  <tr><td style="padding:18px 24px 24px;font-size:12px;line-height:1.5;color:#888;border-top:1px solid #eee">${footer}<br>Food Date Tracker · <a href="${SITE}" style="color:#2f5d3a">food.jamietaylor.org</a></td></tr>
 </table></td></tr></table></body></html>`;
}
function emailItems(title, colour, items) {
  if (!items.length) return "";
  const rows = items.map(i => { const d = daysLeft(i.date); return `<tr>
    <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:15px"><b>${h(i.name)}</b> <span style="color:#666">×${h(i.qty)}</span>${i.notes ? `<br><span style="font-size:13px;color:#888">${h(i.notes)}</span>` : ""}</td>
    <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;font-size:14px"><b>${h(fmt(i.date))}</b><br><span style="font-size:13px;color:${colour}">${h(label(d))}</span></td></tr>`; }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;border:1px solid #eee;border-left:5px solid ${colour};border-radius:8px;border-collapse:separate">
    <tr><td colspan="2" style="padding:10px 12px;background:#fafafa;font-weight:bold;font-size:14px;color:${colour};text-transform:uppercase;letter-spacing:.4px">${h(title)}</td></tr>${rows}</table>`;
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
  await env.FOOD.put("sess:" + t, email, { expirationTtl: SESSION_TTL });
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
<link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#2f5d3a"><meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Food Dates"><meta name="apple-mobile-web-app-status-bar-style" content="default">
<style>
*{box-sizing:border-box}
:root{--main:#2f5d3a;--bg:#f4f1ea;--card:#fff;--text:#222;--muted:#666;--soft:#e6efe8;--line:#ccc;--item:#fafafa;--ghost:#eee;--soon:#fff8e6;--week:#fff0e3;--gone:#fdecec;--font:system-ui,sans-serif;--fs:16px;--on:#fff;--head:#2f5d3a;--headtext:#fff}
.swatches{display:flex;gap:8px;flex-wrap:wrap}.swatch{width:auto;padding:8px 12px;border-radius:20px;border:3px solid transparent;color:#fff;font-weight:600}
.swatch.on{border-color:var(--text);box-shadow:0 0 0 2px var(--card) inset}
.fonts{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.fontbtn{background:var(--item);color:var(--text);border:3px solid var(--line);border-radius:12px;padding:10px;text-align:left}
.fontbtn b{display:block;font-size:1.05em}.fontbtn span{font-size:.85em;color:var(--muted)}.fontbtn.on{border-color:var(--main)}
.modes{display:flex;gap:8px;flex-wrap:wrap}.modes button{flex:1;background:var(--item);color:var(--text);border:3px solid var(--line)}.modes button.on{border-color:var(--main)}.look label{display:block;margin:12px 0 6px;font-weight:600}body{margin:0;font-family:var(--font);font-size:var(--fs);background:var(--bg);color:var(--text)}
header{background:var(--head);color:var(--headtext);padding:14px 20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}h1{margin:0;font-size:22px;flex:1}
header small{opacity:.85}
main{max-width:760px;margin:0 auto;padding:16px}
.card{background:var(--card);border-radius:12px;padding:16px;margin-bottom:14px;box-shadow:0 1px 3px #0002}
.card h2{margin:0 0 10px;font-size:17px}
form.add{display:grid;grid-template-columns:2fr 70px 1fr;gap:8px}form.add .notes{grid-column:1/3}
input,button,select,textarea{font:inherit;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--text)}
button{background:var(--main);color:var(--on);border:0;cursor:pointer}button.ghost{background:var(--ghost);color:var(--text)}button.link{background:none;color:var(--main);padding:4px;text-decoration:underline}
.item{display:flex;align-items:center;gap:12px;padding:10px;border-radius:8px;margin-bottom:6px;border-left:6px solid #3a9d4f;background:var(--item)}
.item.soon{border-color:#e0a100;background:var(--soon)}.item.week{border-color:#e06100;background:var(--week)}.item.gone{border-color:#c62828;background:var(--gone)}
.item.person{border-color:#7a8ca0}
.item .grow{flex:1}.item small{color:var(--muted)}.del{background:var(--ghost);color:var(--text);padding:6px 10px}
.stats{display:flex;gap:10px;flex-wrap:wrap}.stat{flex:1;min-width:110px;text-align:center}.stat b{display:block;font-size:24px}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.col{display:flex;flex-direction:column;gap:8px}
.msg{color:var(--main);margin-top:8px}.bad{color:#c62828}
.tag{font-size:12px;background:var(--soft);color:var(--main);padding:2px 8px;border-radius:10px;margin-left:6px}
.tabs{position:sticky;top:0;z-index:10;display:flex;gap:4px;background:var(--bg);padding:6px 0 10px}
.tabs button{flex:1;background:var(--card);color:var(--main);border:1px solid var(--line);padding:10px 4px;font-weight:600;font-size:15px}
.tabs button.on{background:var(--main);color:var(--on);border-color:var(--main)}
details.help{max-width:760px;margin:10px auto;text-align:left;background:var(--card);border-radius:12px;padding:12px 16px;box-shadow:0 1px 3px #0002}
details.help summary{cursor:pointer;font-weight:600;color:var(--main)}details.help h3{margin:14px 0 6px;font-size:15px}details.help ol{margin:0;padding-left:20px;line-height:1.6}
.modal{position:fixed;inset:0;background:#0006;display:flex;align-items:center;justify-content:center;padding:16px;z-index:50}.modal[hidden]{display:none}.mbox{background:var(--card);border-radius:14px;padding:18px;width:100%;max-width:420px;box-shadow:0 10px 30px #0004}.mbox h3{margin:0 0 12px}.mbox input,.mbox textarea{width:100%;margin-bottom:12px}.mbox .row{justify-content:flex-end}.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--main);color:var(--on);padding:12px 18px;border-radius:24px;box-shadow:0 4px 14px #0003;z-index:60;font-weight:600}.toast[hidden]{display:none}button.done{background:#3a9d4f!important;color:#fff!important}.thumbs{display:flex;gap:6px;flex-wrap:wrap}.thumbs img{width:56px;height:56px;object-fit:cover;border-radius:6px}@media(max-width:560px){form.add{grid-template-columns:1fr 70px}form.add .date{grid-column:1/3}}
</style></head><body>
<header><img src="/icon-192.png" alt="" width="36" height="36" style="border-radius:8px"><h1>Food Date Tracker</h1><small id="who"></small></header><main>

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
  <button class="ghost" onclick="renameGroup()">✏️ Rename</button><button class="ghost" onclick="newGroupPrompt()">+ New group</button>
 </div>
 <div class="tabs"><button data-tab="food" onclick="showTab('food')">🥫 Food</button><button data-tab="add" onclick="showTab('add')">➕ Add</button><button data-tab="group" onclick="showTab('group')">👥 Group</button><button data-tab="settings" onclick="showTab('settings')">⚙️ Settings</button></div>
 <section data-tab="food">
 <div class="card stats"><div class="stat"><b id="sTotal">0</b>items</div><div class="stat"><b id="sSoon">0</b><span id="sSoonLbl">within 2 months</span></div><div class="stat"><b id="sGone">0</b>expired</div></div>
 <div class="card"><input id="search" placeholder="Search..." style="width:100%;margin-bottom:10px" oninput="draw()"><div id="list"></div></div>
 </section>
 <section data-tab="add" hidden>
 <div class="card"><h2>Add food</h2><form class="add" id="f">
  <input name="name" placeholder="Food (e.g. Baked beans)" required>
  <input name="qty" type="number" min="1" value="1" title="How many">
  <input name="date" class="date" type="date" required>
  <input name="notes" class="notes" placeholder="Notes (optional, e.g. top shelf)">
  <button>Add</button></form></div>
 <div class="card"><h2>📸 Add lots at once from photos</h2>
  <div class="col">
   <b>1. What food is it?</b>
   <input id="bFood" placeholder="e.g. Baked beans">
   <b>2. Pick all the photos of the dates</b>
   <input id="bCam" type="file" accept="image/*" capture="environment" hidden onchange="addPhotos(this)"><input id="bGal" type="file" accept="image/*" multiple hidden onchange="addPhotos(this)"><div class="row"><button type="button" onclick="$('bCam').click()">📷 Take photo</button><button type="button" onclick="$('bGal').click()">🖼️ Choose from gallery</button><button type="button" class="ghost" onclick="clearPhotos()" id="bClear" hidden>Clear photos</button></div><div class="thumbs" id="bThumbs"></div>
   <div id="bStatus" class="msg"></div>
   <canvas id="bCanvas" style="max-width:100%;border-radius:8px;display:none"></canvas>
   <div class="row" id="bBtns" hidden>
    <button onclick="copyCollage(this)">Copy collage</button>
    <button class="ghost" onclick="downloadCollage()">Download collage</button>
    <button onclick="copyPrompt(this)">Copy AI instructions</button>
   </div>
   <small>3. Paste the collage <b>and</b> the instructions into another AI (like Claude or ChatGPT). Copy its answer and paste it below.</small>
   <b>4. Paste the AI's answer</b>
   <textarea id="bPaste" rows="6" placeholder="Baked beans | 3 | 2028-05-31 | "  oninput="previewBulk()"></textarea>
   <div id="bPreview"></div>
   <button onclick="addBulk()" id="bAdd" hidden>Add all</button>
  </div>
 </div>
 </section>
 <section data-tab="group" hidden>
 <div class="card"><h2>People in this group</h2>
  <div id="members"></div>
  <div class="row" style="margin-top:10px"><input id="addEm" type="email" placeholder="Their email" style="flex:1"><button onclick="addMember()">Add person</button></div>
  <small>If they don't have an account yet, they'll get an email inviting them to sign up, and they'll join this group as soon as they do.</small>
  <div class="row" style="margin-top:10px"><button class="ghost" onclick="renameGroup()">Rename group</button><button class="ghost" onclick="leaveGroup()" id="leaveBtn">Leave group</button><button class="ghost" onclick="deleteGroup()" id="delBtn">Delete group</button></div>
  <div class="msg" id="gMsg"></div>
 </div>
 </section>
 <section data-tab="settings" hidden>
 <div class="card look"><h2>Look and feel</h2>
  <label>Light or dark</label><div class="modes" id="modes"></div>
  <label>Colour</label><div class="swatches" id="swatches"></div>
  <label>Font</label><div class="fonts" id="fonts"></div>
  <label for="sizeSel">Text size</label><select id="sizeSel" onchange="setLook('size',this.value)" style="width:100%"><option value="small">Small</option><option value="normal">Normal</option><option value="large">Large</option><option value="xl">Extra large</option></select>
  <small>Your choices are saved to your account, so they follow you onto other devices.</small>
 </div>
 <div class="card"><h2>My settings</h2>
  <label class="row"><input type="checkbox" id="alerts" onchange="saveAlerts()"> Email me when food is going out of date</label>
  <div class="look">
  <label for="warnSel">Start emailing me when food is within</label>
  <select id="warnSel" style="width:100%" onchange="saveRemind()"><option value="7">1 week</option><option value="14">2 weeks</option><option value="30">1 month</option><option value="60">2 months</option><option value="90">3 months</option><option value="180">6 months</option></select>
  <label for="everySel">Then remind me</label>
  <select id="everySel" style="width:100%" onchange="saveRemind()"><option value="1">Every day</option><option value="3">Every 3 days</option><option value="7">Every week</option><option value="14">Every 2 weeks</option></select>
  </div>
  <small>Reminders keep coming until you tick the food off as eaten (✓ Eaten), or tap 🔕 on it to stop emails for just that one.</small>
  <div class="row" style="margin-top:10px"><button class="ghost" onclick="act('test-email','Test email sent, check your inbox (and Junk folder)')">Send me a test email</button>
  <button class="ghost" onclick="act('remind-me','Reminder sent, if anything is due')">Send my reminder now</button>
  <button class="ghost" onclick="logout()">Log out</button></div><div class="msg" id="msg"></div>
 </div>
 </section>
</div>
<div class="modal" id="modal" hidden><div class="mbox"><h3 id="mTitle"></h3><p id="mText"></p>
 <input id="mInput" hidden><textarea id="mArea" rows="8" hidden readonly></textarea>
 <div class="row"><button class="ghost" id="mCancel">Cancel</button><button id="mOk">OK</button></div></div></div>
<div class="toast" id="toast" hidden></div>
</main>
<footer style="text-align:center;padding:10px 16px 30px;color:var(--muted)">
 <details class="help"><summary>📱 How to add this to your home screen</summary>
  <p>Adding it to your home screen makes it open like an app, with the tin logo.</p>
  <button id="installBtn" hidden onclick="doInstall()">Install the app</button>
  <h3>iPhone or iPad (Safari)</h3><ol><li>Open food.jamietaylor.org in <b>Safari</b>.</li><li>Tap the <b>Share</b> button (the square with an arrow pointing up).</li><li>Scroll down and tap <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b> in the top corner.</li></ol>
  <h3>Android (Chrome)</h3><ol><li>Open food.jamietaylor.org in <b>Chrome</b>.</li><li>Tap the <b>⋮</b> menu in the top right.</li><li>Tap <b>Add to Home screen</b> (or <b>Install app</b>).</li><li>Tap <b>Add</b> / <b>Install</b>.</li></ol>
  <h3>Computer (Chrome or Edge)</h3><ol><li>Click the install icon at the right end of the address bar, or open the <b>⋮</b> menu.</li><li>Choose <b>Install Food Date Tracker</b> (in Chrome it may be under <b>Cast, save and share</b>).</li></ol>
 </details>
 <button class="ghost" onclick="checkUpdates()">Check for updates</button>
 <div id="upd" style="margin-top:8px;font-size:14px">Version __VERSION__</div>
</footer>
<script>
const MY_VERSION='__VERSION__';
let installEv=null;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEv=e;document.getElementById('installBtn').hidden=false});
async function doInstall(){if(!installEv)return;installEv.prompt();await installEv.userChoice;installEv=null;document.getElementById('installBtn').hidden=true}
function showTab(t){document.querySelectorAll('section[data-tab]').forEach(s=>s.hidden=s.dataset.tab!==t);
 document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===t));localStorage.setItem('ftab',t);window.scrollTo(0,0)}
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
async function start(){showTab(localStorage.getItem('ftab')||'food');me=await api('me');$('auth').hidden=true;$('app').hidden=false;$('who').textContent=me.name;if(me.look){look=me.look;applyLook()}else if(look.theme||look.font||look.size)api('settings',{look}).catch(()=>{});$('alerts').checked=me.alerts;$('warnSel').value=me.warnDays;$('everySel').value=me.every;
 if(!me.groups.find(g=>g.id===gid))gid=me.groups[0]?me.groups[0].id:'';drawGroups();if(gid)openGroup(gid)}
function drawGroups(){$('groupSel').innerHTML=me.groups.map(g=>'<option value="'+g.id+'"'+(g.id===gid?' selected':'')+'>'+esc(g.name)+'</option>').join('')||'<option>No groups yet</option>'}
async function openGroup(id){gid=id;localStorage.setItem('fgid',id);grp=await api('groups/'+id);draw();drawMembers()}
function draw(){if(!grp)return;const q=$('search').value.toLowerCase();const items=grp.items;
 const s=[...items].sort((a,b)=>a.date.localeCompare(b.date));let soon=0,gone=0;
 $('list').innerHTML=s.filter(i=>i.name.toLowerCase().includes(q)).map(i=>{const d=days(i.date);
  const c=d<0?'gone':d<=7?'week':d<=warnD()?'soon':'';const muted=(i.mutedBy||[]).includes(me.email);
  const l=d<0?'Expired '+(-d)+' days ago':d===0?'Today!':d+' days left';
  const date=new Date(i.date+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  return '<div class="item '+c+'"><div class="grow"><b>'+esc(i.name)+'</b> ×'+i.qty+'<br><small>'+date+' · '+l+(i.notes?' · '+esc(i.notes):'')+(i.by?' · added by '+esc(i.by):'')+(muted?' · <b>emails off</b>':'')+'</small></div><button class="del" title="'+(muted?'Turn emails back on for this':'Stop emails for this')+'" data-id="'+i.id+'" onclick="muteItem(this.dataset.id,'+(!muted)+')">'+(muted?'🔕':'🔔')+'</button><button class="del" data-id="'+i.id+'" onclick="delItem(this.dataset.id)">✓ Eaten</button></div>'}).join('')||'<p>No food added yet.</p>';
 items.forEach(i=>{const d=days(i.date);if(d<0)gone++;else if(d<=warnD())soon++});$('sSoonLbl').textContent='within '+WARNTXT[warnD()];
 sTotal.textContent=items.length;sSoon.textContent=soon;sGone.textContent=gone}
function drawMembers(){const owner=grp.owner===me.email;
 $('members').innerHTML=grp.members.map(m=>'<div class="item person"><div class="grow"><b>'+esc(m.name)+'</b>'+(m.owner?'<span class="tag">owner</span>':'')+'<br><small>'+esc(m.email)+'</small></div>'+
  (owner&&!m.owner?'<button class="del" data-e="'+esc(m.email)+'" onclick="removeMember(this.dataset.e)">Remove</button>':'')+'</div>').join('')+
  grp.invited.map(e=>'<div class="item person"><div class="grow">'+esc(e)+'<span class="tag">invited</span><br><small>Hasn\\'t signed up yet</small></div>'+
  (owner?'<button class="del" data-e="'+esc(e)+'" onclick="removeMember(this.dataset.e)">Cancel</button>':'')+'</div>').join('');
 $('leaveBtn').hidden=owner;$('delBtn').hidden=!owner}
$('f').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);
 try{grp.items=await api('groups/'+gid+'/items',Object.fromEntries(f));e.target.reset();e.target.qty.value=1;draw();toast('✓ Added')}catch(x){uiAlert(x.message)}};
async function delItem(id){grp.items=await api('groups/'+gid+'/items/delete',{id});draw();toast('✓ Ticked off as eaten')}
async function addMember(){const el=$('addEm');try{const r=await api('groups/'+gid+'/members',{email:el.value});
 $('gMsg').textContent=(r.joined?'Added! ':'Invited — they\\'ll join when they sign up. ')+(r.emailed?'They\\'ve been emailed.':'(Couldn\\'t send them an email.)');el.value='';openGroup(gid)}catch(e){$('gMsg').textContent=e.message}}
async function removeMember(e){if(!await uiConfirm('Remove '+e+' from this group?','Remove',true))return;await api('groups/'+gid+'/members/remove',{email:e});openGroup(gid)}
async function leaveGroup(){if(!await uiConfirm('Leave this group? You will stop seeing its food list.','Leave',true))return;await api('groups/'+gid+'/members/remove',{email:me.email});gid='';start()}
async function deleteGroup(){if(!await uiConfirm('Delete this group and its whole food list for everyone? This cannot be undone.','Delete',true))return;await api('groups/'+gid+'/delete',{});gid='';start()}
async function renameGroup(){if(!grp)return;const n=await uiPrompt('Rename group',grp.name,'Group name');if(!n||n===grp.name)return;try{await api('groups/'+gid+'/rename',{name:n});await start();toast('✓ Group renamed')}catch(e){uiAlert(e.message)}}
async function newGroupPrompt(){const n=await uiPrompt('New group','','e.g. Dad\\'s cupboard','Create');if(!n)return;try{const r=await api('groups',{name:n});gid=r.id;await start();toast('✓ Group created')}catch(e){uiAlert(e.message)}}
const THEMES={green:{name:'Green',main:'#2f5d3a',bg:'#f4f1ea',soft:'#e6efe8',mainD:'#5cb87a',bgD:'#121714',softD:'#24342a'},
 blue:{name:'Blue',main:'#1f5f8b',bg:'#eef3f8',soft:'#e1ecf5',mainD:'#5aa7e0',bgD:'#11161b',softD:'#21303d'},
 teal:{name:'Teal',main:'#1f7a74',bg:'#eef6f5',soft:'#dcefed',mainD:'#45c4b8',bgD:'#111918',softD:'#203836'},
 purple:{name:'Purple',main:'#5b3f8c',bg:'#f3f0f8',soft:'#ebe4f5',mainD:'#a88be0',bgD:'#15131b',softD:'#312a42'},
 red:{name:'Red',main:'#a63a2b',bg:'#f8f1ee',soft:'#f5e3df',mainD:'#ee7a68',bgD:'#1a1413',softD:'#402a26'},
 pink:{name:'Pink',main:'#b03a78',bg:'#faf0f5',soft:'#f6e1ec',mainD:'#ee82b4',bgD:'#1a1318',softD:'#402836'},
 orange:{name:'Orange',main:'#b8560f',bg:'#fbf3ea',soft:'#f7e6d4',mainD:'#f29a4a',bgD:'#1a1511',softD:'#402f20'},
 grey:{name:'Grey',main:'#4a5560',bg:'#f1f2f3',soft:'#e3e6e9',mainD:'#a7b3bf',bgD:'#141617',softD:'#2c3236'}};
const FONTS={system:['Standard','system-ui,sans-serif'],rounded:['Rounded','ui-rounded,"SF Pro Rounded","Nunito","Varela Round","Arial Rounded MT Bold",system-ui,sans-serif'],
 serif:['Classic','Georgia,"Times New Roman",serif'],comic:['Fun','"Comic Sans MS","Chalkboard SE","Comic Neue",cursive'],
 mono:['Typewriter','ui-monospace,"SF Mono",Menlo,Consolas,"Courier New",monospace'],easy:['Easy read','Verdana,Tahoma,sans-serif'],
 bold:['Chunky','"Arial Black","Helvetica Neue",Impact,sans-serif'],hand:['Handwritten','"Bradley Hand","Segoe Print","Marker Felt","Brush Script MT",cursive']};
const SIZES={small:'14px',normal:'16px',large:'18px',xl:'21px'};
const LIGHT={card:'#fff',text:'#222',muted:'#666',line:'#ccc',item:'#fafafa',ghost:'#eee',soon:'#fff8e6',week:'#fff0e3',gone:'#fdecec',on:'#fff'};
const DARK={card:'#1f2427',text:'#eeeeee',muted:'#a8b0b5',line:'#3f464a',item:'#262c2f',ghost:'#33393d',soon:'#3d3420',week:'#40291c',gone:'#432425',on:'#111'};
const MODES={light:'☀️ Light',dark:'🌙 Dark',auto:'📱 Match my phone'};
let look=(()=>{try{return JSON.parse(localStorage.getItem('flook'))||{}}catch(e){return{}}})();
const darkMQ=window.matchMedia?matchMedia('(prefers-color-scheme: dark)'):null;
if(darkMQ&&darkMQ.addEventListener)darkMQ.addEventListener('change',()=>{if(look.mode==='auto')applyLook()});
function fixLook(){if(look.theme==='dark'){look.theme='green';look.mode='dark'}if(look.font==='big')look.font='easy';if(!THEMES[look.theme])look.theme='green';if(!MODES[look.mode])look.mode='light';if(!FONTS[look.font])look.font='system'}
function isDark(){return look.mode==='dark'||(look.mode==='auto'&&darkMQ&&darkMQ.matches)}
function applyLook(){fixLook();const th=THEMES[look.theme],d=isDark(),r=document.documentElement.style;
 const v=Object.assign({},d?DARK:LIGHT,{main:d?th.mainD:th.main,bg:d?th.bgD:th.bg,soft:d?th.softD:th.soft,head:d?th.softD:th.main,headtext:d?'#f2f2f2':'#fff'});
 for(const k in v)r.setProperty('--'+k,v[k]);
 r.setProperty('--font',FONTS[look.font][1]);r.setProperty('--fs',SIZES[look.size]||SIZES.normal);
 r.colorScheme=d?'dark':'light';document.querySelector('meta[name=theme-color]').content=v.head;
 localStorage.setItem('flook',JSON.stringify(look));drawLook()}
function q(v){return '&quot;'+v+'&quot;'}
function drawLook(){const sw=document.getElementById('swatches');if(!sw)return;const d=isDark();
 document.getElementById('modes').innerHTML=Object.entries(MODES).map(([k,n])=>'<button class="'+(look.mode===k?'on':'')+'" onclick="setLook('+q('mode')+','+q(k)+')">'+n+'</button>').join('');
 sw.innerHTML=Object.entries(THEMES).map(([k,t])=>'<button class="swatch'+(look.theme===k?' on':'')+'" style="background:'+(d?t.mainD:t.main)+';color:'+(d?'#111':'#fff')+'" onclick="setLook('+q('theme')+','+q(k)+')">'+t.name+'</button>').join('');
 document.getElementById('fonts').innerHTML=Object.entries(FONTS).map(([k,f])=>'<button class="fontbtn'+(look.font===k?' on':'')+'" style="font-family:'+f[1].replace(/"/g,'')+'" onclick="setLook('+q('font')+','+q(k)+')"><b>'+f[0]+'</b><span>Baked beans · 31 May 2028</span></button>').join('');
 document.getElementById('sizeSel').value=look.size||'normal'}
function setLook(k,v){look[k]=v;applyLook();if(tok)api('settings',{look}).then(()=>toast('✓ Saved')).catch(()=>{})}
applyLook();
const NL=String.fromCharCode(10);let bulkRows=[],photos=[];
function modal(o){return new Promise(res=>{$('mTitle').textContent=o.title||'';$('mText').textContent=o.text||'';$('mText').hidden=!o.text;
 const inp=$('mInput'),ar=$('mArea');inp.hidden=!o.input;ar.hidden=!o.area;inp.value=o.value||'';inp.placeholder=o.placeholder||'';ar.value=o.area||'';
 $('mOk').textContent=o.ok||'OK';$('mCancel').hidden=!!o.alert;$('mOk').style.background=o.danger?'#c62828':'';$('modal').hidden=false;
 if(o.input)setTimeout(()=>{inp.focus();inp.select()},50);
 const done=v=>{$('modal').hidden=true;$('mOk').onclick=$('mCancel').onclick=inp.onkeydown=null;res(v)};
 $('mOk').onclick=()=>done(o.input?inp.value.trim():true);$('mCancel').onclick=()=>done(o.input?null:false);
 inp.onkeydown=e=>{if(e.key==='Enter')$('mOk').click();if(e.key==='Escape')$('mCancel').click()}})}
const uiAlert=(text,title)=>modal({title:title||'Heads up',text,alert:true});
const uiConfirm=(text,ok,danger)=>modal({title:'Are you sure?',text,ok:ok||'Yes',danger});
const uiPrompt=(title,value,placeholder,ok)=>modal({title,input:true,value,placeholder,ok:ok||'Save'});
let toastT;function toast(t){const el=$('toast');el.textContent=t;el.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>el.hidden=true,2500)}
function flash(btn,label){if(!btn)return;const old=btn.dataset.label||btn.textContent;btn.dataset.label=old;btn.textContent=label;btn.classList.add('done');setTimeout(()=>{btn.textContent=old;btn.classList.remove('done')},2000)}
function addPhotos(inp){photos.push(...inp.files);inp.value='';drawThumbs();makeCollage()}
function clearPhotos(){photos=[];drawThumbs();$('bCanvas').style.display='none';$('bBtns').hidden=true;$('bStatus').textContent=''}
function drawThumbs(){$('bThumbs').innerHTML='';photos.forEach(f=>{const i=document.createElement('img');i.src=URL.createObjectURL(f);$('bThumbs').appendChild(i)});$('bClear').hidden=!photos.length}
async function loadImg(f){try{return await createImageBitmap(f)}catch(e){return await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=URL.createObjectURL(f)})}}
async function makeCollage(){const files=photos;if(!files.length)return;$('bStatus').textContent='Making collage of '+files.length+' photo(s)...';
 try{const imgs=[];for(const f of files)imgs.push(await loadImg(f));
  const n=imgs.length,cols=Math.ceil(Math.sqrt(n)),rows=Math.ceil(n/cols),cell=Math.min(900,Math.floor(3000/cols)),pad=10;
  const c=$('bCanvas');c.width=cols*cell;c.height=rows*cell;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);
  imgs.forEach((im,k)=>{const cx=(k%cols)*cell,cy=Math.floor(k/cols)*cell,w=im.width,h=im.height,s=Math.min((cell-pad*2)/w,(cell-pad*2)/h);
   const dw=w*s,dh=h*s;x.drawImage(im,cx+(cell-dw)/2,cy+(cell-dh)/2,dw,dh);
   const r=Math.max(22,cell/14);x.fillStyle='#c62828';x.beginPath();x.arc(cx+pad+r,cy+pad+r,r,0,7);x.fill();
   x.fillStyle='#fff';x.font='bold '+Math.round(r*1.1)+'px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(String(k+1),cx+pad+r,cy+pad+r+1);
   x.strokeStyle='#ddd';x.strokeRect(cx,cy,cell,cell)});
  c.style.display='block';$('bBtns').hidden=false;
  $('bStatus').textContent='Collage ready ('+n+' photos)'+(n>25?'. Tip: with this many photos the dates get small, so you could split them into 2 batches.':'.')}
 catch(e){$('bStatus').textContent='Couldn\\'t read one of the photos: '+e.message}}
async function copyCollage(btn){try{await navigator.clipboard.write([new ClipboardItem({'image/png':new Promise(r=>$('bCanvas').toBlob(r,'image/png'))})]);flash(btn,'✓ Copied!');toast('✓ Collage copied, paste it into the AI');$('bStatus').textContent='Collage copied! Paste it into the AI.'}
 catch(e){$('bStatus').textContent='Your browser wouldn\\'t copy the picture, so use Download collage and upload it instead.'}}
function downloadCollage(){const a=document.createElement('a');a.href=$('bCanvas').toDataURL('image/jpeg',0.9);a.download=(($('bFood').value||'food').replace(/[^a-z0-9]+/gi,'-'))+'-dates.jpg';a.click()}
function aiPrompt(){const f=$('bFood').value.trim()||'food';return['This picture is a collage of '+photos.length+' numbered photos. Each photo shows the use-by or best-before date printed on the packaging of '+f+'.','',
 'Read the date in every photo and reply ONLY with lines in exactly this format, with no other text, headings or tables:',
 f+' | quantity | YYYY-MM-DD | notes','',
 'Rules:','- Make one line for each different date.','- quantity = how many photos show that same date.',
 '- Write dates as YYYY-MM-DD (year-month-day). If a photo only shows a month and year, use the last day of that month.',
 '- notes: write which photo numbers that line came from, e.g. photos 1, 4, 7.',
 '- If you cannot read a date, write a line like: '+f+' | 1 | UNKNOWN | photo 5'].join(NL)}
async function copyPrompt(btn){const t=aiPrompt();try{await navigator.clipboard.writeText(t);flash(btn,'✓ Copied!');toast('✓ Instructions copied, paste them into the AI');$('bStatus').textContent='Instructions copied! Paste them into the AI along with the collage.'}
 catch(e){modal({title:'Copy these instructions',text:'Your browser blocked copying, so press and hold to select all of this and copy it:',area:t,alert:true})}}
function normDate(s){s=String(s||'').trim();let m;
 if(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s))return okDate(+s.slice(0,4),+s.slice(5,7),+s.slice(8,10));
 if(m=s.match(/^([0-9]{1,2})[./-]([0-9]{1,2})[./-]([0-9]{2,4})$/)){let y=+m[3];if(y<100)y+=2000;return okDate(y,+m[2],+m[1])}
 if(m=s.match(/^([0-9]{1,2})[./-]([0-9]{4})$/)){const y=+m[2],mo=+m[1];return okDate(y,mo,new Date(Date.UTC(y,mo,0)).getUTCDate())}
 return null}
function okDate(y,mo,d){const t=new Date(Date.UTC(y,mo-1,d));if(t.getUTCFullYear()!==y||t.getUTCMonth()!==mo-1||t.getUTCDate()!==d)return null;return t.toISOString().slice(0,10)}
function previewBulk(){const good=[],bad=[];
 $('bPaste').value.split(NL).forEach(line=>{let l=line.split(String.fromCharCode(96)).join('').trim().replace(/^[-*>]+/,'').trim();if(!l||l.indexOf('|')<0)return;
  let p=l.split('|').map(s=>s.trim());if(p[0]==='')p.shift();if(p[p.length-1]==='')p.pop();
  const date=normDate(p[2]);if(!p[0]||/^-+$/.test(p[0])||/food|name/i.test(p[0])&&!date)return;
  if(!date){bad.push(l);return}good.push({name:p[0],qty:Math.max(1,parseInt(p[1])||1),date,notes:p.slice(3).join(' | ')})});
 bulkRows=good;const total=good.reduce((a,b)=>a+b.qty,0);
 $('bPreview').innerHTML=(good.length?'<p><b>Ready to add '+good.length+' line(s), '+total+' item(s) in total:</b></p>'+good.map(g=>'<div class="item"><div class="grow"><b>'+esc(g.name)+'</b> ×'+g.qty+'<br><small>'+new Date(g.date+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})+(g.notes?' · '+esc(g.notes):'')+'</small></div></div>').join(''):'')+
  (bad.length?'<p class="bad">Couldn\\'t read a date on '+bad.length+' line(s), these will be skipped:<br>'+bad.map(esc).join('<br>')+'</p>':'');
 $('bAdd').hidden=!good.length}
async function addBulk(){try{const r=await api('groups/'+gid+'/items/bulk',{items:bulkRows});grp.items=r.items;draw();
 $('bPaste').value='';previewBulk();photos=[];drawThumbs();$('bCanvas').style.display='none';$('bBtns').hidden=true;$('bStatus').textContent='Added '+r.added+' line(s) to the list!';toast('✓ Added '+r.added+' line(s)');showTab('food')}
 catch(e){uiAlert(e.message)}}
const WARNTXT={7:'1 week',14:'2 weeks',30:'1 month',60:'2 months',90:'3 months',180:'6 months'};
function warnD(){return (me&&me.warnDays)||60}
async function saveRemind(){me.warnDays=+$('warnSel').value;me.every=+$('everySel').value;await api('settings',{warnDays:me.warnDays,every:me.every});draw();toast('✓ Saved')}
async function muteItem(id,mute){grp.items=await api('groups/'+gid+'/items/mute',{id,mute});draw();toast(mute?'🔕 Emails off for that one':'🔔 Emails back on for that one')}
async function saveAlerts(){await api('settings',{alerts:$('alerts').checked})}
async function act(p,m){$('msg').textContent='Sending...';try{await api(p,{});$('msg').textContent=m;toast('✓ '+m)}catch(e){$('msg').textContent='Error: '+e.message;uiAlert(e.message,'That didn'+String.fromCharCode(39)+'t work')}}
async function logout(){await api('logout',{}).catch(()=>{});showAuth()}
if(tok){$('auth').hidden=true;start().catch(e=>{if(tok){$('who').textContent='Offline, retrying...';setTimeout(()=>location.reload(),8000)}})}else showAuth();
</script></body></html>`;
