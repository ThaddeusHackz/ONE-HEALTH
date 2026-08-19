# Forensic scan — AI capabilities for ONE HEALTH GHANA

Date: 2026-08-19  
Constraint: Ghana Health Service only. Capabilities must be justified by the four live keys, not by fantasy.

## Keys in play (server-side only)

| Key | What it actually unlocks | What it does not unlock |
|---|---|---|
| OpenRouter | Multi-model chat, vision, PDF file parts, fallback when a vendor 429s, optional Whisper | Unlimited free compute; 402 still stops the chain |
| Tavily | Cited web search over GHS/WHO-weighted domains | A private DHIMS2 feed |
| ElevenLabs | Spoken briefings | A clinical voice diagnosis |
| OpenWeather | Live city weather for Ghana watch-cities | A national rainfall radar product |

## Shipped in this build

1. Leakage-safe ensemble forecast + intervals  
2. IDSR z-score watches  
3. Any-file vision (image, PDF, DOCX, XLSX, CSV, text)  
4. Voice in (Web Speech) / voice out (ElevenLabs or device)  
5. Ghana-weighted search  
6. Climate desk + morning sitrep (weather + search + ensemble)  
7. Persistent database (`data/db.json`) for documents, chats, forecasts, CMS  
8. Wix-style admin CMS for copy, colours, nav, knowledge, records, API probe  

## High-value next capabilities (still Ghana-only)

These are the ones that would genuinely change GHS practice — **if and only if official data is wired**. None of them make forecasts error-free.

1. **DHIMS2 / IDSR connector** — replace demonstration series with weekly official extracts. This is the single most important upgrade. It is a data-governance project, not another model.  
2. **District (not only region) unit** — once counts are complete enough that small-cell risk is managed.  
3. **Nowcast + delay correction** — reporting lag models (the workbook already warns about this).  
4. **Bilingual field briefs** — Twi / Ewe / Ga / Hausa summaries via OpenRouter, spoken via ElevenLabs, for CHPS compounds.  
5. **Redaction gate** — automatic strip of names, phones, folder numbers before a file reaches a model.  
6. **CUSUM / WHO alert thresholds** beside the simple z-score.  
7. **Veterinary + NADMO layers** as first-class time series, not only weather.  
8. **Audit export** — every AI briefing with model name, prompt hash, and human sign-off for the AI-assistance log.

## Explicitly rejected

- “Without error” disease prediction  
- Individual patient diagnosis from a photo  
- Embedding API keys in browser JavaScript  
- Training a foundation model from scratch (the keys already buy that intelligence)  
- A global (non-Ghana) operations centre  

## Test note

This Arena sandbox currently **resets outbound TLS**. Provider probes will fail here with `ECONNRESET` even when keys are valid. The same code on Render, or any normal host, performs the live handshake. Use **Admin → API desk** after deploy.
