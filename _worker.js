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

function councilPackPrompt(topic, targetCount, history) {
  var prior = (history || []).slice(-3).map(function(h, i) {
    return (i + 1) + '. ' + (h && h.question ? h.question : '');
  }).join('\n');
  return SAFE_AI + `

Generate a critical thinking council and each member's response in one pass.

TOPIC: "${topic}"
RECENT CONVERSATION CONTEXT:
${prior || 'none'}
TARGET COUNCIL SIZE: ${targetCount}

Requirements:
1. Create exactly ${targetCount} genuinely different personas.
2. Include at least one contrarian perspective.
3. Ensure strong disciplinary diversity and conflicting assumptions.
4. Each response must be direct, concrete, and 120-180 words.
5. For each response provide 3-5 concise assumptions.

Return ONLY valid JSON in this exact shape:
{
  "council": [
    {
      "id":"snake_case",
      "name":"full name",
      "title":"professional title",
      "intellectual_tradition":"school of thought",
      "epistemology":"one sentence",
      "core_commitment":"one belief",
      "friction_with":["a","b","c"],
      "forbidden_rhetoric":["x","y","z"],
      "vocabulary_register":"accessible_academic",
      "known_bias":"one blind spot",
      "signature_approach":"argument method",
      "avatar_initials":"AB"
    }
  ],
  "responses": [
    {
      "answer":"response text",
      "assumptions":["assumption 1","assumption 2","assumption 3"]
    }
  ]
}`;
}

function buildLensSystemPrompt(selectedLenses) {
  var lensTexts = {
    1: 'LENS 1 — Where does this come from?\nIdentify factual claims if any. Point out where this information would come from, how someone could check it, what sources would be trustworthy. If it is opinion rather than checkable, say so. End with one short question inviting the user to think, like "If you wanted to check this, where would you look first?"',
    2: 'LENS 2 — Whose voice is missing?\nNotice whose perspective the input is told from. Name one or two concrete perspectives NOT in the input — actual people or roles, not "many groups." Say what would look different from those perspectives. End with: "Whose view do you think matters most here, and why?"',
    3: 'LENS 3 — What does this want me to feel?\nName the feeling the input seems designed to create. Point to specific words or framings that produce it. Say why someone might want the reader to feel that. Do not assume bad intent. End with: "Does noticing the feeling change what you think of the message?"',
    4: "LENS 4 — What's the strongest argument the other way?\nIdentify the position implied or stated. Build the BEST argument someone smart could make on the OTHER side — not a strawman. Begin with: \"If someone smart disagreed, here is the best thing they could say:\" Do not declare a winner. End with: \"What part of that argument is hardest to dismiss?\"",
    5: 'LENS 5 — Is this opinion, fact, or in between?\nSort the input into: fact you can check, opinion someone holds, or a mix. Explain WHY — point at specific words. If a mix, say which parts are checkable and which are values. Do not dismiss opinions. End with: "What would change your mind about this?"',
    6: "LENS 6 — How does this connect to what you already know?\nSuggest two or three things from ordinary life that this input matches or conflicts with. Be concrete — \"Most kids have noticed...\" or \"If you have ever...\" Do not pretend to know the user's life. End with: \"Does this match what you have seen, or does it surprise you?\""
  };
  var selected = (Array.isArray(selectedLenses) ? selectedLenses : []).filter(function(n) { return lensTexts[n]; });
  if (!selected.length) selected = [1, 4];
  var base = 'You are a multi-lens thinking tool for readers age 10+. The user gives you a claim, headline, or question. You must respond through EACH of the following lenses. For each lens, write 60-100 words in plain language a 10-year-old can follow. No jargon. Do not be preachy. Do not begin any lens with "Great question!"\n\nRespond in this EXACT format — use these headers exactly so the app can parse them:\n\n';
  var tags = selected.map(function(n) { return '[LENS_' + n + ']\n(your response)\n[/LENS_' + n + ']'; }).join('\n\n');
  var lensBody = selected.map(function(n) { return lensTexts[n]; }).join('\n\n');
  return base + tags + '\n\nThe lenses to apply:\n\n' + lensBody;
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
  return out.slice(0, safeCount);
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

function parseJSONLoose(raw) {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') throw new Error('Invalid JSON payload');
  var clean = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(clean); } catch (e) {}
  var first = clean.indexOf('{');
  var last = clean.lastIndexOf('}');
  if (first >= 0 && last > first) {
    return JSON.parse(clean.slice(first, last + 1));
  }
  throw new Error('Invalid JSON payload');
}

function normalizeResponseList(responses, targetCount, council) {
  var safeCount = Math.min(Array.isArray(council) ? council.length : 0, Math.max(2, Math.min(10, targetCount || 4)));
  var out = [];
  (Array.isArray(responses) ? responses : []).forEach(function(r, i) {
    if (out.length >= safeCount) return;
    out.push(normalizePersonaResponse(r, council && council[i]));
  });
  return out;
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

async function buildCouncil(topic, history, token, model, env) {
  var targetCount = chooseCouncilSize(topic, history);
  var txt = await callHFWithRetry([{ role:'user', content: councilPrompt(topic, targetCount, history) }], token, model, { max_tokens:2500, temperature:0.85 }, 3, env);
  var clean = txt.replace(/```json\s*/g,'').replace(/```\s*/g,'').trim();
  var arr = JSON.parse(clean);
  var council = normalizeCouncil(arr, targetCount, topic);
  if (!Array.isArray(council) || council.length < 2) {
    throw new Error('Council generation unavailable right now. Please retry in a moment.');
  }
  return council;
}

async function buildCouncilPack(topic, history, token, model, env) {
  var targetCount = chooseCouncilSize(topic, history);
  var txt = await callHFWithRetry([{ role:'user', content: councilPackPrompt(topic, targetCount, history) }], token, model, { max_tokens:3200, temperature:0.78 }, 3, env);
  var parsed = parseJSONLoose(txt);
  var council = normalizeCouncil(parsed.council, targetCount, topic);
  var responses = normalizeResponseList(parsed.responses, targetCount, council);
  if (!Array.isArray(council) || council.length < 2) {
    throw new Error('Council generation unavailable right now. Please retry in a moment.');
  }
  if (!Array.isArray(responses) || responses.length < 2) {
    throw new Error('Council responses are temporarily unavailable. Please retry.');
  }
  while (responses.length < council.length) {
    responses.push(fallbackPersonaReply(council[responses.length]));
  }
  return { council: council, responses: responses.slice(0, council.length) };
}

async function personaReply(persona, all, question, history, token, model, env) {
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
  var raw = await callHFWithRetry(msgs, token, model, { max_tokens: 420, temperature: 0.76 }, 2, env);
  return normalizePersonaResponse(raw, persona);
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

function fallbackPersonaReply(persona) {
  var name = (persona && persona.name) ? persona.name : 'This council member';
  return {
    answer: name + ' could not submit a response due to a temporary inference issue. Treat this as missing input rather than agreement.',
    assumptions: ['Inference service returned an intermittent upstream failure for this perspective.']
  };
}

async function buildPersonaResponses(council, question, history, token, model, env) {
  var responses = [];
  var failures = 0;
  // Limit concurrency to reduce 429/5xx bursts from upstream router.
  for (var i = 0; i < council.length; i += 2) {
    var chunk = council.slice(i, i + 2);
    var chunkResults = await Promise.all(chunk.map(async function(p) {
      try {
        return await personaReply(p, council, question, history, token, model, env);
      } catch (err) {
        if (isHF401(err)) throw err;
        failures += 1;
        return fallbackPersonaReply(p);
      }
    }));
    responses = responses.concat(chunkResults);
  }
  if (failures >= council.length) {
    throw new Error('Council responses are temporarily unavailable. Please retry.');
  }
  return responses;
}

async function buildSynthesis(question, council, responses, token, model, env) {
  try {
    var txt = await callHFWithRetry([{ role:'user', content: synthesisPrompt(question, council, responses) }], token, model, { max_tokens:1500, temperature:0.62 }, 2, env);
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

function trimConfirmation(text) {
  return (text || '').replace(/^\s*(Sure!?|Of course!?|Here you go:?|Absolutely!?|Great!?)[,!.\s]*/i, '').trim();
}

async function normalReply(question, history, token, model, env) {
  var msgs = [{ role:'system', content: normalSystemPrompt() }];
  (history || []).slice(-6).forEach(function(h) {
    msgs.push({ role:'user', content: h.question });
    if (h.reply) msgs.push({ role:'assistant', content: trimConfirmation(h.reply) });
  });
  msgs.push({ role:'user', content: question });
  return callHFWithRetry(msgs, token, model, { max_tokens:1024, temperature:0.70 }, 2, env);
}

async function lensReply(question, selectedLenses, token, model, env) {
  var lenses = (Array.isArray(selectedLenses) ? selectedLenses : []).map(Number).filter(function(n) { return n >= 1 && n <= 6; });
  if (!lenses.length) lenses = [1, 4];
  var systemPrompt = buildLensSystemPrompt(lenses);
  var maxTokens = lenses.length === 1 ? 200 : 800;
  var msgs = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: question }
  ];
  return callHFWithRetry(msgs, token, model, { max_tokens: maxTokens, temperature: 0.72 }, 2, env);
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
  var defaultModel = env.HF_MODEL || 'Qwen/Qwen2.5-72B-Instruct';
  var modelCandidates = getModelCandidates(model || defaultModel, env);
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
    if (mode === 'lens') {
      var lenses = Array.isArray(body.lenses) && body.lenses.length
        ? body.lenses.map(Number).filter(function(n) { return n >= 1 && n <= 6; })
        : [1, 4];
      var lensText = await lensReply(question.trim(), lenses, s.hf_token, modelCandidates, env);
      return jres({ reply: lensText });
    }
    if (mode === 'normal') {
      var reply = await normalReply(question, history, s.hf_token, modelCandidates, env);
      cd.messages.push({ id:crypto.randomUUID(), question:question, reply:reply, mode:'normal', timestamp:Date.now() });
      await env.CHATS.put(key, JSON.stringify(cd), { expirationTtl:604800,
        metadata: { first_question: question.slice(0,100), created_at: cd.created_at, mode:'normal' } });
      return jres({ chatId:cid, reply:reply });
    } else {
      var councilPack;
      try {
        councilPack = await buildCouncilPack(question.trim(), history, s.hf_token, modelCandidates, env);
      } catch (packErr) {
        // Fallback path for models that do not reliably emit large structured JSON in one shot.
        var fallbackCouncil = await buildCouncil(question.trim(), history, s.hf_token, modelCandidates, env);
        var fallbackResponses = await buildPersonaResponses(fallbackCouncil, question, history, s.hf_token, modelCandidates, env);
        councilPack = { council: fallbackCouncil, responses: fallbackResponses };
      }
      var council = councilPack.council;
      var responses = councilPack.responses;
      var synthesis = await buildSynthesis(question, council, responses, s.hf_token, modelCandidates, env);
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
    var hfMapped = mapHFErrorToClient(err);
    if (hfMapped) return jres({ error: hfMapped.error }, hfMapped.status);
    if (err && typeof err.message === 'string' && /Council (generation|responses) .*unavailable/.test(err.message)) {
      return jres({ error: err.message }, 503);
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
    var hfMapped = mapHFErrorToClient(err);
    if (hfMapped) return jres({ error: hfMapped.error }, hfMapped.status);
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

async function onAnthropicChat(req, env) {
  if (req.method !== 'POST') return jres({ error: 'Method not allowed' }, 405);
  var s = await getSession(req, env);
  if (!s) return jres({ error: 'Unauthorized' }, 401);
  var body;
  try { body = await req.json(); } catch(e) { return jres({ error: 'Invalid JSON' }, 400); }
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
  } catch(err) {
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
