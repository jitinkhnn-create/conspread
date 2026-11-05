// ================================================================
// CONSPREAD — _worker.js (API only)
// Cloudflare Pages serves index.html as static.
// Worker handles /api/* routes only.
//
// REWRITTEN: single mode ('lens') with position-first critical
// thinking flow. Frontend builds the system prompt; worker passes
// it through. New action 'save_lens_session' persists the full
// completed session.
// ================================================================

const SAFE_AI = `You must always: be accurate and honest, acknowledge uncertainty,
distinguish facts from opinions, avoid harmful content, and not fabricate information.`;

// Gemini only. "-latest" aliases always point at Google's current Flash
// models, so they keep working when individual versions are retired.
const GEMINI_MODELS = [
  'gemini-flash-latest',
  'gemini-flash-lite-latest'
];

// ===================== LENS DEFINITIONS =====================
// Mirror of the frontend LENSES array. Used only as a server-side
// fallback if the frontend doesn't send a systemPrompt (it should).

const LENS_DEFS = {
  1: { q: 'The opposite view',
       instruction: 'Steelman the strongest argument against the user\'s stated position. Do not soften it. Quote back the user\'s own logic and show where it cracks under pressure. Stay direct. 100-140 words.' },
  2: { q: 'What you\'re assuming',
       instruction: 'Surface 3-4 specific unspoken assumptions baked into the user\'s position or the question itself. Number them. For each, name the assumption in one sentence, then say in one sentence what changes if it\'s wrong. 100-140 words.' },
  3: { q: 'Zoom in / zoom out',
       instruction: 'Show how this question looks at three scales: one individual, a group or community of ~100, and a country or larger. The right answer can flip between scales. Be concrete with examples at each scale. 100-140 words.' },
  4: { q: 'Who gains, who loses',
       instruction: 'List 2-3 groups who benefit if the user\'s position is adopted, and 2-3 who lose. Then do the same for the opposite. Be specific about real people, industries, or institutions. End with one line: which of these is loudest in public debate, and why. 100-140 words.' },
  5: { q: 'Has this happened before?',
       instruction: 'Name 1-2 real historical episodes where a similar question or pattern came up. Briefly: when, where, what happened, how it was resolved (or not). End with one line: which historical pattern this most resembles, and why that\'s worth knowing. 100-140 words.' },
  6: { q: '10 years from now',
       instruction: 'Project forward 10 years. Describe two plausible futures: one where the user\'s position turned out right, and one where it turned out wrong. Be specific about what would have had to be true in each case. End with: what to watch for now to tell which is happening. 100-140 words.' }
};

function buildLensSystemPromptServerFallback(lenses, position, conf, context) {
  var valid = (Array.isArray(lenses) ? lenses : [])
    .map(function(n) { return parseInt(n, 10); })
    .filter(function(n) { return LENS_DEFS[n]; });
  if (!valid.length) valid = [1];

  var tagBlock = valid.map(function(n) {
    return '[L' + n + ']\n(your response here)\n[/L' + n + ']';
  }).join('\n\n');

  var instr = valid.map(function(n) {
    return '[L' + n + '] — ' + LENS_DEFS[n].q + ':\n' + LENS_DEFS[n].instruction;
  }).join('\n\n');

  var ctxBlock = '';
  if (context && (context.userRole || context.ctxReason || context.ctxPurpose || context.ctxSource)) {
    ctxBlock = 'USER CONTEXT (use silently to calibrate tone, examples, and depth — DO NOT repeat it back, DO NOT start with "as a ___"):\n';
    if (context.userRole)   ctxBlock += '- The user is a ' + context.userRole + '.\n';
    if (context.ctxReason)  ctxBlock += '- Asking for: ' + context.ctxReason + '.\n';
    if (context.ctxPurpose) ctxBlock += '- Will use answer for: ' + context.ctxPurpose + '.\n';
    if (context.ctxSource)  ctxBlock += '- Question is coming from: ' + context.ctxSource + '.\n';
    ctxBlock += '\nAdapt examples to their situation; never patronize, never flatter.\n\n';
  }

  return SAFE_AI + '\n\n' +
    'You are a critical thinking tool. The user has stated their position BEFORE you respond. Your job is NOT to flatter or summarize. Your job is to push.\n\n' +
    ctxBlock +
    'USER POSITION: "' + (position || '(none stated)') + '"\n' +
    'USER CONFIDENCE: ' + (conf != null ? conf : '?') + '/10\n\n' +
    'Write the response for each requested lens using EXACTLY this format:\n\n' + tagBlock + '\n\n' +
    'Lens instructions:\n\n' + instr + '\n\n' +
    'Rules: Plain language. No jargon. Never start with "Great question!" or any flattery. Do not hedge. Stay focused on the user\'s specific position, not generic talking points. Treat the user as a serious thinker who can handle a real challenge.';
}

// ===================== GEMINI CALL =====================

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

function cleanModel(m) {
  var v = (typeof m === 'string') ? m.trim() : '';
  if (v.startsWith('gm:')) v = v.slice(3);
  return /^gemini-[a-z0-9.\-]+$/.test(v) ? v : '';
}

async function callGeminiOnce(model, messages, opts, env) {
  var res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + env.GEMINI_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      max_tokens: opts.max_tokens,
      temperature: opts.temperature,
      // Newer Flash models "think" before answering, and that thinking uses
      // up max_tokens. Keep it low so the answer itself isn't cut off.
      reasoning_effort: 'low'
    })
  });
  if (!res.ok) {
    var t = await res.text();
    var e = new Error('Gemini ' + res.status + ': ' + t.slice(0, 300));
    e.status = res.status;
    throw e;
  }
  var d = await res.json();
  var text = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
  if (!text || !String(text).trim()) {
    var e2 = new Error('Gemini returned an empty answer');
    e2.status = 502;
    throw e2;
  }
  return text;
}

// Try the chosen model, then the other Gemini models. Retry briefly on
// rate limits / server errors. Bad API key (400/401/403) stops immediately.
async function callGemini(messages, selectedModel, opts, env) {
  if (!env.GEMINI_API_KEY) throw Object.assign(new Error('GEMINI_API_KEY is not set on this deployment.'), { status: 500 });
  var first = cleanModel(selectedModel);
  var models = (first ? [first] : []).concat(GEMINI_MODELS.filter(function(m) { return m !== first; }));
  var lastErr;
  for (var i = 0; i < models.length; i++) {
    for (var attempt = 0; attempt < 2; attempt++) {
      try {
        return await callGeminiOnce(models[i], messages, opts, env);
      } catch (err) {
        lastErr = err;
        var s = err.status;
        if (s === 401 || s === 403 || (s === 400 && !/model/i.test(err.message))) throw err;
        if (s === 429 || s >= 500) { if (attempt === 0) { await sleep(600); continue; } }
        break; // model not found, or retries used up: try the next model
      }
    }
  }
  throw lastErr || new Error('Gemini request failed');
}

function geminiErrorToClient(err) {
  var s = err && err.status;
  if (s === 429) return { status: 429, error: 'Gemini rate limit reached. Please wait a minute and try again.' };
  if (s === 401 || s === 403) return { status: 502, error: 'The Gemini API key was rejected. Check GEMINI_API_KEY in Cloudflare.' };
  if (s === 400) return { status: 502, error: (err.message || 'Gemini rejected the request.') };
  return { status: 503, error: 'Gemini is temporarily unavailable. Please retry shortly.' };
}

// ===================== LENS CALL =====================

async function lensReply(question, options, model, env) {
  var systemPrompt = options.systemPrompt;
  if (!systemPrompt) {
    systemPrompt = buildLensSystemPromptServerFallback(
      options.lenses,
      options.positionBefore,
      options.confidenceBefore,
      {
        userRole:   options.userRole,
        ctxReason:  options.ctxReason,
        ctxPurpose: options.ctxPurpose,
        ctxSource:  options.ctxSource
      }
    );
  }
  var lensCount = (Array.isArray(options.lenses) ? options.lenses.length : 1);
  // Generous budget: room for some thinking plus ~200 words per lens.
  var maxTokens = Math.min(8192, 1500 + lensCount * 600);
  var msgs = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: question }
  ];
  return callGemini(msgs, model, { max_tokens: maxTokens, temperature: 0.72 }, env);
}

// ===================== SESSION HELPERS (unchanged) =====================

async function mkSid() {
  var a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return Array.from(a, function(b) { return b.toString(16).padStart(2, '0'); }).join('');
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
  } catch (e) { return null; }
}

function jres(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

// ===================== AUTH (unchanged) =====================

async function onLogin(req, env) {
  var p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    state: crypto.randomUUID()
  });
  return Response.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + p.toString(), 302);
}

async function onCallback(req, env) {
  var code = new URL(req.url).searchParams.get('code');
  if (!code) return Response.redirect(env.APP_URL + '?err=nocode', 302);
  var tr = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code: code,
      redirect_uri: env.REDIRECT_URI, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET
    })
  });
  if (!tr.ok) return Response.redirect(env.APP_URL + '?err=token', 302);
  var td = await tr.json();
  if (!td.access_token) return Response.redirect(env.APP_URL + '?err=notoken', 302);
  var ui = await (await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { 'Authorization': 'Bearer ' + td.access_token }
  })).json();
  var sid = await mkSid();
  await env.SESSIONS.put(sid, JSON.stringify({
    user: { id: ui.sub, name: ui.name || ui.email, username: ui.email },
    created_at: Date.now(), expires_at: Date.now() + 86400000
  }), { expirationTtl: 86400 });
  return new Response(null, {
    status: 302, headers: {
      'Location': env.APP_URL,
      'Set-Cookie': 'session=' + sid + '; HttpOnly; Secure; SameSite=Strict; Max-Age=86400; Path=/'
    }
  });
}

async function onLogout(req, env) {
  var sid = getSid(req);
  if (sid) try { await env.SESSIONS.delete(sid); } catch (e) {}
  return new Response(null, {
    status: 302, headers: {
      'Location': env.APP_URL,
      'Set-Cookie': 'session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/'
    }
  });
}

async function onSession(req, env) {
  var s = await getSession(req, env);
  return s ? jres({ authenticated: true, user: s.user }) : jres({ authenticated: false });
}

// ===================== CHAT (rewritten) =====================

async function onChat(req, env) {
  if (req.method !== 'POST') return jres({ error: 'Method not allowed' }, 405);

  var body;
  try { body = await req.json(); } catch (e) { return jres({ error: 'Invalid JSON' }, 400); }

  // ===== Branch A: persist a completed lens session (requires auth) =====
  if (body.action === 'save_lens_session') {
    var s = await getSession(req, env);
    if (!s) return jres({ error: 'Unauthorized' }, 401);
    try {
      var cid = body.chatId || crypto.randomUUID();
      var key = 'chat:' + s.user.id + ':' + cid;

      var record = {
        id: cid,
        mode: 'lens',
        created_at: Date.now(),
        first_question: (body.question || '').slice(0, 200),
        // Single "message" representing the whole completed session
        messages: [{
          id: crypto.randomUUID(),
          mode: 'lens',
          timestamp: Date.now(),
          question: body.question || '',
          userRole: body.userRole || '',
          ctxReason: body.ctxReason || '',
          ctxPurpose: body.ctxPurpose || '',
          ctxSource: body.ctxSource || '',
          positionBefore: body.positionBefore || '',
          confidenceBefore: typeof body.confidenceBefore === 'number' ? body.confidenceBefore : null,
          lensesUsed: Array.isArray(body.lensesUsed) ? body.lensesUsed : [],
          responses: body.responses || {},
          pushbacks: body.pushbacks || {},
          positionAfter: body.positionAfter || '',
          confidenceAfter: typeof body.confidenceAfter === 'number' ? body.confidenceAfter : null,
          outcome: (body.outcome === 'changed' || body.outcome === 'held' || body.outcome === 'unsure') ? body.outcome : 'held',
          model: body.model || ''
        }]
      };

      // Keep top-level fields for cheap list-rendering without fetching full record
      record.outcome = record.messages[0].outcome;
      record.confidence_before = record.messages[0].confidenceBefore;
      record.confidence_after = record.messages[0].confidenceAfter;
      record.lenses_count = record.messages[0].lensesUsed.length;

      // Metadata is what list() returns. Keep it small (< 1024 bytes).
      var meta = {
        first_question: record.first_question.slice(0, 100),
        created_at: record.created_at,
        mode: 'lens',
        outcome: record.outcome,
        confidence_before: record.confidence_before,
        confidence_after: record.confidence_after,
        lenses_count: record.lenses_count
      };

      await env.CHATS.put(key, JSON.stringify(record), {
        expirationTtl: 604800,
        metadata: meta
      });

      return jres({ ok: true, chatId: cid });
    } catch (err) {
      return jres({ error: 'Save failed: ' + (err.message || 'unknown') }, 500);
    }
  }

  // ===== Branch B: a lens model call =====
  var question = body.question;
  var chatId = body.chatId;
  var model = body.model;
  if (!question || !question.trim()) return jres({ error: 'Question required' }, 400);
  if (question.length > 2000) return jres({ error: 'Too long' }, 400);

  try {
    var cid2 = chatId || crypto.randomUUID();
    var replyText = await lensReply(
      question.trim(),
      {
        systemPrompt:    body.systemPrompt,
        lenses:          body.lenses,
        positionBefore:  body.positionBefore,
        confidenceBefore:body.confidenceBefore,
        userRole:        body.userRole,
        ctxReason:       body.ctxReason,
        ctxPurpose:      body.ctxPurpose,
        ctxSource:       body.ctxSource
      },
      model,
      env
    );
    // Nothing is persisted on individual lens or pushback calls.
    // The frontend sends save_lens_session at the end.
    return jres({ chatId: cid2, reply: replyText });
  } catch (err) {
    var mapped = geminiErrorToClient(err);
    return jres({ error: mapped.error }, mapped.status);
  }
}

// ===================== HISTORY (rewritten to expose lens fields) =====================

async function onHistory(req, env) {
  var s = await getSession(req, env);
  if (!s) return jres({ error: 'Unauthorized' }, 401);
  var chatId = new URL(req.url).searchParams.get('chatId');

  // ===== Single chat fetch =====
  if (chatId) {
    try {
      var raw = await env.CHATS.get('chat:' + s.user.id + ':' + chatId);
      if (!raw) return jres({ messages: [] });
      // The frontend's showHistoryItem reads m.positionBefore, m.responses,
      // m.lensesUsed, m.outcome, etc., directly off message objects. Our
      // saved record stores all of that on messages[0], so passing it
      // through unchanged works.
      return new Response(raw, { headers: { 'Content-Type': 'application/json' } });
    } catch (e) { return jres({ messages: [] }); }
  }

  // ===== Chat list =====
  try {
    var list = await env.CHATS.list({ prefix: 'chat:' + s.user.id + ':' });
    var chats = list.keys.map(function(k) {
      var meta = k.metadata || {};
      var id = k.name.split(':').slice(2).join(':');
      return {
        id: id,
        first_question: meta.first_question || 'Session',
        created_at: meta.created_at || 0,
        mode: meta.mode || 'lens',
        outcome: meta.outcome || null,
        confidence_before: typeof meta.confidence_before === 'number' ? meta.confidence_before : null,
        confidence_after: typeof meta.confidence_after === 'number' ? meta.confidence_after : null,
        lenses_count: typeof meta.lenses_count === 'number' ? meta.lenses_count : null
      };
    }).sort(function(a, b) { return b.created_at - a.created_at; }).slice(0, 50);
    return jres({ chats: chats });
  } catch (e) { return jres({ chats: [] }); }
}

// ===================== ROUTER =====================

export default {
  async fetch(request, env) {
    var path = new URL(request.url).pathname;
    if (path === '/api/auth/login')    return onLogin(request, env);
    if (path === '/api/auth/callback') return onCallback(request, env);
    if (path === '/api/auth/logout')   return onLogout(request, env);
    if (path === '/api/session')       return onSession(request, env);
    if (path === '/api/chat')          return onChat(request, env);
    if (path === '/api/history')       return onHistory(request, env);
    return env.ASSETS.fetch(request);
  }
};
