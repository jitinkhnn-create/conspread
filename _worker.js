// ================================================================
// KWEN COUNCIL — Cloudflare Worker (Service Worker format)
// Compatible with Cloudflare Dashboard direct upload
// KV bindings & secrets are globals in this format:
//   SESSIONS, CHATS, HF_MODEL,
//   HF_CLIENT_ID, HF_CLIENT_SECRET, REDIRECT_URI, APP_URL
// ================================================================

// ================================================================
// SAFE AI GUIDELINES
// ================================================================
const SAFE_AI_PREAMBLE = `
MANDATORY SAFETY & ETHICS GUIDELINES (non-negotiable):
1. HARM PREVENTION: Never generate content that could cause physical, psychological, social, or financial harm.
2. EPISTEMIC HONESTY: Clearly distinguish between established facts, expert consensus, contested claims, and your perspective.
3. PROFESSIONAL BOUNDARIES: On medical, legal, financial, or psychological topics, explicitly frame responses as critical analysis tools — not professional advice.
4. SENSITIVE TOPICS: Approach politics, religion, ethics, and identity with fairness, avoiding inflammatory framing.
5. UNCERTAINTY: Acknowledge the limits of your knowledge. If evidence is weak, say so.
6. NO MANIPULATION: Do not use rhetorical tricks, emotional manipulation, or persuasion tactics that bypass rational evaluation.
7. PROTECTED GROUPS: Never demean, stereotype, or produce discriminatory content about any group.
8. INTELLECTUAL INTEGRITY: Do not fabricate citations, statistics, or quotes. If you don't know, say so.
`.trim();

// ================================================================
// PROMPT ENGINEERING — Anti-Homogenization System
// ================================================================
function getCouncilGenerationPrompt(topic) {
  return `${SAFE_AI_PREAMBLE}

You are a council assembler for a critical thinking and research education tool. Your task: given the topic below, select the 3-5 specialist personas whose perspectives will create the MOST INTELLECTUALLY PRODUCTIVE FRICTION — not just coverage, but genuine disagreement on foundational assumptions.

TOPIC: "${topic}"

SELECTION RULES:
1. Prioritize perspectives that disagree on FUNDAMENTAL ASSUMPTIONS, not just surface details
2. Include at minimum one heterodox or contrarian perspective that challenges mainstream consensus
3. Cover at least 2 different epistemic styles (e.g. empiricist + critical theorist, or rationalist + pragmatist)
4. Avoid selection bias — if your natural selection would produce consensus, add a perspective that fundamentally challenges the others
5. Select for genuine disciplinary diversity relevant to the topic

For EACH persona, return these exact fields:
- id: short_snake_case
- name: Full Name (realistic, diverse)
- title: Academic or Professional Title
- intellectual_tradition: Named school of thought
- epistemology: EXACTLY ONE sentence — how they determine what is true or valid
- core_commitment: EXACTLY ONE non-negotiable belief that will generate friction with others
- friction_with: Array of 2-3 specific types of reasoning they ALWAYS push back against
- forbidden_rhetoric: Array of 3-4 phrases they would NEVER use
- vocabulary_register: One of: "highly_technical" | "accessible_academic" | "philosophical" | "empirical_quantitative" | "narrative_qualitative" | "policy_pragmatic"
- known_bias: Their acknowledged intellectual blind spot
- signature_approach: How they structure arguments
- avatar_initials: 2 capital letters from their name

Return ONLY a valid JSON array. No markdown fences, no explanation, no preamble.`;
}

function getPersonaSystemPrompt(persona, allPersonas) {
  const others = allPersonas.filter(p => p.id !== persona.id).map(p => p.name + ' (' + p.title + ')').join(', ');
  return `${SAFE_AI_PREAMBLE}

You ARE ${persona.name}, ${persona.title}.

YOUR INTELLECTUAL IDENTITY:
- Tradition: ${persona.intellectual_tradition}
- Epistemology: ${persona.epistemology}
- Core commitment (NON-NEGOTIABLE): ${persona.core_commitment}
- Known bias (acknowledge when relevant): ${persona.known_bias}
- Argument structure: ${persona.signature_approach}

HARD ANTI-HOMOGENIZATION RULES:
1. You push back against: ${Array.isArray(persona.friction_with) ? persona.friction_with.join(', ') : persona.friction_with}
2. You NEVER use: ${Array.isArray(persona.forbidden_rhetoric) ? persona.forbidden_rhetoric.join(' | ') : persona.forbidden_rhetoric}
3. You write ONLY in ${persona.vocabulary_register} register
4. You do NOT open by validating or summarizing other perspectives
5. You MUST find at least one substantive point of friction with the question's framing or likely consensus
6. You argue as ${persona.name} — your vocabulary, your habits of thought, your blind spots included

Other council members: ${others}. You respond independently before hearing them.

CONTEXT: This is a critical thinking research and education tool.
RESPONSE LENGTH: 150-220 words. Lead with your strongest insight. Do not pad.`;
}

function getSynthesisPrompt(question, personas, responses) {
  const personaBlocks = personas.map((p, i) =>
    '[' + p.name + ', ' + p.title + ']:\n' + responses[i]
  ).join('\n\n---\n\n');

  return `${SAFE_AI_PREAMBLE}

You are a synthesis engine for a multi-perspective critical thinking council. Synthesize WITHOUT papering over genuine disagreements.

QUESTION POSED: "${question}"

COUNCIL RESPONSES:
${personaBlocks}

Generate a structured synthesis with EXACTLY these three components:

COMPONENT 1 — SUMMARY: Identify 2-3 points of GENUINE DISAGREEMENT and any unexpected convergences. Do NOT force consensus. Name which council members hold which positions.

COMPONENT 2 — DECISION FRAMEWORK:
- key_questions: 3-5 questions a critical thinker should ask
- evidence_that_would_change_views: For each perspective, what would shift it
- red_flags: 3-4 warning signs the council collectively identified

COMPONENT 3 — OPEN QUESTIONS: 3-5 questions that remain genuinely unresolved after the council, each with a specific reason WHY it's hard to resolve.

Return ONLY valid JSON in this exact structure:
{
  "summary": "string — 3-4 paragraphs",
  "decision_framework": {
    "key_questions": ["string"],
    "evidence_that_would_change_views": ["string"],
    "red_flags": ["string"]
  },
  "open_questions": [
    { "question": "string", "why_unresolved": "string" }
  ]
}

No markdown fences. No explanation. Just the JSON object.`;
}

// ================================================================
// FALLBACK COUNCIL
// ================================================================
function getDefaultCouncil() {
  return [
    {
      id: "empirical_scientist", name: "Dr. Morgan Wells", title: "Empirical Research Scientist",
      intellectual_tradition: "Scientific empiricism",
      epistemology: "Knowledge is validated through reproducible evidence and falsifiable hypotheses.",
      core_commitment: "Claims require evidence proportional to their extraordinary nature.",
      friction_with: ["appeals to authority without data", "unfalsifiable claims", "confusing correlation with causation"],
      forbidden_rhetoric: ["I feel", "obviously", "everyone knows", "intuitively speaking"],
      vocabulary_register: "empirical_quantitative",
      known_bias: "Systematically undervalues qualitative and experiential knowledge systems.",
      signature_approach: "Leads with evidence, then explicitly states what the evidence cannot tell us.",
      avatar_initials: "MW"
    },
    {
      id: "critical_philosopher", name: "Prof. Aria Chen", title: "Philosopher of Knowledge",
      intellectual_tradition: "Critical rationalism with post-structural influences",
      epistemology: "Understanding requires examining the power structures and assumptions embedded in the question itself.",
      core_commitment: "Every framework for understanding contains hidden normative commitments that must be surfaced.",
      friction_with: ["naive empiricism", "instrumental reasoning", "false value-neutrality"],
      forbidden_rhetoric: ["the data shows", "practically speaking", "at the end of the day", "common sense tells us"],
      vocabulary_register: "philosophical",
      known_bias: "Can over-complicate questions that have clear practical answers.",
      signature_approach: "Always historicises and deconstructs the question before answering it.",
      avatar_initials: "AC"
    },
    {
      id: "policy_pragmatist", name: "Dr. James Okafor", title: "Applied Policy Researcher",
      intellectual_tradition: "Pragmatic institutionalism",
      epistemology: "Truth is what produces workable outcomes within real constraints of institutions and power.",
      core_commitment: "Abstract principles must survive contact with institutional realities to be meaningful.",
      friction_with: ["purely theoretical approaches", "solutions that ignore incentive structures", "ahistorical analysis"],
      forbidden_rhetoric: ["in theory", "ideally", "if people were rational", "the research clearly shows"],
      vocabulary_register: "policy_pragmatic",
      known_bias: "Can be too accommodating of existing power structures.",
      signature_approach: "Leads with institutional context and power dynamics, then evaluates what is achievable.",
      avatar_initials: "JO"
    }
  ];
}

// ================================================================
// HTML FRONTEND
// ================================================================
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>KWEN Council — Critical Thinking Tool</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Outfit:wght@300;400;500;600&family=Crimson+Pro:ital,wght@0,400;0,600;1,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #07091a; --surface: #0c0f22; --surface2: #111428;
  --border: #1c2140; --border2: #252d52;
  --gold: #c9a44a; --gold-light: #e8c06a; --gold-dim: #7a6030;
  --text: #e4dfc8; --text2: #8a9bb8; --text3: #505d7a;
  --danger: #c94a4a; --success: #4ac98a;
  --r: 8px; --r2: 12px; --transition: 0.2s ease;
  --font-display: 'Cormorant Garamond', Georgia, serif;
  --font-body: 'Crimson Pro', Georgia, serif;
  --font-ui: 'Outfit', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; overflow: hidden; }
body { background: var(--bg); color: var(--text); font-family: var(--font-ui); font-size: 15px; line-height: 1.6; }
body::before {
  content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background: radial-gradient(ellipse 60% 50% at 20% 20%, rgba(201,164,74,0.04) 0%, transparent 60%),
              radial-gradient(ellipse 50% 60% at 80% 80%, rgba(74,139,201,0.04) 0%, transparent 60%);
}
#login-page { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; background: var(--bg); }
#login-page.hidden { display: none; }
.login-card {
  text-align: center; padding: 56px 48px; background: var(--surface);
  border: 1px solid var(--border2); border-radius: 20px; max-width: 440px; width: 90%;
  position: relative; box-shadow: 0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(201,164,74,0.1);
}
.login-card::before {
  content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%);
  width: 120px; height: 2px; background: linear-gradient(90deg, transparent, var(--gold), transparent);
}
.login-logo { font-family: var(--font-display); font-size: 42px; font-weight: 700; color: var(--gold-light); letter-spacing: 0.04em; margin-bottom: 4px; }
.login-tagline { font-family: var(--font-body); font-size: 15px; font-style: italic; color: var(--text2); margin-bottom: 36px; }
.login-features { list-style: none; text-align: left; margin-bottom: 40px; display: flex; flex-direction: column; gap: 10px; }
.login-features li { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; color: var(--text2); font-family: var(--font-body); }
.login-features li::before { content: '◆'; color: var(--gold-dim); font-size: 8px; margin-top: 5px; flex-shrink: 0; }
.btn-hf {
  display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%;
  padding: 14px 24px; background: var(--gold); color: #0b0e1a; border: none; border-radius: var(--r2);
  font-family: var(--font-ui); font-size: 14px; font-weight: 600; cursor: pointer;
  transition: background var(--transition), transform var(--transition), box-shadow var(--transition); text-decoration: none;
}
.btn-hf:hover { background: var(--gold-light); transform: translateY(-1px); box-shadow: 0 8px 24px rgba(201,164,74,0.3); }
.btn-hf svg { width: 20px; height: 20px; }
.login-note { margin-top: 16px; font-size: 12px; color: var(--text3); }
#app { display: flex; height: 100vh; position: relative; z-index: 1; }
#app.hidden { display: none; }
#sidebar {
  width: 260px; flex-shrink: 0; background: var(--surface);
  border-right: 1px solid var(--border); display: flex; flex-direction: column;
  transition: width 0.25s ease, opacity 0.25s ease; overflow: hidden;
}
#sidebar.collapsed { width: 0; opacity: 0; }
.sidebar-header { padding: 20px 20px 16px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.sidebar-logo { font-family: var(--font-display); font-size: 22px; font-weight: 700; color: var(--gold-light); letter-spacing: 0.04em; }
.sidebar-logo span { color: var(--text3); font-weight: 400; font-size: 11px; display: block; margin-top: 2px; font-family: var(--font-ui); letter-spacing: 0.08em; text-transform: uppercase; }
.btn-new-chat {
  display: flex; align-items: center; gap: 8px; width: 100%; margin-top: 12px; padding: 9px 14px;
  background: rgba(201,164,74,0.1); border: 1px solid rgba(201,164,74,0.2); border-radius: var(--r);
  color: var(--gold); font-family: var(--font-ui); font-size: 13px; font-weight: 500; cursor: pointer;
  transition: background var(--transition), border-color var(--transition);
}
.btn-new-chat:hover { background: rgba(201,164,74,0.18); border-color: rgba(201,164,74,0.4); }
.btn-new-chat svg { width: 14px; height: 14px; }
.chat-history { flex: 1; overflow-y: auto; padding: 12px 10px; }
.chat-history-item {
  padding: 10px 12px; border-radius: var(--r); cursor: pointer;
  border: 1px solid transparent; margin-bottom: 4px;
  transition: background var(--transition), border-color var(--transition);
}
.chat-history-item:hover { background: var(--surface2); border-color: var(--border); }
.chat-history-item.active { background: var(--surface2); border-color: var(--border2); }
.chi-title { font-size: 13px; color: var(--text); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chi-date { font-size: 11px; color: var(--text3); margin-top: 2px; font-family: var(--font-mono); }
.sidebar-footer { padding: 14px 16px; border-top: 1px solid var(--border); display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.user-avatar { width: 30px; height: 30px; border-radius: 50%; background: var(--gold-dim); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; color: var(--text); flex-shrink: 0; }
.user-info { flex: 1; overflow: hidden; }
.user-name { font-size: 13px; font-weight: 500; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.user-sub { font-size: 11px; color: var(--text3); }
.btn-logout { background: none; border: none; cursor: pointer; color: var(--text3); padding: 4px; border-radius: 4px; transition: color var(--transition); display: flex; align-items: center; }
.btn-logout:hover { color: var(--danger); }
.btn-logout svg { width: 16px; height: 16px; }
#main { flex: 1; display: flex; flex-direction: column; min-width: 0; position: relative; }
.main-header {
  padding: 14px 20px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 12px; flex-shrink: 0;
  background: rgba(12,15,34,0.8); backdrop-filter: blur(8px);
}
.btn-sidebar-toggle { background: none; border: none; cursor: pointer; color: var(--text2); padding: 6px; border-radius: 6px; display: flex; align-items: center; transition: color var(--transition), background var(--transition); }
.btn-sidebar-toggle:hover { color: var(--text); background: var(--surface2); }
.btn-sidebar-toggle svg { width: 18px; height: 18px; }
.main-header-title { font-family: var(--font-display); font-size: 17px; font-weight: 600; color: var(--text2); }
.main-header-badge { font-family: var(--font-mono); font-size: 10px; color: var(--gold-dim); background: rgba(201,164,74,0.06); border: 1px solid rgba(201,164,74,0.12); padding: 2px 8px; border-radius: 20px; letter-spacing: 0.06em; text-transform: uppercase; }
#messages { flex: 1; overflow-y: auto; padding: 24px 24px 8px; display: flex; flex-direction: column; gap: 32px; }
.empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 40px; gap: 16px; }
.empty-state-logo { font-family: var(--font-display); font-size: 52px; font-weight: 700; color: rgba(201,164,74,0.3); letter-spacing: 0.04em; }
.empty-state h2 { font-family: var(--font-display); font-size: 22px; font-weight: 600; color: var(--text2); }
.empty-state p { font-family: var(--font-body); font-size: 16px; color: var(--text3); max-width: 480px; line-height: 1.7; }
.example-questions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 8px; max-width: 560px; }
.ex-q { padding: 8px 16px; background: var(--surface2); border: 1px solid var(--border2); border-radius: 20px; font-size: 13px; color: var(--text2); cursor: pointer; transition: background var(--transition), border-color var(--transition), color var(--transition); }
.ex-q:hover { background: rgba(201,164,74,0.1); border-color: rgba(201,164,74,0.3); color: var(--gold); }
.msg-block { display: flex; flex-direction: column; gap: 16px; }
.user-msg { align-self: flex-end; max-width: 680px; background: rgba(201,164,74,0.08); border: 1px solid rgba(201,164,74,0.15); border-radius: 16px 16px 4px 16px; padding: 14px 18px; font-family: var(--font-body); font-size: 17px; line-height: 1.65; color: var(--text); }
.council-wrap { background: var(--surface); border: 1px solid var(--border2); border-radius: var(--r2); overflow: hidden; }
.council-header { padding: 12px 18px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; background: rgba(201,164,74,0.03); }
.council-label { font-family: var(--font-mono); font-size: 10px; color: var(--gold-dim); letter-spacing: 0.1em; text-transform: uppercase; }
.council-count { font-size: 11px; color: var(--text3); margin-left: auto; }
.table-scroll { overflow-x: auto; }
.council-table { width: max-content; min-width: 100%; border-collapse: collapse; }
.persona-th { min-width: 300px; max-width: 340px; padding: 18px 20px 14px; vertical-align: top; border-right: 1px solid var(--border); border-bottom: 3px solid transparent; text-align: left; }
.persona-th:last-child { border-right: none; }
.persona-header { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 8px; }
.persona-avatar { width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: var(--font-ui); font-size: 13px; font-weight: 700; flex-shrink: 0; }
.persona-name { font-family: var(--font-display); font-size: 17px; font-weight: 700; color: var(--text); line-height: 1.2; }
.persona-title { font-size: 12px; color: var(--text2); margin-top: 2px; font-weight: 400; line-height: 1.3; }
.persona-tradition { display: inline-block; padding: 3px 9px; border-radius: 20px; font-size: 10px; font-family: var(--font-mono); letter-spacing: 0.04em; margin-top: 6px; opacity: 0.9; border: 1px solid; }
.persona-bias { margin-top: 6px; font-size: 11px; font-style: italic; color: var(--text3); font-family: var(--font-body); line-height: 1.4; }
.response-td { padding: 16px 20px; vertical-align: top; border-right: 1px solid var(--border); border-left: 3px solid transparent; }
.response-td:last-child { border-right: none; }
.response-text { font-family: var(--font-body); font-size: 15.5px; line-height: 1.75; color: var(--text); }
.loading-wrap { background: var(--surface); border: 1px solid var(--border2); border-radius: var(--r2); padding: 32px 28px; text-align: center; }
.loading-title { font-family: var(--font-display); font-size: 18px; font-weight: 600; color: var(--text2); }
.loading-phases { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
.loading-phase { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: var(--r); background: var(--surface2); border: 1px solid var(--border); font-size: 13px; color: var(--text2); transition: all 0.3s ease; }
.loading-phase.active { border-color: rgba(201,164,74,0.3); background: rgba(201,164,74,0.05); color: var(--gold); }
.loading-phase.done { color: var(--success); border-color: rgba(58,170,114,0.2); background: rgba(58,170,114,0.05); }
.phase-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text3); flex-shrink: 0; }
.loading-phase.active .phase-dot { background: var(--gold); animation: pulse 1.2s ease-in-out infinite; }
.loading-phase.done .phase-dot { background: var(--success); }
@keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.7); } }
.synthesis-wrap { display: flex; flex-direction: column; gap: 12px; margin-top: 4px; }
.synthesis-card { background: var(--surface); border: 1px solid var(--border2); border-radius: var(--r2); overflow: hidden; }
.synthesis-card-header { padding: 12px 18px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; transition: background var(--transition); }
.synthesis-card-header:hover { background: rgba(255,255,255,0.02); }
.synth-icon { width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 13px; flex-shrink: 0; }
.synth-title { font-family: var(--font-display); font-size: 16px; font-weight: 700; color: var(--text); }
.synth-sub { font-size: 12px; color: var(--text3); margin-left: auto; }
.synth-chevron { margin-left: auto; color: var(--text3); transition: transform 0.2s ease; }
.synth-chevron.open { transform: rotate(180deg); }
.synthesis-body { padding: 18px 20px; display: none; }
.synthesis-body.open { display: block; }
.synth-summary { font-family: var(--font-body); font-size: 16px; line-height: 1.8; color: var(--text); }
.synth-summary p + p { margin-top: 12px; }
.framework-section { margin-bottom: 20px; }
.framework-section:last-child { margin-bottom: 0; }
.framework-label { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--gold-dim); margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
.framework-label::after { content: ''; flex: 1; height: 1px; background: var(--border); }
.framework-list { list-style: none; display: flex; flex-direction: column; gap: 7px; }
.framework-list li { display: flex; align-items: flex-start; gap: 10px; font-family: var(--font-body); font-size: 15px; color: var(--text); line-height: 1.6; }
.framework-list li::before { content: '→'; color: var(--gold-dim); flex-shrink: 0; margin-top: 1px; font-size: 12px; }
.open-questions { display: flex; flex-direction: column; gap: 12px; }
.oq-item { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--r); padding: 14px 16px; }
.oq-num { font-family: var(--font-mono); font-size: 10px; color: var(--gold-dim); margin-bottom: 4px; }
.oq-question { font-family: var(--font-body); font-size: 16px; font-weight: 600; color: var(--text); margin-bottom: 6px; line-height: 1.5; }
.oq-why { font-family: var(--font-body); font-size: 14px; font-style: italic; color: var(--text2); line-height: 1.5; }
.oq-why::before { content: 'Why unresolved: '; color: var(--text3); font-style: normal; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
#input-area { padding: 16px 24px 20px; border-top: 1px solid var(--border); background: rgba(7,9,26,0.95); backdrop-filter: blur(10px); flex-shrink: 0; }
.input-wrap { background: var(--surface); border: 1px solid var(--border2); border-radius: var(--r2); display: flex; flex-direction: column; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
.input-wrap:focus-within { border-color: rgba(201,164,74,0.4); box-shadow: 0 0 0 3px rgba(201,164,74,0.06); }
#question-input { background: none; border: none; outline: none; padding: 14px 16px 8px; font-family: var(--font-body); font-size: 16px; color: var(--text); resize: none; max-height: 160px; min-height: 50px; line-height: 1.6; }
#question-input::placeholder { color: var(--text3); }
.input-toolbar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-top: 1px solid var(--border); }
.input-hint { font-size: 11px; color: var(--text3); font-family: var(--font-mono); }
.btn-send { margin-left: auto; display: flex; align-items: center; gap: 7px; padding: 8px 18px; background: var(--gold); border: none; border-radius: 8px; font-family: var(--font-ui); font-size: 13px; font-weight: 600; color: #0b0e1a; cursor: pointer; transition: background var(--transition), transform var(--transition), box-shadow var(--transition); }
.btn-send:hover:not(:disabled) { background: var(--gold-light); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(201,164,74,0.25); }
.btn-send:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-send svg { width: 14px; height: 14px; }
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 3px; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.fade-in { animation: fadeIn 0.35s ease forwards; }
.disclaimer { font-size: 11px; color: var(--text3); text-align: center; padding: 8px 0 0; font-family: var(--font-body); font-style: italic; }
@media (max-width: 700px) { #sidebar { position: absolute; top: 0; bottom: 0; left: 0; z-index: 50; } .persona-th { min-width: 260px; } }
</style>
</head>
<body>
<div id="login-page" class="hidden">
  <div class="login-card">
    <div class="login-logo">KWEN</div>
    <div class="login-tagline">Critical Thinking Research Council</div>
    <ul class="login-features">
      <li>Dynamic council of 3–5 specialist personas per topic</li>
      <li>Anti-homogenisation: each voice has locked epistemic identity</li>
      <li>Tabular debate format with genuine intellectual friction</li>
      <li>Synthesis: summary, decision framework &amp; open questions</li>
      <li>Full chat history preserved across sessions</li>
    </ul>
    <a href="/api/auth/login" class="btn-hf">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18L20 8.5v7.07l-8 4-8-4V8.5L12 4.18z"/></svg>
      Continue with Hugging Face
    </a>
    <p class="login-note">Uses your HF account for authentication &amp; model inference</p>
  </div>
</div>

<div id="app" class="hidden">
  <nav id="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-logo">KWEN <span>Critical Thinking Council</span></div>
      <button class="btn-new-chat" onclick="newChat()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        New Council Session
      </button>
    </div>
    <div class="chat-history" id="chat-history-list"></div>
    <div class="sidebar-footer">
      <div class="user-avatar" id="user-avatar">?</div>
      <div class="user-info">
        <div class="user-name" id="user-name">Loading...</div>
        <div class="user-sub">Research Session</div>
      </div>
      <button class="btn-logout" onclick="logout()" title="Sign out">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>
    </div>
  </nav>
  <div id="main">
    <header class="main-header">
      <button class="btn-sidebar-toggle" onclick="toggleSidebar()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
      <span class="main-header-title" id="header-title">Council Chamber</span>
      <span class="main-header-badge" id="council-badge" style="display:none">Council Active</span>
    </header>
    <div id="messages">
      <div class="empty-state" id="empty-state">
        <div class="empty-state-logo">KWEN</div>
        <h2>Convene Your Council</h2>
        <p>Ask any question. A dynamic council of specialists will be assembled to examine it from genuinely different perspectives — not diplomatic balance, but real intellectual friction.</p>
        <div class="example-questions">
          <span class="ex-q" onclick="setQuestion(this.textContent)">Is economic growth compatible with climate stability?</span>
          <span class="ex-q" onclick="setQuestion(this.textContent)">Does social media strengthen or weaken democracy?</span>
          <span class="ex-q" onclick="setQuestion(this.textContent)">Can artificial general intelligence be made safe?</span>
          <span class="ex-q" onclick="setQuestion(this.textContent)">Is universal basic income economically viable?</span>
          <span class="ex-q" onclick="setQuestion(this.textContent)">How should we think about consciousness in machines?</span>
        </div>
      </div>
    </div>
    <div id="input-area">
      <div class="input-wrap">
        <textarea id="question-input" rows="2" placeholder="Ask your council a question for critical analysis..." onkeydown="handleKeydown(event)" oninput="autoResize(this)"></textarea>
        <div class="input-toolbar">
          <span class="input-hint">Shift+Enter for new line</span>
          <button class="btn-send" id="send-btn" onclick="sendMessage()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            Convene Council
          </button>
        </div>
      </div>
      <p class="disclaimer">For research &amp; education only. Not professional medical, legal, or financial advice.</p>
    </div>
  </div>
</div>

<script>
let currentUser = null, currentChatId = null, chatHistory = [], isLoading = false;

async function init() {
  try {
    const res = await fetch('/api/session', { credentials: 'same-origin' });
    const data = await res.json();
    if (data.authenticated) { currentUser = data.user; showApp(); loadChatHistory(); }
    else showLogin();
  } catch(e) { showLogin(); }
}

function showLogin() { document.getElementById('login-page').classList.remove('hidden'); document.getElementById('app').classList.add('hidden'); }
function showApp() {
  document.getElementById('login-page').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  const initials = (currentUser.name || currentUser.username || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
  document.getElementById('user-avatar').textContent = initials;
  document.getElementById('user-name').textContent = currentUser.name || currentUser.username;
}
function logout() { window.location.href = '/api/auth/logout'; }
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('collapsed'); }
function newChat() {
  currentChatId = null; chatHistory = [];
  document.getElementById('messages').innerHTML = '';
  const es = document.createElement('div'); es.id = 'empty-state'; es.className = 'empty-state';
  es.innerHTML = '<div class="empty-state-logo">KWEN</div><h2>Convene Your Council</h2><p>Ask any question. A dynamic council of specialists will examine it from genuinely different perspectives.</p><div class="example-questions"><span class="ex-q" onclick="setQuestion(this.textContent)">Is economic growth compatible with climate stability?</span><span class="ex-q" onclick="setQuestion(this.textContent)">Does social media strengthen or weaken democracy?</span><span class="ex-q" onclick="setQuestion(this.textContent)">Can artificial general intelligence be made safe?</span></div>';
  document.getElementById('messages').appendChild(es);
  document.getElementById('header-title').textContent = 'Council Chamber';
  document.getElementById('council-badge').style.display = 'none';
  document.querySelectorAll('.chat-history-item').forEach(el => el.classList.remove('active'));
}
function setQuestion(q) { const inp = document.getElementById('question-input'); inp.value = q; inp.focus(); autoResize(inp); }
function handleKeydown(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }
function autoResize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px'; }

async function sendMessage() {
  const input = document.getElementById('question-input');
  const question = input.value.trim();
  if (!question || isLoading) return;
  const empty = document.getElementById('empty-state');
  if (empty) empty.remove();
  isLoading = true; input.value = ''; input.style.height = 'auto';
  document.getElementById('send-btn').disabled = true;
  const msgBlock = document.createElement('div');
  msgBlock.className = 'msg-block fade-in';
  const userMsg = document.createElement('div');
  userMsg.className = 'user-msg'; userMsg.textContent = question;
  msgBlock.appendChild(userMsg);
  const loadingEl = createLoadingUI();
  msgBlock.appendChild(loadingEl);
  document.getElementById('messages').appendChild(msgBlock);
  scrollToBottom();
  const phases = loadingEl.querySelectorAll('.loading-phase');
  let pi = 0;
  const piv = setInterval(() => {
    if (pi > 0) { phases[pi-1].classList.remove('active'); phases[pi-1].classList.add('done'); }
    if (pi < phases.length) phases[pi].classList.add('active');
    pi++; if (pi > phases.length) clearInterval(piv);
  }, 2200);
  try {
    const res = await fetch('/api/chat', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, chatId: currentChatId, history: chatHistory.slice(-3) })
    });
    clearInterval(piv);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    currentChatId = data.chatId;
    chatHistory.push({ question, responses: data.responses });
    loadingEl.remove();
    msgBlock.appendChild(renderCouncilTable(data.council, data.responses));
    if (data.synthesis) msgBlock.appendChild(renderSynthesis(data.synthesis));
    document.getElementById('header-title').textContent = question.slice(0,50) + (question.length > 50 ? '...' : '');
    document.getElementById('council-badge').style.display = '';
    scrollToBottom(); loadChatHistory();
  } catch (err) {
    clearInterval(piv);
    loadingEl.innerHTML = '<p style="color:var(--danger);padding:20px;text-align:center;font-family:var(--font-body)">Error: ' + err.message + '. Please try again.</p>';
  }
  isLoading = false; document.getElementById('send-btn').disabled = false;
}

function createLoadingUI() {
  const d = document.createElement('div'); d.className = 'loading-wrap fade-in';
  d.innerHTML = '<div class="loading-title">Assembling your council</div><div class="loading-phases"><div class="loading-phase"><div class="phase-dot"></div>Analysing topic &amp; selecting specialist perspectives</div><div class="loading-phase"><div class="phase-dot"></div>Locking epistemic identities — preventing homogenisation</div><div class="loading-phase"><div class="phase-dot"></div>Consulting each specialist independently in parallel</div><div class="loading-phase"><div class="phase-dot"></div>Synthesising — identifying genuine tensions &amp; open questions</div></div>';
  return d;
}

const CVARS = [
  {bg:'#c9844a',light:'#e8a96a',dark:'#3d2010'},{bg:'#4a8bc9',light:'#6aaae8',dark:'#10203d'},
  {bg:'#c94a72',light:'#e86a92',dark:'#3d1020'},{bg:'#7a4ac9',light:'#9a6ae8',dark:'#1e1040'},
  {bg:'#3aaa72',light:'#5aca92',dark:'#0d3020'}
];

function renderCouncilTable(council, responses) {
  const wrap = document.createElement('div'); wrap.className = 'council-wrap fade-in';
  const hdr = document.createElement('div'); hdr.className = 'council-header';
  hdr.innerHTML = '<span class="council-label">&#9670; Council Perspectives</span><span class="council-count">' + council.length + ' Specialists</span>';
  wrap.appendChild(hdr);
  const scroll = document.createElement('div'); scroll.className = 'table-scroll';
  const table = document.createElement('table'); table.className = 'council-table';
  const thead = document.createElement('thead'); const hrow = document.createElement('tr');
  council.forEach((p, i) => {
    const c = CVARS[i % CVARS.length]; const th = document.createElement('th'); th.className = 'persona-th'; th.style.borderBottomColor = c.bg;
    th.innerHTML = '<div class="persona-header"><div class="persona-avatar" style="background:' + c.dark + ';color:' + c.light + ';border:1.5px solid ' + c.bg + '">' + (p.avatar_initials || p.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()) + '</div><div><div class="persona-name">' + esc(p.name) + '</div><div class="persona-title">' + esc(p.title) + '</div></div></div><span class="persona-tradition" style="color:' + c.light + ';border-color:' + c.bg + '40;background:' + c.dark + '">' + esc(p.intellectual_tradition) + '</span><div class="persona-bias">Bias: ' + esc(p.known_bias) + '</div>';
    hrow.appendChild(th);
  });
  thead.appendChild(hrow); table.appendChild(thead);
  const tbody = document.createElement('tbody'); const rrow = document.createElement('tr');
  responses.forEach((r, i) => {
    const c = CVARS[i % CVARS.length]; const td = document.createElement('td'); td.className = 'response-td'; td.style.borderLeftColor = c.bg;
    td.innerHTML = '<div class="response-text">' + '<p>' + esc(r).replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>') + '</p></div>';
    rrow.appendChild(td);
  });
  tbody.appendChild(rrow); table.appendChild(tbody); scroll.appendChild(table); wrap.appendChild(scroll);
  return wrap;
}

function renderSynthesis(synthesis) {
  const wrap = document.createElement('div'); wrap.className = 'synthesis-wrap fade-in';
  wrap.appendChild(makeSynthCard('&#9670;','rgba(201,164,74,0.15)','var(--gold)','Council Summary','Key agreements, tensions &amp; positions', body => {
    const div = document.createElement('div'); div.className = 'synth-summary';
    div.innerHTML = (synthesis.summary||'').split('\n\n').filter(Boolean).map(p=>'<p>'+esc(p)+'</p>').join('');
    body.appendChild(div);
  }));
  const fw = synthesis.decision_framework || {};
  wrap.appendChild(makeSynthCard('&#9671;','rgba(74,139,201,0.12)','#4a8bc9','Decision Framework','Questions, evidence thresholds &amp; red flags', body => {
    [{label:'Critical Questions to Ask',items:fw.key_questions},{label:'Evidence That Would Shift Each View',items:fw.evidence_that_would_change_views},{label:'Red Flags & Warning Signs',items:fw.red_flags}].forEach(s => {
      if (!s.items||!s.items.length) return;
      const sec = document.createElement('div'); sec.className = 'framework-section';
      sec.innerHTML = '<div class="framework-label">'+esc(s.label)+'</div>';
      const ul = document.createElement('ul'); ul.className = 'framework-list';
      s.items.forEach(item => { const li=document.createElement('li'); li.textContent=item; ul.appendChild(li); });
      sec.appendChild(ul); body.appendChild(sec);
    });
  }));
  wrap.appendChild(makeSynthCard('?','rgba(122,74,201,0.12)','#7a4ac9','Open Questions','What remains genuinely unresolved &amp; why', body => {
    const div = document.createElement('div'); div.className = 'open-questions';
    (synthesis.open_questions||[]).forEach((oq,i) => {
      const item = document.createElement('div'); item.className = 'oq-item';
      item.innerHTML = '<div class="oq-num">QUESTION '+(i+1)+'</div><div class="oq-question">'+esc(oq.question)+'</div><div class="oq-why">'+esc(oq.why_unresolved)+'</div>';
      div.appendChild(item);
    }); body.appendChild(div);
  }));
  return wrap;
}

function makeSynthCard(icon,iconBg,iconColor,title,sub,fn) {
  const card = document.createElement('div'); card.className = 'synthesis-card';
  const hdr = document.createElement('div'); hdr.className = 'synthesis-card-header';
  hdr.innerHTML = '<div class="synth-icon" style="background:'+iconBg+';color:'+iconColor+'">'+icon+'</div><span class="synth-title">'+title+'</span><span class="synth-sub">'+sub+'</span><svg class="synth-chevron open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="18 15 12 9 6 15"/></svg>';
  const body = document.createElement('div'); body.className = 'synthesis-body open'; fn(body);
  hdr.addEventListener('click', () => { body.classList.toggle('open'); hdr.querySelector('.synth-chevron').classList.toggle('open'); });
  card.appendChild(hdr); card.appendChild(body); return card;
}

async function loadChatHistory() {
  try {
    const res = await fetch('/api/history', { credentials: 'same-origin' });
    const data = await res.json(); const list = document.getElementById('chat-history-list');
    if (data.chats && data.chats.length > 0) {
      list.innerHTML = data.chats.map(c => '<div class="chat-history-item'+(c.id===currentChatId?' active':'')+'" onclick="loadChat(\''+c.id+'\')"><div class="chi-title">'+esc(c.first_question||'Session')+'</div><div class="chi-date">'+new Date(c.created_at).toLocaleDateString()+'</div></div>').join('');
    }
  } catch(e) {}
}

async function loadChat(chatId) {
  try {
    const res = await fetch('/api/history?chatId='+chatId, { credentials: 'same-origin' });
    const data = await res.json();
    if (data && data.messages && data.messages.length > 0) {
      currentChatId = chatId; chatHistory = data.messages.map(m => ({ question: m.question, responses: m.responses }));
      const msgs = document.getElementById('messages'); msgs.innerHTML = '';
      data.messages.forEach(m => {
        const mb = document.createElement('div'); mb.className = 'msg-block fade-in';
        const um = document.createElement('div'); um.className = 'user-msg'; um.textContent = m.question; mb.appendChild(um);
        if (m.council && m.responses) mb.appendChild(renderCouncilTable(m.council, m.responses));
        if (m.synthesis) mb.appendChild(renderSynthesis(m.synthesis));
        msgs.appendChild(mb);
      });
      const lq = data.messages[data.messages.length-1].question;
      document.getElementById('header-title').textContent = lq.slice(0,50)+(lq.length>50?'...':'');
      document.getElementById('council-badge').style.display = ''; scrollToBottom();
      document.querySelectorAll('.chat-history-item').forEach(el => { el.classList.toggle('active', el.getAttribute('onclick') && el.getAttribute('onclick').includes(chatId)); });
    }
  } catch(e) { console.error(e); }
}

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function scrollToBottom() { const m = document.getElementById('messages'); setTimeout(() => m.scrollTop = m.scrollHeight, 50); }
init();
</script>
</body>
</html>`;

// ================================================================
// HELPERS
// ================================================================
async function generateSessionId() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2,'0')).join('');
}

function getSessionIdFromCookie(request) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  return m ? m[1] : null;
}

async function getSession(request) {
  const sid = getSessionIdFromCookie(request);
  if (!sid) return null;
  try {
    const raw = await SESSIONS.get(sid);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (session.expires_at < Date.now()) { await SESSIONS.delete(sid); return null; }
    return session;
  } catch(e) { return null; }
}

function jsonResp(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', ...extra }
  });
}

// ================================================================
// HUGGING FACE INFERENCE
// ================================================================
async function callQwen(messages, hfToken, opts = {}) {
  const model = (typeof HF_MODEL !== 'undefined' ? HF_MODEL : 'Qwen/Qwen2.5-72B-Instruct');
  const url = 'https://api-inference.huggingface.co/models/' + model + '/v1/chat/completions';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + hfToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: opts.max_tokens || 600, temperature: opts.temperature || 0.72, stream: false })
  });
  if (!resp.ok) { const t = await resp.text(); throw new Error('HuggingFace API error ' + resp.status + ': ' + t.slice(0,200)); }
  const data = await resp.json();
  if (!data.choices || !data.choices[0]) throw new Error('Unexpected API response format');
  return data.choices[0].message.content;
}

async function generateCouncil(topic, hfToken) {
  const text = await callQwen([{ role: 'user', content: getCouncilGenerationPrompt(topic) }], hfToken, { max_tokens: 2500, temperature: 0.88 });
  try {
    const clean = text.replace(/\`\`\`json\s?/g,'').replace(/\`\`\`\s?/g,'').trim();
    const council = JSON.parse(clean);
    if (!Array.isArray(council) || council.length < 2) throw new Error('invalid');
    return council.slice(0,5);
  } catch(e) { return getDefaultCouncil(); }
}

async function getPersonaResponse(persona, allPersonas, question, history, hfToken) {
  const personaIdx = allPersonas.findIndex(p => p.id === persona.id);
  const historyMessages = history.slice(-3).flatMap(h => {
    const pr = h.responses && h.responses[personaIdx] ? h.responses[personaIdx] : '';
    if (!pr) return [{ role: 'user', content: h.question }];
    return [{ role: 'user', content: h.question }, { role: 'assistant', content: pr }];
  });
  return callQwen([
    { role: 'system', content: getPersonaSystemPrompt(persona, allPersonas) },
    ...historyMessages,
    { role: 'user', content: question }
  ], hfToken, { max_tokens: 450, temperature: 0.74 });
}

async function generateSynthesis(question, council, responses, hfToken) {
  const text = await callQwen([{ role: 'user', content: getSynthesisPrompt(question, council, responses) }], hfToken, { max_tokens: 1800, temperature: 0.62 });
  try {
    const clean = text.replace(/\`\`\`json\s?/g,'').replace(/\`\`\`\s?/g,'').trim();
    return JSON.parse(clean);
  } catch(e) {
    return { summary: text, decision_framework: { key_questions:[], evidence_that_would_change_views:[], red_flags:[] }, open_questions:[] };
  }
}

// ================================================================
// ROUTE HANDLERS
// ================================================================
async function handleLogin(request) {
  const params = new URLSearchParams({
    client_id: HF_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid profile inference-api',
    state: crypto.randomUUID()
  });
  return Response.redirect('https://huggingface.co/oauth/authorize?' + params.toString(), 302);
}

async function handleCallback(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) return Response.redirect(APP_URL + '?auth_error=1', 302);

  const tokenResp = await fetch('https://huggingface.co/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, client_id: HF_CLIENT_ID, client_secret: HF_CLIENT_SECRET })
  });
  if (!tokenResp.ok) return Response.redirect(APP_URL + '?auth_error=token', 302);

  const tokenData = await tokenResp.json();
  if (!tokenData.access_token) return Response.redirect(APP_URL + '?auth_error=no_token', 302);

  const userResp = await fetch('https://huggingface.co/oauth/userinfo', {
    headers: { 'Authorization': 'Bearer ' + tokenData.access_token }
  });
  const userInfo = await userResp.json();

  const sessionId = await generateSessionId();
  const sessionData = {
    hf_token: tokenData.access_token,
    user: { id: userInfo.sub, name: userInfo.name || userInfo.preferred_username, username: userInfo.preferred_username, avatar: userInfo.picture || null },
    created_at: Date.now(),
    expires_at: Date.now() + 86400000
  };

  await SESSIONS.put(sessionId, JSON.stringify(sessionData), { expirationTtl: 86400 });

  return new Response(null, {
    status: 302,
    headers: {
      'Location': APP_URL,
      'Set-Cookie': 'session=' + sessionId + '; HttpOnly; Secure; SameSite=Strict; Max-Age=86400; Path=/'
    }
  });
}

async function handleLogout(request) {
  const sid = getSessionIdFromCookie(request);
  if (sid) { try { await SESSIONS.delete(sid); } catch(e) {} }
  return new Response(null, {
    status: 302,
    headers: { 'Location': APP_URL, 'Set-Cookie': 'session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/' }
  });
}

async function handleSession(request) {
  const session = await getSession(request);
  if (!session) return jsonResp({ authenticated: false });
  return jsonResp({ authenticated: true, user: session.user });
}

async function handleChat(request) {
  if (request.method !== 'POST') return jsonResp({ error: 'Method not allowed' }, 405);
  const session = await getSession(request);
  if (!session) return jsonResp({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await request.json(); } catch(e) { return jsonResp({ error: 'Invalid JSON' }, 400); }
  const { question, chatId, history = [] } = body;
  if (!question || typeof question !== 'string' || !question.trim()) return jsonResp({ error: 'Question is required' }, 400);
  if (question.length > 2000) return jsonResp({ error: 'Question too long (max 2000 chars)' }, 400);

  try {
    const council = await generateCouncil(question.trim(), session.hf_token);
    const responses = await Promise.all(council.map(p => getPersonaResponse(p, council, question, history, session.hf_token)));
    const synthesis = await generateSynthesis(question, council, responses, session.hf_token);

    const resolvedChatId = chatId || crypto.randomUUID();
    const chatKey = 'chat:' + session.user.id + ':' + resolvedChatId;
    let chatData;
    try {
      const existing = await CHATS.get(chatKey);
      chatData = existing ? JSON.parse(existing) : { messages: [], created_at: Date.now(), first_question: question };
    } catch(e) { chatData = { messages: [], created_at: Date.now(), first_question: question }; }

    chatData.messages.push({ id: crypto.randomUUID(), question, council, responses, synthesis, timestamp: Date.now() });
    await CHATS.put(chatKey, JSON.stringify(chatData), { expirationTtl: 604800 });

    return jsonResp({ chatId: resolvedChatId, council, responses, synthesis });
  } catch(err) {
    return jsonResp({ error: err.message || 'Processing failed. Please try again.' }, 500);
  }
}

async function handleHistory(request) {
  const session = await getSession(request);
  if (!session) return jsonResp({ error: 'Unauthorized' }, 401);
  const url = new URL(request.url);
  const chatId = url.searchParams.get('chatId');
  if (chatId) {
    try {
      const raw = await CHATS.get('chat:' + session.user.id + ':' + chatId);
      if (!raw) return jsonResp({ messages: [] });
      return new Response(raw, { headers: { 'Content-Type': 'application/json' } });
    } catch(e) { return jsonResp({ messages: [] }); }
  }
  return jsonResp({ chats: [] });
}

// ================================================================
// SERVICE WORKER ENTRY POINT
// (Service Worker format — works with Cloudflare Dashboard upload)
// ================================================================
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/auth/login')    return handleLogin(request);
  if (path === '/api/auth/callback') return handleCallback(request);
  if (path === '/api/auth/logout')   return handleLogout(request);
  if (path === '/api/session')       return handleSession(request);
  if (path === '/api/chat')          return handleChat(request);
  if (path === '/api/history')       return handleHistory(request);

  return new Response(HTML, {
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(), camera=(), microphone=()'
    }
  });
}
