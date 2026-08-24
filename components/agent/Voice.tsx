"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Square, Volume2, VolumeX } from "lucide-react";

/* ---------------------------- voice input ---------------------------- */

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

function recognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

const MIME = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.("audio/webm")
  ? "audio/webm"
  : "audio/mp4";

export function VoiceButton({
  onTranscript,
  disabled,
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const [listening, setListening] = useState(false);
  const [engine, setEngine] = useState<"whisper" | "browser" | "none">("none");
  const [note, setNote] = useState("");
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const tickRef = useRef<number | null>(null);

  const stopTimer = () => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = null;
  };

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    stopTimer();
    setListening(false);
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  async function start() {
    setNote("");
    setSeconds(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setListening(true);
      tickRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);

      const recorder = new MediaRecorder(stream, { mimeType: MIME });
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: MIME });
        cleanup();
        if (!blob.size) return;
        setNote("Transcribing…");
        try {
          const form = new FormData();
          form.set("audio", blob, `speech.${MIME.includes("webm") ? "webm" : "m4a"}`);
          const res = await fetch("/api/transcribe", { method: "POST", body: form });
          const json = (await res.json()) as { text?: string; note?: string; engine?: string };
          if (json.text?.trim()) {
            setEngine("whisper");
            setNote(`Whisper${json.engine ? ` (${json.engine})` : ""}`);
            onTranscript(json.text.trim());
            return;
          }
          setNote(json.note || "Whisper returned nothing - tap again and try the browser dictation.");
          fallbackBrowser();
        } catch (err) {
          setNote((err as Error).message);
        }
      };
      recorder.start();
    } catch (err) {
      cleanup();
      setNote(`Microphone unavailable: ${(err as Error).message}. Trying browser dictation.`);
      fallbackBrowser();
    }
  }

  function fallbackBrowser() {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setEngine("none");
      setNote("No microphone permission or no dictation support in this browser.");
      return;
    }
    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = "en-GH";
    rec.continuous = false;
    rec.interimResults = true;
    setListening(true);
    setEngine("browser");
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i += 1) {
        const item = e.results[i];
        text += item[0].transcript;
        if (item.isFinal) onTranscript(text.trim());
      }
    };
    rec.onerror = (e) => {
      setNote(`Browser dictation error: ${e.error || "unknown"}`);
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
      stopTimer();
    };
    tickRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  }

  function stop() {
    if (recRef.current) {
      try {
        recRef.current.stop();
      } catch {
        /* already stopped */
      }
      recRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    } else {
      cleanup();
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={listening ? stop : start}
        disabled={disabled}
        title={listening ? "Stop recording" : "Speak - Whisper transcription, browser dictation fallback"}
        className={`a-chip ${listening ? "!border-ghana-red !bg-red-soft !text-ghana-red" : ""}`}
      >
        {listening ? (
          <>
            <Square className="h-3.5 w-3.5" />
            <span className="a-mono">{seconds}s</span>
            <span className="flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="a-dot h-1.5 w-1.5 rounded-full bg-ghana-red" style={{ animationDelay: `${i * 0.18}s` }} />
              ))}
            </span>
          </>
        ) : (
          <>
            <Mic className="h-3.5 w-3.5" />
            <span>Speak</span>
          </>
        )}
      </button>
      {note && (
        <span className="a-mono max-w-[16rem] truncate text-[11px] text-muted" title={note}>
          {note}
        </span>
      )}
      {engine === "none" && <MicOff className="h-3.5 w-3.5 text-muted" />}
    </div>
  );
}

/* ---------------------------- voice output --------------------------- */

export function SpeakButton({ text, label = "Speak" }: { text: string; label?: string }) {
  const [playing, setPlaying] = useState(false);
  const [engine, setEngine] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setPlaying(false);
  };

  useEffect(() => () => stop(), []);

  async function speak() {
    if (playing) {
      stop();
      return;
    }
    const clean = text
      .replace(/```[\s\S]*?```/g, " code block omitted. ")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[#*_>`|]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2400);
    if (!clean) return;
    setPlaying(true);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean }),
      });
      const ctype = res.headers.get("content-type") || "";
      if (res.ok && ctype.includes("audio")) {
        const blob = await res.blob();
        setEngine(res.headers.get("x-tts-engine") || "server");
        const audio = new Audio(URL.createObjectURL(blob));
        audioRef.current = audio;
        audio.onended = () => setPlaying(false);
        audio.onerror = () => browserSpeak(clean);
        await audio.play();
        return;
      }
      browserSpeak(clean);
    } catch {
      browserSpeak(clean);
    }
  }

  function browserSpeak(clean: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setPlaying(false);
      return;
    }
    setEngine("device");
    const utter = new SpeechSynthesisUtterance(clean);
    utter.rate = 1;
    utter.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find((v) => /en-GB|en_GH|en-NG/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang));
    if (preferred) utter.voice = preferred;
    utter.onend = () => setPlaying(false);
    utter.onerror = () => setPlaying(false);
    window.speechSynthesis.speak(utter);
  }

  return (
    <button type="button" onClick={speak} className="a-chip" title={engine ? `Voice: ${engine}` : "Read this answer aloud"}>
      {playing ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
      {playing ? "Stop" : label}
    </button>
  );
}
