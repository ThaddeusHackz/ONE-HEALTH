# Deploy ONE HEALTH GHANA on Render.com

You will create **one Web Service**. There is no separate frontend and backend - Next.js serves both.

## 0. Push this branch

```bash
git add -A
git commit -m "ONE HEALTH GHANA - forecast desk, vision, Gemini engine"
git push origin arena/01a0189f-one-health
```

Never commit `.env.local`.

## 1. Create the service

1. Sign in at [dashboard.render.com](https://dashboard.render.com) with GitHub.
2. **New → Blueprint** and select `ThaddeusHackz/ONE-HEALTH`, branch `arena/01a0189f-one-health`.
   - or **New → Web Service** → same repo/branch.
3. If you do it manually:

| Field | Value |
|---|---|
| Runtime | Node |
| Build | `npm ci --include=dev && npm run build` |
| Start | `npm start` (binds `0.0.0.0` and honours `PORT`) |
| Health check | `/api/health` |
| Instance | **Free** (blueprint default). Expect spin-down after idle and a cold start. Upgrade later if you need it always on. |

Region **Frankfurt** is closest to Accra among Render’s common options.

## 2. Environment variables

In the service → **Environment**:

```
NODE_ENV=production
NEXT_PUBLIC_SITE_URL=https://YOUR-SERVICE.onrender.com
GEMINI_API_KEY=            # the whole AI engine - https://aistudio.google.com/apikey
GEMINI_MODELS=             # optional - override the model chain
GEMINI_IMAGE_MODELS=       # optional - override the image model chain
GEMINI_TTS_VOICE=          # optional - prebuilt voice name (default Kore)
TAVILY_API_KEY=            # optional
ELEVENLABS_API_KEY=        # optional
ELEVENLABS_VOICE_ID=       # optional
OPENWEATHER_API_KEY=       # optional
ADMIN_EMAIL=admin@ghs.gov.gh
ADMIN_PASSWORD=            # strong password for /admin
ADMIN_NAME=GHS Administrator
SESSION_SECRET=            # long random string
DATABASE_URL=              # set automatically by the blueprint Postgres. Keeps CMS/extracts/chats across web restarts.
```

Save. Render redeploys.

CMS login is `/admin` (default local: `admin@ghs.gov.gh` / the password you set). Never commit those values.

## 3. First-run checklist

- `/` loads the white Ghana desk.
- `/forecast` draws an ensemble interval without any key.
- `/api/health` shows `"gemini": true` and `"engine": "gemini"` after the key is set.
- `/intelligence` answers with a model name from the fallback chain.
- `/vision` reads a redacted scan.
- Microphone works in Chrome (Web Speech). Server-side transcription runs on the same Gemini key.

## 4. Free-tier notes

- The first request after idle can take 30-60 seconds. That is Render spinning the box, not a model failure.
- A Gemini **429** means the key is out of quota for that model. The chain rotates to the next model, then to the free-tier models; a fully exhausted key needs billing enabled in Google AI Studio.
- Official DHIMS2 data is still your responsibility to load. The shipped series are epidemiologically shaped **demonstrations**.

## 5. Local preview of production

```bash
npm run build
npm start
```
