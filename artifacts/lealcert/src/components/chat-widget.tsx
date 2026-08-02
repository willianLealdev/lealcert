import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2, FileText, MessageCircle, X, Send, Loader2, Bot,
  Volume2, VolumeX, ExternalLink, Mail,
} from "lucide-react";

type ChatMsg = { role: "user" | "assistant"; content: string };
type PixQrInfo = { qrCodeDataUrl: string | null; pixPayload: string | null; pixKey: string | null; total: number; orderNumber: string };
type SpeechRecognitionEvent = { results: { transcript: string; isFinal: boolean }[][] };

function normalizeVoiceText(text: string): string {
  let t = text;
  t = t.replace(/\bc[eê]\s+p[eê]\s+[eé]fe\b/gi, "CPF");
  t = t.replace(/\bc[eê]\s+p[eê]\s+fe\b/gi, "CPF");
  t = t.replace(/\bc[eê]\s+ene\s+p[eê]\s+jo[t]?[a-z]*\b/gi, "CNPJ");
  t = t.replace(/\bc[eê]\s+ene\s+p[eê]\s+j[eê]\b/gi, "CNPJ");
  t = t.replace(/\bcepeefe\b/gi, "CPF");
  t = t.replace(/\bcenepeje\b/gi, "CNPJ");
  t = t.replace(/\s*\barroba\b\s*/gi, "@");
  if (t.includes("@")) {
    t = t.replace(/\s*\bponto\b\s*/gi, ".");
    t = t.replace(/\s*@\s*/g, "@");
    t = t.replace(/(\w)\s*\.\s*(\w)/g, "$1.$2");
    t = t.replace(/\s+/g, " ").trim();
  }
  return t;
}

function detectMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) return true;
  if (typeof window !== "undefined") {
    if (window.matchMedia("(pointer: coarse)").matches) return true;
    if (navigator.maxTouchPoints > 1 && window.innerWidth < 1024) return true;
  }
  return false;
}

function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

const IS_MOBILE       = detectMobile();
const IS_IOS          = detectIOS();
const ASSISTANT_NAME    = "Will";
const ASSISTANT_ARTICLE = "o";

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const [showMenuOptions, setShowMenuOptions] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [micSupported] = useState(() => typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window));
  const [hopeUrl, setHopeUrl] = useState<string | null>(null);
  const [docsConfirmed, setDocsConfirmed] = useState(false);
  const [docsModalOpen, setDocsModalOpen] = useState(false);
  const [activeOrderInfo, setActiveOrderInfo] = useState<{
    id: number; orderNumber: string; status: string;
    garHopeUploadUrl?: string | null; garAgendamentoDataHora?: string | null;
  } | null>(null);
  const [pixQrInfo, setPixQrInfo] = useState<PixQrInfo | null>(null);
  const [pixAfterMessageIdx, setPixAfterMessageIdx] = useState<number | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<number | null>(null);
  const [qrBlobUrl, setQrBlobUrl] = useState<string | null>(null);
  const messagesLengthRef = useRef(0);
  const [voiceMode, setVoiceMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [awaitingEmail, setAwaitingEmail] = useState(false);
  const [awaitingPassword, setAwaitingPassword] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<Array<{ id: number; dataHora: string }> | null>(null);
  const [schedulingOrderId, setSchedulingOrderId] = useState<number | null>(null);
  const [chatLoggedIn, setChatLoggedIn] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<{ start(): void; stop(): void; abort(): void; onresult: ((e: SpeechRecognitionEvent) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null; lang: string; continuous: boolean; interimResults: boolean } | null>(null);
  const sendRef = useRef<(msg?: string) => Promise<void>>(() => Promise.resolve());
  const transcriptRef = useRef("");
  const pendingSendRef = useRef(false);
  const directSentRef = useRef(false);
  const voiceModeRef = useRef(false);
  const audioEnabledRef = useRef(false);
  const toggleMicRef = useRef<() => void>(() => {});
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iosAudioUnlockedRef = useRef(false);
  const pendingGreetingRef = useRef<string | null>(null);
  const [micDenied, setMicDenied] = useState(false);
  const [iosAudioLocked, setIosAudioLocked] = useState(IS_IOS);
  const [termsAccepted, setTermsAccepted] = useState<boolean>(false);

  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);
  useEffect(() => { audioEnabledRef.current = audioEnabled; }, [audioEnabled]);

  useEffect(() => {
    const dataUrl = pixQrInfo?.qrCodeDataUrl;
    if (!dataUrl) { setQrBlobUrl(null); return; }
    let url: string | null = null;
    try {
      const base64 = dataUrl.split(",")[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "image/png" });
      url = URL.createObjectURL(blob);
      setQrBlobUrl(url);
    } catch {
      setQrBlobUrl(dataUrl);
    }
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [pixQrInfo?.qrCodeDataUrl]);

  useEffect(() => { messagesLengthRef.current = messages.length; }, [messages]);

  const unlockIOSAudio = useCallback(() => {
    if (!IS_IOS || iosAudioUnlockedRef.current || !("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance("");
    window.speechSynthesis.speak(u);
    window.speechSynthesis.cancel();
    iosAudioUnlockedRef.current = true;
    setIosAudioLocked(false);
    if (pendingGreetingRef.current) {
      const text = pendingGreetingRef.current;
      pendingGreetingRef.current = null;
      setTimeout(() => { speakTextRef.current(text); }, 200);
    }
  }, []);

  const speakTextRef = useRef<(text: string, onDone?: () => void) => void>(() => {});

  const speakText = useCallback((text: string, onDone?: () => void) => {
    if (!audioEnabledRef.current || !("speechSynthesis" in window)) { onDone?.(); return; }
    if (IS_IOS && !iosAudioUnlockedRef.current) { onDone?.(); return; }
    window.speechSynthesis.cancel();
    const clean = text
      .split("\n")
      .filter(l => !l.startsWith("ACAO:"))
      .join(" ")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/[*_~>#\-]/g, "")
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
      .replace(/[\u2600-\u27BF]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!clean) { onDone?.(); return; }

    const KNOWN_MALE_PT   = /\b(felipe|daniel|carlos|miguel|gustavo|antonio|reed|thomas|luca)\b/i;
    const KNOWN_FEMALE_PT = /\b(luciana|maria|google|francisca|joana|ines)\b/i;

    const pickVoice = (voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined => {
      if (IS_MOBILE) {
        const female = voices.find(v => v.lang === "pt-BR" && KNOWN_FEMALE_PT.test(v.name));
        if (female) return female;
        return voices.find(v => v.lang === "pt-BR") ?? voices.find(v => v.lang.startsWith("pt"));
      }
      const named = voices.find(v => v.lang === "pt-BR" && KNOWN_MALE_PT.test(v.name));
      if (named) return named;
      const maleName = voices.find(v => v.lang === "pt-BR" && v.name.toLowerCase().includes("male"));
      if (maleName) return maleName;
      const notFemale = voices.find(v => v.lang === "pt-BR" && !KNOWN_FEMALE_PT.test(v.name));
      if (notFemale) return notFemale;
      return voices.find(v => v.lang === "pt-BR") ?? voices.find(v => v.lang.startsWith("pt"));
    };

    const doSpeak = (voices: SpeechSynthesisVoice[]) => {
      const utter = new SpeechSynthesisUtterance(clean);
      utter.lang = "pt-BR";
      utter.rate = 1.5;
      utter.pitch = 0.9;
      const v = pickVoice(voices);
      if (v) utter.voice = v;
      utter.onstart = () => setIsSpeaking(true);
      utter.onend = () => { setIsSpeaking(false); onDone?.(); };
      utter.onerror = () => { setIsSpeaking(false); onDone?.(); };
      window.speechSynthesis.speak(utter);
    };

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      doSpeak(voices);
    } else {
      const onChanged = () => {
        window.speechSynthesis.onvoiceschanged = null;
        doSpeak(window.speechSynthesis.getVoices());
      };
      window.speechSynthesis.onvoiceschanged = onChanged;
      setTimeout(() => {
        if (window.speechSynthesis.onvoiceschanged === onChanged) {
          window.speechSynthesis.onvoiceschanged = null;
          doSpeak([]);
        }
      }, 800);
    }
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => { sendRef.current = send; });
  useEffect(() => { speakTextRef.current = speakText; });

  async function startSession() {
    if (sessionId) return;
    setStarting(true);
    setSessionError(false);
    try {
      const res = await fetch("/api/chat/session", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { id: number };
      setSessionId(data.id);
      const greetingText = `Olá! Sou ${ASSISTANT_ARTICLE} ${ASSISTANT_NAME}, assistente da LealCert Certificados Digital. Como posso te ajudar hoje? Diga o número da opção desejada: dois para suporte, três para tirar dúvidas, quatro para consultar meu pedido.`;
      setMessages([{
        role: "assistant",
        content: `Olá! 👋 Sou ${ASSISTANT_ARTICLE} **${ASSISTANT_NAME}**, assistente da **LealCert Certificados Digital**.\n\nComo posso te ajudar hoje? Clique na opção desejada:`,
      }]);
      setShowMenuOptions(true);
      try {
        const ordersRes = await fetch("/api/orders", { credentials: "include" });
        if (ordersRes.ok) {
          const orders = await ordersRes.json() as Array<{
            id: number; orderNumber: string; status: string;
            garHopeUploadUrl?: string | null; garAgendamentoDataHora?: string | null;
          }>;
          const ACTIVE = ["paid", "protocol_assigned", "aguardando_validacao"];
          const pending = orders.find(o => ACTIVE.includes(o.status));
          if (pending) setActiveOrderInfo(pending);
        }
      } catch { /* usuário não logado ou erro — ignorar */ }
      if (IS_IOS) {
        pendingGreetingRef.current = greetingText;
      } else {
        setTimeout(() => { speakText(greetingText); }, 300);
      }
    } catch {
      setSessionError(true);
    } finally {
      setStarting(false);
    }
  }

  useEffect(() => { if (termsAccepted) startSession(); }, [termsAccepted]);

  async function acceptTerms() { setTermsAccepted(true); }

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
    } else {
      setTermsAccepted(false);
      setSessionId(null);
      setMessages([]);
      setStarting(false);
      setShowMenuOptions(false);
      setLoading(false);
      setInput("");
      setActiveOrderInfo(null);
      setHopeUrl(null);
      setDocsConfirmed(false);
      setPixQrInfo(null);
      setPixAfterMessageIdx(null);
      setCreatedOrderId(null);
    }
  }, [open]);

  async function send(directMsg?: string) {
    const userMsg = (directMsg ?? input).trim();
    if (!userMsg || loading) return;
    if (!sessionId) { await startSession(); return; }
    const wasPassword = awaitingPassword;
    setInput("");
    setAwaitingEmail(false);
    setAwaitingPassword(false);
    setShowMenuOptions(false);
    const isInternalCmd = userMsg.startsWith("__PAGUEI__:") || userMsg.startsWith("__AGENDAR__:");
    if (!isInternalCmd) {
      setMessages(prev => [...prev, { role: "user", content: wasPassword ? "••••••••" : userMsg }]);
    }
    setLoading(true);

    let assistantContent = "";
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: userMsg, sessionId, assistantName: ASSISTANT_NAME }),
      });

      if (!res.body) throw new Error("No stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6)) as {
              content?: string;
              done?: boolean;
              action?: string;
              tipo?: string;
              hopeUrl?: string;
              orderId?: number;
              orderNumber?: string;
              total?: number;
              pixKey?: string | null;
              pixPayload?: string | null;
              qrCodeDataUrl?: string | null;
              nome?: string;
              slots?: Array<{ id: number; dataHora: string }>;
            };
            if (ev.content) {
              assistantContent += ev.content;
              const lines = assistantContent.split("\n");
              const filtered: string[] = [];
              let skipNextJson = false;
              for (const line of lines) {
                if (line.startsWith("ACAO:")) { skipNextJson = true; continue; }
                if (skipNextJson && line.trim().startsWith("{")) { skipNextJson = false; continue; }
                skipNextJson = false;
                filtered.push(line);
              }
              const display = filtered.join("\n")
                .replace(/\[[A-Z][A-Z_]*(?::[^\]]*)??\]/g, "")
                .replace(/\n{3,}/g, "\n\n")
                .trim();
              setMessages(prev => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: display };
                return copy;
              });
            }
            if (ev.action === "mostrar_link_docs" && ev.hopeUrl) {
              setHopeUrl(ev.hopeUrl);
              setDocsConfirmed(false);
            }
            if (ev.action === "login_ok" && ev.nome) {
              setChatLoggedIn(ev.nome as string);
              setAwaitingPassword(false);
            }
            if (ev.action === "mostrar_horarios" && ev.slots) {
              setAvailableSlots(ev.slots as Array<{ id: number; dataHora: string }>);
              if (ev.orderId) setSchedulingOrderId(ev.orderId as number);
            }
            if (ev.action === "agendamento_confirmado") {
              setAvailableSlots(null);
              setSchedulingOrderId(null);
            }
            if (ev.action === "order_created" && ev.orderNumber) {
              if (ev.orderId) setCreatedOrderId(ev.orderId);
              setPixAfterMessageIdx(messagesLengthRef.current - 1);
              setPixQrInfo({
                qrCodeDataUrl: ev.qrCodeDataUrl ?? null,
                pixPayload: ev.pixPayload ?? null,
                pixKey: ev.pixKey ?? null,
                total: ev.total ?? 0,
                orderNumber: ev.orderNumber,
              });
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch {
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: "❌ Erro de conexão. Tente novamente." };
        return copy;
      });
    } finally {
      setLoading(false);
      const isAskingEmail = /digit.*e-?mail|e-?mail.*digit|campo.*e-?mail|e-?mail.*campo|por favor.*digit/i.test(assistantContent)
        && !/confirmação|enviado|enviada|cadastrado|enviamos/i.test(assistantContent);
      if (isAskingEmail) setAwaitingEmail(true);
      const isAskingPassword = /digit.*senha|informe.*senha|sua senha|senha.*acesso|senha de acesso/i.test(assistantContent)
        && !/incorret|inválid|erro|login.*ok|autenticad|bem.?vind/i.test(assistantContent);
      if (isAskingPassword) setAwaitingPassword(true);
      if (assistantContent) speakText(assistantContent);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  async function confirmDocsUploaded() {
    if (!sessionId) return;
    setDocsConfirmed(true);
    await sendRef.current("[DOCS_CONFIRMADOS] Confirmei o envio dos documentos no portal Hope. Pode prosseguir com o agendamento da videoconferência.");
  }

  async function toggleMic() {
    if (!micSupported) return;
    if (IS_IOS) unlockIOSAudio();
    if (isListening) {
      const raw = transcriptRef.current.trim();
      transcriptRef.current = "";
      pendingSendRef.current = false;
      directSentRef.current = true;
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      setIsListening(false);
      setInput("");
      if (raw) void sendRef.current(normalizeVoiceText(raw));
      return;
    }
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        setMicDenied(false);
      } catch {
        setMicDenied(true);
        if (voiceModeRef.current) { setVoiceMode(false); voiceModeRef.current = false; }
        return;
      }
    }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    const recognition = new SR() as typeof recognitionRef.current;
    if (!recognition) return;
    transcriptRef.current = "";
    recognition.lang = "pt-BR";
    recognition.continuous = !IS_IOS;
    recognition.interimResults = true;
    const clearSilenceTimer = () => {
      if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    };
    const armSilenceTimer = () => {
      clearSilenceTimer();
      silenceTimerRef.current = setTimeout(() => {
        if (recognitionRef.current !== recognition) return;
        const raw = transcriptRef.current.trim();
        transcriptRef.current = "";
        pendingSendRef.current = false;
        directSentRef.current = true;
        recognition.abort();
        recognitionRef.current = null;
        setIsListening(false);
        setInput("");
        if (raw) void sendRef.current(normalizeVoiceText(raw));
      }, 1500);
    };
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let full = "";
      for (let i = 0; i < e.results.length; i++) full += e.results[i][0].transcript;
      transcriptRef.current = full;
      setInput(full);
      armSilenceTimer();
    };
    recognition.onend = () => {
      clearSilenceTimer();
      setIsListening(false);
      recognitionRef.current = null;
      if (directSentRef.current) { directSentRef.current = false; transcriptRef.current = ""; return; }
      const raw = transcriptRef.current.trim();
      transcriptRef.current = "";
      if (pendingSendRef.current && raw) {
        pendingSendRef.current = false;
        const msg = normalizeVoiceText(raw);
        setInput("");
        void sendRef.current(msg);
      } else {
        pendingSendRef.current = false;
        if (voiceModeRef.current) setTimeout(() => toggleMicRef.current(), 400);
      }
    };
    recognition.onerror = (e: { error: string }) => {
      clearSilenceTimer();
      pendingSendRef.current = false;
      setIsListening(false);
      recognitionRef.current = null;
      transcriptRef.current = "";
      if (voiceModeRef.current && e.error !== "not-allowed" && e.error !== "service-not-allowed") {
        setTimeout(() => toggleMicRef.current(), 600);
      }
    };
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setInput("");
  }

  useEffect(() => { toggleMicRef.current = toggleMic; });

  function startVoiceMode() {
    if (!micSupported) return;
    if (IS_IOS) unlockIOSAudio();
    window.speechSynthesis.cancel();
    setVoiceMode(true);
    voiceModeRef.current = true;
    setTimeout(() => toggleMicRef.current(), 200);
  }

  function stopVoiceMode() {
    window.speechSynthesis.cancel();
    setVoiceMode(false);
    voiceModeRef.current = false;
    setIsSpeaking(false);
    recognitionRef.current?.stop();
  }

  function renderContent(text: string) {
    const lines = text.split("\n");
    return lines.map((line, i) => {
      const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
      return (
        <span key={i}>
          {i > 0 && <br />}
          {parts.map((part, j) => {
            if (part.startsWith("**") && part.endsWith("**")) return <strong key={j}>{part.slice(2, -2)}</strong>;
            if (part.startsWith("`") && part.endsWith("`")) return <code key={j} className="bg-black/10 rounded px-1 font-mono text-xs">{part.slice(1, -1)}</code>;
            return part;
          })}
        </span>
      );
    });
  }

  // suppress unused warning — micDenied is used as guard inside toggleMic
  void micDenied;
  void chatLoggedIn;
  void voiceMode;
  void startVoiceMode;
  void stopVoiceMode;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-6 z-50 flex items-center gap-2.5 bg-[#2563eb] text-white px-5 py-3.5 rounded-full shadow-2xl hover:bg-blue-700 transition-all duration-200 hover:scale-105 active:scale-95 group"
        aria-label="Abrir chat de vendas"
      >
        <MessageCircle className="h-5 w-5" />
        <span className="font-semibold text-sm">Falar com o assistente</span>
        <span className="absolute -top-1 -right-1 h-3 w-3 bg-green-400 rounded-full border-2 border-white animate-pulse" />
      </button>

      {open && (
        <div className="fixed bottom-0 right-0 sm:bottom-6 sm:right-6 z-50 flex flex-col w-full sm:w-[400px] h-full sm:h-[600px] bg-white rounded-none sm:rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 bg-[#0f172a] text-white shrink-0">
            <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition-all ${isSpeaking ? "bg-green-500 animate-pulse" : "bg-[#2563eb]"}`}>
              <Bot className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{ASSISTANT_NAME} — LealCert Certificados Digital</div>
              <div className="flex items-center gap-1.5 text-xs text-green-400">
                <span className={`h-1.5 w-1.5 rounded-full ${isSpeaking ? "bg-yellow-400 animate-pulse" : "bg-green-400"}`} />
                {isSpeaking ? "Falando…" : "Online agora"}
              </div>
            </div>
            <button
              onClick={() => { const next = !audioEnabled; setAudioEnabled(next); if (!next) window.speechSynthesis.cancel(); }}
              title={audioEnabled ? "Silenciar voz" : "Ativar voz"}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              {audioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 opacity-50" />}
            </button>
            <button onClick={() => { stopVoiceMode(); setOpen(false); }} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
            {!termsAccepted && (
              <div className="flex justify-start gap-2">
                <div className="h-7 w-7 rounded-full bg-[#2563eb] flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="max-w-[92%] bg-white border border-blue-200 rounded-2xl rounded-bl-sm shadow-sm px-4 py-4 text-sm">
                  <p className="font-semibold text-gray-800 mb-2">🔒 Política de Privacidade e LGPD</p>
                  <p className="text-xs text-gray-600 leading-relaxed mb-3">
                    Antes de iniciarmos, é necessário que você concorde com o tratamento dos seus dados pessoais conforme a <strong>Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018)</strong>.
                  </p>
                  <p className="text-xs text-gray-600 leading-relaxed mb-3">
                    A <strong>LealCert Certificados Digital</strong> coleta os dados informados neste chat (nome, CPF/CNPJ, e-mail, telefone e endereço) com a <strong>finalidade exclusiva</strong> de processar sua solicitação de certificado digital ICP-Brasil. Suas informações são armazenadas com segurança e <strong>nunca serão compartilhadas com terceiros</strong> sem sua autorização, exceto quando exigido por lei.
                  </p>
                  <p className="text-xs text-gray-500 mb-4">
                    Ao continuar, você autoriza o tratamento dos seus dados conforme nossa política de privacidade.
                  </p>
                  <button
                    onClick={acceptTerms}
                    className="w-full flex items-center justify-center gap-2 text-sm px-4 py-2.5 rounded-xl bg-[#2563eb] text-white hover:bg-blue-700 transition-colors font-semibold shadow-sm"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Aceitar e iniciar conversa
                  </button>
                </div>
              </div>
            )}
            {termsAccepted && starting && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-[#2563eb]" />
              </div>
            )}
            {messages.map((m, i) => (
              <Fragment key={i}>
              <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} gap-2`}>
                {m.role === "assistant" && (
                  <div className="h-7 w-7 rounded-full bg-[#2563eb] flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-white" />
                  </div>
                )}
                <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-[#2563eb] text-white rounded-br-sm"
                    : "bg-white text-gray-800 shadow-sm border border-gray-100 rounded-bl-sm"
                }`}>
                  {m.content ? renderContent(m.content) : (
                    <span className="flex gap-1 items-center py-0.5">
                      <span className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                  )}
                </div>
              </div>
              {pixQrInfo && pixAfterMessageIdx === i && (
                <div className="flex justify-start gap-2">
                  <div className="h-7 w-7 rounded-full bg-[#2563eb] flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="max-w-[90%] bg-white border border-green-200 rounded-2xl rounded-bl-sm shadow-sm px-4 py-4 text-sm">
                    <p className="font-bold text-gray-800 mb-1">✅ Pedido #{pixQrInfo.orderNumber} criado!</p>
                    <p className="text-green-700 font-semibold mb-3 text-base">Total: R$ {pixQrInfo.total.toFixed(2).replace(".", ",")}</p>
                    {pixQrInfo.qrCodeDataUrl ? (
                      <div className="flex flex-col items-center gap-3">
                        <p className="text-xs text-gray-600 font-medium self-start">📲 Pague via PIX:</p>
                        <img
                          src={qrBlobUrl ?? pixQrInfo.qrCodeDataUrl}
                          alt="QR Code PIX"
                          className="w-48 h-48 rounded-lg border border-gray-200 shadow-sm"
                          loading="eager"
                          decoding="async"
                        />
                        <p className="text-xs text-gray-500 text-center">
                          Aponte a câmera do celular para o QR Code ou use o botão abaixo
                        </p>
                        {pixQrInfo.pixPayload && (
                          <button
                            onClick={() => { void navigator.clipboard.writeText(pixQrInfo!.pixPayload!); }}
                            className="w-full text-xs px-3 py-2 rounded-lg bg-[#2563eb] text-white hover:bg-blue-700 transition-colors font-medium"
                          >
                            📋 Copiar código PIX (Copia e Cola)
                          </button>
                        )}
                      </div>
                    ) : pixQrInfo.pixKey ? (
                      <div className="space-y-2">
                        <p className="text-xs text-gray-600 font-medium">📲 Pague via PIX:</p>
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                          <p className="text-xs text-gray-500 mb-1 font-medium">Chave PIX:</p>
                          <p className="font-mono text-sm text-gray-900 break-all select-all">{pixQrInfo.pixKey}</p>
                        </div>
                        <p className="text-xs text-gray-500">Valor: <span className="font-semibold text-gray-800">R$ {pixQrInfo.total.toFixed(2).replace(".", ",")}</span></p>
                        {pixQrInfo.pixPayload && (
                          <button
                            onClick={() => { void navigator.clipboard.writeText(pixQrInfo!.pixPayload!); }}
                            className="w-full text-xs px-3 py-2 rounded-lg bg-[#2563eb] text-white hover:bg-blue-700 transition-colors font-medium"
                          >
                            📋 Copiar código PIX (Copia e Cola)
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-xs text-amber-800 font-medium">⏳ Nossa equipe entrará em contato com os dados de pagamento em breve.</p>
                      </div>
                    )}
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-500 text-center mb-2">Após efetuar o pagamento, clique no botão abaixo:</p>
                      <button
                        onClick={() => void send(`__PAGUEI__:${createdOrderId ?? ""}`)}
                        className="w-full flex items-center justify-center gap-2 text-sm px-4 py-2.5 rounded-xl bg-green-600 text-white hover:bg-green-700 transition-colors font-semibold shadow-sm"
                      >
                        ✅ Já paguei!
                      </button>
                    </div>
                  </div>
                </div>
              )}
              </Fragment>
            ))}
            {showMenuOptions && !loading && activeOrderInfo && (
              <div className="flex justify-start gap-2">
                <div className="h-7 w-7 rounded-full bg-amber-500 flex items-center justify-center shrink-0 mt-0.5">
                  <FileText className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="max-w-[92%] bg-white border border-amber-200 rounded-2xl rounded-bl-sm shadow-sm px-4 py-3 text-sm space-y-2">
                  <p className="font-semibold text-gray-800">📋 Pedido em andamento</p>
                  <p className="text-xs text-gray-500">#{activeOrderInfo.orderNumber}</p>
                  <div className="flex flex-col gap-2 pt-1">
                    {activeOrderInfo.garHopeUploadUrl && (
                      <button
                        onClick={() => {
                          setHopeUrl(activeOrderInfo!.garHopeUploadUrl!);
                          setDocsModalOpen(true);
                        }}
                        className="text-left text-sm px-4 py-2 rounded-xl border-2 border-amber-500 text-amber-700 bg-amber-50 hover:bg-amber-500 hover:text-white transition-all duration-150 font-medium"
                      >
                        📄 Enviar Documentos
                      </button>
                    )}
                    {(activeOrderInfo.status === "protocol_assigned" || activeOrderInfo.status === "aguardando_validacao") && (
                      <a
                        href={`/orders/${activeOrderInfo.id}`}
                        className="text-left text-sm px-4 py-2 rounded-xl border-2 border-[#2563eb] text-[#2563eb] bg-white hover:bg-[#2563eb] hover:text-white transition-all duration-150 font-medium text-center"
                      >
                        📅 Agendar Atendimento
                      </a>
                    )}
                    {activeOrderInfo.status === "aguardando_validacao" && activeOrderInfo.garAgendamentoDataHora && (
                      <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
                        ✅ Agendado: {new Date(activeOrderInfo.garAgendamentoDataHora).toLocaleString("pt-BR")}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
            {showMenuOptions && !loading && (
              <div className="flex justify-start gap-2">
                <div className="h-7 w-7 rounded-full bg-[#2563eb] flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="flex flex-col gap-2">
                  {/* ⚠️ NUNCA remover ou reabilitar a opção de compra pelo chat.
                      Compra só ocorre dentro do sistema (painel). */}
                  <button
                    disabled
                    className="text-left text-sm px-4 py-2 rounded-xl border-2 border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed font-medium"
                    onClick={() => {
                      setMessages(prev => [...prev, {
                        role: "assistant" as const,
                        content: "🛒 Para adquirir um certificado, acesse o sistema pelo botão **\"Acessar minha conta\"** ou **\"Comprar Agora\"** no topo da página. Por lá você finaliza a compra com segurança. 😊",
                      }]);
                      setShowMenuOptions(false);
                    }}
                  >
                    💬 Falar com o assistente
                    <span className="ml-2 text-xs text-gray-400">(suporte e dúvidas)</span>
                  </button>
                  {[
                    { label: "🎫 Abrir chamado de suporte", msg: "2" },
                    { label: "❓ Tirar dúvidas sobre certificados", msg: "3" },
                    { label: "🔍 Consultar meu pedido", msg: "4" },
                  ].map(opt => (
                    <button
                      key={opt.msg}
                      onClick={() => {
                        setActiveOrderInfo(null);
                        setHopeUrl(null);
                        setAvailableSlots(null);
                        setSchedulingOrderId(null);
                        setChatLoggedIn(null);
                        setAwaitingPassword(false);
                        send(opt.msg);
                      }}
                      className="text-left text-sm px-4 py-2 rounded-xl border-2 border-[#2563eb] text-[#2563eb] bg-white hover:bg-[#2563eb] hover:text-white transition-all duration-150 font-medium shadow-sm"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {loading && messages[messages.length - 1]?.content === "" && null}
            {hopeUrl && !docsConfirmed && (
              <div className="flex justify-start gap-2">
                <div className="h-7 w-7 rounded-full bg-[#2563eb] flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="max-w-[92%] bg-white border border-amber-200 rounded-2xl rounded-bl-sm shadow-sm px-4 py-3 text-sm">
                  <p className="font-semibold text-gray-800 mb-1">📄 Envio de Documentos</p>
                  <p className="text-xs text-gray-600 mb-3 leading-relaxed">
                    Clique no botão abaixo para acessar o portal seguro e fazer o upload dos seus documentos. Quando concluir, clique em "Concluir Envio" para prosseguir com o agendamento.
                  </p>
                  <button
                    onClick={() => setDocsModalOpen(true)}
                    className="w-full flex items-center justify-center gap-2 text-sm px-4 py-2 rounded-lg bg-[#2563eb] text-white hover:bg-blue-700 transition-colors font-medium"
                  >
                    <FileText className="h-4 w-4" />
                    Abrir Portal de Documentos
                  </button>
                </div>
              </div>
            )}
            {hopeUrl && (
              <Dialog open={docsModalOpen} onOpenChange={setDocsModalOpen}>
                <DialogContent className="max-w-4xl w-full h-[90vh] flex flex-col p-0 gap-0">
                  <DialogHeader className="px-4 py-3 border-b shrink-0 flex flex-row items-center justify-between">
                    <DialogTitle className="text-base">Portal de Envio de Documentos</DialogTitle>
                    <a
                      href={hopeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      title="Abrir em nova aba"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Abrir em nova aba
                    </a>
                  </DialogHeader>
                  <div className="flex-1 min-h-0">
                    <iframe
                      src={hopeUrl}
                      className="w-full h-full border-0"
                      title="Portal de Envio de Documentos"
                      allow="camera; microphone"
                    />
                  </div>
                  <div className="px-4 py-3 border-t shrink-0 flex items-center justify-between gap-3 bg-muted/30">
                    <p className="text-xs text-muted-foreground">
                      Após enviar todos os documentos no portal acima, clique em "Concluir Envio".
                    </p>
                    <Button onClick={() => { setDocsModalOpen(false); confirmDocsUploaded(); }} className="shrink-0">
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Concluir Envio
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            {availableSlots && availableSlots.length > 0 && (
              <div className="flex justify-start gap-2">
                <div className="h-7 w-7 rounded-full bg-[#2563eb] flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="max-w-[92%] bg-white border border-blue-200 rounded-2xl rounded-bl-sm shadow-sm px-4 py-3 text-sm">
                  <p className="font-semibold text-gray-800 mb-2">📅 Escolha um horário</p>
                  <div className="flex flex-col gap-2">
                    {availableSlots.map(slot => (
                      <button
                        key={slot.id}
                        onClick={() => {
                          const orderId = schedulingOrderId ?? createdOrderId ?? activeOrderInfo?.id;
                          if (!orderId) return;
                          setAvailableSlots(null);
                          send(`__AGENDAR__:${JSON.stringify({ orderId, slotId: slot.id })}`);
                        }}
                        className="text-left text-sm px-4 py-2 rounded-xl border-2 border-[#2563eb] text-[#2563eb] bg-white hover:bg-[#2563eb] hover:text-white transition-all duration-150 font-medium"
                      >
                        🕐 {slot.dataHora}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {hopeUrl && docsConfirmed && (
              <div className="flex justify-start gap-2">
                <div className="h-7 w-7 rounded-full bg-green-600 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="max-w-[92%] bg-green-50 border border-green-200 rounded-2xl rounded-bl-sm shadow-sm px-4 py-3 text-sm">
                  <p className="font-semibold text-green-800">✅ Documentos confirmados!</p>
                  <p className="text-xs text-green-700 mt-0.5">Seu envio foi registrado. Aguarde a confirmação do assistente para prosseguir.</p>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="px-3 py-3 bg-white border-t border-gray-100 shrink-0">
            {sessionError && (
              <div className="mb-2 flex items-center justify-between text-xs text-red-600 bg-red-50 rounded-lg px-3 py-1.5">
                <span>Erro ao conectar. Tente novamente.</span>
                <button onClick={startSession} className="underline font-medium ml-2">Reconectar</button>
              </div>
            )}
            {IS_IOS && iosAudioLocked && sessionId && (
              <button
                onClick={unlockIOSAudio}
                className="mb-2 w-full flex items-center justify-center gap-2 text-xs font-medium text-[#2563eb] bg-blue-50 hover:bg-blue-100 rounded-lg px-3 py-2 transition-colors"
              >
                <Volume2 className="h-3.5 w-3.5" />
                Toque aqui para ativar o áudio
              </button>
            )}
            {isSpeaking && !awaitingEmail && (
              <div className="mb-2 flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-1.5">
                <Volume2 className="h-3.5 w-3.5 animate-pulse shrink-0" />
                <span className="font-medium">{ASSISTANT_NAME} está falando…</span>
              </div>
            )}
            {awaitingEmail && (
              <div className="mb-2 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="font-medium">Digite seu e-mail abaixo</span>
              </div>
            )}
            {awaitingPassword && (
              <div className="mb-2 flex items-center gap-2 text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-1.5">
                <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                <span className="font-medium">Senha oculta por segurança — apenas você a vê</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type={awaitingPassword ? "password" : "text"}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={!termsAccepted ? "Aceite os termos acima para iniciar…" : awaitingPassword ? "••••••••" : awaitingEmail ? "Digite seu e-mail aqui…" : isSpeaking ? `${ASSISTANT_NAME} está falando…` : starting ? "Conectando…" : "Digite sua mensagem…"}
                disabled={!termsAccepted || loading || starting || (isSpeaking && !awaitingEmail && !awaitingPassword)}
                className="flex-1 text-sm px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30 focus:border-[#2563eb] placeholder:text-gray-400 disabled:opacity-50 transition-all"
              />
              <button
                onClick={() => send()}
                disabled={!termsAccepted || !input.trim() || loading || starting || isSpeaking}
                className="h-10 w-10 flex items-center justify-center bg-[#2563eb] text-white rounded-xl disabled:opacity-40 hover:bg-blue-700 transition-colors shrink-0"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-center text-[10px] text-gray-400 mt-2">
              🔒 Seus dados são protegidos e nunca compartilhados
            </p>
          </div>
        </div>
      )}
    </>
  );
}
