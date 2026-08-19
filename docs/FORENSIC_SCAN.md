# Forensic scan — Phase 2 workbook, companion code, OpenRouter brief

Date: 2026-08-19  
Scope: files supplied on `main` (`One Health Pandemic Forecasting Workbook - Phase 2 (1)(1).pdf`, `code.txt`, `OPENROUTER_FORENSIC_FALLBACK_REPORT.txt`) plus the production system built from them.

## 1. What the PDF actually is

- 26 pages, Word-exported PDF 1.7, dated 2026-08-19.
- Teaching workbook: Colab + Python + Gemini. One Health framing, then a single-country COVID weekly forecast.
- **Figures 1–6 are captions without pictures.** Pages that claim diagrams (3, 5, 13, 14, 18, 22) contain empty space. That is the primary visual defect the professor asked to fix.
- Scientific core is sound and must be preserved: chronological splits, leakage-safe lags, baselines before ML, intervals not points, alerts ≠ outbreaks, Gemini is not the analyst of record, no patient identifiers.

## 2. Defects in `code.txt`

| Item | Finding | Fix in the Ghana notebook / engine |
|---|---|---|
| Country | Hard-coded `South Africa` | Default `Ghana` |
| `alerts [[` | Syntax error in Module 15 print | `alerts_triggered[["date", ...]]` |
| `fillna(method="ffill")` | Deprecated in current pandas | `.ffill()` |
| RF train merge | Comment admits “simplistic merge” | Split **after** feature engineering |
| SARIMA fit on full series | `SARIMAX(sarima_series)` uses future weeks | Fit on **train** only, forecast `len(test)` |
| Evaluation alignment | Mixes `y_test.index` with `baseline_df` after resets | Align on dates |
| Missing modules | 0, 3, 11, 17–20 exist in PDF, not as executable cells | Documented in `/workbook` and notebook markdown |
| No images | Companion is text only | Platform ships generated figures |

## 3. OpenRouter report — verified design we implemented

The fallback report is correct in architecture:

- One `OPENROUTER_API_KEY`.
- Request body `models: [...]` is the cross-provider chain.
- `provider.allow_fallbacks: true` covers same-model host failover.
- 429 / 5xx on one vendor moves to the next; a **402 (OpenRouter balance empty)** stops everything.
- Failed attempts are not billed.

Implemented chain (chat): GPT-4.1 → Gemini 2.5 Pro → Claude Sonnet → Gemini Flash → DeepSeek → Llama 4 Maverick → Mistral Large.  
Vision chain starts on Gemini 2.5 Pro / GPT-4.1 / Claude.

**We do not embed the key in the website JavaScript.** That would leak it to every browser. The key lives in Render environment variables and is read only in Route Handlers.

## 4. Professor / product deltas (accepted)

1. Ghana Health Service only — 16 regions, Ghana disease set.
2. Multi-disease One Health board, not COVID-only.
3. Documents and photographs are ingestible.
4. Voice in (Web Speech + optional Whisper) and voice out (ElevenLabs or device TTS).
5. Web search (Tavily, else DuckDuckGo) with Ghana-weighted domains.
6. White 2026 UI, Ghana flag colours as accents (green / gold / red) plus clinical teal.
7. Honest uncertainty. **“Without error” is scientifically false** and is rejected in product copy.

## 5. What this system will not pretend

- Official DHIMS2 completeness.
- Individual clinical diagnosis from a photo.
- Perfect future case counts.
- Cross-border operations outside Ghana-relevant imported risk.
