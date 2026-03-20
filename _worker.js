// ================================================================
// CONSPREAD — _worker.js (API only)
// Cloudflare Pages serves index.html as static.
// Worker handles /api/* routes only.
// ================================================================

const SAFE_AI = `You must always: be accurate and honest, acknowledge uncertainty,
distinguish facts from opinions, avoid harmful content, and not fabricate information.`;

function councilPrompt(topic, targetCount, history) {
  var prior = (history || []).slice(-3).map(function(h, i) {
    return (i + 1) + '. ' + (h && h.question ? h.question : '');
  }).join('\n');
  return SAFE_AI + `

You are assembling a critical thinking council. For the topic below, select EXACTLY ${targetCount} specialists
whose perspectives create maximum intellectual friction.

TOPIC: "${topic}"
RECENT CONVERSATION CONTEXT:
${prior || 'none'}

Rules:
1. Include at least one contrarian/devil's advocate
2. Cover at least 4 different epistemic styles
3. Select for genuine disciplinary diversity
4. Each persona must have fundamentally different assumptions from the others

For EACH persona return:
- id: snake_case unique identifier
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

Return ONLY a valid JSON array of exactly ${targetCount} objects. No markdown, no explanation.`;
}

function personaPrompt(persona, allPersonas) {
  var others = allPersonas
    .filter(function(p) { return p.id !== persona.id; })
    .map(function(p) { return p.name + ' (' + p.title + ')'; })
    .join(', ');
  return SAFE_AI + `

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
4. Do NOT start by agreeing with the question framing - find friction immediately
5. Use plain, direct English. Maximum 3 short paragraphs. No jargon.
6. Be concrete - use real examples, not abstractions
7. Argue as yourself: your vocabulary, your blind spots included

Other council members (you respond INDEPENDENTLY): ${others}

Respond in this exact JSON shape and nothing else:
{"answer":"150-200 words. Lead with your sharpest insight. No filler.","assumptions":["3-5 concise assumptions this answer relies on"]}`;
}

function synthesisPrompt(question, personas, responses) {
  var blocks = personas.map(function(p, i) {
    var r = responses[i] || {};
    var assumptions = Array.isArray(r.assumptions) && r.assumptions.length
      ? '\nAssumptions: ' + r.assumptions.join('; ')
      : '';
    return '[' + p.name + ', ' + p.title + ']:\n' + responseText(r) + assumptions;
  }).join('\n\n---\n\n');
  return SAFE_AI + `

Synthesize this council debate WITHOUT forcing consensus. Write in plain English.

QUESTION: "${question}"

COUNCIL RESPONSES:
${blocks}

Return ONLY this JSON (no markdown fences):
{"summary":"3-4 paragraphs covering genuine disagreements and what remains unresolved. Plain English.","decision_framework":{"key_questions":["3-5 questions someone must answer before deciding"],"evidence_that_would_change_views":["what each perspective would need to see"],"red_flags":["3-4 warning signs"]},"open_questions":[{"question":"unresolved question","why_unresolved":"specific reason"}]}`;
}

function normalSystemPrompt() {
  return `You are Conspread, a helpful and thoughtful assistant.

Style rules:
- Plain, direct English. No jargon.
- Short paragraphs. Get to the point quickly.
- Be honest about uncertainty.
- Be constructive and give actionable insight.
- Friendly but not sycophantic.

${SAFE_AI}`;
}

function makeFallbackPersona(topic, idx) {
  var n = idx + 1;
  var tag = String(topic || 'Topic').trim().slice(0, 24) || 'Topic';
  return {
    id: 'perspective_' + n,
    name: 'Perspective ' + n + ' (' + tag + ')',
    title: 'Independent Council Analyst',
    intellectual_tradition: 'Interdisciplinary critical analysis',
    epistemology: 'Combines evidence, logic, and context while exposing uncertainty.',
    core_commitment: 'Decisions should be robust under uncertainty and trade-offs.',
    friction_with: ['single-cause explanations', 'unchecked assumptions', 'overconfidence'],
    forbidden_rhetoric: ['obviously', 'everyone knows', 'it is simple'],
    vocabulary_register: 'accessible_academic',
    known_bias: 'May over-emphasize uncertainty in ambiguous situations.',
    signature_approach: 'States assumptions first, then pressure-tests conclusions.',
    avatar_initials: 'P' + n
  };
}

function normalizeCouncil(council, count, topic) {
  var safeCount = Math.max(4, Math.min(10, count || 6));
  var out = [];
  (Array.isArray(council) ? council : []).forEach(function(p, idx) {
    if (!p || typeof p !== 'object' || out.length >= safeCount) return;
    var n = out.length + 1;
    out.push({
      id: (typeof p.id === 'string' && p.id.trim()) ? p.id.trim() : 'perspective_' + n,
      name: (typeof p.name === 'string' && p.name.trim()) ? p.name.trim() : ('Perspective ' + n),
      title: (typeof p.title === 'string' && p.title.trim()) ? p.title.trim() : 'Independent Council Analyst',
      intellectual_tradition: (typeof p.intellectual_tradition === 'string' && p.intellectual_tradition.trim()) ? p.intellectual_tradition.trim() : 'Interdisciplinary critical analysis',
      epistemology: (typeof p.epistemology === 'string' && p.epistemology.trim()) ? p.epistemology.trim() : 'Uses evidence and reasoning with explicit uncertainty.',
      core_commitment: (typeof p.core_commitment === 'string' && p.core_commitment.trim()) ? p.core_commitment.trim() : 'Avoid brittle conclusions.',
      friction_with: Array.isArray(p.friction_with) && p.friction_with.length ? p.friction_with.slice(0, 3) : ['unchecked assumptions', 'single-cause thinking'],
      forbidden_rhetoric: Array.isArray(p.forbidden_rhetoric) && p.forbidden_rhetoric.length ? p.forbidden_rhetoric.slice(0, 3) : ['obviously', 'everyone knows', 'it is simple'],
      vocabulary_register: (typeof p.vocabulary_register === 'string' && p.vocabulary_register.trim()) ? p.vocabulary_register.trim() : 'accessible_academic',
      known_bias: (typeof p.known_bias === 'string' && p.known_bias.trim()) ? p.known_bias.trim() : 'May miss domain-specific nuance.',
      signature_approach: (typeof p.signature_approach === 'string' && p.signature_approach.trim()) ? p.signature_approach.trim() : 'Makes assumptions explicit, then tests implications.',
      avatar_initials: (typeof p.avatar_initials === 'string' && p.avatar_initials.trim()) ? p.avatar_initials.trim().slice(0, 2).toUpperCase() : ('P' + n)
    });
  });
  while (out.length < safeCount) out.push(makeFallbackPersona(topic, out.length));
  return out;
}

function chooseCouncilSize(question, history) {
  var text = ((question || '') + ' ' + (history || []).map(function(h) { return h && h.question ? h.question : ''; }).join(' ')).toLowerCase();
  var score = 0;
  if ((question || '').length > 140) score += 1;
  if ((history || []).length >= 2) score += 1;
  if ((history || []).length >= 5) score += 1;
  if (/(compare|versus|trade[\s-]?off|scenario|policy|ethical|ethics|regulation|strategy|system|geopolit|multi|stakeholder|uncertain|risk|long[-\s]?term)/.test(text)) score += 1;
  if (/(urgent|quick|brief|simple|eli5|in short|tl;dr)/.test(text)) score -= 1;
  if (score <= 0) return 4;
  if (score === 1) return 6;
  if (score === 2) return 8;
  return 10;
}

function responseText(r) {
  if (!r) return '';
  if (typeof r === 'string') return r;
  if (typeof r.answer === 'string') return r.answer;
  return '';
}

function normalizePersonaResponse(raw, persona) {
  if (raw && typeof raw === 'object' && typeof raw.answer === 'string') {
    var assumptions = Array.isArray(raw.assumptions) ? raw.assumptions.filter(function(a) { return typeof a === 'string' && a.trim(); }).slice(0, 5) : [];
    return { answer: raw.answer.trim(), assumptions: assumptions };
  }
  if (typeof raw !== 'string') {
    return fallbackPersonaReply(persona);
  }
  var clean = raw.replace(/```json\s*/g,'').replace(/```\s*/g,'').trim();
  try {
    var parsed = JSON.parse(clean);
    return normalizePersonaResponse(parsed, persona);
  } catch (e) {
    return { answer: clean, assumptions: [] };
  }
}

async function callHF(messages, token, model, opts) {
  opts = opts || {};
  var res = await fetch('https://router.huggingface.co/v1/chat/completions', {
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
  if (!d.choices || !d.choices[0]) throw new Error('Unexpected HF response');
  return d.choices[0].message.content;
}

async function buildCouncil(topic, history, token, model) {
  var targetCount = chooseCouncilSize(topic, history);
  try {
    var txt = await callHF([{ role:'user', content: councilPrompt(topic, targetCount, history) }], token, model, { max_tokens:2500, temperature:0.85 });
    var clean = txt.replace(/```json\s*/g,'').replace(/```\s*/g,'').trim();
    var arr = JSON.parse(clean);
    if (!Array.isArray(arr) || arr.length < 2) throw new Error('bad format');
    return normalizeCouncil(arr, targetCount, topic);
  } catch(e) {
    return normalizeCouncil([], targetCount, topic);
  }
}

async function personaReply(persona, all, question, history, token, model) {
  var idx = all.findIndex(function(p) { return p.id === persona.id; });
  var hist = (history || []).slice(-3).flatMap(function(h) {
    var pr = h.responses && h.responses[idx];
    var priorAnswer = responseText(pr);
    return pr
      ? [{ role:'user', content: h.question }, { role:'assistant', content: priorAnswer }]
      : [{ role:'user', content: h.question }];
  });
  var msgs = [{ role:'system', content: personaPrompt(persona, all) }]
    .concat(hist)
    .concat([{ role:'user', content: question }]);
  var raw = await callHF(msgs, token, model, { max_tokens: 420, temperature: 0.76 });
  return normalizePersonaResponse(raw, persona);
}

function isHF401(err) {
  return !!(err && typeof err.message === 'string' && err.message.startsWith('HF 401'));
}

function fallbackPersonaReply(persona) {
  var name = (persona && persona.name) ? persona.name : 'This council member';
  return {
    answer: name + ' could not submit a response due to a temporary inference issue. Treat this as missing input rather than agreement.',
    assumptions: ['Inference service returned an intermittent upstream failure for this perspective.']
  };
}

async function buildPersonaResponses(council, question, history, token, model) {
  var responses = [];
  // Limit concurrency to reduce 429/5xx bursts from upstream router.
  for (var i = 0; i < council.length; i += 3) {
    var chunk = council.slice(i, i + 3);
    var chunkResults = await Promise.all(chunk.map(async function(p) {
      try {
        return await personaReply(p, council, question, history, token, model);
      } catch (err) {
        if (isHF401(err)) throw err;
        return fallbackPersonaReply(p);
      }
    }));
    responses = responses.concat(chunkResults);
  }
  return responses;
}

async function buildSynthesis(question, council, responses, token, model) {
  try {
    var txt = await callHF([{ role:'user', content: synthesisPrompt(question, council, responses) }], token, model, { max_tokens:1500, temperature:0.62 });
    var clean = txt.replace(/```json\s*/g,'').replace(/```\s*/g,'').trim();
    return JSON.parse(clean);
  } catch(e) {
    return {
      summary: responses.map(function(r) { return responseText(r); }).join('\n\n'),
      decision_framework:{ key_questions:[], evidence_that_would_change_views:[], red_flags:[] },
      open_questions:[]
    };
  }
}

async function normalReply(question, history, token, model) {
  var msgs = [{ role:'system', content: normalSystemPrompt() }];
  (history || []).slice(-6).forEach(function(h) {
    msgs.push({ role:'user', content: h.question });
    if (h.reply) msgs.push({ role:'assistant', content: h.reply });
  });
  msgs.push({ role:'user', content: question });
  return callHF(msgs, token, model, { max_tokens:600, temperature:0.70 });
}

async function mkSid() {
  var a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return Array.from(a, function(b) { return b.toString(16).padStart(2,'0'); }).join('');
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

async function onLogin(req, env) {
  var p = new URLSearchParams({
    client_id: env.HF_CLIENT_ID, redirect_uri: env.REDIRECT_URI,
    response_type: 'code', scope: 'openid profile inference-api',
    state: crypto.randomUUID()
  });
  return Response.redirect('https://huggingface.co/oauth/authorize?' + p.toString(), 302);
}

async function onCallback(req, env) {
  var code = new URL(req.url).searchParams.get('code');
  if (!code) return Response.redirect(env.APP_URL + '?err=nocode', 302);
  var tr = await fetch('https://huggingface.co/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code: code,
      redirect_uri: env.REDIRECT_URI, client_id: env.HF_CLIENT_ID, client_secret: env.HF_CLIENT_SECRET
    })
  });
  if (!tr.ok) return Response.redirect(env.APP_URL + '?err=token', 302);
  var td = await tr.json();
  if (!td.access_token) return Response.redirect(env.APP_URL + '?err=notoken', 302);
  var ui = await (await fetch('https://huggingface.co/oauth/userinfo', {
    headers: { 'Authorization': 'Bearer ' + td.access_token }
  })).json();
  var sid = await mkSid();
  await env.SESSIONS.put(sid, JSON.stringify({
    hf_token: td.access_token,
    user: { id: ui.sub, name: ui.name || ui.preferred_username, username: ui.preferred_username },
    created_at: Date.now(), expires_at: Date.now() + 86400000
  }), { expirationTtl: 86400 });
  return new Response(null, { status: 302, headers: {
    'Location': env.APP_URL,
    'Set-Cookie': 'session=' + sid + '; HttpOnly; Secure; SameSite=Strict; Max-Age=86400; Path=/'
  }});
}

async function onLogout(req, env) {
  var sid = getSid(req);
  if (sid) try { await env.SESSIONS.delete(sid); } catch(e) {}
  return new Response(null, { status: 302, headers: {
    'Location': env.APP_URL,
    'Set-Cookie': 'session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/'
  }});
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
  var question = body.question, chatId = body.chatId, history = body.history, mode = body.mode, model = body.model;
  if (!question || !question.trim()) return jres({ error:'Question required' }, 400);
  if (question.length > 2000) return jres({ error:'Too long' }, 400);
  var defaultModel = env.HF_MODEL || 'Qwen/Qwen3-30B-A3B-Instruct-2507';
  var selectedModel = model || defaultModel;
  try {
    var cid = chatId || crypto.randomUUID();
    var key = 'chat:' + s.user.id + ':' + cid;
    var cd;
    try {
      var ex = await env.CHATS.get(key);
      cd = ex ? JSON.parse(ex) : { messages:[], created_at:Date.now(), first_question:question, mode: mode||'council' };
    } catch(e) {
      cd = { messages:[], created_at:Date.now(), first_question:question, mode: mode||'council' };
    }
    if (mode === 'normal') {
      var reply = await normalReply(question, history, s.hf_token, selectedModel);
      cd.messages.push({ id:crypto.randomUUID(), question:question, reply:reply, mode:'normal', timestamp:Date.now() });
      await env.CHATS.put(key, JSON.stringify(cd), { expirationTtl:604800,
        metadata: { first_question: question.slice(0,100), created_at: cd.created_at, mode:'normal' } });
      return jres({ chatId:cid, reply:reply });
    } else {
      var council = await buildCouncil(question.trim(), history, s.hf_token, selectedModel);
      var responses = await buildPersonaResponses(council, question, history, s.hf_token, selectedModel);
      var synthesis = await buildSynthesis(question, council, responses, s.hf_token, selectedModel);
      cd.messages.push({ id:crypto.randomUUID(), question:question, council:council, responses:responses, synthesis:synthesis, mode:'council', timestamp:Date.now() });
      await env.CHATS.put(key, JSON.stringify(cd), { expirationTtl:604800,
        metadata: { first_question: question.slice(0,100), created_at: cd.created_at, mode:'council' } });
      return jres({ chatId:cid, council:council, responses:responses, synthesis:synthesis });
    }
  } catch(err) {
    // If the Hugging Face token is invalid/expired, force a logout so the client can re-authenticate.
    if (isHF401(err)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': 'session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/'
        }
      });
    }
    return jres({ error: err.message || 'Processing failed' }, 500);
  }
}

async function onImage(req, env) {
  if (req.method !== 'POST') return jres({ error:'Method not allowed' }, 405);
  var s = await getSession(req, env);
  if (!s) return jres({ error:'Unauthorized' }, 401);
  var body;
  try { body = await req.json(); } catch(e) { return jres({ error:'Invalid JSON' }, 400); }
  if (!body.prompt) return jres({ error:'Prompt required' }, 400);
  try {
    var res = await fetch('https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + s.hf_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: body.prompt, parameters: { num_inference_steps: 4 } })
    });
    if (!res.ok) {
      var errText = await res.text();
      // Treat 401s as an authorization issue so the client can logout/relogin.
      if (res.status === 401) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': 'session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/'
          }
        });
      }
      return jres({ error: 'Image generation failed: ' + errText.slice(0,200) }, 502);
    }
    var imgBuffer = await res.arrayBuffer();
    return new Response(imgBuffer, { headers: { 'Content-Type': res.headers.get('content-type') || 'image/jpeg' } });
  } catch(err) {
    if (err && typeof err.message === 'string' && err.message.startsWith('HF 401')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': 'session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/'
        }
      });
    }
    return jres({ error: err.message }, 500);
  }
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
    var chats = list.keys.map(function(k) {
      return {
        id: k.name.split(':').slice(2).join(':'),
        first_question: (k.metadata && k.metadata.first_question) || 'Session',
        created_at: (k.metadata && k.metadata.created_at) || 0,
        mode: (k.metadata && k.metadata.mode) || 'council'
      };
    }).sort(function(a,b) { return b.created_at - a.created_at; }).slice(0, 30);
    return jres({ chats: chats });
  } catch(e) { return jres({ chats:[] }); }
}

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
