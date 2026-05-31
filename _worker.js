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

const BUILTIN_MODEL_FALLBACKS = [
  'Qwen/Qwen2.5-72B-Instruct',
  'Qwen/Qwen2.5-Coder-32B-Instruct',
  'meta-llama/Llama-3.1-70B-Instruct',
  'mistralai/Mistral-7B-Instruct-v0.3'
];

const OPENROUTER_FREE_FALLBACKS = [
  'or:openrouter/free',
  'or:meta-llama/llama-3.3-70b-instruct:free',
  'or:mistralai/mistral-small-3.1-24b-instruct:free',
  'or:deepseek/deepseek-r1:free'
];

const GEMINI_FREE_FALLBACKS = [
  'gm:gemini-2.0-flash',
  'gm:gemini-1.5-flash'
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

// ===================== MODEL FALLBACK PLUMBING (unchanged) =====================

function uniqueModels(list) {
  var seen = {};
  var out = [];
  (list || []).forEach(function(m) {
    var v = (typeof m === 'string') ? m.trim() : '';
    if (!v || seen[v]) return;
    seen[v] = true;
    out.push(v);
  });
  return out;
}

function splitCsvModels(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
}

function toOrModel(raw) {
  var v = (typeof raw === 'string') ? raw.trim() : '';
  if (!v) return '';
  return v.startsWith('or:') ? v : ('or:' + v);
}

function isGeminiModel(model) {
  return typeof model === 'string' && model.startsWith('gm:');
}

function stripGeminiPrefix(model) {
  return isGeminiModel(model) ? model.slice(3) : model;
}

function getModelCandidates(selectedModel, env) {
  var hasHFToken = !!(env && env.HF_TOKEN);
  var hasOR = !!(env && env.OPENROUTER_API_KEY);
  var hasGM = !!(env && env.GEMINI_API_KEY);

  var candidates = selectedModel ? [selectedModel] : [];

  if (hasHFToken) {
    if (env.HF_MODEL) candidates.push(env.HF_MODEL);
    candidates = candidates.concat(splitCsvModels(env.HF_MODEL_FALLBACKS));
    candidates = candidates.concat(BUILTIN_MODEL_FALLBACKS);
  }

  if (hasOR) {
    var orCustom = splitCsvModels(env.OPENROUTER_FREE_MODELS).map(toOrModel).filter(Boolean);
    candidates = candidates.concat(orCustom).concat(OPENROUTER_FREE_FALLBACKS);
  }

  if (hasGM) {
    candidates = candidates.concat(GEMINI_FREE_FALLBACKS);
  }

  return uniqueModels(candidates);
}

function isModelNotSupported(status, errText) {
  if (status !== 400) return false;
  var txt = String(errText || '');
  return txt.indexOf('model_not_supported') !== -1
    || txt.indexOf('not supported by any provider') !== -1;
}

function isRetriableGM(err) {
  var status = getProviderStatus(err);
  return status === 429 || status === 500 || status === 502 || status === 503;
}

function isOpenRouterModel(model) {
  return typeof model === 'string' && model.startsWith('or:');
}

function stripOpenRouterPrefix(model) {
  return isOpenRouterModel(model) ? model.slice(3) : model;
}

function isRetriableHF(err) {
  var status = getProviderStatus(err);
  return status === 408 || status === 409 || status === 425 || status === 429
    || status === 500 || status === 502 || status === 503 || status === 504;
}

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

async function callHFWithRetry(messages, token, model, opts, maxAttempts, env) {
  var models = Array.isArray(model) ? uniqueModels(model) : [model];
  var lastErr;
  for (var m = 0; m < models.length; m++) {
    var candidate = models[m];
    var attempts = Math.max(1, maxAttempts || 1);
    for (var i = 0; i < attempts; i++) {
      try {
        return await callHF(messages, token, candidate, opts, env);
      } catch (err) {
        lastErr = err;
        if (isHF401(err)) throw err;
        if (isModelNotSupportedProvider(err) && m < models.length - 1) break;
        if (!isRetriableHF(err) || i === attempts - 1) {
          if (m < models.length - 1) break;
          throw err;
        }
        await sleep(250 * (i + 1));
      }
    }
  }
  throw lastErr || new Error('LLM request failed');
}

async function callHF(messages, token, model, opts, env) {
  opts = opts || {};
  if (isGeminiModel(model)) {
    if (!env || !env.GEMINI_API_KEY) throw new Error('GM 500: Gemini is not configured.');
    var gmModel = stripGeminiPrefix(model);
    var gmRes = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + env.GEMINI_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: gmModel,
        messages: messages,
        max_tokens: opts.max_tokens || 600,
        temperature: opts.temperature || 0.72
      })
    });
    if (!gmRes.ok) {
      var gmErr = await gmRes.text();
      throw new Error('GM ' + gmRes.status + ': ' + gmErr.slice(0, 300));
    }
    var gmData = await gmRes.json();
    if (!gmData.choices || !gmData.choices[0]) throw new Error('Unexpected Gemini response');
    return gmData.choices[0].message.content;
  }
  if (isOpenRouterModel(model)) {
    if (!env || !env.OPENROUTER_API_KEY) throw new Error('OR 500: OpenRouter is not configured.');
    var orModel = stripOpenRouterPrefix(model);
    var orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + env.OPENROUTER_API_KEY,
        'Content-Type': 'application/json',
        'HTTP-Referer': env.APP_URL || 'https://conspread.pages.dev',
        'X-Title': 'Conspread'
      },
      body: JSON.stringify({
        model: orModel,
        messages: messages,
        max_tokens: opts.max_tokens || 600,
        temperature: opts.temperature || 0.72,
        stream: false
      })
    });
    if (!orRes.ok) {
      var orErr = await orRes.text();
      throw new Error('OR ' + orRes.status + ': ' + orErr.slice(0, 300));
    }
    var orData = await orRes.json();
    if (!orData.choices || !orData.choices[0]) throw new Error('Unexpected OpenRouter response');
    return orData.choices[0].message.content;
  }
  // HF Inference — skip gracefully if no server token is configured
  if (!token) throw new Error('HF 400: model_not_supported');
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
    if (isModelNotSupported(res.status, errText)) {
      throw new Error('HF 400: model_not_supported');
    }
    throw new Error('HF ' + res.status + ': ' + errText.slice(0, 300));
  }
  var d = await res.json();
  if (!d.choices || !d.choices[0]) throw new Error('Unexpected HF response');
  return d.choices[0].message.content;
}

function isHF401(err) {
  return !!(err && typeof err.message === 'string' && err.message.startsWith('HF 401'));
}

function getProviderStatus(err) {
  if (!err || typeof err.message !== 'string') return null;
  var m = err.message.match(/^(HF|OR|GM) (\d{3}):/);
  return m ? Number(m[2]) : null;
}

function isModelNotSupportedProvider(err) {
  if (!err || typeof err.message !== 'string') return false;
  if (err.message.indexOf('HF 400: model_not_supported') === 0) return true;
  if (!/^(OR|GM) (400|404):/.test(err.message)) return false;
  var msg = err.message.toLowerCase();
  return msg.indexOf('model') !== -1 || msg.indexOf('no endpoints found') !== -1;
}

function getHFStatus(err) {
  return getProviderStatus(err);
}

function extractHFErrorText(err) {
  if (!err || typeof err.message !== 'string') return '';
  var m = err.message.match(/^(HF|OR|GM) \d{3}:\s*(.*)$/);
  return (m && m[2]) ? m[2] : err.message;
}

function mapHFErrorToClient(err) {
  var status = getHFStatus(err);
  var raw = extractHFErrorText(err);
  if (!status) return null;
  if (status === 402) {
    return {
      status: 402,
      error: 'Hugging Face inference credits are exhausted for this account. Add credits or upgrade the HF plan, then try again.'
    };
  }
  if (status === 429) {
    return {
      status: 429,
      error: 'Inference provider rate limit reached. Please retry in a moment.'
    };
  }
  if (status === 404 && String(raw).toLowerCase().indexOf('no endpoints found') !== -1) {
    return {
      status: 503,
      error: 'No currently available endpoint for the selected free model. Please retry or choose another free model.'
    };
  }
  if (status >= 400 && status < 500) {
    return { status: status, error: raw || 'Inference request rejected by provider.' };
  }
  if (status >= 500) {
    return { status: 503, error: 'Inference provider is temporarily unavailable. Please retry shortly.' };
  }
  return null;
}

// ===================== LENS CALL =====================

async function lensReply(question, options, token, model, env) {
  // The frontend builds the systemPrompt and sends it. We respect it.
  // Fallback: if no systemPrompt was provided, we build one server-side.
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
  var maxTokens = Math.min(3000, Math.max(400, lensCount * 220));
  var msgs = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: question }
  ];
  return callHFWithRetry(msgs, token, model, { max_tokens: maxTokens, temperature: 0.72 }, 2, env);
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
  var mode = body.mode;
  var model = body.model;
  if (!question || !question.trim()) return jres({ error: 'Question required' }, 400);
  if (question.length > 2000) return jres({ error: 'Too long' }, 400);

  // We only accept lens mode from the new frontend. Anything else, we still
  // try to handle as a lens call to keep things resilient.
  var defaultModel = env.HF_MODEL || 'Qwen/Qwen2.5-72B-Instruct';
  var modelCandidates = getModelCandidates(model || defaultModel, env);

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
      env.HF_TOKEN || '',
      modelCandidates,
      env
    );
    // Note: we don't persist anything on individual lens or pushback calls.
    // The frontend collects everything and sends save_lens_session at the end.
    return jres({ chatId: cid2, reply: replyText });
  } catch (err) {
    if (isHF401(err)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': 'session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/'
        }
      });
    }
    var hfMapped = mapHFErrorToClient(err);
    if (hfMapped) return jres({ error: hfMapped.error }, hfMapped.status);
    return jres({ error: err.message || 'Processing failed' }, 500);
  }
}

// ===================== IMAGE (unchanged) =====================

async function onImage(req, env) {
  if (req.method !== 'POST') return jres({ error: 'Method not allowed' }, 405);
  var s = await getSession(req, env);
  if (!s) return jres({ error: 'Unauthorized' }, 401);
  if (!env.HF_TOKEN) return jres({ error: 'Image generation is not available on this deployment.' }, 503);
  var body;
  try { body = await req.json(); } catch (e) { return jres({ error: 'Invalid JSON' }, 400); }
  if (!body.prompt) return jres({ error: 'Prompt required' }, 400);
  try {
    var res = await fetch('https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.HF_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: body.prompt, parameters: { num_inference_steps: 4 } })
    });
    if (!res.ok) {
      var errText = await res.text();
      return jres({ error: 'Image generation failed: ' + errText.slice(0, 200) }, 502);
    }
    var imgBuffer = await res.arrayBuffer();
    return new Response(imgBuffer, { headers: { 'Content-Type': res.headers.get('content-type') || 'image/jpeg' } });
  } catch (err) {
    var hfMapped = mapHFErrorToClient(err);
    if (hfMapped) return jres({ error: hfMapped.error }, hfMapped.status);
    return jres({ error: err.message }, 500);
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

// ===================== ANTHROPIC (unchanged) =====================

async function onAnthropicChat(req, env) {
  if (req.method !== 'POST') return jres({ error: 'Method not allowed' }, 405);
  var s = await getSession(req, env);
  if (!s) return jres({ error: 'Unauthorized' }, 401);
  var body;
  try { body = await req.json(); } catch (e) { return jres({ error: 'Invalid JSON' }, 400); }
  var model = body.model, messages = body.messages, systemPrompt = body.systemPrompt;
  var maxTokens = Math.min(body.maxTokens || 1024, 2048);
  if (!model || !model.startsWith('claude-')) return jres({ error: 'Invalid model' }, 400);
  if (!Array.isArray(messages) || !messages.length) return jres({ error: 'Messages required' }, 400);
  if (!env.ANTHROPIC_API_KEY) return jres({ error: 'Anthropic not configured on this deployment' }, 503);
  var reqBody = {
    model: model,
    max_tokens: maxTokens,
    messages: messages.map(function(m) { return { role: m.role, content: m.content }; })
  };
  if (systemPrompt) reqBody.system = systemPrompt;
  try {
    var resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(reqBody)
    });
    var data = await resp.json();
    if (!resp.ok) return jres({ error: (data.error && data.error.message) || 'Anthropic API error' }, resp.status);
    var text = data.content && data.content[0] && data.content[0].text;
    if (!text) return jres({ error: 'Empty response from Anthropic' }, 502);
    return jres({ reply: text });
  } catch (err) {
    return jres({ error: err.message || 'Anthropic request failed' }, 500);
  }
}

// ===================== ROUTER (unchanged) =====================

export default {
  async fetch(request, env) {
    var path = new URL(request.url).pathname;
    if (path === '/api/auth/login')    return onLogin(request, env);
    if (path === '/api/auth/callback') return onCallback(request, env);
    if (path === '/api/auth/logout')   return onLogout(request, env);
    if (path === '/api/session')       return onSession(request, env);
    if (path === '/api/chat')          return onChat(request, env);
    if (path === '/api/anthropic')     return onAnthropicChat(request, env);
    if (path === '/api/image')         return onImage(request, env);
    if (path === '/api/history')       return onHistory(request, env);
    return env.ASSETS.fetch(request);
  }
};
