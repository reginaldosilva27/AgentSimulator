# Plan: Arena — semantic cache

> The HOW for `112-arena-semantic-cache`. Independent of 108–111; if 110 lands first,
> the preset pins use equilibrium numbers.

## Approach

- **Catalog** (`frontend/src/arena/components.ts`): add `"semanticCache"` to
  `ArenaKind`, `BENCHMARKS` (`baseCapacity: 20_000, baseLatencyMs: 10` — an
  embedding + vector lookup service; comment the assumption), `KIND_META` (labels,
  description, info, clouds, scaling: cluster nodes / node memory), `PALETTE_ORDER`
  (after `cache`), and a new `DEFAULT_SEMANTIC_HIT_RATIO = 0.25`.
- **Model** (`frontend/src/arena/model.ts`): generalize the hit-ratio branch —
  `const hit = isCacheLike(spec.kind) ? spec.hitRatio ?? defaultHitFor(spec.kind) : 0`
  where `isCacheLike = kind === "cache" || kind === "semanticCache"`. No other
  propagation change (topological order already makes cpr-on-downstream apply to
  misses only).
- **Scale panel** (`ArenaCanvas.tsx` hit-ratio slider): show for `semanticCache`
  exactly as for `cache` (reuse the existing control, per-kind default).
- **Example** (`examples.ts`): new preset `semantic-cache` — same shape as
  `scale-llm`-era designs but sized so the LLM tier is warning/critical without the
  cache and healthy with it (final numbers depend on whether 110 landed; pin in
  `examples.test.ts` either way).

## Affected files

**Frontend**
- `frontend/src/arena/components.ts` — kind, benchmark, meta, default hit ratio.
- `frontend/src/arena/model.ts` — cache-like forwarding.
- `frontend/src/arena/ArenaCanvas.tsx` — hit-ratio control applies to the new kind.
- `frontend/src/arena/examples.ts` — new preset (en + pt).
- `frontend/src/i18n/*` — only if any shared chrome string is needed (kind meta lives
  in `components.ts`).
- Tests: `components.test.ts`, `model.test.ts`, `examples.test.ts`, `i18n.test.ts`.

**Backend** — none.

## Protocol changes (constitution §1)

None.

## Data model changes

None (localStorage designs with the new kind round-trip through the existing schema —
`kind` is a string; older builds never see it).

## i18n strings (constitution §4)

All in `KIND_META.semanticCache` (en/pt):

| field | en | pt |
|---|---|---|
| label | `Semantic Cache` | `Cache Semântico` |
| description | `Answers repeated/similar questions without calling the model` | `Responde perguntas repetidas/parecidas sem chamar o modelo` |
| info | `Caches answers by embedding similarity: hits skip the model entirely; only misses continue. Honest hit rates are modest (~20–30% — it dedupes paraphrases, not sessions) and a too-loose threshold can serve a WRONG similar answer. Units are cluster nodes; size is node memory.` | `Faz cache de respostas por similaridade de embeddings: acertos pulam o modelo; só as falhas seguem adiante. Taxas de acerto honestas são modestas (~20–30% — ele deduplica paráfrases, não sessões) e um limiar frouxo demais pode servir uma resposta parecida ERRADA. As unidades são nós do cluster; o tamanho é a memória do nó.` |
| scaling.unit | `Cluster nodes` | `Nós do cluster` |
| scaling.sizeMeaning | `Node type (memory)` | `Tipo do nó (memória)` |

Preset title/description: `Semantic cache shields the fleet` / `Cache semântico
protege a frota` (+ bilingual description with the load story).

## Cloud map (constitution §5)

| element | generic | azure | aws | gcp |
|---|---|---|---|---|
| semanticCache | Semantic response cache | Azure Managed Redis (vector) | MemoryDB (vector search) | Memorystore for Redis |

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | kind present in palette order, meta complete (label/desc/info/clouds/scaling, en+pt) | `components.test.ts` |
| AC2 | forwards 1−hit; default 0.25; `cache` default still 0.8 | `model.test.ts` |
| AC3 | LLM arriving −25% with the cache; cpr composes on misses (numeric pin) | `model.test.ts` |
| AC4 | preset pinned: without cache warning/critical, with cache healthy | `examples.test.ts` |
| AC5 | info strings parity en/pt | `i18n.test.ts` / `components.test.ts` |

## Risks / trade-offs

- Two cache kinds can confuse — the descriptions differentiate placement ("DB reads"
  vs "model answers") and the ℹ️ carries the caveat.
- Preset numbers shift if 110 lands after this — whichever lands second re-pins
  (noted in both specs).
