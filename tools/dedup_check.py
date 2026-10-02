#!/usr/bin/env python3
"""dedup_check.py - mandatory semantic dedup of hook + headline against the last N published posts.

Linear scan over state/published-embeddings.jsonl (no vector DB; see the scale canary in config/pipeline.json).
Embeddings are local (fastembed, BAAI/bge-small-en-v1.5, no credentials). Lines written by a different model are ignored.

Usage:
    python tools/dedup_check.py check --hook "..." --headline "..." [--threshold 0.85] [--json]
    python tools/dedup_check.py add --post-id ID --date 2026-09-24 --hook "..." --headline "..."
    python tools/dedup_check.py selftest
Backends: fastembed (default, real) | hash (offline, lexical only; for tests and CI, never for production decisions).
Exit codes: 0 = novel enough | 1 = too similar (rewrite requested) | 2 = error.
"""
import argparse
import json
import math
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CFG = json.loads((ROOT / "config" / "pipeline.json").read_text(encoding="utf-8"))["dedup"]
STORE = ROOT / "state" / "published-embeddings.jsonl"
os.environ.setdefault("FASTEMBED_CACHE_PATH", str(ROOT / ".cache" / "fastembed"))
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

_model = None


def embed(texts, backend):
    """-> (model_id, list[list[float]]), each vector L2-normalised."""
    if backend == "hash":
        return "hash-ngram-v1", [_hash_vec(t) for t in texts]
    global _model
    from fastembed import TextEmbedding
    if _model is None:
        _model = TextEmbedding(CFG["embedding_model"], cache_dir=os.environ["FASTEMBED_CACHE_PATH"])
    vecs = []
    for v in _model.embed(texts):
        n = math.sqrt(sum(x * x for x in v)) or 1.0
        vecs.append([float(x) / n for x in v])
    return CFG["embedding_model"], vecs


def _hash_vec(text, dim=512):
    t = " " + " ".join(text.lower().split()) + " "
    v = [0.0] * dim
    for i in range(len(t) - 2):
        v[hash(t[i:i + 3]) % dim] += 1.0
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


def cos(a, b):
    return sum(x * y for x, y in zip(a, b))


def load_recent(model_id):
    rows = []
    if STORE.exists():
        for line in STORE.read_text(encoding="utf-8").splitlines():
            if line.strip():
                rows.append(json.loads(line))
    rows = rows[-CFG["compare_against_last_n"]:]
    return [r for r in rows if r["model"] == model_id], len(rows)


def check(hook, headline, threshold, backend):
    model_id, (hv, tv) = embed([hook, headline], backend)   # includes one-off model load; not part of the canary
    t0 = time.perf_counter()                                 # canary = the linear scan over stored embeddings
    rows, total = load_recent(model_id)
    best = {"similarity": 0.0, "post_id": None, "pair": None}
    for r in rows:
        for label, a, b in (("hook~hook", hv, r["hook_embedding"]), ("headline~headline", tv, r["headline_embedding"]),
                            ("hook~headline", hv, r["headline_embedding"]), ("headline~hook", tv, r["hook_embedding"])):
            s = cos(a, b)
            if s > best["similarity"]:
                best = {"similarity": s, "post_id": r["post_id"], "pair": label}
    ms = (time.perf_counter() - t0) * 1000
    warnings = []
    if ms > CFG["latency_canary_ms"]:
        warnings.append(f"dedup took {ms:.0f}ms (> {CFG['latency_canary_ms']}ms canary): revisit storage")
    if total >= CFG["corpus_canary_posts"]:
        warnings.append(f"{total} embeddings stored (>= {CFG['corpus_canary_posts']} canary): consider a real vector DB")
    return {"passed": best["similarity"] < threshold, "threshold": threshold, "max_similarity": round(best["similarity"], 4),
            "closest_post_id": best["post_id"], "closest_pair": best["pair"], "compared": len(rows), "model": model_id,
            "elapsed_ms": round(ms, 1), "warnings": warnings}


def add(post_id, date, hook, headline, backend):
    model_id, (hv, tv) = embed([hook, headline], backend)
    if STORE.exists() and any(json.loads(l)["post_id"] == post_id for l in STORE.read_text(encoding="utf-8").splitlines() if l.strip()):
        return False                                    # idempotent
    line = json.dumps({"post_id": post_id, "date": date, "model": model_id, "hook": hook, "headline": headline,
                       "hook_embedding": [round(x, 6) for x in hv], "headline_embedding": [round(x, 6) for x in tv]}, ensure_ascii=False)
    tmp = STORE.with_suffix(".jsonl.tmp")
    tmp.write_text((STORE.read_text(encoding="utf-8") if STORE.exists() else "") + line + "\n", encoding="utf-8")
    os.replace(tmp, STORE)
    return True


def main(argv=None):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--backend", choices=("fastembed", "hash"), default=CFG["embedding_backend"])
    ap.add_argument("--json", action="store_true")
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("check"); c.add_argument("--hook", required=True); c.add_argument("--headline", required=True)
    c.add_argument("--threshold", type=float, default=CFG["threshold"])
    d = sub.add_parser("add"); d.add_argument("--post-id", required=True); d.add_argument("--date", required=True)
    d.add_argument("--hook", required=True); d.add_argument("--headline", required=True)
    sub.add_parser("selftest")
    a = ap.parse_args(argv)
    try:
        if a.cmd == "check":
            res = check(a.hook, a.headline, a.threshold, a.backend)
            print(json.dumps(res, indent=2) if a.json else
                  f"{'PASS' if res['passed'] else 'TOO SIMILAR'}  max_similarity={res['max_similarity']} (threshold {res['threshold']})"
                  f" closest={res['closest_post_id']} [{res['closest_pair']}] compared={res['compared']} {res['elapsed_ms']}ms"
                  + "".join(f"\n  warn {w}" for w in res["warnings"]))
            return 0 if res["passed"] else 1
        if a.cmd == "add":
            print("added" if add(a.post_id, a.date, a.hook, a.headline, a.backend) else "already present; nothing written")
            return 0
        if a.cmd == "selftest":
            model_id, v = embed(["Anger is a messenger", "Anger is a signal from your inner world", "The tiffin was not hers"], a.backend)
            print(f"model={model_id} dim={len(v[0])} paraphrase={cos(v[0], v[1]):.3f} unrelated={cos(v[0], v[2]):.3f}")
            return 0
    except Exception as e:
        print(f"ERROR {type(e).__name__}: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
