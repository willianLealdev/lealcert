import { useState, useEffect } from "react";
import {
  Shield, CheckCircle2, Clock, Award, Users, FileText,
  ChevronRight, Star, Lock, Zap, Phone, Mail, MapPin,
  BadgeCheck, CalendarCheck, CreditCard, Headphones, Loader2, Send,
} from "lucide-react";
import { ChatWidget } from "@/components/chat-widget";

function LealCertLogo({ variant = "dark" }: { variant?: "dark" | "light" }) {
  if (variant === "light") {
    return (
      <div className="bg-white rounded-lg px-4 py-2">
        <img src="/logo-cropped.png" alt="LealCert" className="h-10 w-auto object-contain" />
      </div>
    );
  }
  return <img src="/logo-cropped.png" alt="LealCert" className="h-14 w-auto object-contain" />;
}

type CertFromDB = {
  id: number;
  name: string;
  description: string | null;
  price: string;
  validityMonths: number;
  product: string | null;
  issuanceType: string | null;
  model: string | null;
};

type ReviewFromDB = {
  id: number;
  name: string;
  role: string;
  text: string;
  stars: number;
  createdAt: string;
};

const CERT_GROUPS = [
  {
    key: "ecpf",
    tag: "Mais vendido",
    tagColor: "bg-blue-600 text-white",
    name: "e-CPF",
    sub: "Pessoa Física",
    desc: "Para profissionais autônomos, advogados, contadores e qualquer cidadão que precisa assinar documentos digitalmente.",
    features: ["Arquivo digital (A1) ou Token/Cartão (A3)", "Assinatura eletrônica ICP-Brasil", "Acesso ao Gov.br nível Ouro", "NF-e, declaração de IR e muito mais"],
    highlight: false,
    matchFn: (c: CertFromDB) => c.name.toLowerCase().includes("cpf"),
  },
  {
    key: "ecnpj",
    tag: "Indicado para empresas",
    tagColor: "bg-amber-500 text-white",
    name: "e-CNPJ",
    sub: "Pessoa Jurídica",
    desc: "Obrigatório para emissão de NF-e, eSocial, EFD-Reinf e acesso a portais da Receita Federal e Prefeitura.",
    features: ["Arquivo digital (A1) ou Token/Cartão (A3)", "NF-e, NFS-e e eSocial", "Receita Federal e Prefeitura", "Validade de 12 ou 24 meses"],
    highlight: true,
    matchFn: (c: CertFromDB) => c.name.toLowerCase().includes("cnpj"),
  },
];

const STEPS = [
  { n: "01", icon: FileText, title: "Faça seu cadastro", desc: "Acesse o sistema, crie seu cadastro com CPF ou CNPJ e escolha o certificado ideal para o seu caso." },
  { n: "02", icon: CreditCard, title: "Realize o pagamento", desc: "Pagamento rápido via PIX. Confirmação automática e instantânea assim que o pagamento é identificado." },
  { n: "03", icon: CalendarCheck, title: "Agende a videoconferência", desc: "Escolha o melhor horário para uma breve videochamada com nosso agente credenciado ICP-Brasil." },
  { n: "04", icon: BadgeCheck, title: "Receba seu certificado", desc: "Após a verificação, seu certificado é emitido e entregue digitalmente em minutos." },
];

const BENEFITS = [
  { icon: Zap, title: "Emissão em até 24h úteis", desc: "Do pedido ao certificado no seu prazo" },
  { icon: Shield, title: "Certificadora ICP-Brasil", desc: "Padrão de segurança nacional reconhecido" },
  { icon: Clock, title: "100% Online e Remoto", desc: "Sem deslocamento, sem filas, sem papelada" },
  { icon: Award, title: "Suporte durante toda a validade", desc: "Nossa equipe ao seu lado até o vencimento" },
  { icon: Users, title: "Atendimento para contabilidades", desc: "Condições especiais para escritórios" },
  { icon: Headphones, title: "Suporte especializado", desc: "Equipe técnica treinada e credenciada" },
];

function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange?.(n)}
          onMouseEnter={() => onChange && setHover(n)}
          onMouseLeave={() => onChange && setHover(0)}
          className={onChange ? "cursor-pointer" : "cursor-default"}
        >
          <Star className={`h-5 w-5 ${(hover || value) >= n ? "fill-[#f59e0b] text-[#f59e0b]" : "text-gray-300"}`} />
        </button>
      ))}
    </div>
  );
}

function CertCard({ group, certs }: { group: typeof CERT_GROUPS[number]; certs: CertFromDB[] }) {
  const matched = certs.filter(group.matchFn);

  const lowestPrice = matched.length
    ? Math.min(...matched.map(c => parseFloat(c.price)))
    : null;

  const options = matched.filter(c => {
    const vm = c.validityMonths;
    return vm === 12 || vm === 24;
  });

  return (
    <div className={`relative rounded-2xl border-2 p-7 flex flex-col transition-all hover:shadow-xl ${
      group.highlight ? "border-[#2563eb] shadow-lg shadow-blue-100" : "border-gray-100 shadow-sm hover:border-[#2563eb]/30"
    }`}>
      {group.highlight && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span className="bg-[#2563eb] text-white text-xs font-bold px-4 py-1.5 rounded-full shadow">MAIS VENDIDO</span>
        </div>
      )}
      <div className="mb-4">
        <span className={`text-xs font-bold px-3 py-1 rounded-full ${group.tagColor}`}>{group.tag}</span>
      </div>
      <h3 className="text-2xl font-black mb-1">{group.name}</h3>
      <p className="text-[#2563eb] font-semibold text-sm mb-3">{group.sub}</p>
      <p className="text-gray-500 text-sm leading-relaxed mb-5">{group.desc}</p>
      <ul className="space-y-2 mb-6 flex-1">
        {group.features.map(f => (
          <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            {f}
          </li>
        ))}
      </ul>

      {options.length > 0 && (
        <div className="mb-5 space-y-2">
          {options.map(c => (
            <div key={c.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-2.5 border border-gray-100">
              <span className="text-sm font-medium text-gray-600">{c.validityMonths} meses ({c.model ?? (c.validityMonths === 12 ? "A1" : "A3")})</span>
              <span className="text-base font-black text-[#0f172a]">R$ {parseFloat(c.price).toFixed(2).replace(".", ",")}</span>
            </div>
          ))}
        </div>
      )}

      {lowestPrice !== null && options.length === 0 && (
        <div className="mb-5">
          <span className="text-2xl font-black text-[#0f172a]">A partir de R$ {lowestPrice.toFixed(2).replace(".", ",")}</span>
          <span className="text-gray-400 text-sm ml-1">/ ano</span>
        </div>
      )}

      {lowestPrice === null && (
        <div className="mb-5 h-8 bg-gray-100 rounded-lg animate-pulse" />
      )}

      <a href="/register" className={`block w-full text-center font-bold py-3 rounded-xl transition-all hover:scale-105 ${
        group.highlight ? "bg-[#2563eb] text-white hover:bg-blue-700 shadow-md shadow-blue-200" : "bg-[#0f172a] text-white hover:bg-gray-800"
      }`}>
        Comprar
      </a>
    </div>
  );
}

function ReviewForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({ name: "", role: "", text: "", stars: 5 });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/public/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg(data.message);
        setForm({ name: "", role: "", text: "", stars: 5 });
        onSuccess();
      } else {
        setMsg("Erro ao enviar avaliação. Tente novamente.");
      }
    } catch {
      setMsg("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-[#f8fafc] rounded-2xl border border-gray-100 p-6 mt-8">
      <h3 className="font-black text-lg mb-4">Deixe sua avaliação</h3>
      {msg ? (
        <div className="text-center py-6">
          <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
          <p className="font-semibold text-gray-700">{msg}</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Seu nome *</label>
              <input
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: João Silva"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30 focus:border-[#2563eb]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Profissão / Cidade</label>
              <input
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                placeholder="Ex: Contador — São Paulo/SP"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30 focus:border-[#2563eb]"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Sua avaliação *</label>
            <textarea
              required
              rows={3}
              value={form.text}
              onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
              placeholder="Conte como foi sua experiência com a LealCert..."
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30 focus:border-[#2563eb] resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-2 block">Nota</label>
            <StarRating value={form.stars} onChange={v => setForm(f => ({ ...f, stars: v }))} />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 bg-[#2563eb] text-white font-bold px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar avaliação
          </button>
        </form>
      )}
    </div>
  );
}

export default function Landing() {
  const [certs, setCerts] = useState<CertFromDB[]>([]);
  const [reviews, setReviews] = useState<ReviewFromDB[]>([]);
  const [showReviewForm, setShowReviewForm] = useState(false);

  useEffect(() => {
    fetch("/api/public/certificates")
      .then(r => r.json())
      .then(data => Array.isArray(data) && setCerts(data))
      .catch(() => {});
  }, []);

  function loadReviews() {
    fetch("/api/public/reviews")
      .then(r => r.json())
      .then(data => Array.isArray(data) && setReviews(data))
      .catch(() => {});
  }

  useEffect(() => { loadReviews(); }, []);

  return (
    <div className="min-h-screen bg-white text-[#0f172a] font-sans">

      {/* Top bar */}
      <div className="bg-[#0f172a] text-xs text-gray-400 text-center py-2 px-4">
        Certificadora autorizada ICP-Brasil &nbsp;·&nbsp; Atendimento em todo o Brasil &nbsp;·&nbsp;
        <span className="text-[#f59e0b] font-medium">Emissão em até 24h úteis</span>
      </div>

      {/* Nav */}
      <nav className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-20">
          <div className="flex items-center">
            <LealCertLogo variant="dark" />
          </div>
          <div className="hidden md:flex items-center gap-1 text-sm font-medium text-gray-600">
            <a href="#certificados" className="px-3 py-2 rounded-md hover:bg-gray-100 hover:text-[#0f172a] transition-colors">Certificados</a>
            <a href="#como-funciona" className="px-3 py-2 rounded-md hover:bg-gray-100 hover:text-[#0f172a] transition-colors">Como Funciona</a>
            <a href="#sobre" className="px-3 py-2 rounded-md hover:bg-gray-100 hover:text-[#0f172a] transition-colors">Por que nós</a>
            <a href="#avaliacoes" className="px-3 py-2 rounded-md hover:bg-gray-100 hover:text-[#0f172a] transition-colors">Avaliações</a>
            <a href="#contato" className="px-3 py-2 rounded-md hover:bg-gray-100 hover:text-[#0f172a] transition-colors">Contato</a>
          </div>
          <div className="flex items-center gap-3">
            <a href="/entrar" className="hidden sm:block text-sm font-semibold text-[#0f172a] hover:text-[#2563eb] transition-colors px-4 py-2 rounded-lg border border-gray-300 hover:border-[#2563eb]">
              Acessar conta
            </a>
            <a href="/register" className="bg-[#2563eb] text-white text-sm font-bold px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
              Cadastrar
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative bg-[#0f172a] text-white overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0f172a] via-[#1a2e4a] to-[#0f172a]" />
        <div className="absolute right-0 top-0 w-1/2 h-full opacity-5"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%232563eb' fill-opacity='0.8'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-[#2563eb]/20 border border-[#2563eb]/40 rounded-full px-4 py-1.5 text-sm text-blue-300 mb-6">
              <Shield className="h-3.5 w-3.5" />
              <span>Certificados ICP-Brasil — Padrão Nacional</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-black leading-tight mb-5">
              Certificado Digital<br />
              <span className="text-[#f59e0b]">emitido online,</span><br />
              <span className="text-[#60a5fa]">sem sair de casa</span>
            </h1>
            <p className="text-blue-100/70 text-lg mb-8 leading-relaxed">
              e-CPF e e-CNPJ emitidos com agilidade e segurança. Videoconferência rápida, agente credenciado ICP-Brasil e certificado entregue digitalmente em até 24h úteis.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mb-8">
              <a href="/register"
                className="flex items-center justify-center gap-2 bg-[#2563eb] hover:bg-blue-600 text-white font-bold px-8 py-4 rounded-xl transition-all hover:scale-105 shadow-lg shadow-blue-900/30 text-base">
                Emitir meu Certificado
                <ChevronRight className="h-5 w-5" />
              </a>
              <a href="#certificados"
                className="flex items-center justify-center gap-2 border border-white/20 hover:bg-white/10 text-white font-semibold px-8 py-4 rounded-xl transition-all text-base">
                Ver planos e preços
              </a>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-blue-200/70">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-400" /> Sem deslocamento</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-400" /> Pagamento via PIX</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-400" /> Emissão em até 24h</span>
            </div>
          </div>

          <div className="hidden md:flex flex-col gap-4">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur">
              <div className="grid grid-cols-2 gap-6">
                {[
                  { value: "+5.000", label: "Certificados emitidos" },
                  { value: "24h", label: "Prazo médio de emissão" },
                  { value: "100%", label: "Online e remoto" },
                  { value: "ICP-Brasil", label: "Certificadora autorizada" },
                ].map(s => (
                  <div key={s.label} className="text-center">
                    <div className="text-2xl font-black text-[#f59e0b] mb-1">{s.value}</div>
                    <div className="text-xs text-blue-200/60 leading-tight">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur flex items-center gap-4">
              <div className="h-12 w-12 bg-green-500/20 rounded-xl flex items-center justify-center shrink-0">
                <BadgeCheck className="h-6 w-6 text-green-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Certificadora Autorizada</p>
                <p className="text-xs text-blue-200/60 mt-0.5">Credenciada junto à cadeia ICP-Brasil conforme MP 2.200-2/2001</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <div className="bg-[#f8fafc] border-y border-gray-100 py-5">
        <div className="max-w-6xl mx-auto px-4 flex flex-wrap items-center justify-center gap-6 sm:gap-10">
          {[
            { icon: Shield, text: "Certificadora ICP-Brasil" },
            { icon: Lock, text: "Dados criptografados" },
            { icon: Star, text: "+5.000 certificados emitidos" },
            { icon: Users, text: "Atendemos todo o Brasil" },
            { icon: Award, text: "Suporte durante toda a validade" },
          ].map(item => (
            <div key={item.text} className="flex items-center gap-2 text-sm font-medium text-gray-600">
              <item.icon className="h-4 w-4 text-[#2563eb]" />
              {item.text}
            </div>
          ))}
        </div>
      </div>

      {/* Certificados / Preços */}
      <section id="certificados" className="py-16 sm:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <span className="text-[#2563eb] font-semibold text-sm uppercase tracking-wider">Nossos certificados</span>
            <h2 className="text-3xl sm:text-4xl font-black mt-2 mb-3">Escolha o certificado ideal</h2>
            <p className="text-gray-500 max-w-xl mx-auto">Validade de 12 ou 24 meses — pessoa física, jurídica e escritórios de contabilidade</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {CERT_GROUPS.map(group => (
              <CertCard key={group.key} group={group} certs={certs} />
            ))}
          </div>
          <p className="text-center text-xs text-gray-400 mt-8 flex items-center justify-center gap-1.5">
            <Lock className="h-3.5 w-3.5" />
            Condições especiais para contabilidades com volume. &nbsp;
            <a href="#contato" className="text-[#2563eb] hover:underline">Consulte-nos</a>
          </p>
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="py-16 sm:py-24 bg-[#f8fafc]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <span className="text-[#2563eb] font-semibold text-sm uppercase tracking-wider">Processo simples</span>
            <h2 className="text-3xl sm:text-4xl font-black mt-2 mb-3">Como funciona</h2>
            <p className="text-gray-500 max-w-xl mx-auto">4 passos rápidos. Sem filas, sem deslocamento, sem papelada. Tudo 100% digital e remoto.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map((s, i) => (
              <div key={s.n} className="relative bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                {i < STEPS.length - 1 && (
                  <div className="hidden lg:block absolute top-10 -right-3 z-10">
                    <ChevronRight className="h-5 w-5 text-gray-300" />
                  </div>
                )}
                <div className="h-14 w-14 rounded-2xl bg-[#2563eb]/10 flex items-center justify-center mb-4">
                  <s.icon className="h-7 w-7 text-[#2563eb]" />
                </div>
                <div className="text-xs font-black text-[#2563eb] mb-1 tracking-wider">PASSO {s.n}</div>
                <h3 className="font-black text-base mb-2">{s.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
            <a href="/register"
              className="inline-flex items-center gap-2 bg-[#2563eb] text-white font-bold px-8 py-4 rounded-xl hover:bg-blue-700 transition-all hover:scale-105 shadow-md shadow-blue-200">
              Começar agora — é rápido e fácil
              <ChevronRight className="h-5 w-5" />
            </a>
          </div>
        </div>
      </section>

      {/* Por que a LealCert */}
      <section id="sobre" className="py-16 sm:py-24 bg-[#0f172a] text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <span className="text-[#f59e0b] font-semibold text-sm uppercase tracking-wider">Diferenciais</span>
            <h2 className="text-3xl sm:text-4xl font-black mt-2 mb-3">Por que escolher a LealCert?</h2>
            <p className="text-blue-300/60 max-w-xl mx-auto">Credenciada ICP-Brasil, com agentes especializados e foco total em atendimento de qualidade</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {BENEFITS.map(b => (
              <div key={b.title} className="flex items-start gap-4 p-5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/[0.08] transition-colors">
                <div className="h-11 w-11 rounded-xl bg-[#2563eb] flex items-center justify-center shrink-0">
                  <b.icon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-base mb-1">{b.title}</h3>
                  <p className="text-blue-200/50 text-sm">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Avaliações */}
      <section id="avaliacoes" className="py-16 sm:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <span className="text-[#2563eb] font-semibold text-sm uppercase tracking-wider">Depoimentos</span>
            <h2 className="text-3xl sm:text-4xl font-black mt-2 mb-3">O que nossos clientes dizem</h2>
            <p className="text-gray-500 max-w-xl mx-auto">Avaliações reais de clientes que emitiram seus certificados com a LealCert</p>
          </div>

          {reviews.length === 0 ? (
            <div className="grid md:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-[#f8fafc] rounded-2xl p-6 border border-gray-100 animate-pulse">
                  <div className="flex gap-1 mb-4">
                    {[1, 2, 3, 4, 5].map(s => <div key={s} className="h-4 w-4 bg-gray-200 rounded" />)}
                  </div>
                  <div className="space-y-2 mb-5">
                    <div className="h-3 bg-gray-200 rounded w-full" />
                    <div className="h-3 bg-gray-200 rounded w-4/5" />
                    <div className="h-3 bg-gray-200 rounded w-3/4" />
                  </div>
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-6">
              {reviews.map(r => (
                <div key={r.id} className="bg-[#f8fafc] rounded-2xl p-6 border border-gray-100">
                  <StarRating value={r.stars} />
                  <p className="text-gray-600 text-sm leading-relaxed my-4">"{r.text}"</p>
                  <div>
                    <p className="font-bold text-sm text-[#0f172a]">{r.name}</p>
                    <p className="text-xs text-gray-400">{r.role}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="text-center mt-8">
            <button
              onClick={() => setShowReviewForm(v => !v)}
              className="inline-flex items-center gap-2 border border-[#2563eb] text-[#2563eb] font-semibold px-6 py-3 rounded-xl hover:bg-blue-50 transition-colors text-sm"
            >
              <Star className="h-4 w-4" />
              {showReviewForm ? "Fechar formulário" : "Deixar minha avaliação"}
            </button>
          </div>

          {showReviewForm && (
            <ReviewForm onSuccess={() => { loadReviews(); setTimeout(() => setShowReviewForm(false), 3000); }} />
          )}
        </div>
      </section>

      {/* CTA final */}
      <section className="py-16 sm:py-20 bg-gradient-to-r from-[#2563eb] to-blue-700 text-white">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-black mb-4">Pronto para emitir seu certificado?</h2>
          <p className="text-blue-100/80 text-lg mb-8">Cadastre-se agora, escolha seu certificado e agende a videoconferência. Em menos de 24h úteis seu certificado estará em mãos.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/register"
              className="inline-flex items-center justify-center gap-3 bg-white text-[#2563eb] font-bold px-10 py-4 rounded-xl hover:bg-blue-50 transition-all hover:scale-105 shadow-xl">
              Criar minha conta grátis
              <ChevronRight className="h-5 w-5" />
            </a>
            <a href="/entrar"
              className="inline-flex items-center justify-center gap-3 border border-white/30 hover:bg-white/10 text-white font-semibold px-8 py-4 rounded-xl transition-all">
              Já tenho cadastro
            </a>
          </div>
          <p className="text-blue-200/50 text-sm mt-5">Cadastro gratuito · Sem compromisso · Suporte especializado</p>
        </div>
      </section>

      {/* Contato */}
      <section id="contato" className="py-14 bg-[#f8fafc]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-black mb-2">Fale Conosco</h2>
            <p className="text-gray-500 text-sm">Estamos disponíveis para tirar suas dúvidas e ajudar com a emissão do seu certificado</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <a href="https://wa.me/551731760105" target="_blank" rel="noopener noreferrer"
              className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm text-center hover:border-green-300 hover:shadow-md transition-all group">
              <div className="h-12 w-12 bg-green-50 group-hover:bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-4 transition-colors">
                <Phone className="h-5 w-5 text-green-600" />
              </div>
              <h3 className="font-bold mb-1">WhatsApp</h3>
              <p className="text-sm text-gray-500">(17) 3176-0105</p>
              <p className="text-xs text-green-600 font-medium mt-1">Clique para abrir</p>
            </a>
            <a href="mailto:certificados@lealcert.com.br"
              className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm text-center hover:border-blue-200 hover:shadow-md transition-all group">
              <div className="h-12 w-12 bg-blue-50 group-hover:bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4 transition-colors">
                <Mail className="h-5 w-5 text-[#2563eb]" />
              </div>
              <h3 className="font-bold mb-1">E-mail</h3>
              <p className="text-sm text-gray-500">certificados@lealcert.com.br</p>
              <p className="text-xs text-[#2563eb] font-medium mt-1">Resposta em até 2h</p>
            </a>
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm text-center">
              <div className="h-12 w-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-4">
                <MapPin className="h-5 w-5 text-[#2563eb]" />
              </div>
              <h3 className="font-bold mb-1">Atendimento nacional</h3>
              <p className="text-sm text-gray-500">Clientes em todo o Brasil, 100% remoto</p>
              <p className="text-xs text-gray-400 mt-1">Seg–Sex, 8h às 18h</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0f172a] text-white pt-10 pb-6">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <LealCertLogo variant="light" />
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-400">
              <a href="/entrar" className="hover:text-white transition-colors">Área do Cliente</a>
              <a href="mailto:certificados@lealcert.com.br" className="hover:text-white transition-colors">Contato</a>
              <a href="/politica-de-privacidade" className="hover:text-white transition-colors">Privacidade</a>
            </div>
          </div>
          <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-gray-500 text-xs order-2 sm:order-1">
              © {new Date().getFullYear()} LealCert. Todos os direitos reservados.
            </p>
            <div className="flex items-center gap-3 order-1 sm:order-2">
              <span className="text-gray-500 text-xs uppercase tracking-wider">Certificado por</span>
              <div className="bg-white/5 hover:bg-white/10 transition-colors rounded-lg px-4 py-2 border border-white/10">
                <img
                  src="/safeweb-logo.png"
                  alt="Safeweb"
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
