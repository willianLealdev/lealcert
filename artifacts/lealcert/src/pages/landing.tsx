import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Shield, CheckCircle2, Clock, Award, Users, FileText,
  ChevronRight, MessageCircle, X, Send, Loader2, Bot,
  Star, Lock, Zap, Phone, Mail, MapPin, Menu, Mic, MicOff,
  Volume2, VolumeX, Upload, Paperclip
} from "lucide-react";

const CERTS = [
  { name: "e-CPF", desc: "Certificado de pessoa física", detail: "Assinatura eletrônica, acesso a serviços Gov.br, declaração de IR, procurações eletrônicas e muito mais.", icon: "👤" },
  { name: "e-CNPJ", desc: "Certificado de pessoa jurídica", detail: "Emissão de NF-e, NFS-e, eSocial, EFD-Reinf, acesso a portais da Receita Federal e Prefeitura.", icon: "🏢" },
  { name: "A1 — Arquivo Digital", desc: "Instalado no computador ou nuvem", detail: "Prático e seguro, armazenado como arquivo. Renovação anual. Ideal para quem usa sempre no mesmo dispositivo.", icon: "💾" },
  { name: "A3 — Cartão/Token", desc: "Dispositivo físico criptografado", detail: "Máxima segurança. Armazenado em dispositivo físico. Validade de 1 a 3 anos. O cliente precisa ter mídia compatível.", icon: "🔐" },
];

const STEPS = [
  { n: "01", title: "Fale com nossa IA", desc: "Informe o que precisa no chat. A assistente vai recomendar o certificado ideal para o seu caso." },
  { n: "02", title: "Forneça seus dados", desc: "Nome, CPF/CNPJ e endereço. Tudo direto no chat, sem formulários complicados." },
  { n: "03", title: "Pague via PIX", desc: "QR Code e chave PIX gerados na hora. Pagamento instantâneo e confirmação automática." },
  { n: "04", title: "Emissão agendada", desc: "Nossa equipe entra em contato para agendar. Você acompanha tudo por e-mail." },
];

const BENEFITS = [
  { icon: Zap, title: "Rápido", desc: "Do pedido à emissão em até 24h úteis" },
  { icon: Shield, title: "Seguro", desc: "Tecnologia ICP-Brasil, padrão nacional" },
  { icon: Clock, title: "100% Online", desc: "Sem precisar sair de casa ou do escritório" },
  { icon: Award, title: "Garantia", desc: "Suporte completo durante toda a validade" },
  { icon: Users, title: "Para Todos", desc: "Pessoa física, jurídica e contabilidades" },
  { icon: FileText, title: "Conformidade", desc: "Aceito em todos os sistemas governamentais" },
];

type ChatMsg = { role: "user" | "assistant"; content: string };
type PixQrInfo = { qrCodeDataUrl: string | null; pixPayload: string | null; pixKey: string | null; total: number; orderNumber: string };

function getDocList(tipo: "cpf" | "cnpj" | "outros"): string[] {
  if (tipo === "cpf") return ["RG ou CNH — frente", "RG ou CNH — verso", "Comprovante de residência"];
  if (tipo === "cnpj") return ["RG ou CNH do responsável", "Cartão CNPJ (emitido pela Receita Federal)", "Ficha Cadastral (Contrato Social ou Requerimento de Empresário)", "Comprovante de endereço da empresa"];
  return ["Documento comprobatório do CEI, PIS ou NIS"];
}

function normalizeVoiceText(text: string): string {
  let t = text;

  // Siglas faladas em português via voz → forma escrita
  // "cê pê éfe" / "cê pê efe" → "CPF"
  t = t.replace(/\bc[eê]\s+p[eê]\s+[eé]fe\b/gi, "CPF");
  t = t.replace(/\bc[eê]\s+p[eê]\s+fe\b/gi, "CPF");
  // "cê ene pê jota" / "cê ene pê jê" → "CNPJ"
  t = t.replace(/\bc[eê]\s+ene\s+p[eê]\s+jo[t]?[a-z]*\b/gi, "CNPJ");
  t = t.replace(/\bc[eê]\s+ene\s+p[eê]\s+j[eê]\b/gi, "CNPJ");
  // "cê pê éfe" como palavra única transcrita
  t = t.replace(/\bcepeefe\b/gi, "CPF");
  t = t.replace(/\bcenepeje\b/gi, "CNPJ");

  // "arroba" → "@"
  t = t.replace(/\s*\barroba\b\s*/gi, "@");

  if (t.includes("@")) {
    // "ponto" → "." in email context
    t = t.replace(/\s*\bponto\b\s*/gi, ".");
    // remove spaces around @ and .
    t = t.replace(/\s*@\s*/g, "@");
    t = t.replace(/(\w)\s*\.\s*(\w)/g, "$1.$2");
    // collapse any remaining multiple spaces
    t = t.replace(/\s+/g, " ").trim();
  }

  return t;
}

type SpeechRecognitionEvent = { results: { transcript: string; isFinal: boolean }[][] };

function ChatWidget() {
  const [open, setOpen] = useState(true);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const [showMenuOptions, setShowMenuOptions] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [micSupported] = useState(() => typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window));
  const [docRequest, setDocRequest] = useState<{ tipo: "cpf" | "cnpj" | "outros" } | null>(null);
  const [pixQrInfo, setPixQrInfo] = useState<PixQrInfo | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<number | null>(null);
  const [docFiles, setDocFiles] = useState<(File | null)[]>([]);
  const [uploading, setUploading] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [awaitingEmail, setAwaitingEmail] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const docFileInputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const recognitionRef = useRef<{ start(): void; stop(): void; abort(): void; onresult: ((e: SpeechRecognitionEvent) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null; lang: string; continuous: boolean; interimResults: boolean } | null>(null);
  const sendRef = useRef<(msg?: string) => Promise<void>>(() => Promise.resolve());
  const transcriptRef = useRef("");
  const pendingSendRef = useRef(false);
  const voiceModeRef = useRef(false);
  const audioEnabledRef = useRef(true);
  const toggleMicRef = useRef<() => void>(() => {});

  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);
  useEffect(() => { audioEnabledRef.current = audioEnabled; }, [audioEnabled]);

  const speakText = useCallback((text: string, onDone?: () => void) => {
    if (!audioEnabledRef.current || !("speechSynthesis" in window)) { onDone?.(); return; }
    window.speechSynthesis.cancel();
    // Strip markdown, emojis, action lines and special chars for clean TTS
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

    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = "pt-BR";
    utter.rate = 1.4;
    utter.pitch = 0.9;
    // Prefer a pt-BR male voice
    const voices = window.speechSynthesis.getVoices();
    const ptVoice = voices.find(v => v.lang === "pt-BR" && v.name.toLowerCase().includes("male"))
      ?? voices.find(v => v.lang === "pt-BR" && !v.name.toLowerCase().includes("female"))
      ?? voices.find(v => v.lang === "pt-BR")
      ?? voices.find(v => v.lang.startsWith("pt"));
    if (ptVoice) utter.voice = ptVoice;

    utter.onstart = () => setIsSpeaking(true);
    utter.onend = () => { setIsSpeaking(false); onDone?.(); };
    utter.onerror = () => { setIsSpeaking(false); onDone?.(); };
    window.speechSynthesis.speak(utter);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => { sendRef.current = send; });

  useEffect(() => {
    if (docRequest) {
      setDocFiles(new Array(getDocList(docRequest.tipo).length).fill(null) as (File | null)[]);
      docFileInputsRef.current = [];
    }
  }, [docRequest]);

  async function startSession() {
    if (sessionId) return;
    setStarting(true);
    setSessionError(false);
    try {
      const res = await fetch("/api/chat/session", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { id: number };
      setSessionId(data.id);
      const greetingText = "Olá! Sou o Will, assistente da LealCert Certificados Digital. Como posso te ajudar hoje? Diga o número da opção desejada: um para comprar certificado, dois para suporte, três para tirar dúvidas.";
      setMessages([{
        role: "assistant",
        content: "Olá! 👋 Sou o **Will**, assistente da **LealCert Certificados Digital**.\n\nComo posso te ajudar hoje? Digite o número ou clique na opção:",
      }]);
      setShowMenuOptions(true);
      // Auto-ativar modo voz: fala saudação e depois abre mic
      if (micSupported) {
        setVoiceMode(true);
        voiceModeRef.current = true;
        setTimeout(() => {
          speakText(greetingText, () => setTimeout(() => toggleMicRef.current(), 400));
        }, 300);
      }
    } catch {
      setSessionError(true);
    } finally {
      setStarting(false);
    }
  }

  useEffect(() => {
    startSession();
  }, []);

  useEffect(() => {
    if (open) { setTimeout(() => inputRef.current?.focus(), 300); }
  }, [open]);

  async function send(directMsg?: string) {
    const userMsg = (directMsg ?? input).trim();
    if (!userMsg || loading) return;
    if (!sessionId) { await startSession(); return; }
    setInput("");
    setAwaitingEmail(false);
    setShowMenuOptions(false);
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    let assistantContent = "";
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: userMsg, sessionId }),
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
              orderId?: number;
              orderNumber?: string;
              total?: number;
              pixKey?: string | null;
              pixPayload?: string | null;
              qrCodeDataUrl?: string | null;
            };
            if (ev.content) {
              assistantContent += ev.content;
              const display = assistantContent
                .split("\n")
                .filter(l => !l.startsWith("ACAO:"))
                .join("\n")
                .trim();
              setMessages(prev => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: display };
                return copy;
              });
            }
            if (ev.action === "solicitar_docs" && ev.tipo) {
              setDocRequest({ tipo: ev.tipo as "cpf" | "cnpj" | "outros" });
            }
            if (ev.action === "order_created" && ev.orderNumber) {
              if (ev.orderId) setCreatedOrderId(ev.orderId);
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
      // Detecta se o Will está pedindo o e-mail → pausa o mic e libera o input para digitação
      const isAskingEmail = /digit.*e-?mail|e-?mail.*digit|campo.*e-?mail|e-?mail.*campo|por favor.*digit/i.test(assistantContent)
        && !/confirmação|enviado|enviada|cadastrado|enviamos/i.test(assistantContent);
      if (isAskingEmail) setAwaitingEmail(true);
      if (assistantContent) {
        speakText(assistantContent, () => {
          // Não abre o mic se estiver esperando e-mail por digitação
          if (voiceModeRef.current && !isAskingEmail) setTimeout(() => toggleMicRef.current(), 400);
        });
      }
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  async function uploadDocs() {
    const files = docFiles.filter((f): f is File => f !== null);
    if (!files.length || !sessionId) return;
    setUploading(true);
    try {
      const formData = new FormData();
      files.forEach(f => formData.append("files", f));
      formData.append("sessionId", String(sessionId));
      const res = await fetch("/api/chat/upload-docs", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json() as { files: string[] };
      setDocRequest(null);
      setDocFiles([]);
      const names = data.files.join(", ");
      await sendRef.current(`[DOCUMENTOS_ENVIADOS] Arquivos enviados: ${names}. Por favor, prossiga com a criação do pedido.`);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "❌ Erro ao enviar os documentos. Por favor, tente novamente." }]);
    } finally {
      setUploading(false);
    }
  }

  function toggleMic() {
    if (!micSupported) return;

    if (isListening) {
      // Clique MicOff: sinaliza envio pendente e para a gravação
      pendingSendRef.current = true;
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      recognitionRef.current?.stop();
      return;
    }

    // Cancela TTS antes de iniciar gravação
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    const recognition = new SR() as typeof recognitionRef.current;
    if (!recognition) return;

    transcriptRef.current = "";
    recognition.lang = "pt-BR";
    recognition.continuous = true;    // grava continuamente até o usuário clicar em parar
    recognition.interimResults = true;

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let full = "";
      for (let i = 0; i < e.results.length; i++) {
        full += e.results[i][0].transcript;
      }
      transcriptRef.current = full;
      setInput(full);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      const raw = transcriptRef.current.trim();
      transcriptRef.current = "";
      if (pendingSendRef.current && raw) {
        // Envio acionado pelo clique em MicOff
        pendingSendRef.current = false;
        const msg = normalizeVoiceText(raw);
        setInput("");
        void sendRef.current(msg);
      } else {
        pendingSendRef.current = false;
        // Sem envio pendente mas no modo voz: reabre mic para continuar a conversa
        if (voiceModeRef.current) setTimeout(() => toggleMicRef.current(), 400);
      }
    };

    recognition.onerror = (e: { error: string }) => {
      pendingSendRef.current = false;
      setIsListening(false);
      recognitionRef.current = null;
      transcriptRef.current = "";
      // No modo voz, reabre o mic a menos que seja erro de permissão
      if (voiceModeRef.current && e.error !== "not-allowed" && e.error !== "service-not-allowed") {
        setTimeout(() => toggleMicRef.current(), 600);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setInput("");
  }

  // Keep toggleMicRef always up-to-date so speakText callback can call it
  useEffect(() => { toggleMicRef.current = toggleMic; });

  function startVoiceMode() {
    if (!micSupported) return;
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

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 bg-[#2563eb] text-white px-5 py-3.5 rounded-full shadow-2xl hover:bg-blue-700 transition-all duration-200 hover:scale-105 active:scale-95 group"
        aria-label="Abrir chat de vendas"
      >
        <MessageCircle className="h-5 w-5" />
        <span className="font-semibold text-sm">Comprar certificado</span>
        <span className="absolute -top-1 -right-1 h-3 w-3 bg-green-400 rounded-full border-2 border-white animate-pulse" />
      </button>

      {open && (
        <div className="fixed bottom-0 right-0 sm:bottom-6 sm:right-6 z-50 flex flex-col w-full sm:w-[400px] h-full sm:h-[600px] bg-white rounded-none sm:rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 bg-[#0f172a] text-white shrink-0">
            <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition-all ${isSpeaking ? "bg-green-500 animate-pulse" : "bg-[#2563eb]"}`}>
              <Bot className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">Will — LealCert Certificados Digital</div>
              <div className="flex items-center gap-1.5 text-xs text-green-400">
                <span className={`h-1.5 w-1.5 rounded-full ${isSpeaking ? "bg-yellow-400 animate-pulse" : "bg-green-400"}`} />
                {isSpeaking ? "Falando…" : isListening ? "Ouvindo…" : voiceMode ? "Modo voz ativo" : "Online agora"}
              </div>
            </div>
            {micSupported && (
              <button
                onClick={() => voiceMode ? stopVoiceMode() : startVoiceMode()}
                title={voiceMode ? "Desativar modo voz" : "Ativar conversa por voz"}
                className={`p-1.5 rounded-lg transition-colors ${voiceMode ? "bg-green-500/80 hover:bg-green-600" : "hover:bg-white/10"}`}
              >
                <Mic className={`h-4 w-4 ${voiceMode ? "" : "opacity-60"}`} />
              </button>
            )}
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
            {starting && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-[#2563eb]" />
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} gap-2`}>
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
            ))}
            {showMenuOptions && !loading && (
              <div className="flex justify-start gap-2">
                <div className="h-7 w-7 rounded-full bg-[#2563eb] flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="flex flex-col gap-2">
                  {[
                    { label: "🛒 Comprar certificado digital", msg: "1" },
                    { label: "🎫 Abrir chamado de suporte", msg: "2" },
                    { label: "❓ Tirar dúvidas sobre certificados", msg: "3" },
                  ].map(opt => (
                    <button
                      key={opt.msg}
                      onClick={() => send(opt.msg)}
                      className="text-left text-sm px-4 py-2 rounded-xl border-2 border-[#2563eb] text-[#2563eb] bg-white hover:bg-[#2563eb] hover:text-white transition-all duration-150 font-medium shadow-sm"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {loading && messages[messages.length - 1]?.content === "" && null}
            {docRequest && (() => {
              const docList = getDocList(docRequest.tipo);
              const allSelected = docFiles.every(f => f !== null) && docFiles.length === docList.length;
              const anySelected = docFiles.some(f => f !== null);
              return (
                <div className="flex justify-start gap-2">
                  <div className="h-7 w-7 rounded-full bg-[#2563eb] flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="max-w-[92%] bg-white border border-blue-200 rounded-2xl rounded-bl-sm shadow-sm px-4 py-3 text-sm">
                    <p className="font-semibold text-gray-800 mb-3">
                      📎 {docRequest.tipo === "cpf" ? "Documentos necessários — e-CPF" : docRequest.tipo === "cnpj" ? "Documentos necessários — e-CNPJ" : "Documento comprobatório (CEI / PIS / NIS)"}
                    </p>
                    <div className="space-y-2 mb-3">
                      {docList.map((doc, i) => (
                        <div key={doc} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-700 font-medium truncate">{doc}</p>
                            {docFiles[i] ? (
                              <p className="text-xs text-green-600 truncate mt-0.5 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3 shrink-0" />
                                {docFiles[i]!.name}
                              </p>
                            ) : (
                              <p className="text-xs text-gray-400 mt-0.5">Nenhum arquivo selecionado</p>
                            )}
                          </div>
                          <button
                            onClick={() => docFileInputsRef.current[i]?.click()}
                            className="shrink-0 flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-white border border-gray-300 hover:bg-blue-50 hover:border-blue-400 text-gray-600 hover:text-blue-600 transition-colors"
                          >
                            <Paperclip className="h-3 w-3" />
                            {docFiles[i] ? "Trocar" : "Selecionar"}
                          </button>
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            className="hidden"
                            ref={el => { docFileInputsRef.current[i] = el; }}
                            onChange={e => {
                              const file = e.target.files?.[0] ?? null;
                              setDocFiles(prev => { const c = [...prev]; c[i] = file; return c; });
                            }}
                          />
                        </div>
                      ))}
                    </div>
                    {anySelected && (
                      <button
                        onClick={uploadDocs}
                        disabled={uploading}
                        className="w-full flex items-center justify-center gap-2 text-sm px-4 py-2 rounded-lg bg-[#2563eb] text-white hover:bg-blue-700 transition-colors disabled:opacity-50 font-medium"
                      >
                        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {uploading ? "Enviando…" : allSelected ? "Enviar todos os documentos" : `Enviar ${docFiles.filter(Boolean).length} de ${docList.length} documentos`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
            {pixQrInfo && (
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
                        src={pixQrInfo.qrCodeDataUrl}
                        alt="QR Code PIX"
                        className="w-48 h-48 rounded-lg border border-gray-200 shadow-sm"
                      />
                      <p className="text-xs text-gray-500 text-center">
                        Aponte a câmera do celular para o QR Code ou use o botão abaixo
                      </p>
                      {pixQrInfo.pixPayload && (
                        <button
                          onClick={() => { void navigator.clipboard.writeText(pixQrInfo.pixPayload!); }}
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
                          onClick={() => { void navigator.clipboard.writeText(pixQrInfo.pixPayload!); }}
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
                      onClick={() => void send("Já paguei o PIX!")}
                      className="w-full flex items-center justify-center gap-2 text-sm px-4 py-2.5 rounded-xl bg-green-600 text-white hover:bg-green-700 transition-colors font-semibold shadow-sm"
                    >
                      ✅ Já paguei!
                    </button>
                  </div>
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
            {voiceMode && isSpeaking && !isListening && !awaitingEmail && (
              <div className="mb-2 flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-1.5">
                <Volume2 className="h-3.5 w-3.5 animate-pulse shrink-0" />
                <span className="font-medium">Will está falando…</span>
                <button onClick={stopVoiceMode} className="ml-auto underline text-gray-500">Encerrar voz</button>
              </div>
            )}
            {isListening && (
              <div className="mb-2 flex items-center gap-2 text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
                <span className="font-medium">Pode falar agora… envio automático ao parar</span>
                <span className="ml-auto text-gray-400 italic truncate max-w-[110px]">{input || "ouvindo…"}</span>
              </div>
            )}
            {voiceMode && !isListening && !isSpeaking && !loading && !awaitingEmail && (
              <div className="mb-2 flex items-center gap-2 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-1.5">
                <Mic className="h-3.5 w-3.5 shrink-0" />
                <span className="font-medium">Modo voz ativo — aguardando…</span>
                <button onClick={stopVoiceMode} className="ml-auto underline text-gray-500">Encerrar</button>
              </div>
            )}
            {awaitingEmail && (
              <div className="mb-2 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="font-medium">Digite o e-mail — mic pausado</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={awaitingEmail ? "Digite seu e-mail aqui…" : isListening ? "Ouvindo…" : isSpeaking ? "Will está falando…" : voiceMode ? "Modo voz — ou digite aqui" : starting ? "Conectando…" : "Digite sua mensagem…"}
                disabled={loading || starting || isListening || (isSpeaking && !awaitingEmail)}
                className="flex-1 text-sm px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30 focus:border-[#2563eb] placeholder:text-gray-400 disabled:opacity-50 transition-all"
              />
              {micSupported && (
                <button
                  onClick={isListening || isSpeaking ? toggleMic : voiceMode ? stopVoiceMode : toggleMic}
                  disabled={loading || starting}
                  title={isListening ? "Parar gravação e enviar" : voiceMode ? "Encerrar modo voz" : "Falar mensagem"}
                  className={`h-10 w-10 flex items-center justify-center rounded-xl transition-all shrink-0 disabled:opacity-40 ${
                    voiceMode
                      ? "bg-green-500 text-white hover:bg-green-600"
                      : isListening
                        ? "bg-red-500 text-white animate-pulse hover:bg-red-600"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
              )}
              <button
                onClick={() => send()}
                disabled={!input.trim() || loading || starting || isListening || isSpeaking}
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

export default function Landing() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white text-[#0f172a]">
      <nav className="sticky top-0 z-40 bg-[#0f172a] backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-28">
          <div className="flex items-center">
            <img src="/logo.png" alt="LealCert" className="h-24 w-auto object-contain" />
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-300">
            <a href="#certificados" className="hover:text-white transition-colors">Certificados</a>
            <a href="#como-funciona" className="hover:text-white transition-colors">Como Funciona</a>
            <a href="#beneficios" className="hover:text-white transition-colors">Benefícios</a>
            <a href="#contato" className="hover:text-white transition-colors">Contato</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/entrar">
              <Button variant="ghost" size="sm" className="hidden sm:flex text-sm text-gray-300 hover:text-white hover:bg-white/10">Entrar</Button>
            </Link>
            <Link href="/entrar">
              <button className="bg-[#2563eb] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                Comprar Agora
              </button>
            </Link>
            <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white px-4 py-3 flex flex-col gap-3 text-sm font-medium">
            <a href="#certificados" onClick={() => setMobileMenuOpen(false)} className="py-1">Certificados</a>
            <a href="#como-funciona" onClick={() => setMobileMenuOpen(false)} className="py-1">Como Funciona</a>
            <a href="#beneficios" onClick={() => setMobileMenuOpen(false)} className="py-1">Benefícios</a>
            <a href="#contato" onClick={() => setMobileMenuOpen(false)} className="py-1">Contato</a>
            <Link href="/entrar"><span className="py-1 text-[#2563eb]">Acessar Painel</span></Link>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0f172a] via-[#1e3a5f] to-[#0f172a] text-white py-20 sm:py-28">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 20% 50%, #2563eb 0%, transparent 50%), radial-gradient(circle at 80% 20%, #f59e0b 0%, transparent 40%)" }} />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-[#2563eb]/20 border border-[#2563eb]/40 rounded-full px-4 py-1.5 text-sm text-blue-300 mb-6">
            <Shield className="h-3.5 w-3.5" />
            <span>Certificados ICP-Brasil — Padrão Nacional de Segurança</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-tight mb-6">
            Certificado Digital<br />
            <span className="text-[#f59e0b]">sem burocracia,</span><br />
            <span className="text-[#2563eb]">100% online</span>
          </h1>
          <p className="text-lg sm:text-xl text-blue-100/80 max-w-2xl mx-auto mb-10">
            e-CPF e e-CNPJ emitidos com rapidez e segurança. Nossa assistente virtual te guia pelo processo completo — do pedido ao certificado.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              id="chat-cta"
              onClick={() => document.querySelector<HTMLButtonElement>("[aria-label='Abrir chat de vendas']")?.click()}
              className="flex items-center justify-center gap-2 bg-[#2563eb] hover:bg-blue-600 text-white font-bold px-8 py-4 rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg shadow-blue-900/30"
            >
              <MessageCircle className="h-5 w-5" />
              Comprar pelo Chat
            </button>
            <Link href="/entrar">
              <button className="flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold px-8 py-4 rounded-xl transition-all w-full sm:w-auto">
                Acessar minha conta
                <ChevronRight className="h-4 w-4" />
              </button>
            </Link>
          </div>
          <div className="flex items-center justify-center gap-6 mt-12 text-sm text-blue-200/60">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-400" /> Sem sair de casa</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-400" /> Pagamento via PIX</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-400" /> Emissão em até 24h</span>
          </div>
        </div>
      </section>

      {/* Social proof strip */}
      <div className="bg-[#f59e0b] py-4">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-center gap-8 flex-wrap text-[#0f172a] font-semibold text-sm">
          <span className="flex items-center gap-2"><Star className="h-4 w-4" /> +5.000 certificados emitidos</span>
          <span className="flex items-center gap-2"><Users className="h-4 w-4" /> Atendemos contabilidades em todo o Brasil</span>
          <span className="flex items-center gap-2"><Lock className="h-4 w-4" /> Certificadora autorizada ICP-Brasil</span>
        </div>
      </div>

      {/* Certificados */}
      <section id="certificados" className="py-16 sm:py-24 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black mb-4">Tipos de Certificado</h2>
            <p className="text-gray-500 max-w-xl mx-auto">Temos a solução certa para pessoa física, jurídica e escritórios de contabilidade</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {CERTS.map(c => (
              <div key={c.name} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md hover:border-[#2563eb]/30 transition-all group">
                <div className="text-3xl mb-4">{c.icon}</div>
                <h3 className="font-black text-lg mb-1 group-hover:text-[#2563eb] transition-colors">{c.name}</h3>
                <p className="text-[#2563eb] font-semibold text-sm mb-3">{c.desc}</p>
                <p className="text-gray-500 text-sm leading-relaxed">{c.detail}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-400 mt-8 flex items-center justify-center gap-1.5">
            <Lock className="h-3.5 w-3.5" />
            Preços exibidos pelo chat ou após login — garantimos o melhor custo-benefício do mercado
          </p>
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="py-16 sm:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black mb-4">Como Funciona</h2>
            <p className="text-gray-500 max-w-xl mx-auto">Processo 100% digital. Sem filas, sem papelada, sem complicação</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map((s, i) => (
              <div key={s.n} className="relative">
                {i < STEPS.length - 1 && (
                  <div className="hidden lg:block absolute top-8 left-full w-full h-0.5 bg-gradient-to-r from-[#2563eb]/30 to-transparent -translate-x-4 z-0" />
                )}
                <div className="relative z-10">
                  <div className="h-16 w-16 rounded-2xl bg-[#2563eb] text-white flex items-center justify-center text-2xl font-black mb-4">{s.n}</div>
                  <h3 className="font-bold text-lg mb-2">{s.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
            <button
              onClick={() => document.querySelector<HTMLButtonElement>("[aria-label='Abrir chat de vendas']")?.click()}
              className="inline-flex items-center gap-2 bg-[#2563eb] text-white font-bold px-8 py-4 rounded-xl hover:bg-blue-700 transition-all hover:scale-105 active:scale-95"
            >
              <MessageCircle className="h-5 w-5" />
              Iniciar agora no chat
            </button>
          </div>
        </div>
      </section>

      {/* Benefícios */}
      <section id="beneficios" className="py-16 sm:py-24 bg-[#0f172a] text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black mb-4">Por que a LealCert?</h2>
            <p className="text-blue-300/70 max-w-xl mx-auto">Mais de 5 anos conectando brasileiros à certificação digital com agilidade e segurança</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {BENEFITS.map(b => (
              <div key={b.title} className="flex items-start gap-4 p-5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/8 transition-colors">
                <div className="h-12 w-12 rounded-xl bg-[#2563eb] flex items-center justify-center shrink-0">
                  <b.icon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-lg mb-1">{b.title}</h3>
                  <p className="text-blue-200/60 text-sm">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-20 bg-gradient-to-r from-[#2563eb] to-blue-700 text-white">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-black mb-4">Pronto para começar?</h2>
          <p className="text-blue-100/80 text-lg mb-8">Nossa assistente virtual está disponível agora para te ajudar a escolher e adquirir o certificado certo.</p>
          <button
            onClick={() => document.querySelector<HTMLButtonElement>("[aria-label='Abrir chat de vendas']")?.click()}
            className="inline-flex items-center gap-3 bg-white text-[#2563eb] font-bold px-10 py-4 rounded-xl hover:bg-blue-50 transition-all hover:scale-105 active:scale-95 shadow-xl"
          >
            <MessageCircle className="h-5 w-5" />
            Falar com a assistente agora
          </button>
          <p className="text-blue-200/60 text-sm mt-4">Sem cadastro obrigatório · Pagamento via PIX · Confirmação imediata</p>
        </div>
      </section>

      {/* Contato */}
      <section id="contato" className="py-14 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <h2 className="text-2xl font-black mb-4">Fale Conosco</h2>
              <p className="text-gray-500 mb-6">Prefere falar diretamente com nossa equipe? Estamos disponíveis pelos canais abaixo.</p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <Phone className="h-4 w-4 text-[#2563eb]" />
                  <span>WhatsApp disponível no chat</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <Mail className="h-4 w-4 text-[#2563eb]" />
                  <span>contato@lealcert.com.br</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <MapPin className="h-4 w-4 text-[#2563eb]" />
                  <span>Atendimento em todo o Brasil</span>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm text-center">
              <div className="text-4xl mb-4">🤖</div>
              <h3 className="font-bold text-lg mb-2">Atendimento Imediato</h3>
              <p className="text-gray-500 text-sm mb-5">Nossa assistente de IA responde na hora, 24 horas por dia, 7 dias por semana.</p>
              <button
                onClick={() => document.querySelector<HTMLButtonElement>("[aria-label='Abrir chat de vendas']")?.click()}
                className="w-full bg-[#2563eb] text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors"
              >
                Abrir Chat
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0f172a] text-white pt-10 pb-6">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="LealCert" className="h-10 w-auto object-contain brightness-0 invert" />
              <span className="text-gray-400 text-sm">— Certificados Digitais ICP-Brasil</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-400">
              <Link href="/entrar"><span className="hover:text-white transition-colors cursor-pointer">Área do Cliente</span></Link>
              <a href="mailto:contato@lealcert.com.br" className="hover:text-white transition-colors">Contato</a>
            </div>
          </div>

          {/* Certifier badge */}
          <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-gray-500 text-xs order-2 sm:order-1">
              © {new Date().getFullYear()} LealCert. Todos os direitos reservados.
            </p>
            <div className="flex items-center gap-3 order-1 sm:order-2">
              <span className="text-gray-500 text-xs uppercase tracking-wider">Certificado por</span>
              <div className="bg-white/5 hover:bg-white/10 transition-colors rounded-lg px-4 py-2 border border-white/10">
                <img
                  src="/safeweb-logo.png"
                  alt="Safeweb — Segurança da Informação"
                  className="h-7 w-auto object-contain brightness-0 invert opacity-80 hover:opacity-100 transition-opacity"
                />
              </div>
            </div>
          </div>
        </div>
      </footer>

      <ChatWidget />
    </div>
  );
}
