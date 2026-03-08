// ================================================================
// KWEN COUNCIL — Cloudflare Pages _worker.js
// ES Module format — required for Pages GitHub deployment
// env.SESSIONS, env.CHATS, env.HF_* injected automatically
// ================================================================

const SAFE_AI = `MANDATORY SAFETY GUIDELINES:
1. Never generate content causing physical, psychological or financial harm.
2. Distinguish clearly between facts, expert consensus, and contested claims.
3. On medical/legal/financial topics, frame as analysis tools not professional advice.
4. Approach politics, religion, ethics with fairness and balance.
5. Acknowledge limits of knowledge. If evidence is weak, say so.
6. No manipulation or persuasion bypassing rational thought.
7. Never demean or stereotype any group.
8. Do not fabricate citations, statistics, or quotes.`;

function councilPrompt(topic) {
  return `${SAFE_AI}\n\nYou are a council assembler for a critical thinking research tool. Select 3-5 specialist personas whose perspectives create the MOST INTELLECTUALLY PRODUCTIVE FRICTION on this topic.\n\nTOPIC: "${topic}"\n\nRULES:\n1. Prioritize perspectives disagreeing on FUNDAMENTAL ASSUMPTIONS\n2. Include at least one heterodox/contrarian voice\n3. Cover at least 2 different epistemic styles\n4. Select for genuine disciplinary diversity\n\nFor EACH persona return:\n- id: snake_case\n- name: realistic full name\n- title: professional title\n- intellectual_tradition: named school of thought\n- epistemology: ONE sentence — how they determine truth\n- core_commitment: ONE non-negotiable belief creating friction\n- friction_with: array of 2-3 reasoning types they challenge\n- forbidden_rhetoric: array of 3-4 phrases they NEVER use\n- vocabulary_register: one of "highly_technical"|"accessible_academic"|"philosophical"|"empirical_quantitative"|"narrative_qualitative"|"policy_pragmatic"\n- known_bias: honest intellectual blind spot\n- signature_approach: how they structure arguments\n- avatar_initials: 2 capital letters\n\nReturn ONLY a valid JSON array. No markdown, no explanation.`;
}

function personaPrompt(persona, allPersonas) {
  const others = allPersonas.filter(p => p.id !== persona.id).map(p => `${p.name} (${p.title})`).join(', ');
  return `${SAFE_AI}\n\nYou ARE ${persona.name}, ${persona.title}.\n\nIDENTITY:\n- Tradition: ${persona.intellectual_tradition}\n- Epistemology: ${persona.epistemology}\n- Core commitment (NON-NEGOTIABLE): ${persona.core_commitment}\n- Known bias: ${persona.known_bias}\n- Argument structure: ${persona.signature_approach}\n\nANTI-HOMOGENIZATION RULES:\n1. Push back against: ${Array.isArray(persona.friction_with) ? persona.friction_with.join(', ') : persona.friction_with}\n2. NEVER use: ${Array.isArray(persona.forbidden_rhetoric) ? persona.forbidden_rhetoric.join(' | ') : persona.forbidden_rhetoric}\n3. Write ONLY in ${persona.vocabulary_register} register\n4. Do NOT open by validating other perspectives\n5. Find friction with the question's framing\n6. Argue as ${persona.name} — your vocabulary, habits, blind spots included\n\nOther council members (you respond independently): ${others}\n\nRESPONSE: 150-220 words. Lead with strongest insight. No padding.`;
}

function synthesisPrompt(question, personas, responses) {
  const blocks = personas.map((p, i) => `[${p.name}, ${p.title}]:\n${responses[i]}`).join('\n\n---\n\n');
  return `${SAFE_AI}\n\nSynthesize WITHOUT forcing consensus.\n\nQUESTION: "${question}"\n\nCOUNCIL:\n${blocks}\n\nReturn ONLY this JSON (no markdown):\n{"summary":"3-4 paragraphs on genuine disagreements and preserved tensions","decision_framework":{"key_questions":["3-5 questions"],"evidence_that_would_change_views":["per perspective"],"red_flags":["3-4 warnings"]},"open_questions":[{"question":"unresolved","why_unresolved":"specific reason"}]}`;
}

function defaultCouncil() {
  return [
    { id: "empirical_scientist", name: "Dr. Morgan Wells", title: "Empirical Research Scientist", intellectual_tradition: "Scientific empiricism", epistemology: "Knowledge is validated only through reproducible evidence and falsifiable hypotheses.", core_commitment: "Claims require evidence proportional to their extraordinary nature.", friction_with: ["appeals to authority without data", "unfalsifiable claims", "confusing correlation with causation"], forbidden_rhetoric: ["I feel", "obviously", "everyone knows", "intuitively speaking"], vocabulary_register: "empirical_quantitative", known_bias: "Systematically undervalues qualitative and experiential knowledge.", signature_approach: "Leads with evidence, then states what it cannot tell us.", avatar_initials: "MW" },
    { id: "critical_philosopher", name: "Prof. Aria Chen", title: "Philosopher of Knowledge", intellectual_tradition: "Critical rationalism with post-structural influences", epistemology: "Understanding requires examining power structures embedded in the question itself.", core_commitment: "Every framework contains hidden normative commitments that must be surfaced.", friction_with: ["naive empiricism", "instrumental reasoning", "false value-neutrality"], forbidden_rhetoric: ["the data shows", "practically speaking", "at the end of the day", "common sense"], vocabulary_register: "philosophical", known_bias: "Can over-complicate questions that have clear practical answers.", signature_approach: "Historicises and deconstructs the question before answering.", avatar_initials: "AC" },
    { id: "policy_pragmatist", name: "Dr. James Okafor", title: "Applied Policy Researcher", intellectual_tradition: "Pragmatic institutionalism", epistemology: "Truth is what produces workable outcomes within real constraints of institutions.", core_commitment: "Abstract principles must survive contact with institutional realities.", friction_with: ["purely theoretical approaches", "solutions ignoring incentive structures", "ahistorical analysis"], forbidden_rhetoric: ["in theory", "ideally", "if people were rational", "the research clearly shows"], vocabulary_register: "policy_pragmatic", known_bias: "Can be overly accommodating of existing power structures.", signature_approach: "Leads with institutional context, then evaluates what is achievable.", avatar_initials: "JO" }
  ];
}

async function callQwen(messages, token, model, opts = {}) {
  const res = await fetch(`https://api-inference.huggingface.co/models/${model}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: opts.max_tokens || 600, temperature: opts.temperature || 0.72, stream: false })
  });
  if (!res.ok) throw new Error(`HF ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const d = await res.json();
  if (!d.choices?.[0]) throw new Error('Unexpected HF response');
  return d.choices[0].message.content;
}

async function buildCouncil(topic, token, model) {
  try {
    const txt = await callQwen([{ role: 'user', content: councilPrompt(topic) }], token, model, { max_tokens: 2500, temperature: 0.88 });
    const arr = JSON.parse(txt.replace(/```json\s?/g, '').replace(/```\s?/g, '').trim());
    if (!Array.isArray(arr) || arr.length < 2) throw new Error('bad');
    return arr.slice(0, 5);
  } catch { return defaultCouncil(); }
}

async function personaReply(persona, all, question, history, token, model) {
  const idx = all.findIndex(p => p.id === persona.id);
  const hist = (history || []).slice(-3).flatMap(h => {
    const pr = h.responses?.[idx];
    return pr ? [{ role: 'user', content: h.question }, { role: 'assistant', content: pr }] : [{ role: 'user', content: h.question }];
  });
  return callQwen([{ role: 'system', content: personaPrompt(persona, all) }, ...hist, { role: 'user', content: question }], token, model, { max_tokens: 450, temperature: 0.74 });
}

async function buildSynthesis(question, council, responses, token, model) {
  try {
    const txt = await callQwen([{ role: 'user', content: synthesisPrompt(question, council, responses) }], token, model, { max_tokens: 1800, temperature: 0.62 });
    return JSON.parse(txt.replace(/```json\s?/g, '').replace(/```\s?/g, '').trim());
  } catch {
    return { summary: responses.join('\n\n'), decision_framework: { key_questions: [], evidence_that_would_change_views: [], red_flags: [] }, open_questions: [] };
  }
}

async function mkSid() {
  const a = new Uint8Array(32); crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}

function getSid(req) {
  const m = (req.headers.get('Cookie') || '').match(/(?:^|;\s*)session=([^;]+)/);
  return m ? m[1] : null;
}

async function getSession(req, env) {
  const sid = getSid(req);
  if (!sid) return null;
  try {
    const raw = await env.SESSIONS.get(sid);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s.expires_at < Date.now()) { await env.SESSIONS.delete(sid); return null; }
    return s;
  } catch { return null; }
}

function jres(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// ---- Route handlers ----
async function onLogin(req, env) {
  const p = new URLSearchParams({ client_id: env.HF_CLIENT_ID, redirect_uri: env.REDIRECT_URI, response_type: 'code', scope: 'openid profile inference-api', state: crypto.randomUUID() });
  return Response.redirect(`https://huggingface.co/oauth/authorize?${p}`, 302);
}

async function onCallback(req, env) {
  const code = new URL(req.url).searchParams.get('code');
  if (!code) return Response.redirect(`${env.APP_URL}?err=nocode`, 302);
  const tr = await fetch('https://huggingface.co/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: env.REDIRECT_URI, client_id: env.HF_CLIENT_ID, client_secret: env.HF_CLIENT_SECRET })
  });
  if (!tr.ok) return Response.redirect(`${env.APP_URL}?err=token`, 302);
  const td = await tr.json();
  if (!td.access_token) return Response.redirect(`${env.APP_URL}?err=notoken`, 302);
  const ui = await (await fetch('https://huggingface.co/oauth/userinfo', { headers: { 'Authorization': `Bearer ${td.access_token}` } })).json();
  const sid = await mkSid();
  await env.SESSIONS.put(sid, JSON.stringify({ hf_token: td.access_token, user: { id: ui.sub, name: ui.name || ui.preferred_username, username: ui.preferred_username }, created_at: Date.now(), expires_at: Date.now() + 86400000 }), { expirationTtl: 86400 });
  return new Response(null, { status: 302, headers: { 'Location': env.APP_URL, 'Set-Cookie': `session=${sid}; HttpOnly; Secure; SameSite=Strict; Max-Age=86400; Path=/` } });
}

async function onLogout(req, env) {
  const sid = getSid(req);
  if (sid) try { await env.SESSIONS.delete(sid); } catch {}
  return new Response(null, { status: 302, headers: { 'Location': env.APP_URL, 'Set-Cookie': 'session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/' } });
}

async function onSession(req, env) {
  const s = await getSession(req, env);
  return s ? jres({ authenticated: true, user: s.user }) : jres({ authenticated: false });
}

async function onChat(req, env) {
  if (req.method !== 'POST') return jres({ error: 'Method not allowed' }, 405);
  const s = await getSession(req, env);
  if (!s) return jres({ error: 'Unauthorized' }, 401);
  let body; try { body = await req.json(); } catch { return jres({ error: 'Invalid JSON' }, 400); }
  const { question, chatId, history } = body;
  if (!question?.trim()) return jres({ error: 'Question required' }, 400);
  if (question.length > 2000) return jres({ error: 'Too long' }, 400);
  const model = env.HF_MODEL || 'Qwen/Qwen2.5-72B-Instruct';
  try {
    const council = await buildCouncil(question.trim(), s.hf_token, model);
    const responses = await Promise.all(council.map(p => personaReply(p, council, question, history, s.hf_token, model)));
    const synthesis = await buildSynthesis(question, council, responses, s.hf_token, model);
    const cid = chatId || crypto.randomUUID();
    const key = `chat:${s.user.id}:${cid}`;
    let cd; try { const ex = await env.CHATS.get(key); cd = ex ? JSON.parse(ex) : { messages: [], created_at: Date.now(), first_question: question }; } catch { cd = { messages: [], created_at: Date.now(), first_question: question }; }
    cd.messages.push({ id: crypto.randomUUID(), question, council, responses, synthesis, timestamp: Date.now() });
    await env.CHATS.put(key, JSON.stringify(cd), { expirationTtl: 604800 });
    return jres({ chatId: cid, council, responses, synthesis });
  } catch (err) { return jres({ error: err.message || 'Processing failed' }, 500); }
}

async function onHistory(req, env) {
  const s = await getSession(req, env);
  if (!s) return jres({ error: 'Unauthorized' }, 401);
  const chatId = new URL(req.url).searchParams.get('chatId');
  if (chatId) {
    try { const raw = await env.CHATS.get(`chat:${s.user.id}:${chatId}`); return raw ? new Response(raw, { headers: { 'Content-Type': 'application/json' } }) : jres({ messages: [] }); }
    catch { return jres({ messages: [] }); }
  }
  return jres({ chats: [] });
}

// ---- HTML ----
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>KWEN Council</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Outfit:wght@300;400;500;600&family=Crimson+Pro:ital,wght@0,400;0,600;1,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--bg:#07091a;--sur:#0c0f22;--sur2:#111428;--bor:#1c2140;--bor2:#252d52;--gold:#c9a44a;--gl:#e8c06a;--gd:#7a6030;--tx:#e4dfc8;--tx2:#8a9bb8;--tx3:#505d7a;--err:#c94a4a;--ok:#4ac98a;--r:8px;--r2:12px;--t:.2s ease;--fd:'Cormorant Garamond',Georgia,serif;--fb:'Crimson Pro',Georgia,serif;--fu:'Outfit',system-ui,sans-serif;--fm:'JetBrains Mono',monospace}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{height:100%;overflow:hidden}
body{background:var(--bg);color:var(--tx);font-family:var(--fu);font-size:15px;line-height:1.6}
body::before{content:'';position:fixed;inset:0;z-index:0;pointer-events:none;background:radial-gradient(ellipse 60% 50% at 20% 20%,rgba(201,164,74,.04) 0%,transparent 60%),radial-gradient(ellipse 50% 60% at 80% 80%,rgba(74,139,201,.04) 0%,transparent 60%)}
#lp{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:var(--bg)}#lp.h{display:none}
.lc{text-align:center;padding:56px 48px;background:var(--sur);border:1px solid var(--bor2);border-radius:20px;max-width:440px;width:90%;position:relative;box-shadow:0 32px 80px rgba(0,0,0,.6)}
.lc::before{content:'';position:absolute;top:0;left:50%;transform:translateX(-50%);width:120px;height:2px;background:linear-gradient(90deg,transparent,var(--gold),transparent)}
.ll{font-family:var(--fd);font-size:42px;font-weight:700;color:var(--gl);letter-spacing:.04em;margin-bottom:4px}
.lt{font-family:var(--fb);font-size:15px;font-style:italic;color:var(--tx2);margin-bottom:36px}
.lf{list-style:none;text-align:left;margin-bottom:40px;display:flex;flex-direction:column;gap:10px}
.lf li{display:flex;align-items:flex-start;gap:10px;font-size:13px;color:var(--tx2);font-family:var(--fb)}
.lf li::before{content:'◆';color:var(--gd);font-size:8px;margin-top:5px;flex-shrink:0}
.bhf{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:14px 24px;background:var(--gold);color:#0b0e1a;border:none;border-radius:var(--r2);font-family:var(--fu);font-size:14px;font-weight:600;cursor:pointer;transition:background var(--t),transform var(--t);text-decoration:none}
.bhf:hover{background:var(--gl);transform:translateY(-1px)}.bhf svg{width:20px;height:20px}
.ln{margin-top:16px;font-size:12px;color:var(--tx3)}
#app{display:flex;height:100vh;position:relative;z-index:1}#app.h{display:none}
#sb{width:260px;flex-shrink:0;background:var(--sur);border-right:1px solid var(--bor);display:flex;flex-direction:column;transition:width .25s,opacity .25s;overflow:hidden}#sb.c{width:0;opacity:0}
.sbh{padding:20px 20px 16px;border-bottom:1px solid var(--bor);flex-shrink:0}
.sbl{font-family:var(--fd);font-size:22px;font-weight:700;color:var(--gl);letter-spacing:.04em}
.sbl span{color:var(--tx3);font-weight:400;font-size:11px;display:block;margin-top:2px;font-family:var(--fu);letter-spacing:.08em;text-transform:uppercase}
.bnc{display:flex;align-items:center;gap:8px;width:100%;margin-top:12px;padding:9px 14px;background:rgba(201,164,74,.1);border:1px solid rgba(201,164,74,.2);border-radius:var(--r);color:var(--gold);font-family:var(--fu);font-size:13px;font-weight:500;cursor:pointer;transition:background var(--t)}
.bnc:hover{background:rgba(201,164,74,.18)}.bnc svg{width:14px;height:14px}
.sch{flex:1;overflow-y:auto;padding:12px 10px}
.sci{padding:10px 12px;border-radius:var(--r);cursor:pointer;border:1px solid transparent;margin-bottom:4px;transition:background var(--t)}
.sci:hover,.sci.a{background:var(--sur2);border-color:var(--bor2)}
.sci-t{font-size:13px;color:var(--tx);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sci-d{font-size:11px;color:var(--tx3);margin-top:2px;font-family:var(--fm)}
.sbf{padding:14px 16px;border-top:1px solid var(--bor);display:flex;align-items:center;gap:10px;flex-shrink:0}
.ua{width:30px;height:30px;border-radius:50%;background:var(--gd);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:var(--tx);flex-shrink:0}
.ui{flex:1;overflow:hidden}.un{font-size:13px;font-weight:500;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.us{font-size:11px;color:var(--tx3)}
.blo{background:none;border:none;cursor:pointer;color:var(--tx3);padding:4px;border-radius:4px;transition:color var(--t);display:flex;align-items:center}.blo:hover{color:var(--err)}.blo svg{width:16px;height:16px}
#mn{flex:1;display:flex;flex-direction:column;min-width:0;position:relative}
.mh{padding:14px 20px;border-bottom:1px solid var(--bor);display:flex;align-items:center;gap:12px;flex-shrink:0;background:rgba(12,15,34,.8);backdrop-filter:blur(8px)}
.bst{background:none;border:none;cursor:pointer;color:var(--tx2);padding:6px;border-radius:6px;display:flex;align-items:center;transition:color var(--t),background var(--t)}.bst:hover{color:var(--tx);background:var(--sur2)}.bst svg{width:18px;height:18px}
.mht{font-family:var(--fd);font-size:17px;font-weight:600;color:var(--tx2)}
.mhb{font-family:var(--fm);font-size:10px;color:var(--gd);background:rgba(201,164,74,.06);border:1px solid rgba(201,164,74,.12);padding:2px 8px;border-radius:20px;letter-spacing:.06em;text-transform:uppercase}
#msgs{flex:1;overflow-y:auto;padding:24px 24px 8px;display:flex;flex-direction:column;gap:32px}
.es{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px;gap:16px}
.esl{font-family:var(--fd);font-size:52px;font-weight:700;color:rgba(201,164,74,.3);letter-spacing:.04em}
.es h2{font-family:var(--fd);font-size:22px;font-weight:600;color:var(--tx2)}
.es p{font-family:var(--fb);font-size:16px;color:var(--tx3);max-width:480px;line-height:1.7}
.eqs{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:8px;max-width:560px}
.eq{padding:8px 16px;background:var(--sur2);border:1px solid var(--bor2);border-radius:20px;font-size:13px;color:var(--tx2);cursor:pointer;transition:background var(--t),color var(--t)}.eq:hover{background:rgba(201,164,74,.1);color:var(--gold)}
.mb{display:flex;flex-direction:column;gap:16px}
.um{align-self:flex-end;max-width:680px;background:rgba(201,164,74,.08);border:1px solid rgba(201,164,74,.15);border-radius:16px 16px 4px 16px;padding:14px 18px;font-family:var(--fb);font-size:17px;line-height:1.65;color:var(--tx)}
.cw{background:var(--sur);border:1px solid var(--bor2);border-radius:var(--r2);overflow:hidden}
.ch2{padding:12px 18px;border-bottom:1px solid var(--bor);display:flex;align-items:center;gap:10px;background:rgba(201,164,74,.03)}
.clb{font-family:var(--fm);font-size:10px;color:var(--gd);letter-spacing:.1em;text-transform:uppercase}
.ccnt{font-size:11px;color:var(--tx3);margin-left:auto}
.ts{overflow-x:auto}.ct{width:max-content;min-width:100%;border-collapse:collapse}
.pt{min-width:300px;max-width:340px;padding:18px 20px 14px;vertical-align:top;border-right:1px solid var(--bor);border-bottom:3px solid transparent;text-align:left}.pt:last-child{border-right:none}
.ph{display:flex;align-items:flex-start;gap:12px;margin-bottom:8px}
.pav{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--fu);font-size:13px;font-weight:700;flex-shrink:0}
.pnm{font-family:var(--fd);font-size:17px;font-weight:700;color:var(--tx);line-height:1.2}
.pti{font-size:12px;color:var(--tx2);margin-top:2px;line-height:1.3}
.ptr{display:inline-block;padding:3px 9px;border-radius:20px;font-size:10px;font-family:var(--fm);letter-spacing:.04em;margin-top:6px;border:1px solid}
.pbias{margin-top:6px;font-size:11px;font-style:italic;color:var(--tx3);font-family:var(--fb);line-height:1.4}
.rtd{padding:16px 20px;vertical-align:top;border-right:1px solid var(--bor);border-left:3px solid transparent}.rtd:last-child{border-right:none}
.rtx{font-family:var(--fb);font-size:15.5px;line-height:1.75;color:var(--tx)}
.lw{background:var(--sur);border:1px solid var(--bor2);border-radius:var(--r2);padding:32px 28px;text-align:center}
.ltitle{font-family:var(--fd);font-size:18px;font-weight:600;color:var(--tx2)}
.lps{display:flex;flex-direction:column;gap:10px;margin-top:16px}
.lph{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:var(--r);background:var(--sur2);border:1px solid var(--bor);font-size:13px;color:var(--tx2);transition:all .3s}
.lph.ac{border-color:rgba(201,164,74,.3);background:rgba(201,164,74,.05);color:var(--gold)}
.lph.dn{color:var(--ok);border-color:rgba(58,170,114,.2);background:rgba(58,170,114,.05)}
.pdot{width:8px;height:8px;border-radius:50%;background:var(--tx3);flex-shrink:0}
.lph.ac .pdot{background:var(--gold);animation:pulse 1.2s ease-in-out infinite}
.lph.dn .pdot{background:var(--ok)}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.7)}}
.sw{display:flex;flex-direction:column;gap:12px;margin-top:4px}
.scard{background:var(--sur);border:1px solid var(--bor2);border-radius:var(--r2);overflow:hidden}
.scardh{padding:12px 18px;border-bottom:1px solid var(--bor);display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;transition:background var(--t)}.scardh:hover{background:rgba(255,255,255,.02)}
.sico{width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0}
.stitle{font-family:var(--fd);font-size:16px;font-weight:700;color:var(--tx)}
.ssub{font-size:12px;color:var(--tx3);margin-left:auto}
.schev{margin-left:auto;color:var(--tx3);transition:transform .2s}.schev.o{transform:rotate(180deg)}
.scardb{padding:18px 20px;display:none}.scardb.o{display:block}
.ssum{font-family:var(--fb);font-size:16px;line-height:1.8;color:var(--tx)}.ssum p+p{margin-top:12px}
.fwsec{margin-bottom:20px}.fwsec:last-child{margin-bottom:0}
.fwlbl{font-family:var(--fm);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--gd);margin-bottom:10px;display:flex;align-items:center;gap:8px}.fwlbl::after{content:'';flex:1;height:1px;background:var(--bor)}
.fwlist{list-style:none;display:flex;flex-direction:column;gap:7px}
.fwlist li{display:flex;align-items:flex-start;gap:10px;font-family:var(--fb);font-size:15px;color:var(--tx);line-height:1.6}.fwlist li::before{content:'→';color:var(--gd);flex-shrink:0;font-size:12px}
.oqs{display:flex;flex-direction:column;gap:12px}
.oqi{background:var(--sur2);border:1px solid var(--bor);border-radius:var(--r);padding:14px 16px}
.oqn{font-family:var(--fm);font-size:10px;color:var(--gd);margin-bottom:4px}
.oqq{font-family:var(--fb);font-size:16px;font-weight:600;color:var(--tx);margin-bottom:6px;line-height:1.5}
.oqw{font-family:var(--fb);font-size:14px;font-style:italic;color:var(--tx2);line-height:1.5}.oqw::before{content:'Why unresolved: ';color:var(--tx3);font-style:normal;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
#ia{padding:16px 24px 20px;border-top:1px solid var(--bor);background:rgba(7,9,26,.95);backdrop-filter:blur(10px);flex-shrink:0}
.iw{background:var(--sur);border:1px solid var(--bor2);border-radius:var(--r2);display:flex;flex-direction:column;transition:border-color .2s,box-shadow .2s}.iw:focus-within{border-color:rgba(201,164,74,.4);box-shadow:0 0 0 3px rgba(201,164,74,.06)}
#qi{background:none;border:none;outline:none;padding:14px 16px 8px;font-family:var(--fb);font-size:16px;color:var(--tx);resize:none;max-height:160px;min-height:50px;line-height:1.6}#qi::placeholder{color:var(--tx3)}
.itbar{display:flex;align-items:center;gap:8px;padding:8px 12px;border-top:1px solid var(--bor)}
.ihint{font-size:11px;color:var(--tx3);font-family:var(--fm)}
.bsend{margin-left:auto;display:flex;align-items:center;gap:7px;padding:8px 18px;background:var(--gold);border:none;border-radius:8px;font-family:var(--fu);font-size:13px;font-weight:600;color:#0b0e1a;cursor:pointer;transition:background var(--t),transform var(--t)}.bsend:hover:not(:disabled){background:var(--gl);transform:translateY(-1px)}.bsend:disabled{opacity:.4;cursor:not-allowed}.bsend svg{width:14px;height:14px}
::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--bor2);border-radius:3px}
@keyframes fi{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.fi{animation:fi .35s ease forwards}
.disc{font-size:11px;color:var(--tx3);text-align:center;padding:8px 0 0;font-family:var(--fb);font-style:italic}
@media(max-width:700px){#sb{position:absolute;top:0;bottom:0;left:0;z-index:50}.pt{min-width:260px}}
</style>
</head>
<body>
<div id="lp" class="h">
  <div class="lc">
    <div class="ll">KWEN</div><div class="lt">Critical Thinking Research Council</div>
    <ul class="lf">
      <li>Dynamic council of 3-5 specialists per topic</li>
      <li>Anti-homogenisation: locked epistemic identities</li>
      <li>Tabular debate with genuine intellectual friction</li>
      <li>Summary, decision framework &amp; open questions</li>
    </ul>
    <a href="/api/auth/login" class="bhf">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18L20 8.5v7.07l-8 4-8-4V8.5L12 4.18z"/></svg>
      Continue with Hugging Face
    </a>
    <p class="ln">Uses your HF account for auth &amp; inference</p>
  </div>
</div>
<div id="app" class="h">
  <nav id="sb">
    <div class="sbh">
      <div class="sbl">KWEN <span>Critical Thinking Council</span></div>
      <button class="bnc" onclick="newChat()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New Session</button>
    </div>
    <div class="sch" id="chl"></div>
    <div class="sbf">
      <div class="ua" id="uav">?</div>
      <div class="ui"><div class="un" id="unm">Loading...</div><div class="us">Research Session</div></div>
      <button class="blo" onclick="logout()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></button>
    </div>
  </nav>
  <div id="mn">
    <header class="mh">
      <button class="bst" onclick="document.getElementById('sb').classList.toggle('c')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
      <span class="mht" id="htt">Council Chamber</span>
      <span class="mhb" id="cbadge" style="display:none">Council Active</span>
    </header>
    <div id="msgs"><div class="es" id="es0">
      <div class="esl">KWEN</div><h2>Convene Your Council</h2>
      <p>Ask any question. A dynamic council of specialists will examine it from genuinely different perspectives — real intellectual friction, not diplomatic balance.</p>
      <div class="eqs">
        <span class="eq" onclick="setQ(this.textContent)">Is economic growth compatible with climate stability?</span>
        <span class="eq" onclick="setQ(this.textContent)">Does social media strengthen or weaken democracy?</span>
        <span class="eq" onclick="setQ(this.textContent)">Can artificial general intelligence be made safe?</span>
        <span class="eq" onclick="setQ(this.textContent)">Is universal basic income economically viable?</span>
      </div>
    </div></div>
    <div id="ia">
      <div class="iw">
        <textarea id="qi" rows="2" placeholder="Ask your council a question..." onkeydown="onKey(event)" oninput="rsz(this)"></textarea>
        <div class="itbar">
          <span class="ihint">Shift+Enter for new line</span>
          <button class="bsend" id="sbtn" onclick="send()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>Convene Council</button>
        </div>
      </div>
      <p class="disc">For research &amp; education only — not professional advice.</p>
    </div>
  </div>
</div>
<script>
var user=null,cid=null,hist=[],busy=false;
var CV=[{bg:'#c9844a',li:'#e8a96a',dk:'#3d2010'},{bg:'#4a8bc9',li:'#6aaae8',dk:'#10203d'},{bg:'#c94a72',li:'#e86a92',dk:'#3d1020'},{bg:'#7a4ac9',li:'#9a6ae8',dk:'#1e1040'},{bg:'#3aaa72',li:'#5aca92',dk:'#0d3020'}];
function h(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function stob(){setTimeout(function(){document.getElementById('msgs').scrollTop=9999},50)}
async function init(){
  try{var r=await fetch('/api/session',{credentials:'same-origin'});var d=await r.json();
    if(d.authenticated){user=d.user;showApp();loadHist();}else showLogin();
  }catch(x){showLogin();}
}
function showLogin(){document.getElementById('lp').classList.remove('h');document.getElementById('app').classList.add('h')}
function showApp(){
  document.getElementById('lp').classList.add('h');document.getElementById('app').classList.remove('h');
  var ini=(user.name||user.username||'U').split(' ').map(function(w){return w[0]}).join('').toUpperCase().slice(0,2);
  document.getElementById('uav').textContent=ini;document.getElementById('unm').textContent=user.name||user.username;
}
function logout(){window.location.href='/api/auth/logout'}
function setQ(q){var i=document.getElementById('qi');i.value=q;i.focus();rsz(i)}
function onKey(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}
function rsz(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,160)+'px'}
function newChat(){
  cid=null;hist=[];var m=document.getElementById('msgs');m.innerHTML='';
  var es=document.createElement('div');es.id='es0';es.className='es';
  es.innerHTML='<div class="esl">KWEN</div><h2>Convene Your Council</h2><p>Ask any question for critical multi-perspective analysis.</p>';
  m.appendChild(es);document.getElementById('htt').textContent='Council Chamber';document.getElementById('cbadge').style.display='none';
}
async function send(){
  var inp=document.getElementById('qi'),q=inp.value.trim();
  if(!q||busy)return;
  var es=document.getElementById('es0');if(es)es.remove();
  busy=true;inp.value='';inp.style.height='auto';document.getElementById('sbtn').disabled=true;
  var mb=document.createElement('div');mb.className='mb fi';
  var um=document.createElement('div');um.className='um';um.textContent=q;mb.appendChild(um);
  var lw=mkLoad();mb.appendChild(lw);
  document.getElementById('msgs').appendChild(mb);stob();
  var ps=lw.querySelectorAll('.lph'),pi=0;
  var piv=setInterval(function(){
    if(pi>0){ps[pi-1].classList.remove('ac');ps[pi-1].classList.add('dn')}
    if(pi<ps.length)ps[pi].classList.add('ac');
    pi++;if(pi>ps.length)clearInterval(piv);
  },2200);
  try{
    var r=await fetch('/api/chat',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q,chatId:cid,history:hist.slice(-3)})});
    clearInterval(piv);var d=await r.json();
    if(!r.ok)throw new Error(d.error||'Request failed');
    cid=d.chatId;hist.push({question:q,responses:d.responses});
    lw.remove();mb.appendChild(mkTable(d.council,d.responses));
    if(d.synthesis)mb.appendChild(mkSynth(d.synthesis));
    document.getElementById('htt').textContent=q.slice(0,50)+(q.length>50?'...':'');
    document.getElementById('cbadge').style.display='';stob();loadHist();
  }catch(err){clearInterval(piv);lw.innerHTML='<p style="color:var(--err);padding:20px;text-align:center;font-family:var(--fb)">Error: '+h(err.message)+'</p>';}
  busy=false;document.getElementById('sbtn').disabled=false;
}
function mkLoad(){
  var d=document.createElement('div');d.className='lw fi';
  d.innerHTML='<div class="ltitle">Assembling your council</div><div class="lps"><div class="lph"><div class="pdot"></div>Analysing topic &amp; selecting specialists</div><div class="lph"><div class="pdot"></div>Locking epistemic identities</div><div class="lph"><div class="pdot"></div>Consulting each specialist independently</div><div class="lph"><div class="pdot"></div>Synthesising tensions &amp; open questions</div></div>';
  return d;
}
function mkTable(council,responses){
  var wrap=document.createElement('div');wrap.className='cw fi';
  var hdr=document.createElement('div');hdr.className='ch2';
  hdr.innerHTML='<span class="clb">&#9670; Council Perspectives</span><span class="ccnt">'+council.length+' Specialists</span>';
  wrap.appendChild(hdr);
  var scroll=document.createElement('div');scroll.className='ts';
  var tbl=document.createElement('table');tbl.className='ct';
  var thead=document.createElement('thead'),hr=document.createElement('tr');
  council.forEach(function(p,i){
    var c=CV[i%CV.length],th=document.createElement('th');th.className='pt';th.style.borderBottomColor=c.bg;
    var ini=p.avatar_initials||(p.name||'?').split(' ').map(function(w){return w[0]}).join('').slice(0,2).toUpperCase();
    th.innerHTML='<div class="ph"><div class="pav" style="background:'+c.dk+';color:'+c.li+';border:1.5px solid '+c.bg+'">'+ini+'</div><div><div class="pnm">'+h(p.name)+'</div><div class="pti">'+h(p.title)+'</div></div></div><span class="ptr" style="color:'+c.li+';border-color:'+c.bg+'40;background:'+c.dk+'">'+h(p.intellectual_tradition)+'</span><div class="pbias">Bias: '+h(p.known_bias)+'</div>';
    hr.appendChild(th);
  });
  thead.appendChild(hr);tbl.appendChild(thead);
  var tbody=document.createElement('tbody'),rr=document.createElement('tr');
  responses.forEach(function(r,i){
    var c=CV[i%CV.length],td=document.createElement('td');td.className='rtd';td.style.borderLeftColor=c.bg;
    td.innerHTML='<div class="rtx"><p>'+h(r).replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>')+'</p></div>';
    rr.appendChild(td);
  });
  tbody.appendChild(rr);tbl.appendChild(tbody);scroll.appendChild(tbl);wrap.appendChild(scroll);return wrap;
}
function mkSynth(syn){
  var wrap=document.createElement('div');wrap.className='sw fi';
  wrap.appendChild(mkCard('&#9670;','rgba(201,164,74,.15)','var(--gold)','Council Summary','Agreements, tensions & positions',function(b){
    var d=document.createElement('div');d.className='ssum';
    d.innerHTML=(syn.summary||'').split('\n\n').filter(Boolean).map(function(p){return '<p>'+h(p)+'</p>'}).join('');b.appendChild(d);
  }));
  var fw=syn.decision_framework||{};
  wrap.appendChild(mkCard('&#9671;','rgba(74,139,201,.12)','#4a8bc9','Decision Framework','Questions, evidence & red flags',function(b){
    [{l:'Critical Questions',it:fw.key_questions},{l:'Evidence That Would Shift Views',it:fw.evidence_that_would_change_views},{l:'Red Flags',it:fw.red_flags}].forEach(function(s){
      if(!s.it||!s.it.length)return;
      var sec=document.createElement('div');sec.className='fwsec';sec.innerHTML='<div class="fwlbl">'+h(s.l)+'</div>';
      var ul=document.createElement('ul');ul.className='fwlist';
      s.it.forEach(function(it){var li=document.createElement('li');li.textContent=it;ul.appendChild(li)});
      sec.appendChild(ul);b.appendChild(sec);
    });
  }));
  wrap.appendChild(mkCard('?','rgba(122,74,201,.12)','#7a4ac9','Open Questions','What remains unresolved & why',function(b){
    var d=document.createElement('div');d.className='oqs';
    (syn.open_questions||[]).forEach(function(oq,i){
      var it=document.createElement('div');it.className='oqi';
      it.innerHTML='<div class="oqn">QUESTION '+(i+1)+'</div><div class="oqq">'+h(oq.question)+'</div><div class="oqw">'+h(oq.why_unresolved)+'</div>';
      d.appendChild(it);
    });b.appendChild(d);
  }));
  return wrap;
}
function mkCard(icon,ibg,ic,title,sub,fn){
  var card=document.createElement('div');card.className='scard';
  var hdr=document.createElement('div');hdr.className='scardh';
  hdr.innerHTML='<div class="sico" style="background:'+ibg+';color:'+ic+'">'+icon+'</div><span class="stitle">'+title+'</span><span class="ssub">'+sub+'</span><svg class="schev o" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="18 15 12 9 6 15"/></svg>';
  var body=document.createElement('div');body.className='scardb o';fn(body);
  hdr.addEventListener('click',function(){body.classList.toggle('o');hdr.querySelector('.schev').classList.toggle('o')});
  card.appendChild(hdr);card.appendChild(body);return card;
}
async function loadHist(){
  try{var r=await fetch('/api/history',{credentials:'same-origin'});var d=await r.json();
    var list=document.getElementById('chl');
    if(d.chats&&d.chats.length)list.innerHTML=d.chats.map(function(c){return '<div class="sci'+(c.id===cid?' a':'')+'" onclick="loadChat(\''+c.id+'\')"><div class="sci-t">'+h(c.first_question||'Session')+'</div><div class="sci-d">'+new Date(c.created_at).toLocaleDateString()+'</div></div>'}).join('');
  }catch(x){}
}
async function loadChat(chatId){
  try{var r=await fetch('/api/history?chatId='+chatId,{credentials:'same-origin'});var d=await r.json();
    if(d&&d.messages&&d.messages.length){
      cid=chatId;hist=d.messages.map(function(m){return{question:m.question,responses:m.responses}});
      var msgs=document.getElementById('msgs');msgs.innerHTML='';
      d.messages.forEach(function(m){
        var mb=document.createElement('div');mb.className='mb fi';
        var um=document.createElement('div');um.className='um';um.textContent=m.question;mb.appendChild(um);
        if(m.council&&m.responses)mb.appendChild(mkTable(m.council,m.responses));
        if(m.synthesis)mb.appendChild(mkSynth(m.synthesis));msgs.appendChild(mb);
      });
      var lq=d.messages[d.messages.length-1].question;
      document.getElementById('htt').textContent=lq.slice(0,50)+(lq.length>50?'...':'');
      document.getElementById('cbadge').style.display='';stob();
      document.querySelectorAll('.sci').forEach(function(el){el.classList.toggle('a',el.getAttribute('onclick')&&el.getAttribute('onclick').indexOf(chatId)>-1)});
    }
  }catch(x){console.error(x)}
}
init();
</script>
</body>
</html>`;

// ================================================================
// ES MODULE EXPORT — Required for Cloudflare Pages _worker.js
// ================================================================
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/auth/login')    return onLogin(request, env);
    if (path === '/api/auth/callback') return onCallback(request, env);
    if (path === '/api/auth/logout')   return onLogout(request, env);
    if (path === '/api/session')       return onSession(request, env);
    if (path === '/api/chat')          return onChat(request, env);
    if (path === '/api/history')       return onHistory(request, env);

    return new Response(HTML, {
      headers: {
        'Content-Type': 'text/html; charset=UTF-8',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      }
    });
  }
};
