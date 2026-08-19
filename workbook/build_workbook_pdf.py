"""Generate the illustrated Ghana Phase-2 workbook PDF."""

from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
IMG = ROOT / "public" / "images"
OUT = ROOT / "workbook" / "ONE_HEALTH_GHANA_Phase2_Illustrated_Workbook.pdf"

GREEN = HexColor("#0B7A43")
GOLD = HexColor("#E8B923")
RED = HexColor("#C8102E")
TEAL = HexColor("#0E7490")
INK = HexColor("#0B1220")
MUTED = HexColor("#5B6575")
LINE = HexColor("#E6EAF0")
PAPER = HexColor("#F7F8FA")


def styles():
    base = getSampleStyleSheet()
    s = {
        "cover": ParagraphStyle("cover", parent=base["Title"], fontName="Times-Bold", fontSize=28, leading=34, textColor=INK, alignment=TA_CENTER, spaceAfter=8),
        "sub": ParagraphStyle("sub", parent=base["Normal"], fontName="Times-Italic", fontSize=13, leading=18, textColor=TEAL, alignment=TA_CENTER, spaceAfter=12),
        "h1": ParagraphStyle("h1", parent=base["Heading1"], fontName="Times-Bold", fontSize=16, leading=20, textColor=GREEN, spaceBefore=14, spaceAfter=8),
        "h2": ParagraphStyle("h2", parent=base["Heading2"], fontName="Times-Bold", fontSize=13, leading=17, textColor=INK, spaceBefore=10, spaceAfter=6),
        "body": ParagraphStyle("body", parent=base["Normal"], fontName="Times-Roman", fontSize=10.5, leading=15, textColor=INK, alignment=TA_JUSTIFY, spaceAfter=7),
        "cap": ParagraphStyle("cap", parent=base["Normal"], fontName="Times-Italic", fontSize=9, leading=12, textColor=MUTED, alignment=TA_CENTER, spaceBefore=3, spaceAfter=10),
        "take": ParagraphStyle("take", parent=base["Normal"], fontName="Times-Bold", fontSize=10.5, leading=14, textColor=INK, backColor=HexColor("#E8F6EE"), borderPadding=6, spaceBefore=6, spaceAfter=8),
        "warn": ParagraphStyle("warn", parent=base["Normal"], fontName="Times-Bold", fontSize=10.5, leading=14, textColor=INK, backColor=HexColor("#FFF6D8"), borderPadding=6, spaceBefore=6, spaceAfter=8),
        "small": ParagraphStyle("small", parent=base["Normal"], fontName="Times-Roman", fontSize=9, leading=12, textColor=MUTED, alignment=TA_CENTER),
        "toc": ParagraphStyle("toc", parent=base["Normal"], fontName="Times-Roman", fontSize=11, leading=16, textColor=INK),
    }
    return s


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(RED)
    canvas.rect(0, A4[1] - 4, A4[0] / 3, 4, fill=1, stroke=0)
    canvas.setFillColor(GOLD)
    canvas.rect(A4[0] / 3, A4[1] - 4, A4[0] / 3, 4, fill=1, stroke=0)
    canvas.setFillColor(GREEN)
    canvas.rect(2 * A4[0] / 3, A4[1] - 4, A4[0] / 3, 4, fill=1, stroke=0)
    canvas.setFillColor(MUTED)
    canvas.setFont("Times-Italic", 8)
    canvas.drawString(18 * mm, 10 * mm, "ONE HEALTH GHANA · Phase 2 illustrated workbook · Ghana Health Service")
    canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, str(doc.page))
    canvas.restoreState()


def img(name, h=72 * mm):
    path = IMG / name
    if not path.exists():
        return Spacer(1, 4)
    im = Image(str(path), width=170 * mm, height=h, kind="proportional")
    im.hAlign = "CENTER"
    return im


def bullets(items, st):
    return ListFlowable(
        [ListItem(Paragraph(i, st["body"]), leftIndent=8) for i in items],
        bulletType="bullet",
        start="•",
        leftIndent=14,
    )


def build():
    st = styles()
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title="ONE HEALTH GHANA — Illustrated Phase 2 Workbook",
        author="ONE HEALTH GHANA · Ghana Health Service",
    )
    story = []

    story += [
        Spacer(1, 18 * mm),
        Paragraph("ONE HEALTH GHANA", st["cover"]),
        Paragraph("Pandemic and Disease-Outbreak Forecasting", st["cover"]),
        Paragraph(
            "A practical technical and AI-assisted modelling workbook — Phase 2, modified for the Ghana Health Service and the production system that follows.",
            st["sub"],
        ),
        Spacer(1, 4 * mm),
        img("logo.png", 42 * mm),
        Paragraph("Ghana Health Service · Veterinary Services Directorate · EPA · Noguchi · One Health Secretariat", st["small"]),
        Spacer(1, 6 * mm),
        Paragraph(
            "Python · Next.js production desk · OpenRouter multi-model fallback · Vision · Voice · Web search",
            st["small"],
        ),
        Spacer(1, 8 * mm),
        Paragraph(
            "A forecast is a probability statement with an interval. It is never “without error.” An alert is a prompt to investigate, not a confirmed outbreak.",
            st["warn"],
        ),
        PageBreak(),
        Paragraph("How to use this modified workbook", st["h1"]),
        Paragraph(
            "The original Phase 2 document trained professionals to build a forecasting model by hand in Google Colab, then to use Gemini as a tutor — never as the analyst of record. That scientific contract is unchanged: UNDERSTAND → IMPLEMENT → VALIDATE → USE AI TO ASSIST → CRITICALLY EVALUATE → IMPROVE → INTERPRET.",
            st["body"],
        ),
        Paragraph(
            "The professor asked for the next step: modify the workbook so the class can walk into a working national system for Ghana only. This edition therefore (1) replaces empty figure boxes with real diagrams, (2) retargets every example from a generic country to Ghana’s sixteen regions and One Health disease set, (3) adds document/image ingestion and vision, (4) replaces a single Gemini key with an OpenRouter fallback chain, and (5) describes the white production website that implements the same pipeline.",
            st["body"],
        ),
        Paragraph(
            "Dataset for the teaching notebook: Our World in Data COVID-19 extract filtered to Ghana (public, non-identifiable). Dataset for the live desk: demonstration series shaped on Ghana epidemiology until official DHIMS2 / IDSR / VSD extracts are loaded. No patient-level data appears anywhere.",
            st["body"],
        ),
        Paragraph("Table of contents", st["h2"]),
    ]
    toc = [
        "Module 1 — One Health for Ghana",
        "Module 2 — Framing the Ghana region-week problem",
        "Module 3 — Two environments: Colab and the production desk",
        "Module 4–5 — Ingesting files, photographs, and official extracts",
        "Module 6–7 — EDA and time-series diagnostics",
        "Module 8–9 — Baselines and chronological splits",
        "Module 10–12 — Features and models (no leakage, no default deep learning)",
        "Module 13–14 — Evaluation and intervals",
        "Module 15 — Early warning is not confirmation",
        "Module 16–19 — Interpretation, AI limits, ethics",
        "Module 20 — Capstone = this platform",
        "Appendix — OpenRouter fallback, Render, keys, glossary",
    ]
    for t in toc:
        story.append(Paragraph(t, st["toc"]))

    story += [
        Paragraph("Module 1 — One Health for Ghana", st["h1"]),
        Paragraph(
            "One Health is not a slogan. In Ghana it is the only honest way to see Lassa (rodents and harvest stores), HPAI (live-bird markets), anthrax (carcass butchering), cholera (flooded drains), and malaria (standing water after the rains). Human IDSR counts without veterinary and environmental streams will systematically miss the first signal.",
            st["body"],
        ),
        img("one-health-convergence.png", 88 * mm),
        Paragraph("Figure 1. Human, animal and environmental surveillance converge on the Ghana Health Service One Health data hub.", st["cap"]),
        img("data-decision-pipeline.png", 62 * mm),
        Paragraph("Figure 2. Data → analysis → model → forecast → decision support. Each arrow can introduce error, bias, or uncertainty.", st["cap"]),
        Paragraph("Limitations you must internalise now", st["h2"]),
        bullets(
            [
                "A model reflects reporting delays, testing changes, and under-counting — not the hidden truth of infection.",
                "Forecasts degrade with horizon. Twelve weeks is a sketch; four weeks is the operational default.",
                "A forecast is a statement of probability, never certainty, and never “without error.”",
                "No model substitutes for field epidemiological investigation.",
            ],
            st,
        ),
        Paragraph("KEY TAKEAWAY — Forecasting models are decision-support tools built from imperfect surveillance. Every later module exists so you can explain, defend, and bound the system we are building for Ghana.", st["take"]),
        Paragraph("Module 2 — Framing the epidemiological problem", st["h1"]),
        Paragraph(
            "Original sentence: “Can we forecast weekly reported COVID-19 cases in a given country over the next 4 weeks?” Production sentence: “Can we forecast weekly reported or suspected counts for a named notifiable disease in a named Ghana region over the next four weeks, using that region’s own history plus leakage-safe calendar and climate flags, and can the forecast beat a naive baseline with an interval wide enough to be honest?”",
            st["body"],
        ),
    ]

    table_data = [
        [Paragraph("<b>Element</b>", st["body"]), Paragraph("<b>Ghana production definition</b>", st["body"])],
        [Paragraph("Target", st["body"]), Paragraph("weekly_cases for one disease (malaria, cholera, CSM, measles, YF, COVID-19, ILI, mpox, Lassa, TB, HPAI, anthrax, flood-risk index)", st["body"])],
        [Paragraph("Predictors", st["body"]), Paragraph("lag 1–4, rolling mean/std after shift(1), week-of-year, month, rainy-season, harmattan", st["body"])],
        [Paragraph("Horizon", st["body"]), Paragraph("4 weeks default (2–12 allowed); quality collapses as horizon grows", st["body"])],
        [Paragraph("Unit", st["body"]), Paragraph("Ghana region-week (national roll-up available)", st["body"])],
        [Paragraph("Success", st["body"]), Paragraph("MAE/RMSE/sMAPE better than naive on a chronological test window, plus a usable interval", st["body"])],
    ]
    tbl = Table(table_data, colWidths=[40 * mm, 130 * mm])
    tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), HexColor("#E8F6EE")),
                ("BOX", (0, 0), (-1, -1), 0.4, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story += [tbl, Spacer(1, 4 * mm)]

    story += [
        Paragraph("Module 3 — Two environments", st["h1"]),
        Paragraph(
            "Google Colab remains the classroom. The production desk is the Next.js application in this repository: statistical engine in TypeScript, intelligence through OpenRouter, files through the Vision Lab, voice through the Web Speech API (and optional Whisper / ElevenLabs). The Colab session still evaporates; the Render service persists. Secrets still never belong in a notebook cell or in NEXT_PUBLIC_* variables.",
            st["body"],
        ),
        img("system-architecture.png", 88 * mm),
        Paragraph("Figure 3. Production architecture: artefacts in, leakage-safe models, OpenRouter fallback, Ghana command UI.", st["cap"]),
        Paragraph("Module 4–5 — Ingest and clean, including pictures", st["h1"]),
        Paragraph(
            "The original workbook loaded one CSV. The professor required that the system also pick up photographs and documents of any ordinary type. The Vision Lab sends images through Gemini / GPT-4.1 / Claude (in that fallback order) and asks for structured fields: disease, Ghana geography, dates, counts, facility type, data-quality flags. It must refuse to repeat names, folder numbers, phones, or faces.",
            st["body"],
        ),
        img("vision-ingest.png", 78 * mm),
        Paragraph("Figure 4. Field photos, IDSR forms, lab slips and CSVs enter the same extraction step before they can touch the forecast engine.", st["cap"]),
        Paragraph(
            "Cleaning rules are unchanged and non-negotiable. Clip negative corrections to zero. Resample to weeks. Interpolate at most two internal missing weeks. Flag the rest. Never delete a spike because it is inconvenient — it may be the outbreak. A four-week hole may be a strike, a flooded district office, or a DHIMS2 outage; investigate before you invent numbers.",
            st["body"],
        ),
        Paragraph("Module 6–7 — EDA and diagnostics", st["h1"]),
        Paragraph(
            "Plot the raw weekly series and a four-week rolling mean. Ask whether a peak is a wave or a backlog dump. Decompose into trend, seasonal, residual (period 52). Run an Augmented Dickey–Fuller test so you know whether you must difference. Read ACF/PACF before you pick lags. Ghana has two seasonal clocks: harmattan (CSM, some respiratory signals) and the major rains (malaria, cholera, flood index).",
            st["body"],
        ),
        Paragraph("Module 8–9 — Baselines and the split you must not shuffle", st["h1"]),
        Paragraph(
            "Always ship naive (next week = this week), seasonal naive (same week last year), and a four-week moving average, each shifted so they cannot see the target week. If a forest cannot beat last week’s number, it does not brief the Minister.",
            st["body"],
        ),
        img("chrono-split.png", 58 * mm),
        Paragraph("Figure 5. Chronological train / validation / test. Nothing after the cut informs training. Random split is temporal leakage.", st["cap"]),
        Paragraph("Module 10–12 — Features and models", st["h1"]),
        img("feature-pipeline.png", 72 * mm),
        Paragraph("Figure 6. Lag, rolling (after shift) and calendar families merge into the modelling frame. Rolling without shift(1) is leakage.", st["cap"]),
        Paragraph(
            "On a few hundred Ghana weekly points, Random Forest and SARIMA (in the notebook) plus Holt and ridge (on the desk) are the justified family. LSTM and “foundation models for time series” are not the default. The production ensemble takes the three lowest-MAE members and prints their interval union.",
            st["body"],
        ),
        Paragraph(
            "Companion-code repairs applied: country default Ghana; SARIMA fitted on train only; features engineered before the split; deprecated fillna(method='ffill') replaced; Module 15 print statement syntax error removed.",
            st["body"],
        ),
        Paragraph("Module 13–14 — Evaluation and uncertainty", st["h1"]),
        Paragraph(
            "Report MAE, RMSE and sMAPE on the same held-out window. MAPE is unstable when weekly cholera or yellow fever sits near zero — which is most weeks. A 90% interval means: under the model’s assumptions, repeated application would cover the truth about nine times in ten. It does not mean “there is a 90% chance next week lands in this one interval,” and it does not see a new vaccine campaign or a reporting collapse.",
            st["body"],
        ),
        Paragraph("Always write “127 cases (interval 105–151)”, never “127 cases.”", st["warn"]),
        Paragraph("Module 15 — Early warning", st["h1"]),
        img("early-warning.png", 68 * mm),
        Paragraph("Figure 7. Historical baseline → expected → observed → deviation → threshold → investigation. The last word is investigation, not confirmation.", st["cap"]),
        Paragraph(
            "z > 2 is a watch, z > 3.5 is severe. Next human actions: check a reporting outage, a batch dump, laboratory backlog, then decide whether to mobilise. The model is not the incident manager.",
            st["body"],
        ),
        Paragraph("Module 16–19 — Interpretation, AI, ethics", st["h1"]),
        Paragraph(
            "If lag_1 dominates feature importance, last week is the best statistical predictor of this week. That is not a causal discovery. OpenRouter (classroom: Gemini) may draft code, explain ADF p-values, and write a 180-word briefing. It must never decide that an outbreak exists, that a point is an error, that a variable is epidemiologically valid, or that an intervention should launch.",
            st["body"],
        ),
        Paragraph(
            "Never paste patient-identifiable information into a public model. Small-cell paediatric counts in a rural district can re-identify. Use aggregates, public OWID extracts, or institutionally governed tools.",
            st["body"],
        ),
        Paragraph("Module 20 — Capstone is the platform", st["h1"]),
        Paragraph(
            "Independently complete, on official or public Ghana data: problem statement; ingestion and quality log; cleaning justifications; two interpreted charts; diagnostics; baseline; chronological features; two models; MAE/RMSE/sMAPE versus naive; an interval; a z-threshold; feature caveats; a one-page limit statement; an AI-assistance log. The live site is the demonstration; the notebook is the reproducible proof.",
            st["body"],
        ),
        img("hero-clinic.png", 78 * mm),
        Paragraph("Figure 8. The white national desk this workbook is written to justify — Ghana Health Service, not a generic dashboard.", st["cap"]),
        img("ghana-regions.png", 88 * mm),
        Paragraph("Figure 9. Sixteen regions. The unit of analysis moved from “one country” to “one Ghana region-week.”", st["cap"]),
        Paragraph("Appendix A — OpenRouter fallback (what the forensic note got right)", st["h1"]),
        Paragraph(
            "One sk-or- key. The request sends a models array: GPT-4.1, Gemini 2.5 Pro, Claude Sonnet, Gemini Flash, DeepSeek, Llama 4 Maverick, Mistral Large. A 429 or 5xx on the first vendor moves to the next. allow_fallbacks covers same-model hosts. A 402 (your OpenRouter balance is empty) stops the entire chain — top up credits. Failed attempts are not billed. Keys live only in Render environment variables.",
            st["body"],
        ),
        Paragraph("Appendix B — Render", st["h1"]),
        Paragraph(
            "Push branch arena/01a01814-one-health. New Web Service or Blueprint. Build: npm ci --include=dev && npm run build. Start: npm start. Health: /api/health. Set OPENROUTER_API_KEY, optional TAVILY_API_KEY, ELEVENLABS_API_KEY, OPENWEATHER_API_KEY. Frankfurt is the nearest common region to Accra.",
            st["body"],
        ),
        Paragraph("Appendix C — Glossary (unchanged science)", st["h1"]),
        Paragraph(
            "Surveillance — ongoing collection and analysis of health data. Outbreak / epidemic / pandemic — local, regional, global rise above expectation. Incidence — new cases in a period. Time series, trend, seasonality, stationarity, autocorrelation, lag, baseline, chronological train/validation/test, leakage, overfitting, MAE/RMSE/sMAPE, prediction interval, feature importance (not causation), early warning (investigation prompt).",
            st["body"],
        ),
        Paragraph("Appendix D — Sources", st["h1"]),
        Paragraph(
            "OWID COVID-19 · WHO GHO and Disease Outbreak News · Ghana Health Service IDSR / DHIMS2 (official extracts, not scraped) · pandas, scikit-learn, statsmodels · OpenRouter routing documentation · original Phase 2 workbook (2026-08-19 Word export).",
            st["body"],
        ),
        Paragraph(
            "Verify every live URL before a training delivery. Demonstration series on the website are epidemiologically shaped for Ghana and must be replaced before operational decisions.",
            st["warn"],
        ),
    ]

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    print("wrote", OUT, "bytes", OUT.stat().st_size)


if __name__ == "__main__":
    build()
