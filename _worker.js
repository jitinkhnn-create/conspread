// ================================================================
// CONSPREAD — _worker.js (API only)
// Cloudflare Pages serves index.html as static.
// Worker handles /api/* routes only.
// ================================================================

const SAFE_AI = `You must always: be accurate and honest, acknowledge uncertainty,
distinguish facts from opinions, avoid harmful content, and not fabricate information.`;

// ---- Prompts ----
function councilPrompt(topic) {
  return `${SAFE_AI}

You are assembling a critical thinking council. For the topic below, select EXACTLY 8 specialists
whose perspectives create maximum intellectual friction — genuine disagreements on fundamental assumptions.

TOPIC: "${topic}"

Rules:
1. Include at least one contrarian/devil's advocate voice
2. Cover at least 4 different epistemic styles
3. Select for genuine disciplinary diversity
4. Each persona must have fundamentally different assumptions

For EACH of the 8 personas return:
- id: snake_case unique
- name: realistic full name
- title: professional title
- intellectual_tradition: named school of thought
- epistemology: one sentence on how they determine truth
- core_commitment: one non-negotiable belief
- friction_with: array of 2-3 reasoning types they challenge
- forbidden_rhetoric: array of 3 phrases they never use
- vocabulary_register: one of "highly_technical"|"accessible_academic"|"philosophical"|"empirical_quantitative"|"narrative_qualitative"|"policy_pragmatic"
- known_bias: honest blind spot
- signature_approach: how they structure arguments
- avatar_initials: 2 capital letters

Return ONLY valid JSON array of exactly 8 objects. No markdown, no explanation.`;
}

function personaPrompt(persona, allPersonas) {
  var others = allPersonas.filter(p => p.id !== persona.id).map(p => `${p.name} (${p.title})`).join(', ');
  return `${SAFE_AI}

You ARE ${persona.name}, ${persona.title}.

YOUR IDENTITY:
- Tradition: ${persona.intellectual_tradition}
- Epistemology: ${persona.epistemology}
- Core belief (NON-NEGOTIABLE): ${persona.core_commitment}
- Known bias: ${persona.known_bias}
- How you argue: ${persona.signature_approach}

STRICT RULES:
1. Challenge these types of reasoning: ${Array.isArray(persona.friction_with) ? persona.friction_with.join(', ') : persona.friction_with}
2. Never say: ${Array.isArray(persona.forbidden_rhetoric) ? persona.forbidden_rhetoric.join(' | ') : persona.forbidden_rhetoric}
3. Write in ${persona.vocabulary_register} style
4. Do NOT start by agreeing with others — find friction immediately
5. Use plain, direct English. Maximum 3 short paragraphs. No jargon.
6. Be concrete — use real examples, not abstractions
7. Argue as yourself: your vocabulary, your blind spots

Other council members (you respond INDEPENDENTLY, do not reference them): ${others}

Respond in 150-200 words. Lead with your sharpest insight. No filler.`;
}

function synthesisPrompt(question, personas, responses) {
  var blocks = personas.map((p, i) => `[${p.name}, ${p.title}]:\n${responses[i]}`).join('\n\n---\n\n');
  return `${SAFE_AI}

Synthesize this council debate WITHOUT forcing consensus. Write in plain English.

QUESTION: "${question}"

COUNCIL RESPONSES:
${blocks}

Return ONLY this JSON (no markdown):
{
  "summary": "3-4 paragraphs covering the genuine disagreements, what each side gets right, and what remains unresolved. Plain English.",
  "decision_framework": {
    "key_questions": ["3-5 questions someone must answer before deciding"],
    "evidence_that_would_change_views": ["what each perspective would need to see"],
    "red_flags": ["3-4 warning signs to watch for"]
  },
  "open_questions": [
    {"question": "unresolved question", "why_unresolved": "specific reason this cannot be settled yet"}
  ]
}`;
}

function normalSystemPrompt() {
  return `You are Conspread, a helpful and thoughtful assistant.

Your style:
- Plain, direct English. No jargon or academic language.
- Short paragraphs. Get to the point quickly.
- Be honest about uncertainty. Say "I don't know" when appropriate.
- Be constructive — give actionable insight, not just analysis.
- Friendly but not sycophantic. Don't pad responses.

${SAFE_AI}`;
}

// ---- Default council (8 fallback personas) ----
function defaultCouncil() {
  return [
    { id:"empiricist", name:"Dr. Sarah Chen", title:"Empirical Research Scientist", intellectual_tradition:"Scientific empiricism", epistemology:"Claims require reproducible evidence. If it can't be tested, it's not knowledge.", core_commitment:"Data overrides intuition every time.", friction_with:["appeals to authority","unfalsifiable claims","anecdotal evidence"], forbidden_rhetoric:["I feel","obviously","everyone knows"], vocabulary_register:"empirical_quantitative", known_bias:"Undervalues qualitative and lived experience.", signature_approach:"States the evidence first, then its limits.", avatar_initials:"SC" },
    { id:"philosopher", name:"Prof. Marcus Webb", title:"Philosopher of Knowledge", intellectual_tradition:"Critical rationalism", epistemology:"All knowledge is provisional — we advance by eliminating error, not accumulating truth.", core_commitment:"Every claim must be falsifiable or it's not knowledge.", friction_with:["naive empiricism","dogmatic certainty","instrumental reasoning"], forbidden_rhetoric:["the data clearly shows","at the end of the day","practically speaking"], vocabulary_register:"philosophical", known_bias:"Over-complicates questions that have clear practical answers.", signature_approach:"Exposes hidden assumptions in the question before answering.", avatar_initials:"MW" },
    { id:"pragmatist", name:"Dr. James Okafor", title:"Applied Policy Researcher", intellectual_tradition:"Pragmatic institutionalism", epistemology:"Truth is what works within real institutional constraints.", core_commitment:"Abstract principles must survive contact with messy reality.", friction_with:["purely theoretical approaches","ignoring incentive structures","ahistorical analysis"], forbidden_rhetoric:["in theory","if people were rational","the research clearly shows"], vocabulary_register:"policy_pragmatic", known_bias:"Too accommodating of existing power structures.", signature_approach:"Leads with institutional context, then what's actually achievable.", avatar_initials:"JO" },
    { id:"contrarian", name:"Dr. Nina Vasquez", title:"Heterodox Economist & Contrarian", intellectual_tradition:"Austrian economics with contrarian methodology", epistemology:"Consensus is often wrong. The most important truths are unpopular.", core_commitment:"Mainstream thinking systematically produces blind spots.", friction_with:["consensus views","institutional authority","incremental thinking"], forbidden_rhetoric:["experts agree","the evidence is clear","we should trust"], vocabulary_register:"accessible_academic", known_bias:"Contrarianism for its own sake, can miss legitimate consensus.", signature_approach:"Leads with what everyone is getting wrong.", avatar_initials:"NV" },
    { id:"systems_thinker", name:"Dr. Amir Patel", title:"Complex Systems Scientist", intellectual_tradition:"Systems theory and complexity science", epistemology:"Individual components only make sense in relation to the whole system.", core_commitment:"Everything is connected. Linear cause-effect is almost always wrong.", friction_with:["reductionist thinking","single-cause explanations","ignoring feedback loops"], forbidden_rhetoric:["the cause is","simple solution","independently of"], vocabulary_register:"highly_technical", known_bias:"Can make everything seem too complex to act on.", signature_approach:"Maps the system's feedback loops before proposing anything.", avatar_initials:"AP" },
    { id:"ethicist", name:"Prof. Grace Ndlovu", title:"Applied Ethicist & Humanist", intellectual_tradition:"Capabilities approach to human flourishing", epistemology:"What matters is human dignity and the conditions for people to live full lives.", core_commitment:"No technical or economic solution that harms vulnerable people is actually a solution.", friction_with:["purely technical solutions","economic reductionism","treating people as means"], forbidden_rhetoric:["efficiency demands","that's just the market","growth will solve"], vocabulary_register:"narrative_qualitative", known_bias:"Can prioritise individual cases over systemic change.", signature_approach:"Starts with who is affected and how, then evaluates solutions.", avatar_initials:"GN" },
    { id:"economist", name:"Dr. Robert Klein", title:"Behavioural Economist", intellectual_tradition:"Behavioural and institutional economics", epistemology:"Human behaviour follows predictable patterns that rarely match rational-actor models.", core_commitment:"Incentives and cognitive biases shape outcomes more than values or intentions.", friction_with:["assuming rational actors","ignoring distributional effects","pure market solutions"], forbidden_rhetoric:["people will simply","we just need to change culture","if they understood"], vocabulary_register:"empirical_quantitative", known_bias:"Overestimates the predictability of social systems.", signature_approach:"Identifies the incentive structure, then predicts behaviour.", avatar_initials:"RK" },
    { id:"anthropologist", name:"Dr. Lena Hoffman", title:"Cultural Anthropologist", intellectual_tradition:"Interpretive anthropology and post-colonialism", epistemology:"Meaning is constructed culturally. Context is everything — universal claims are almost always parochial ones.", core_commitment:"No perspective is neutral. Power shapes what counts as knowledge.", friction_with:["universalist claims","techno-solutionism","ahistorical analysis"], forbidden_rhetoric:["naturally","human nature","objectively better"], vocabulary_register:"narrative_qualitative", known_bias:"Can relativise to the point of paralysis.", signature_approach:"Historicises the question, surfaces hidden cultural assumptions.", avatar_initials:"LH" }
  ];
}

// ---- HF API call ----
async function callHF(messages, token, model, opts) {
  opts = opts || {};
  var url = 'https://router.huggingface.co/v1/chat/completions';
  var res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      max_tokens: opts.max_tokens || 600,
      temperature: opts.temperature || 0.72,
      stream: false
    })
  });
  if (!res.ok) {
    var errText = await res.text();
    throw new Error('HF ' + res.status + ': ' + errText.slice(0, 300));
  }
  var d = await res.json();
  if (!d.choices || !d.choices[0]) throw new Error('Unexpected HF response: ' + JSON.stringify(d).slice(0, 200));
  return d.choices[0].message.content;
}

// ---- Council building ----
async function buildCouncil(topic, token, model) {
  try {
    var txt = await callHF([{ role:'user', content: councilPrompt(topic) }], token, model, { max_tokens:3500, temperature:0.85 });
    var clean = txt.replace(/```json[\s]*/g,'').replace(/```[\s]*/g,'').trim();
    // Handle array possibly wrapped in object
    if (clean.startsWith('{')) {
      var obj = JSON.parse(clean);
      clean = JSON.stringify(Object.values(obj)[0] || obj);
    }
    var arr = JSON.parse(clean);
    if (!Array.isArray(arr) || arr.length < 4) throw new Error('Need at least 4 personas, got ' + (arr ? arr.length : 0));
    // Pad to 8 if fewer returned
    while (arr.length < 8) arr.push(defaultCouncil()[arr.length]);
    return arr.slice(0, 8);
  } catch(e) {
    console.error('Council build failed:', e.message);
    return defaultCouncil();
  }
}

async function personaReply(persona, all, question, history, token, model) {
  var idx = all.findIndex(p => p.id === persona.id);
  var hist = (history || []).slice(-3).flatMap(h => {
    var pr = h.responses && h.responses[idx];
    return pr
      ? [{ role:'user', content: h.question }, { role:'assistant', content: pr }]
      : [{ role:'user', content: h.question }];
  });
  return callHF(
    [{ role:'system', content: personaPrompt(persona, all) }].concat(hist).concat([{ role:'user', content: question }]),
    token, model, { max_tokens: 400, temperature: 0.76 }
  );
}

async function buildSynthesis(question, council, responses, token, model) {
  try {
    var txt = await callHF([{ role:'user', content: synthesisPrompt(question, council, responses) }], token, model, { max_tokens:2000, temperature:0.62 });
    var clean = txt.replace(/```json[\s]*/g,'').replace(/```[\s]*/g,'').trim();
    return JSON.parse(clean);
  } catch(e) {
    return { summary: responses.join('\n\n'), decision_framework:{ key_questions:[], evidence_that_would_change_views:[], red_flags:[] }, open_questions:[] };
  }
}

async function normalReply(question, history, token, model) {
  var msgs = [{ role:'system', content: normalSystemPrompt() }];
  (history || []).slice(-6).forEach(h => {
    msgs.push({ role:'user', content: h.question });
    if (h.reply) msgs.push({ role:'assistant', content: h.reply });
  });
  msgs.push({ role:'user', content: question });
  return callHF(msgs, token, model, { max_tokens:800, temperature:0.70 });
}

// ---- Session helpers ----
async function mkSid() {
  var a = new Uint8Array(32); crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2,'0')).join('');
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
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type':'application/json' }
  });
}

// ---- Route handlers ----
async function onLogin(req, env) {
  var p = new URLSearchParams({ client_id:env.HF_CLIENT_ID, redirect_uri:env.REDIRECT_URI, response_type:'code', scope:'openid profile inference-api', state:crypto.randomUUID() });
  return Response.redirect('https://huggingface.co/oauth/authorize?' + p.toString(), 302);
}

async function onCallback(req, env) {
  var code = new URL(req.url).searchParams.get('code');
  if (!code) return Response.redirect(env.APP_URL + '?err=nocode', 302);
  var tr = await fetch('https://huggingface.co/oauth/token', {
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body: new URLSearchParams({ grant_type:'authorization_code', code, redirect_uri:env.REDIRECT_URI, client_id:env.HF_CLIENT_ID, client_secret:env.HF_CLIENT_SECRET })
  });
  if (!tr.ok) return Response.redirect(env.APP_URL + '?err=token', 302);
  var td = await tr.json();
  if (!td.access_token) return Response.redirect(env.APP_URL + '?err=notoken', 302);
  var ui = await (await fetch('https://huggingface.co/oauth/userinfo', { headers:{'Authorization':'Bearer ' + td.access_token} })).json();
  var sid = await mkSid();
  await env.SESSIONS.put(sid, JSON.stringify({ hf_token:td.access_token, user:{ id:ui.sub, name:ui.name||ui.preferred_username, username:ui.preferred_username }, created_at:Date.now(), expires_at:Date.now()+86400000 }), { expirationTtl:86400 });
  return new Response(null, { status:302, headers:{ 'Location':env.APP_URL, 'Set-Cookie':'session='+sid+'; HttpOnly; Secure; SameSite=Strict; Max-Age=86400; Path=/' } });
}

async function onLogout(req, env) {
  var sid = getSid(req);
  if (sid) try { await env.SESSIONS.delete(sid); } catch(e) {}
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
  var { question, chatId, history, mode } = body;
  if (!question || !question.trim()) return jres({ error:'Question required' }, 400);
  if (question.length > 2000) return jres({ error:'Too long — max 2000 chars' }, 400);
  var model = env.HF_MODEL || 'Qwen/Qwen2.5-72B-Instruct';
  try {
    var cid = chatId || crypto.randomUUID();
    var key = 'chat:' + s.user.id + ':' + cid;
    var cd;
    try { var ex = await env.CHATS.get(key); cd = ex ? JSON.parse(ex) : { messages:[], created_at:Date.now(), first_question:question, mode: mode||'council' }; }
    catch(e) { cd = { messages:[], created_at:Date.now(), first_question:question, mode: mode||'council' }; }

    if (mode === 'normal') {
      var reply = await normalReply(question, history, s.hf_token, model);
      cd.messages.push({ id:crypto.randomUUID(), question, reply, mode:'normal', timestamp:Date.now() });
      await env.CHATS.put(key, JSON.stringify(cd), { expirationTtl:604800, metadata:{ first_question:question.slice(0,100), created_at:cd.created_at, mode:'normal' } });
      return jres({ chatId:cid, reply });
    } else {
      var council = await buildCouncil(question.trim(), s.hf_token, model);
      var responses = await Promise.all(council.map(p => personaReply(p, council, question, history, s.hf_token, model)));
      var synthesis = await buildSynthesis(question, council, responses, s.hf_token, model);
      cd.messages.push({ id:crypto.randomUUID(), question, council, responses, synthesis, mode:'council', timestamp:Date.now() });
      await env.CHATS.put(key, JSON.stringify(cd), { expirationTtl:604800, metadata:{ first_question:question.slice(0,100), created_at:cd.created_at, mode:'council' } });
      return jres({ chatId:cid, council, responses, synthesis });
    }
  } catch(err) { return jres({ error: err.message || 'Processing failed' }, 500); }
}

async function onImage(req, env) {
  if (req.method !== 'POST') return jres({ error:'Method not allowed' }, 405);
  var s = await getSession(req, env);
  if (!s) return jres({ error:'Unauthorized' }, 401);
  var body;
  try { body = await req.json(); } catch(e) { return jres({ error:'Invalid JSON' }, 400); }
  var { prompt } = body;
  if (!prompt) return jres({ error:'Prompt required' }, 400);
  try {
    var res = await fetch('https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + s.hf_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: prompt, parameters: { num_inference_steps: 4 } })
    });
    if (!res.ok) {
      var errText = await res.text();
      return jres({ error: 'Image generation failed: ' + errText.slice(0,200) }, 502);
    }
    var imgBuffer = await res.arrayBuffer();
    var ct = res.headers.get('content-type') || 'image/jpeg';
    return new Response(imgBuffer, { headers: { 'Content-Type': ct } });
  } catch(err) { return jres({ error: err.message }, 500); }
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
  try {
    var list = await env.CHATS.list({ prefix: 'chat:' + s.user.id + ':' });
    var chats = list.keys.map(k => ({
      id: k.name.split(':').slice(2).join(':'),
      first_question: (k.metadata && k.metadata.first_question) || 'Session',
      created_at: (k.metadata && k.metadata.created_at) || 0,
      mode: (k.metadata && k.metadata.mode) || 'council'
    })).sort((a,b) => b.created_at - a.created_at).slice(0, 30);
    return jres({ chats });
  } catch(e) { return jres({ chats:[] }); }
}

// ---- Main export ----
export default {
  async fetch(request, env) {
    var path = new URL(request.url).pathname;
    if (path === '/api/auth/login')    return onLogin(request, env);
    if (path === '/api/auth/callback') return onCallback(request, env);
    if (path === '/api/auth/logout')   return onLogout(request, env);
    if (path === '/api/session')       return onSession(request, env);
    if (path === '/api/chat')          return onChat(request, env);
    if (path === '/api/image')         return onImage(request, env);
    if (path === '/api/history')       return onHistory(request, env);
    return env.ASSETS.fetch(request);
  }
};
