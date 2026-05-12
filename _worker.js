// ================================================================
// CONSPREAD — _worker.js (API only)
// Cloudflare Pages serves index.html as static.
// Worker handles /api/* routes only.
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

// ===================== PERSPECTIVES =====================

var PERSP_INSTRUCTIONS = {
  'Personal|Emotional impact':        'How does this topic make people feel? Name the emotions it stirs — fear, excitement, sadness, hope — and say which kinds of people feel them and why. Be specific.',
  'Personal|Daily life relevance':    'How does this show up in a person\'s everyday life? Give a concrete example someone aged 10-18 would recognise from their own day.',
  'Personal|Self-reflection':         'What does this topic ask someone to examine about themselves? What personal belief, habit, or assumption might it challenge?',
  'Ethical|Fairness':                 'Is this topic fair to everyone involved? Name who benefits and who might be left out or harmed — actual people or groups, not abstractions.',
  'Ethical|Social responsibility':    'What do people, companies, or governments owe each other here? What does doing the right thing look like in practice?',
  'Ethical|Environmental impact':     'How does this connect to the natural world? Describe the environmental effects — short-term and long-term — in plain terms.',
  'Practical|Daily application':      'How would someone actually use or apply this in everyday life? Give concrete steps, situations, or tools.',
  'Practical|Problem-solving':        'What problem does this topic solve, or what new problem does it create? What would a practical fix or workaround look like?',
  'Practical|Real-world use':         'Where is this already being used in the world right now? Give a real or very plausible example of it in action.',
  'Creative|Imaginative scenarios':   'Describe a surprising or unexpected situation this topic could lead to. Make it vivid, specific, and a little unexpected.',
  'Creative|Storytelling':            'Write 2-3 sentences of a mini-story that brings this topic to life for a young reader. Make the reader feel something.',
  'Creative|Artistic views':          'How might a poet, musician, or filmmaker see this topic differently from a scientist or politician? What feeling would they want to capture and why?',
  'Historical|Past interpretations':  'How did people in a specific past time or place understand or deal with this topic? Name the era or culture — avoid vague "long ago."',
  'Historical|Lessons from history':  'What lesson has history taught about this topic? Point to a real past mistake or success that still matters today.',
  'Historical|Cultural evolution':    'How has the meaning or importance of this topic shifted across different cultures or over time? Name the change and what drove it.',
  'Future-oriented|Long-term effects':'If current trends continue unchanged, where does this topic lead in 20-50 years? Be specific about likely consequences.',
  'Future-oriented|Future innovations':'What new technology, idea, or social movement could change how we deal with this topic? Why might it matter?',
  'Future-oriented|Trends ahead':     'What patterns visible today hint at where this topic is heading? Name a real, observable trend — not a wish or fear.'
};

function buildPerspectivesSystemPrompt(selectedPerspectives) {
  var valid = (Array.isArray(selectedPerspectives) ? selectedPerspectives : []).filter(function(p) {
    return p && p.category && p.subcategory && PERSP_INSTRUCTIONS[p.category + '|' + p.subcategory];
  });
  if (!valid.length) valid = [{ category: 'Personal', subcategory: 'Emotional impact' }];

  var header = SAFE_AI + '\n\nYou are a multi-perspective thinking tool for readers aged 10 and above. The user gives you a topic. Respond through EACH perspective listed below.\n\nFor each perspective: write 80-120 words in plain language a 10-year-old can follow. No jargon. No preaching. Never start any response with "Great question!" or similar filler.\n\nUse this EXACT tag format (the app parses it):\n\n';
  var tagBlock = valid.map(function(p) {
    return '[P:' + p.category + '|' + p.subcategory + ']\n(your response here)\n[/P:' + p.category + '|' + p.subcategory + ']';
  }).join('\n\n');
  var instrBlock = '\n\nPerspective instructions:\n\n' + valid.map(function(p) {
    var k = p.category + '|' + p.subcategory;
    return '[P:' + k + ']\n' + p.category + ' — ' + p.subcategory + ':\n' + PERSP_INSTRUCTIONS[k];
  }).join('\n\n');

  return header + tagBlock + instrBlock;
}

function parsePerspectivesResponse(text, selectedPerspectives) {
  var result = {};
  (selectedPerspectives || []).forEach(function(p) {
    var k = p.category + '|' + p.subcategory;
    var escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var rx = new RegExp('\\[P:' + escaped + '\\]([\\s\\S]*?)\\[/P:' + escaped + '\\]');
    var m = (text || '').match(rx);
    if (m) result[k] = m[1].trim();
  });
  // Fallback: if nothing parsed, put raw text under first key
  if (!Object.keys(result).length && selectedPerspectives && selectedPerspectives.length) {
    var first = selectedPerspectives[0];
    result[first.category + '|' + first.subcategory] = text || '';
  }
  return result;
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

function getModelCandidates(selectedModel, env) {
  var base = uniqueModels(
    [selectedModel, env.HF_MODEL]
      .concat(splitCsvModels(env.HF_MODEL_FALLBACKS))
      .concat(BUILTIN_MODEL_FALLBACKS)
  );
  if (env && env.OPENROUTER_API_KEY) {
    var orModels = splitCsvModels(env.OPENROUTER_FREE_MODELS).map(toOrModel).filter(Boolean);
    return uniqueModels(base.concat(orModels).concat(OPENROUTER_FREE_FALLBACKS));
  }
  return base;
}

function isModelNotSupported(status, errText) {
  if (status !== 400) return false;
  var txt = String(errText || '');
  return txt.indexOf('model_not_supported') !== -1
    || txt.indexOf('not supported by any provider') !== -1;
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
  var m = err.message.match(/^(HF|OR) (\d{3}):/);
  return m ? Number(m[2]) : null;
}

function isModelNotSupportedProvider(err) {
  if (!err || typeof err.message !== 'string') return false;
  if (err.message.indexOf('HF 400: model_not_supported') === 0) return true;
  if (!/^OR (400|404):/.test(err.message)) return false;
  var msg = err.message.toLowerCase();
  return msg.indexOf('model') !== -1 || msg.indexOf('no endpoints found') !== -1;
}

function getHFStatus(err) {
  return getProviderStatus(err);
}

function extractHFErrorText(err) {
  if (!err || typeof err.message !== 'string') return '';
  var m = err.message.match(/^(HF|OR) \d{3}:\s*(.*)$/);
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

function trimConfirmation(text) {
  return (text || '').replace(/^\s*(Sure!?|Of course!?|Here you go:?|Absolutely!?|Great!?)[,!.\s]*/i, '').trim();
}

async function normalReply(question, history, token, model, env) {
  var msgs = [{ role: 'system', content: normalSystemPrompt() }];
  (history || []).slice(-6).forEach(function(h) {
    msgs.push({ role: 'user', content: h.question });
    if (h.reply) msgs.push({ role: 'assistant', content: trimConfirmation(h.reply) });
  });
  msgs.push({ role: 'user', content: question });
  return callHFWithRetry(msgs, token, model, { max_tokens: 1024, temperature: 0.70 }, 2, env);
}

async function perspectivesReply(question, selectedPerspectives, token, model, env) {
  var persp = (Array.isArray(selectedPerspectives) ? selectedPerspectives : []).filter(function(p) {
    return p && p.category && p.subcategory;
  });
  if (!persp.length) persp = [{ category: 'Personal', subcategory: 'Emotional impact' }];
  var systemPrompt = buildPerspectivesSystemPrompt(persp);
  var maxTokens = Math.min(3000, Math.max(400, persp.length * 200));
  var msgs = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: question }
  ];
  return callHFWithRetry(msgs, token, model, { max_tokens: maxTokens, temperature: 0.72 }, 2, env);
}

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

async function onChat(req, env) {
  if (req.method !== 'POST') return jres({ error: 'Method not allowed' }, 405);
  var s = await getSession(req, env);
  if (!s) return jres({ error: 'Unauthorized' }, 401);
  var body;
  try { body = await req.json(); } catch (e) { return jres({ error: 'Invalid JSON' }, 400); }
  var question = body.question, chatId = body.chatId, history = body.history, mode = body.mode, model = body.model;
  if (!question || !question.trim()) return jres({ error: 'Question required' }, 400);
  if (question.length > 2000) return jres({ error: 'Too long' }, 400);
  var defaultModel = env.HF_MODEL || 'Qwen/Qwen2.5-72B-Instruct';
  var modelCandidates = getModelCandidates(model || defaultModel, env);
  try {
    var cid = chatId || crypto.randomUUID();
    var key = 'chat:' + s.user.id + ':' + cid;
    var cd;
    try {
      var ex = await env.CHATS.get(key);
      cd = ex ? JSON.parse(ex) : { messages: [], created_at: Date.now(), first_question: question, mode: mode || 'perspectives' };
    } catch (e) {
      cd = { messages: [], created_at: Date.now(), first_question: question, mode: mode || 'perspectives' };
    }

    if (mode === 'perspectives') {
      var selectedPerspectives = Array.isArray(body.perspectives) ? body.perspectives : [];
      var perspText = await perspectivesReply(question.trim(), selectedPerspectives, s.hf_token, modelCandidates, env);
      cd.messages.push({ id: crypto.randomUUID(), question: question, reply: perspText, perspectives: selectedPerspectives, mode: 'perspectives', timestamp: Date.now() });
      await env.CHATS.put(key, JSON.stringify(cd), {
        expirationTtl: 604800,
        metadata: { first_question: question.slice(0, 100), created_at: cd.created_at, mode: 'perspectives' }
      });
      return jres({ chatId: cid, reply: perspText });
    }

    if (mode === 'normal') {
      var reply = await normalReply(question, history, s.hf_token, modelCandidates, env);
      cd.messages.push({ id: crypto.randomUUID(), question: question, reply: reply, mode: 'normal', timestamp: Date.now() });
      await env.CHATS.put(key, JSON.stringify(cd), {
        expirationTtl: 604800,
        metadata: { first_question: question.slice(0, 100), created_at: cd.created_at, mode: 'normal' }
      });
      return jres({ chatId: cid, reply: reply });
    }

    // Fallback
    var fallbackReply = await normalReply(question, history, s.hf_token, modelCandidates, env);
    return jres({ chatId: cid, reply: fallbackReply });

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

async function onImage(req, env) {
  if (req.method !== 'POST') return jres({ error: 'Method not allowed' }, 405);
  var s = await getSession(req, env);
  if (!s) return jres({ error: 'Unauthorized' }, 401);
  var body;
  try { body = await req.json(); } catch (e) { return jres({ error: 'Invalid JSON' }, 400); }
  if (!body.prompt) return jres({ error: 'Prompt required' }, 400);
  try {
    var res = await fetch('https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + s.hf_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: body.prompt, parameters: { num_inference_steps: 4 } })
    });
    if (!res.ok) {
      var errText = await res.text();
      if (res.status === 401) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': 'session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/'
          }
        });
      }
      return jres({ error: 'Image generation failed: ' + errText.slice(0, 200) }, 502);
    }
    var imgBuffer = await res.arrayBuffer();
    return new Response(imgBuffer, { headers: { 'Content-Type': res.headers.get('content-type') || 'image/jpeg' } });
  } catch (err) {
    if (err && typeof err.message === 'string' && err.message.startsWith('HF 401')) {
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
    return jres({ error: err.message }, 500);
  }
}

async function onHistory(req, env) {
  var s = await getSession(req, env);
  if (!s) return jres({ error: 'Unauthorized' }, 401);
  var chatId = new URL(req.url).searchParams.get('chatId');
  if (chatId) {
    try {
      var raw = await env.CHATS.get('chat:' + s.user.id + ':' + chatId);
      return raw ? new Response(raw, { headers: { 'Content-Type': 'application/json' } }) : jres({ messages: [] });
    } catch (e) { return jres({ messages: [] }); }
  }
  try {
    var list = await env.CHATS.list({ prefix: 'chat:' + s.user.id + ':' });
    var chats = list.keys.map(function(k) {
      return {
        id: k.name.split(':').slice(2).join(':'),
        first_question: (k.metadata && k.metadata.first_question) || 'Session',
        created_at: (k.metadata && k.metadata.created_at) || 0,
        mode: (k.metadata && k.metadata.mode) || 'perspectives'
      };
    }).sort(function(a, b) { return b.created_at - a.created_at; }).slice(0, 30);
    return jres({ chats: chats });
  } catch (e) { return jres({ chats: [] }); }
}

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
