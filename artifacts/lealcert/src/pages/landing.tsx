import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Shield, CheckCircle2, Clock, Award, Users, FileText,
  ChevronRight, MessageCircle, X, Send, Loader2, Bot,
  Star, Lock, Zap, Phone, Mail, MapPin, Menu
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

function ChatWidget() {
  const [open, setOpen] = useState(true);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function startSession() {
    if (sessionId) return;
    setStarting(true);
    setSessionError(false);
    try {
      const res = await fetch("/api/chat/session", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { id: number };
      setSessionId(data.id);
      setMessages([{
        role: "assistant",
        content: "Olá! 👋 Sou a assistente de vendas da **LealCert**.\n\nEstou aqui para te ajudar a encontrar e adquirir o certificado digital ideal para você ou sua empresa.\n\nComo posso te ajudar hoje?",
      }]);
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

  async function send() {
    if (!input.trim() || loading) return;
    if (!sessionId) { await startSession(); return; }
    const userMsg = input.trim();
    setInput("");
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
            const ev = JSON.parse(line.slice(6)) as { content?: string; done?: boolean; action?: string; orderNumber?: string; pixPayload?: { pixKey: string; amount: number } };
            if (ev.content) {
              assistantContent += ev.content;
              setMessages(prev => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: assistantContent };
                return copy;
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
      setTimeout(() => inputRef.current?.focus(), 100);
    }
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
            <div className="h-9 w-9 rounded-full bg-[#2563eb] flex items-center justify-center shrink-0">
              <Bot className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">Assistente LealCert</div>
              <div className="flex items-center gap-1.5 text-xs text-green-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                Online agora
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
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
            {loading && messages[messages.length - 1]?.content === "" && null}
            <div ref={bottomRef} />
          </div>

          <div className="px-3 py-3 bg-white border-t border-gray-100 shrink-0">
            {sessionError && (
              <div className="mb-2 flex items-center justify-between text-xs text-red-600 bg-red-50 rounded-lg px-3 py-1.5">
                <span>Erro ao conectar. Tente novamente.</span>
                <button onClick={startSession} className="underline font-medium ml-2">Reconectar</button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={starting ? "Conectando…" : "Digite sua mensagem…"}
                disabled={loading || starting}
                className="flex-1 text-sm px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30 focus:border-[#2563eb] placeholder:text-gray-400 disabled:opacity-50 transition-all"
              />
              <button
                onClick={send}
                disabled={!input.trim() || loading || starting}
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
      <nav className="sticky top-0 z-40 bg-gray-100/95 backdrop-blur border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-20">
          <div className="flex items-center">
            <img src="/logo.png" alt="LealCert" className="h-14 w-auto object-contain" />
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
            <a href="#certificados" className="hover:text-[#2563eb] transition-colors">Certificados</a>
            <a href="#como-funciona" className="hover:text-[#2563eb] transition-colors">Como Funciona</a>
            <a href="#beneficios" className="hover:text-[#2563eb] transition-colors">Benefícios</a>
            <a href="#contato" className="hover:text-[#2563eb] transition-colors">Contato</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/entrar">
              <Button variant="ghost" size="sm" className="hidden sm:flex text-sm">Entrar</Button>
            </Link>
            <button
              onClick={() => document.getElementById("chat-cta")?.click()}
              className="bg-[#2563eb] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Comprar Agora
            </button>
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
      <footer className="bg-[#0f172a] text-white py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="LealCert" className="h-10 w-auto object-contain brightness-0 invert" />
            <span className="text-gray-400 text-sm">— Certificados Digitais ICP-Brasil</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-400">
            <Link href="/entrar"><span className="hover:text-white transition-colors cursor-pointer">Área do Cliente</span></Link>
            <a href="mailto:contato@lealcert.com.br" className="hover:text-white transition-colors">Contato</a>
          </div>
          <p className="text-gray-500 text-xs">© {new Date().getFullYear()} LealCert. Todos os direitos reservados.</p>
        </div>
      </footer>

      <ChatWidget />
    </div>
  );
}
