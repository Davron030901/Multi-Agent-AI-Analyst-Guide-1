# Deploy qo'llanmasi — qadam-baqadam

Backend → **Render** (Docker), Frontend → **Vercel**, vektorlar → **Qdrant Cloud**.

Jami vaqt: ~40 daqiqa. Karta kerak emas (agar `LLM_PROVIDER=gemini` qoldirsangiz).

> **Tartib muhim.** Qdrant → GitHub → Render → Vercel → CORS. Har bir qadam
> o'zidan oldingisining natijasini ishlatadi. Tartibni buzsangiz, oxirida
> CORS xatosi yoki bo'sh retriever bilan qolasiz.

---

## Umumiy sxema

```
                    ┌─────────────────┐
                    │  Qdrant Cloud   │  ← vektorlar (1 GB bepul)
                    └────────▲────────┘
                             │
┌──────────────┐     ┌───────┴────────┐     ┌──────────────┐
│    Vercel    │────▶│     Render     │────▶│  Gemini API  │
│  (frontend)  │ SSE │  (backend,     │     │  yoki OpenAI │
│   Next.js    │◀────│   Docker)      │     └──────────────┘
└──────────────┘     └────────────────┘
       ▲                     │
       │                     └──▶ SQLite (image ichida)
   foydalanuvchi
```

Ikki tomonlama bog'lanish borligiga e'tibor bering: Vercel Render'ning URL'ini
bilishi kerak (`NEXT_PUBLIC_API_URL`), Render esa Vercel'ning URL'ini bilishi
kerak (`CORS_ORIGINS`). Shuning uchun oxirida **4-qadam** bor.

---

## 0-QADAM · Tayyorgarlik (~10 daqiqa)

### 0.1 Kalitlarni yig'ib oling

| Kalit | Qayerdan | Majburiymi |
|---|---|---|
| `GOOGLE_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | **Ha** (yoki OpenAI) |
| `OPENAI_API_KEY` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | Gemini o'rniga ishlatsangiz |
| `TAVILY_API_KEY` | [tavily.com](https://tavily.com) | Yo'q — web agent o'zi chetlab o'tadi |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` | [cloud.langfuse.com](https://cloud.langfuse.com) | Yo'q — lekin F12 uchun kerak (5 ball) |

### 0.2 Lokalda ishlashiga ishonch hosil qiling

Deploy — ishlaydigan tizimni ko'chirish. Ishlamaydigan tizimni ko'chirsangiz,
xatoni Render loglaridan qidirasiz, bu esa ancha og'ir.

```bash
cd backend
python -m ingestion.seed_db
python -m ingestion.ingest
python -m scripts.smoke        # hamma qator PASS yoki SKIP bo'lsin, FAIL bo'lmasin
pytest                         # 117 ta test o'tishi kerak
```

### 0.3 Docker image lokalda build bo'lishini tekshiring

**Bu qadamni tashlab ketmang.** Render'da build 5-10 daqiqa davom etadi;
xato bo'lsa, lokalda 2 daqiqada topasiz.

```bash
# repo ildizidan
docker build -t analyst-api ./backend
docker run --rm -p 8000:8000 --env-file .env analyst-api
```

Boshqa terminalda:

```bash
curl -s localhost:8000/health
```

`"status": "ok"` va `"llm_ready": true` chiqishi kerak. Chiqmasa — `.env`ni
tekshiring, Render'ga o'tmang.

---

## 1-QADAM · Qdrant Cloud (~5 daqiqa)

**Nega bu birinchi?** Render'ning bepul diski *ephemeral* — ya'ni har deploy'da
o'chadi. Embedded Qdrant papkasi ishlatsangiz, har safar hujjatlaringiz
yo'qoladi va retriever bo'sh javob qaytaradi. Qdrant Cloud 1 GB bepul, kartasiz
va bizning hujjatlar uchun bu juda yetarli.

1. [cloud.qdrant.io](https://cloud.qdrant.io) → **Sign up** (GitHub bilan tez).
2. **Clusters → Create Cluster** → **Free** tarif → region tanlang.
   *Maslahat:* Render'ni `oregon`da ishlatsangiz, Qdrant'ni ham AQSh regionida
   oling — latency kamayadi.
3. Cluster tayyor bo'lgach (~1 daqiqa), ikkita narsani nusxalang:
   - **Endpoint URL** — `https://xxxx-xxxx.us-east-1-0.aws.cloud.qdrant.io:6333`
   - **API key** — bir marta ko'rsatiladi, saqlab qo'ying

4. Ishlayotganini tekshiring:

```bash
curl -H "api-key: SIZNING_API_KEY" https://SIZNING-URL:6333/collections
```

`{"result":{"collections":[]},"status":"ok"}` — bo'sh, lekin ishlayapti.

### 1.1 Hujjatlarni Qdrant Cloud'ga yuklang (lokaldan)

Ikki yo'l bor. **Birinchisi yaxshiroq:**

**A yo'li — lokaldan bir marta ingest qiling (tavsiya).**
Siz nazorat qilasiz, natijani darrov ko'rasiz, Render'da hech narsa
o'zgarmaydi va API kvota bir marta sarflanadi.

`.env` fayliga qo'shing:

```bash
QDRANT_URL=https://xxxx.aws.cloud.qdrant.io:6333
QDRANT_API_KEY=siz_olgan_kalit
```

Keyin:

```bash
cd backend
python -m ingestion.ingest --reset
```

Oxirida similarity search natijalari chiqadi — demak vektorlar bulutda.

**B yo'li — Render build'da avtomatik.** `AUTO_INGEST=true` qo'ysangiz,
konteyner har ishga tushganda embed qiladi. Bu kvota va vaqt sarflaydi,
shuning uchun faqat birinchi deploy'da yoqing, keyin `false` qiling.

A yo'lini tanlasangiz, `AUTO_INGEST` doim `false` qolaveradi.

---

## 2-QADAM · Kodni GitHub'ga yuklang (~5 daqiqa)

```bash
cd C:\Users\user\Desktop\Multi_Agent_AI_Analyst_Guide

git init
git add .
git commit -m "Multi-Agent AI Analyst"
```

### ⚠️ Commit'dan oldin tekshiring

```bash
git status --short          # .env ko'rinmasligi kerak
git ls-files | findstr ".env"    # faqat .env.example chiqsin
```

Agar `.env` ro'yxatda bo'lsa — **to'xtang**. `git rm --cached .env` qiling va
`.gitignore`ni tekshiring. Kalit GitHub'ga bir marta tushsa, uni o'chirish
yetarli emas — git tarixida qoladi va **kalitni almashtirish kerak bo'ladi.**

Keyin GitHub'da bo'sh repo yarating va:

```bash
git remote add origin https://github.com/SIZNING_USERNAME/multi-agent-ai-analyst.git
git branch -M main
git push -u origin main
```

---

## 3-QADAM · Backend → Render (~15 daqiqa)

### 3.1 Blueprint orqali yarating

1. [render.com](https://render.com) → **Sign up** (GitHub bilan).
2. Dashboard → **New** → **Blueprint**.
3. Repongizni tanlang. Render `render.yaml`ni o'qiydi va
   `backend/Dockerfile`ni topadi.
4. **Apply** bosing.

Render `runtime: docker`ni ko'radi va image'ni o'zi build qiladi — sizga
build/start buyruqlarini yozish kerak emas, hammasi `render.yaml`da.

### 3.2 Secret'larni qo'shing

Birinchi build **yiqiladi yoki `degraded` holatda ishga tushadi** — bu normal,
chunki kalitlar hali yo'q. `render.yaml`da ular `sync: false` deb belgilangan,
ya'ni ataylab commit qilinmagan.

Service → **Environment** → **Add Environment Variable**:

| Key | Value |
|---|---|
| `GOOGLE_API_KEY` | Gemini kalitingiz |
| `QDRANT_URL` | `https://xxxx.aws.cloud.qdrant.io:6333` |
| `QDRANT_API_KEY` | Qdrant kaliti |
| `TAVILY_API_KEY` | ixtiyoriy |
| `LANGFUSE_PUBLIC_KEY` | ixtiyoriy |
| `LANGFUSE_SECRET_KEY` | ixtiyoriy |

**OpenAI ishlatmoqchi bo'lsangiz** yana ikkitasini qo'shing:

| Key | Value |
|---|---|
| `OPENAI_API_KEY` | `sk-...` |
| `LLM_PROVIDER` | `openai` *(mavjud qiymatni `gemini`dan o'zgartiring)* |

**Save Changes** → Render avtomatik qayta deploy qiladi.

### 3.3 Deploy'ni kuzating

**Logs** bo'limida quyidagini kutasiz:

```
-------------------------------------------------------------
 Multi-Agent AI Analyst - backend container
 provider : gemini
 port     : 10000
 qdrant   : https://xxxx.aws.cloud.qdrant.io:6333
-------------------------------------------------------------
Multi-Agent AI Analyst - capabilities
  LLM (gemini  )    [on ]  gemini-2.5-flash
  ...
INFO:     Uvicorn running on http://0.0.0.0:10000
```

`provider` va `qdrant` qatorlari kutganingizdek bo'lsin. `qdrant`da
`embedded` yozilgan bo'lsa — `QDRANT_URL` qo'yilmagan, orqaga qayting.

### 3.4 Tekshiring

Render URL beradi: `https://multi-agent-analyst-api.onrender.com`

```bash
curl -s https://SIZNING-SERVICE.onrender.com/health
```

Kutilgan natija:

```json
{
  "status": "ok",
  "llm_ready": true,
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "capabilities": { "database": true, "qdrant": "cloud", ... }
}
```

### 3.5 ⚠️ Ma'lumot joyidami? — `/diagnostics`

`/health` "jarayon ishlayapti" deydi. Bu yetarli emas. Eng ko'p uchraydigan
xato: API mukammal ishga tushadi, lekin hech kim ingest qilmagan — retriever
jimgina bo'sh qaytaradi va har bir "nima uchun" savoli yupqa javob oladi.

```bash
curl -s https://SIZNING-SERVICE.onrender.com/diagnostics
```

Kutilgan natija:

```json
{
  "vector_store": {
    "mode": "cloud",
    "documents_collection": "analyst_docs",
    "document_vectors": 47,
    "ingested": true,
    "embed_provider": "gemini"
  },
  "database": { "customers": 180, "q2_2026_churns": 12, "seed_correct": true },
  "ready_to_answer": true
}
```

**`"ready_to_answer": true` bo'lishi shart.** `false` bo'lsa, javobning
o'zida `fix` maydoni chiqadi va nima qilish kerakligini aytadi.

`"document_vectors": 0` bo'lsa — 1.1-qadamga qayting va lokaldan ingest qiling.

### 3.6 Haqiqiy savol bilan sinang (SSE oqimi)

```bash
curl -N "https://SIZNING-SERVICE.onrender.com/ask/stream?q=Q2+2026+da+nechta+mijoz+ketdi"
```

`supervisor → data → retriever → generate → critic` qadamlari oqim bo'lib
kelishi kerak. **Birinchi so'rov 30-50 soniya kutadi** — bepul instance
uxlagan bo'ladi, bu xato emas.

> `AUTO_INGEST` bo'yicha: 1.1-qadamda A yo'lini tanlagan bo'lsangiz, hech
> narsa qilmang. B yo'lini tanlagan bo'lsangiz — hozir `AUTO_INGEST=true`
> qo'ying, bir marta deploy bo'lsin, keyin `false`ga qaytaring.

---

## 4-QADAM · Frontend → Vercel (~10 daqiqa)

### 4.1 Loyihani import qiling

1. [vercel.com](https://vercel.com) → **Sign up** (GitHub bilan).
2. **Add New → Project** → repongizni **Import**.

### 4.2 ⚠️ Root Directory'ni to'g'ri qo'ying

Bu yerda ko'pchilik adashadi. Vercel repo ildizida `package.json` qidiradi,
lekin bizda u `frontend/` ichida.

**Root Directory** → **Edit** → `frontend` deb yozing.

Shundan keyin Vercel Next.js'ni avtomatik aniqlaydi:

| Sozlama | Qiymat |
|---|---|
| Framework Preset | Next.js *(avtomatik)* |
| Build Command | `next build` *(avtomatik)* |
| Output Directory | `.next` *(avtomatik)* |
| Install Command | `npm install` *(avtomatik)* |

### 4.3 ⚠️ Environment variable'ni **deploy'dan OLDIN** qo'ying

**Environment Variables** bo'limida:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://SIZNING-SERVICE.onrender.com` |

Oxirida `/` **qo'ymang**.

Nega "oldin"? Chunki `NEXT_PUBLIC_*` o'zgaruvchilari **build paytida** kodga
yoziladi (inline qilinadi), runtime'da o'qilmaydi. Keyin o'zgartirsangiz,
albatta **qayta deploy** qilish kerak — aks holda eski qiymat brauzerga
ketaveradi. Bu Next.js'ning eng ko'p chalkashtiradigan xususiyati.

### 4.4 Deploy

**Deploy** bosing. ~2 daqiqa. Vercel URL beradi:
`https://multi-agent-analyst.vercel.app`

Ochib ko'ring. Yuqori o'ng burchakda status ko'rasiz:

- 🟢 **backend ready** — hammasi joyida, 5-qadamga o'ting
- ⚪️ **backend unreachable** — `NEXT_PUBLIC_API_URL` xato, yoki CORS bloklayapti
- 🟡 **backend degraded** — API ishlayapti, lekin kalit yo'q

---

## 5-QADAM · CORS'ni ulang (~3 daqiqa) — **eng ko'p unutiladigan qadam**

Hozir frontend backend'ga murojaat qilganda brauzer uni bloklaydi, chunki
Render hali Vercel domenini tanimaydi.

1. Render → service → **Environment**.
2. `CORS_ORIGINS`ni toping va haqiqiy Vercel URL'ingizga o'zgartiring:

```
http://localhost:3000,https://multi-agent-analyst.vercel.app
```

Vergul bilan ajrating. Oxirida `/` **qo'ymang** — brauzer `Origin` sarlavhasini
slashsiz yuboradi va mos kelmay qoladi. (Vergul atrofidagi bo'sh joylar muhim
emas, kod ularni o'zi tozalaydi.)

### 5.1 ⚠️ Vercel URL'i har deploy'da o'zgaradi — regex ishlating

Vercel har bir deployment uchun **yangi hostname** yaratadi:

```
multi-agent-ai-analyst-guide-1-lg67.vercel.app              ← barqaror (production)
multi-agent-ai-analyst-guide-1-lg67-h1t7b5hvj.vercel.app    ← bu deployment
multi-agent-ai-analyst-guide-1-lg67-9zzq11kk.vercel.app     ← keyingi push
```

Aniq ro'yxatga faqat bittasini yozsangiz, keyingi push'da yana CORS xatosi
oladi. Yechim — `CORS_ORIGIN_REGEX`:

| Key | Value |
|---|---|
| `CORS_ORIGIN_REGEX` | `https://multi-agent-ai-analyst-guide-1-lg67.*\.vercel\.app` |

Bu barcha preview va production URL'laringizni qamrab oladi, lekin
**boshqalarning** `.vercel.app` saytlarini bloklaydi.

> **`.*\.vercel\.app` deb yozmang** — u har qanday odamning Vercel sayti sizning
> API'ingizni chaqirishiga va kvotangizni sarflashiga ruxsat beradi. Doim o'z
> loyihangiz prefiksidan boshlang.

Barqaror domenni Vercel → loyiha → **Domains** bo'limidan oling (eng qisqasi,
hashsiz).

3. **Save Changes** → Render qayta deploy qiladi (~3 daqiqa).

> Vercel har PR uchun *preview* URL yaratadi (`...-git-branch-user.vercel.app`).
> Ular `CORS_ORIGINS`da bo'lmaydi va bloklanadi. Bu xavfsizlik nuqtai
> nazaridan to'g'ri — faqat production URL'ni qo'shing.

---

## 6-QADAM · Yakuniy tekshirish

Vercel URL'ini oching va **multi-hop** savol bering:

> Q2 2026 da nechta mijoz ketdi va nima uchun?

Ko'rishingiz kerak bo'lgan narsalar:

- [ ] O'ng tarafdagi **Live trace** panelida qadamlar jonli chiqadi
- [ ] `SUPERVISOR → DATA · SQL → SUPERVISOR → RETRIEVER → GENERATE → CRITIC`
- [ ] Javobda **12** raqami bor
- [ ] Javobda `MISSING_FEATURE` sababi tilga olingan
- [ ] "SQL query & result" ochilib, haqiqiy `SELECT` ko'rinadi
- [ ] "Show N sources" bosilganda hujjat manbalari chiqadi

Ikkinchi savol — hisob-kitob (code agent uchun):

> Q2 2026 da faol MRR'ning necha foizini yo'qotdik?

Trace'da `CODE` qadami paydo bo'lishi va javobda `0.85%` chiqishi kerak.

---

## Xatolar va yechimlari

### Render

| Xato | Sabab | Yechim |
|---|---|---|
| `exec /app/docker-entrypoint.sh: no such file or directory` | Windows CRLF qator oxirlari | `.gitattributes` bor — lekin fayl allaqachon CRLF bilan commit bo'lgan bo'lsa: `git rm --cached -r . && git reset --hard` |
| Build "out of memory" | 512 MB limit | `requirements.txt`dan `ragas` va `datasets`ni olib tashlang — ular faqat lokal evaluation uchun |
| `/health` → `"llm_ready": false` | kalit qo'yilmagan | Environment → `GOOGLE_API_KEY` qo'shing |
| Loglarda `qdrant: embedded` | `QDRANT_URL` yo'q | Environment'ga qo'shing, aks holda har deploy'da vektorlar o'chadi |
| Retriever bo'sh javob | hujjatlar ingest qilinmagan | `/diagnostics` → `document_vectors: 0`. Lokaldan `python -m ingestion.ingest --reset` (`.env`da `QDRANT_URL` bilan) |
| Bosh sahifada `404 Not Found` | `/` yo'nalishi yo'q edi | Yangilangan kodda `/` xizmat kartasini qaytaradi — push qiling |
| `Collection has dimension X but model produces Y` | `EMBED_PROVIDER` deploy'dan keyin o'zgargan | `python -m ingestion.ingest --reset` — o'lcham o'zgarsa eski kolleksiya yaroqsiz |
| Birinchi so'rov 50 soniya | bepul instance uxlaydi | Normal holat. Oldini olish uchun `/health`ni har 10 daqiqada chaqiruvchi cron qo'yish mumkin |
| `429 quota exceeded` | Gemini bepul limiti | Bir necha daqiqa kuting |

### Vercel

| Xato | Sabab | Yechim |
|---|---|---|
| `No Next.js version detected` | Root Directory qo'yilmagan | Settings → General → Root Directory = `frontend` |
| "backend unreachable" | URL xato yoki oxirida `/` bor | `NEXT_PUBLIC_API_URL`ni tekshiring, qayta deploy qiling |
| URL to'g'ri, baribir ishlamaydi | env var build'dan keyin qo'yilgan | **Redeploy** qiling — `NEXT_PUBLIC_*` build'da inline bo'ladi |
| Console'da `CORS policy` xatosi | 5-qadam qilinmagan | Render'da `CORS_ORIGINS`ga Vercel URL'ini qo'shing |
| Trace ko'rinmaydi, javob birdan chiqadi | proxy SSE'ni buferlaydi | Backend `X-Accel-Buffering: no` yuboradi — Render loglarida oqim borligini tekshiring |

### Tez diagnostika

```bash
# 1. Backend tirikmi?
curl -s https://SIZNING-SERVICE.onrender.com/health

# 2. Javob berishga tayyormi? (vektorlar + baza) - eng foydali tekshiruv
curl -s https://SIZNING-SERVICE.onrender.com/diagnostics

# 3. CORS to'g'rimi? (Vercel domenidan so'rov simulyatsiyasi)
curl -I -X OPTIONS https://SIZNING-SERVICE.onrender.com/ask/stream \
  -H "Origin: https://SIZNING-APP.vercel.app" \
  -H "Access-Control-Request-Method: POST"
# javobda access-control-allow-origin bo'lishi kerak
```

---

## Muqobil yo'l — Colab + Gradio (5 daqiqa, serversiz)

Render/Vercel bilan vaqt ketkazmoqchi bo'lmasangiz yoki tezda ishlaydigan
havola kerak bo'lsa:

1. `notebooks/Colab_Multi_Agent_Analyst.ipynb`ni Colab'da oching.
2. Kataklarni tepadan pastga ishga tushiring.
3. 7-katak `https://xxxx.gradio.live` havolasini beradi.

Kamchiliklari: havola ~72 soat yashaydi, katak to'xtasa o'ladi, va bu
"frontend deployed" talabini to'liq qoplamaydi (F13 alohida ball). Lekin
demo ko'rsatish uchun eng tez yo'l.

---

## Topshirish uchun checklist

- [ ] Backend URL ishlaydi: `https://____.onrender.com/health` → `"status": "ok"`
- [ ] Frontend URL ishlaydi: `https://____.vercel.app`
- [ ] Frontend'da multi-hop savol to'liq javob beradi (trace + manbalar bilan)
- [ ] `git ls-files` ichida `.env` **yo'q**
- [ ] Qdrant Cloud'da `analyst_docs` kolleksiyasi to'la
- [ ] Langfuse'da kamida bitta trace bor (F12 — 5 ball)
- [ ] README'dagi evaluation jadvali to'ldirilgan (F11 — 10 ball)
- [ ] `docs/error_analysis.md` sizning haqiqiy xatolaringiz bilan yangilangan
- [ ] Screenshot'lar: frontend trace, Langfuse trace, metrics jadvali

### Ikkala havolani README'ga qo'shing

`README.md` boshiga:

```markdown
## Jonli demo
- **Frontend:** https://____.vercel.app
- **API:** https://____.onrender.com/health

> Bepul Render instance 15 daqiqa ishlatilmasa uxlaydi.
> Birinchi so'rov ~40 soniya kutadi.
```

Oxirgi qator muhim: mentoringiz havolani ochib, 40 soniya kutmasdan
"ishlamayapti" deb o'ylashi mumkin.

---

## Xarajat

| Servis | Tarif | Oyiga |
|---|---|---|
| Render | Free (512 MB, uxlaydi) | $0 |
| Vercel | Hobby | $0 |
| Qdrant Cloud | Free (1 GB) | $0 |
| Gemini API | Free tier | $0 |
| Tavily | 1,000 qidiruv/oy | $0 |
| Langfuse | Free tier | $0 |
| **Jami** | | **$0** |

`LLM_PROVIDER=openai` qilsangiz OpenAI to'lovli bo'ladi — `gpt-4o-mini` arzon,
lekin karta talab qilinadi va bu loyihaning "kartasiz" shartini buzadi.
Gemini'da qolsangiz, hammasi bepul.
