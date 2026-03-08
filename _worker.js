// ================================================================
// KWEN COUNCIL — _worker.js (API only)
// Cloudflare Pages serves index.html as a static file.
// This worker ONLY handles /api/* routes.
// All other requests → env.ASSETS (static files)
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
  return SAFE_AI + '\n\nYou are a council assembler for a critical thinking research tool. Select 3-5 specialist personas whose perspectives create the MOST INTELLECTUALLY PRODUCTIVE FRICTION on this topic.\n\nTOPIC: "' + topic + '"\n\nRULES:\n1. Prioritize perspectives disagreeing on FUNDAMENTAL ASSUMPTIONS\n2. Include at least one heterodox/contrarian voice\n3. Cover at least 2 different epistemic styles\n4. Select for genuine disciplinary diversity\n\nFor EACH persona return:\n- id: snake_case\n- name: realistic full name\n- title: professional title\n- intellectual_tradition: named school of thought\n- epistemology: ONE sentence on how they determine truth\n- core_commitment: ONE non-negotiable belief creating friction\n- friction_with: array of 2-3 reasoning types they challenge\n- forbidden_rhetoric: array of 3-4 phrases they NEVER use\n- vocabulary_register: one of "highly_technical"|"accessible_academic"|"philosophical"|"empirical_quantitative"|"narrative_qualitative"|"policy_pragmatic"\n- known_bias: honest intellectual blind spot\n- signature_approach: how they structure arguments\n- avatar_initials: 2 capital letters\n\nReturn ONLY a valid JSON array. No markdown, no explanation.';
}

function personaPrompt(persona, allPersonas) {
  var others = allPersonas.filter(function(p){ return p.id !== persona.id; }).map(function(p){ return p.name + ' (' + p.title + ')'; }).join(', ');
  return SAFE_AI + '\n\nYou ARE ' + persona.name + ', ' + persona.title + '.\n\nIDENTITY:\n- Tradition: ' + persona.intellectual_tradition + '\n- Epistemology: ' + persona.epistemology + '\n- Core commitment (NON-NEGOTIABLE): ' + persona.core_commitment + '\n- Known bias: ' + persona.known_bias + '\n- Argument structure: ' + persona.signature_approach + '\n\nANTI-HOMOGENIZATION RULES:\n1. Push back against: ' + (Array.isArray(persona.friction_with) ? persona.friction_with.join(', ') : persona.friction_with) + '\n2. NEVER use: ' + (Array.isArray(persona.forbidden_rhetoric) ? persona.forbidden_rhetoric.join(' | ') : persona.forbidden_rhetoric) + '\n3. Write ONLY in ' + persona.vocabulary_register + ' register\n4. Do NOT open by validating other perspectives\n5. Find friction with the question\'s framing\n\nOther council members (you respond independently): ' + others + '\n\nRESPONSE: 150-220 words. Lead with strongest insight. No padding.';
}

function synthesisPrompt(question, personas, responses) {
  var blocks = personas.map(function(p, i){ return '[' + p.name + ', ' + p.title + ']:\n' + responses[i]; }).join('\n\n---\n\n');
  return SAFE_AI + '\n\nSynthesize WITHOUT forcing consensus.\n\nQUESTION: "' + question + '"\n\nCOUNCIL:\n' + blocks + '\n\nReturn ONLY this JSON (no markdown fences):\n{"summary":"3-4 paragraphs on genuine disagreements","decision_framework":{"key_questions":["3-5 questions"],"evidence_that_would_change_views":["per perspective"],"red_flags":["3-4 warnings"]},"open_questions":[{"question":"unresolved","why_unresolved":"specific reason"}]}';
}

function defaultCouncil() {
  return [
    { id:"empirical_scientist", name:"Dr. Morgan Wells", title:"Empirical Research Scientist", intellectual_tradition:"Scientific empiricism", epistemology:"Knowledge is validated only through reproducible evidence and falsifiable hypotheses.", core_commitment:"Claims require evidence proportional to their extraordinary nature.", friction_with:["appeals to authority without data","unfalsifiable claims","confusing correlation with causation"], forbidden_rhetoric:["I feel","obviously","everyone knows","intuitively speaking"], vocabulary_register:"empirical_quantitative", known_bias:"Systematically undervalues qualitative and experiential knowledge.", signature_approach:"Leads with evidence, then states what it cannot tell us.", avatar_initials:"MW" },
    { id:"critical_philosopher", name:"Prof. Aria Chen", title:"Philosopher of Knowledge", intellectual_tradition:"Critical rationalism with post-structural influences", epistemology:"Understanding requires examining power structures embedded in the question itself.", core_commitment:"Every framework contains hidden normative commitments that must be surfaced.", friction_with:["naive empiricism","instrumental reasoning","false value-neutrality"], forbidden_rhetoric:["the data shows","practically speaking","at the end of the day","common sense"], vocabulary_register:"philosophical", known_bias:"Can over-complicate questions that have clear practical answers.", signature_approach:"Historicises and deconstructs the question before answering.", avatar_initials:"AC" },
    { id:"policy_pragmatist", name:"Dr. James Okafor", title:"Applied Policy Researcher", intellectual_tradition:"Pragmatic institutionalism", epistemology:"Truth is what produces workable outcomes within real constraints of institutions.", core_commitment:"Abstract principles must survive contact with institutional realities.", friction_with:["purely theoretical approaches","solutions ignoring incentive structures","ahistorical analysis"], forbidden_rhetoric:["in theory","ideally","if people were rational","the research clearly shows"], vocabulary_register:"policy_pragmatic", known_bias:"Can be overly accommodating of existing power structures.", signature_approach:"Leads with institutional context, then evaluates what is achievable.", avatar_initials:"JO" }
  ];
}

async function callQwen(messages, token, model, opts) {
  opts = opts || {};
  var res = await fetch('https://api-inference.huggingface.co/models/' + model + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model, messages: messages, max_tokens: opts.max_tokens || 600, temperature: opts.temperature || 0.72, stream: false })
  });
  if (!res.ok) throw new Error('HF ' + res.status + ': ' + (await res.text()).slice(0, 200));
  var d = await res.json();
  if (!d.choices || !d.choices[0]) throw new Error('Unexpected HF response');
  return d.choices[0].message.content;
}

async function buildCouncil(topic, token, model) {
  try {
    var txt = await callQwen([{ role:'user', content:councilPrompt(topic) }], token, model, { max_tokens:2500, temperature:0.88 });
    var clean = txt.replace(/```json\s?/g,'').replace(/```\s?/g,'').trim();
    var arr = JSON.parse(clean);
    if (!Array.isArray(arr) || arr.length < 2) throw new Error('bad format');
    return arr.slice(0, 5);
  } catch(e) { return defaultCouncil(); }
}

async function personaReply(persona, all, question, history, token, model) {
  var idx = all.findIndex(function(p){ return p.id === persona.id; });
  var hist = (history || []).slice(-3).flatMap(function(h) {
    var pr = h.responses && h.responses[idx];
    return pr ? [{ role:'user', content:h.question }, { role:'assistant', content:pr }] : [{ role:'user', content:h.question }];
  });
  return callQwen([{ role:'system', content:personaPrompt(persona, all) }].concat(hist).concat([{ role:'user', content:question }]), token, model, { max_tokens:450, temperature:0.74 });
}

async function buildSynthesis(question, council, responses, token, model) {
  try {
    var txt = await callQwen([{ role:'user', content:synthesisPrompt(question, council, responses) }], token, model, { max_tokens:1800, temperature:0.62 });
    var clean = txt.replace(/```json\s?/g,'').replace(/```\s?/g,'').trim();
    return JSON.parse(clean);
  } catch(e) {
    return { summary: responses.join('\n\n'), decision_framework: { key_questions:[], evidence_that_would_change_views:[], red_flags:[] }, open_questions:[] };
  }
}

async function mkSid() {
  var a = new Uint8Array(32); crypto.getRandomValues(a);
  return Array.from(a, function(b){ return b.toString(16).padStart(2,'0'); }).join('');
}

function getSid(req) {
  var m = (req.headers.get('Cookie') || '').match(/(?:^|;\s*)session=([^;]+)/);
  return m ? m[1] : null;
}

async function getSession(req, env) {
  var sid = getSid(req);
  if (!sid) return null;
  try {
    var raw = await env.SESSIONS.get(sid);
    if (!raw) return null;
    var s = JSON.parse(raw);
    if (s.expires_at < Date.now()) { await env.SESSIONS.delete(sid); return null; }
    return s;
  } catch(e) { return null; }
}

function jres(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { 'Content-Type':'application/json' } });
}

async function onLogin(req, env) {
  var p = new URLSearchParams({ client_id:env.HF_CLIENT_ID, redirect_uri:env.REDIRECT_URI, response_type:'code', scope:'openid profile inference-api', state:crypto.randomUUID() });
  return Response.redirect('https://huggingface.co/oauth/authorize?' + p.toString(), 302);
}

async function onCallback(req, env) {
  var code = new URL(req.url).searchParams.get('code');
  if (!code) return Response.redirect(env.APP_URL + '?err=nocode', 302);
  var tr = await fetch('https://huggingface.co/oauth/token', {
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body: new URLSearchParams({ grant_type:'authorization_code', code:code, redirect_uri:env.REDIRECT_URI, client_id:env.HF_CLIENT_ID, client_secret:env.HF_CLIENT_SECRET })
  });
  if (!tr.ok) return Response.redirect(env.APP_URL + '?err=token', 302);
  var td = await tr.json();
  if (!td.access_token) return Response.redirect(env.APP_URL + '?err=notoken', 302);
  var ur = await fetch('https://huggingface.co/oauth/userinfo', { headers:{'Authorization':'Bearer ' + td.access_token} });
  var ui = await ur.json();
  var sid = await mkSid();
  await env.SESSIONS.put(sid, JSON.stringify({ hf_token:td.access_token, user:{ id:ui.sub, name:ui.name||ui.preferred_username, username:ui.preferred_username }, created_at:Date.now(), expires_at:Date.now()+86400000 }), { expirationTtl:86400 });
  return new Response(null, { status:302, headers:{ 'Location':env.APP_URL, 'Set-Cookie':'session='+sid+'; HttpOnly; Secure; SameSite=Strict; Max-Age=86400; Path=/' } });
}

async function onLogout(req, env) {
  var sid = getSid(req);
  if (sid) { try { await env.SESSIONS.delete(sid); } catch(e){} }
  return new Response(null, { status:302, headers:{ 'Location':env.APP_URL, 'Set-Cookie':'session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/' } });
}

async function onSession(req, env) {
  var s = await getSession(req, env);
  return s ? jres({ authenticated:true, user:s.user }) : jres({ authenticated:false });
}

async function onChat(req, env) {
  if (req.method !== 'POST') return jres({ error:'Method not allowed' }, 405);
  var s = await getSession(req, env);
  if (!s) return jres({ error:'Unauthorized' }, 401);
  var body;
  try { body = await req.json(); } catch(e) { return jres({ error:'Invalid JSON' }, 400); }
  var question = body.question, chatId = body.chatId, history = body.history;
  if (!question || !question.trim()) return jres({ error:'Question required' }, 400);
  if (question.length > 2000) return jres({ error:'Too long' }, 400);
  var model = env.HF_MODEL || 'Qwen/Qwen2.5-72B-Instruct';
  try {
    var council = await buildCouncil(question.trim(), s.hf_token, model);
    var responses = await Promise.all(council.map(function(p){ return personaReply(p, council, question, history, s.hf_token, model); }));
    var synthesis = await buildSynthesis(question, council, responses, s.hf_token, model);
    var cid = chatId || crypto.randomUUID();
    var key = 'chat:' + s.user.id + ':' + cid;
    var cd;
    try { var ex = await env.CHATS.get(key); cd = ex ? JSON.parse(ex) : { messages:[], created_at:Date.now(), first_question:question }; }
    catch(e) { cd = { messages:[], created_at:Date.now(), first_question:question }; }
    cd.messages.push({ id:crypto.randomUUID(), question:question, council:council, responses:responses, synthesis:synthesis, timestamp:Date.now() });
    await env.CHATS.put(key, JSON.stringify(cd), { expirationTtl:604800 });
    return jres({ chatId:cid, council:council, responses:responses, synthesis:synthesis });
  } catch(err) { return jres({ error:err.message||'Processing failed' }, 500); }
}

async function onHistory(req, env) {
  var s = await getSession(req, env);
  if (!s) return jres({ error:'Unauthorized' }, 401);
  var chatId = new URL(req.url).searchParams.get('chatId');
  if (chatId) {
    try {
      var raw = await env.CHATS.get('chat:' + s.user.id + ':' + chatId);
      return raw ? new Response(raw, { headers:{'Content-Type':'application/json'} }) : jres({ messages:[] });
    } catch(e) { return jres({ messages:[] }); }
  }
  return jres({ chats:[] });
}

export default {
  async fetch(request, env) {
    var path = new URL(request.url).pathname;
    if (path === '/api/auth/login')    return onLogin(request, env);
    if (path === '/api/auth/callback') return onCallback(request, env);
    if (path === '/api/auth/logout')   return onLogout(request, env);
    if (path === '/api/session')       return onSession(request, env);
    if (path === '/api/chat')          return onChat(request, env);
    if (path === '/api/history')       return onHistory(request, env);
    // All non-API requests → serve static files (index.html etc.)
    return env.ASSETS.fetch(request);
  }
};
