import {
  Shield, CheckCircle2, Clock, Award, Briefcase, FileText,
  ChevronRight, Star, Zap, Phone, Mail, Users, BadgeCheck,
  CalendarCheck, CreditCard, TrendingDown, LayoutDashboard,
  ClipboardList, RefreshCw, Lock, Building2, UserCheck,
} from "lucide-react";

// ── Logo ──────────────────────────────────────────────────────────────────────
function Logo({ variant = "dark" }: { variant?: "dark" | "light" }) {
  if (variant === "light") {
    return (
      <div className="bg-white rounded-xl px-5 py-2.5">
        <img src="/logo-oficial-cropped.png" alt="LealCert" className="h-10 w-auto object-contain" />
      </div>
    );
  }
  return <img src="/logo-oficial-cropped.png" alt="LealCert" className="h-14 w-auto object-contain" />;
}

// ── Dados da página ────────────────────────────────────────────────────────────
const DORES = [
  {
    icon: Clock,
    title: "Tempo perdido em filas e deslocamentos",
    desc: "Seu cliente precisa tirar certificado e você precisa coordenar deslocamento, horário de atendimento presencial e fila. Horas desperdiçadas que poderiam estar em trabalho produtivo.",
  },
  {
    icon: TrendingDown,
    title: "Sem condição especial de parceiro",
    desc: "Você faz o serviço, indica o cliente — mas paga o mesmo preço que qualquer pessoa física. Sem desconto, sem reconhecimento, sem vantagem por volume.",
  },
  {
    icon: ClipboardList,
    title: "Controle manual e disperso",
    desc: "Planilha aqui, e-mail ali, ligação no WhatsApp. Impossível saber em qual etapa está cada certificado de cada cliente sem um sistema centralizado.",
  },
];

const BENEFICIOS = [
  {
    icon: TrendingDown,
    color: "bg-[#2563eb]",
    title: "Preço de parceiro",
    desc: "Contadores têm acesso a preços exclusivos, menores que os valores cobrados ao cliente final. Quanto mais você indica, mais a sua contabilidade se diferencia.",
  },
  {
    icon: LayoutDashboard,
    color: "bg-[#0f172a]",
    title: "Portal dedicado para sua contabilidade",
    desc: "Acompanhe todos os pedidos dos seus clientes em um único painel: status em tempo real, histórico completo, agendamento e documentos — tudo centralizado.",
  },
  {
    icon: Zap,
    color: "bg-amber-500",
    title: "Emissão em até 24h úteis",
    desc: "Do pedido ao certificado no prazo do seu cliente. Videoconferência rápida com agente credenciado ICP-Brasil, 100% remota, sem deslocamento de ninguém.",
  },
  {
    icon: CalendarCheck,
    color: "bg-green-600",
    title: "Agendamento direto pelo sistema",
    desc: "Você abre o pedido para o seu cliente no portal, escolhe o horário da videoconferência e pronto. Sem ligações intermediárias, sem vai-e-vem.",
  },
  {
    icon: Shield,
    color: "bg-violet-600",
    title: "Certificadora autorizada ICP-Brasil",
    desc: "Todos os certificados emitidos seguem o padrão nacional ICP-Brasil, aceitos pela Receita Federal, Prefeituras, Juntas Comerciais e demais órgãos.",
  },
  {
    icon: Award,
    color: "bg-[#2563eb]",
    title: "Suporte durante toda a validade",
    desc: "Sua contabilidade tem suporte especializado para qualquer dúvida — desde a emissão até o vencimento do certificado. Time técnico treinado e credenciado.",
  },
];

const PASSOS = [
  {
    n: "01",
    icon: UserCheck,
    title: "Crie sua conta como contador",
    desc: "Cadastre seu escritório ou CPF com CRC. A plataforma verifica o seu registro no CFC automaticamente no ato do cadastro.",
  },
  {
    n: "02",
    icon: Users,
    title: "Cadastre ou indique seus clientes",
    desc: "Abra um pedido de certificado para o seu cliente diretamente no portal — ele pode ser CPF ou CNPJ, pessoa física ou jurídica.",
  },
  {
    n: "03",
    icon: CalendarCheck,
    title: "Agende a videoconferência",
    desc: "Escolha o melhor horário para seu cliente fazer a breve videochamada de verificação com o nosso agente credenciado ICP-Brasil.",
  },
  {
    n: "04",
    icon: BadgeCheck,
    title: "Certificado entregue em minutos",
    desc: "Após a verificação, o certificado é emitido e entregue digitalmente. Você acompanha tudo no painel — em tempo real.",
  },
];

const DESTAQUES = [
  { value: "+5.000", label: "Certificados emitidos" },
  { value: "24h", label: "Prazo médio de emissão" },
  { value: "100%", label: "Online e remoto" },
  { value: "ICP-Brasil", label: "Certificadora autorizada" },
];

// ── Componente principal ──────────────────────────────────────────────────────
export default function Contadores() {
  return (
    <div className="min-h-screen bg-white text-[#0f172a] font-sans">

      {/* Top bar */}
      <div className="bg-[#0f172a] text-xs text-gray-400 text-center py-2 px-4">
        Certificadora autorizada ICP-Brasil &nbsp;·&nbsp; Condições especiais para contadores e escritórios contábeis &nbsp;·&nbsp;
        <span className="text-[#f59e0b] font-medium">Emissão em até 24h úteis</span>
      </div>

      {/* Nav */}
      <nav className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-20">
          <a href="/">
            <Logo variant="dark" />
          </a>
          <div className="hidden md:flex items-center gap-1 text-sm font-medium text-gray-600">
            <a href="#beneficios" className="px-3 py-2 rounded-md hover:bg-gray-100 hover:text-[#0f172a] transition-colors">Benefícios</a>
            <a href="#como-funciona" className="px-3 py-2 rounded-md hover:bg-gray-100 hover:text-[#0f172a] transition-colors">Como Funciona</a>
            <a href="#cadastro" className="px-3 py-2 rounded-md hover:bg-gray-100 hover:text-[#0f172a] transition-colors">Cadastrar</a>
          </div>
          <div className="flex items-center gap-3">
            <a href="/entrar" className="hidden sm:block text-sm font-semibold text-[#0f172a] hover:text-[#2563eb] transition-colors px-4 py-2 rounded-lg border border-gray-300 hover:border-[#2563eb]">
              Acessar portal
            </a>
            <a href="/register?userType=contador" className="bg-[#2563eb] text-white text-sm font-bold px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
              Cadastrar grátis
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="relative bg-[#0f172a] text-white overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0f172a] via-[#1a2e4a] to-[#0f172a]" />
        {/* Subtle pattern */}
        <div
          className="absolute right-0 top-0 w-1/2 h-full opacity-5"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%232563eb' fill-opacity='0.8'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}
        />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-28 grid md:grid-cols-2 gap-12 items-center">
          <div>
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-[#f59e0b]/20 border border-[#f59e0b]/40 rounded-full px-4 py-1.5 text-sm text-amber-300 mb-6">
              <Briefcase className="h-3.5 w-3.5" />
              <span>Para contadores e escritórios de contabilidade</span>
            </div>

            <h1 className="text-4xl sm:text-5xl font-black leading-tight mb-6">
              Certificado Digital<br />
              <span className="text-[#f59e0b]">com preço de parceiro</span><br />
              <span className="text-[#60a5fa]">e portal próprio</span>
            </h1>

            <p className="text-blue-100/70 text-lg mb-8 leading-relaxed">
              Emita e-CPF e e-CNPJ para seus clientes com condições especiais para contadores. Preço diferenciado, portal de acompanhamento, videoconferência remota e certificado entregue em até 24h úteis.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mb-8">
              <a
                href="/register?userType=contador"
                className="flex items-center justify-center gap-2 bg-[#f59e0b] hover:bg-amber-400 text-[#0f172a] font-black px-8 py-4 rounded-xl transition-all hover:scale-105 shadow-lg shadow-amber-900/30 text-base"
              >
                Criar conta de contador — grátis
                <ChevronRight className="h-5 w-5" />
              </a>
              <a
                href="#beneficios"
                className="flex items-center justify-center gap-2 border border-white/20 hover:bg-white/10 text-white font-semibold px-8 py-4 rounded-xl transition-all text-base"
              >
                Ver os benefícios
              </a>
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-blue-200/70">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-400" /> Preço exclusivo para parceiros</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-400" /> Portal de gestão dos pedidos</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-400" /> Validação automática do CRC</span>
            </div>
          </div>

          {/* Stats card */}
          <div className="hidden md:flex flex-col gap-4">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur">
              <div className="grid grid-cols-2 gap-6">
                {DESTAQUES.map(s => (
                  <div key={s.label} className="text-center">
                    <div className="text-2xl font-black text-[#f59e0b] mb-1">{s.value}</div>
                    <div className="text-xs text-blue-200/60 leading-tight">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur flex items-center gap-4">
              <div className="h-12 w-12 bg-amber-500/20 rounded-xl flex items-center justify-center shrink-0">
                <BadgeCheck className="h-6 w-6 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Validação de CRC automática</p>
                <p className="text-xs text-blue-200/60 mt-0.5">Seu registro no CFC é verificado no ato do cadastro — sem burocracia manual</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust bar ────────────────────────────────────────────────────────── */}
      <div className="bg-[#f8fafc] border-y border-gray-100 py-5">
        <div className="max-w-6xl mx-auto px-4 flex flex-wrap items-center justify-center gap-6 sm:gap-10">
          {[
            { icon: Shield, text: "Certificadora ICP-Brasil" },
            { icon: Lock, text: "Dados criptografados" },
            { icon: TrendingDown, text: "Preço especial para contadores" },
            { icon: Users, text: "Portal de gestão dos clientes" },
            { icon: Award, text: "Suporte durante toda a validade" },
          ].map(item => (
            <div key={item.text} className="flex items-center gap-2 text-sm font-medium text-gray-600">
              <item.icon className="h-4 w-4 text-[#2563eb]" />
              {item.text}
            </div>
          ))}
        </div>
      </div>

      {/* ── Preço de parceiro + cupom boas-vindas — DESTAQUE LOGO APÓS O HERO ── */}
      <section className="py-16 sm:py-20 bg-[#0f172a] text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">

          {/* Banner cupom boas-vindas */}
          <div className="relative mb-10 bg-gradient-to-r from-green-500 to-emerald-600 rounded-3xl p-6 sm:p-8 overflow-hidden">
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M20 20.5V18H0v5h5v5H0v5h20v-2.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5V33h20v-5h-5v-5h5v-5H23v2.5c0 .83-.67 1.5-1.5 1.5S20 21.33 20 20.5z'/%3E%3C/g%3E%3C/svg%3E\")" }} />
            <div className="relative flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="text-center sm:text-left">
                <div className="inline-flex items-center gap-2 bg-white/20 border border-white/30 rounded-full px-3 py-1 text-xs font-bold text-white mb-3">
                  <Star className="h-3.5 w-3.5 fill-white" />
                  Oferta exclusiva de boas-vindas
                </div>
                <h3 className="text-2xl sm:text-3xl font-black text-white mb-1">
                  Primeiro certificado por <span className="text-yellow-300">R$ 70</span>
                </h3>
                <p className="text-green-100/80 text-sm leading-relaxed max-w-md">
                  Use o cupom <strong className="text-white">PARCEIRO</strong> no primeiro pedido e pague apenas R$ 70 — em vez de R$ 90. Desconto automático na plataforma, sem precisar pedir.
                </p>
              </div>
              <div className="shrink-0 text-center">
                <div className="bg-white rounded-2xl px-8 py-5 shadow-xl">
                  <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Cupom de boas-vindas</p>
                  <p className="text-3xl font-black text-[#0f172a] tracking-widest mb-1">PARCEIRO</p>
                  <p className="text-green-600 text-sm font-bold">R$ 70 no 1º certificado</p>
                </div>
              </div>
            </div>
          </div>

          <div className="text-center mb-10">
            <span className="text-[#f59e0b] font-semibold text-sm uppercase tracking-wider">Condição exclusiva para parceiros</span>
            <h2 className="text-3xl sm:text-4xl font-black mt-2 mb-3">Preço de parceiro + programa de cortesia</h2>
            <p className="text-blue-300/60 max-w-xl mx-auto">Valores diferenciados e um programa de fidelidade que recompensa quem emite mais.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">

            {/* Card preço */}
            <div className="relative bg-gradient-to-br from-[#2563eb] to-blue-700 rounded-3xl p-8 overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="relative">
                <div className="inline-flex items-center gap-2 bg-white/20 border border-white/30 rounded-full px-3 py-1 text-xs font-bold text-white mb-4">
                  <TrendingDown className="h-3.5 w-3.5" />
                  Preço exclusivo contador
                </div>
                <p className="text-blue-200/70 text-sm mb-1">Certificado Digital para seus clientes</p>
                <div className="flex items-end gap-2 mb-2">
                  <span className="text-5xl font-black text-white">R$ 90</span>
                  <span className="text-blue-200/60 text-base mb-1.5">/ certificado</span>
                </div>
                <p className="text-blue-100/60 text-xs mb-6">Preço aplicado automaticamente ao fazer login como contador</p>
                <ul className="space-y-2.5">
                  {[
                    "Válido para e-CPF e e-CNPJ",
                    "Aceito PIX, Boleto e Cartão de Crédito",
                    "Sem mensalidade, sem fidelidade",
                    "Sem limite de pedidos por mês",
                  ].map(item => (
                    <li key={item} className="flex items-center gap-2 text-sm text-blue-100/80">
                      <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Card cortesia */}
            <div className="relative bg-gradient-to-br from-[#f59e0b] to-amber-500 rounded-3xl p-8 overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="relative">
                <div className="inline-flex items-center gap-2 bg-white/30 border border-white/40 rounded-full px-3 py-1 text-xs font-bold text-[#0f172a] mb-4">
                  <Star className="h-3.5 w-3.5" />
                  Programa de cortesia
                </div>
                <p className="text-amber-900/70 text-sm mb-1">A cada 10 certificados emitidos</p>
                <div className="flex items-end gap-2 mb-2">
                  <span className="text-5xl font-black text-[#0f172a]">+1</span>
                  <span className="text-amber-900/70 text-base mb-1.5">certificado grátis</span>
                </div>
                <p className="text-amber-900/60 text-xs mb-6">Cortesia acumulada no portal e disponível para usar como desejar</p>
                <div className="bg-white/30 rounded-2xl p-4 mb-4">
                  <p className="text-[#0f172a] text-xs font-bold mb-3">Como funciona na prática:</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-7 w-7 rounded-lg flex items-center justify-center text-xs font-black ${
                          i < 9
                            ? "bg-amber-600/30 text-amber-900 border border-amber-600/40"
                            : "bg-[#0f172a] text-[#f59e0b] border-2 border-[#f59e0b]"
                        }`}
                      >
                        {i + 1}
                      </div>
                    ))}
                  </div>
                  <p className="text-[#0f172a] text-xs font-medium">A cada 10 emitidos → 1 cortesia disponível no portal</p>
                </div>
                <ul className="space-y-2">
                  {[
                    "Usa como quiser — para o escritório ou para um cliente",
                    "Acumula sem prazo de validade",
                  ].map(item => (
                    <li key={item} className="flex items-center gap-2 text-sm text-amber-900/80">
                      <CheckCircle2 className="h-4 w-4 text-amber-900/70 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-blue-300/50 text-sm">
              Condições aplicadas automaticamente após cadastro verificado como contador credenciado no CFC.
            </p>
          </div>
        </div>
      </section>

      {/* ── Dores ────────────────────────────────────────────────────────────── */}
      <section className="py-16 sm:py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <span className="text-red-500 font-semibold text-sm uppercase tracking-wider">O problema</span>
            <h2 className="text-3xl sm:text-4xl font-black mt-2 mb-3">O que faz você perder tempo e dinheiro hoje?</h2>
            <p className="text-gray-500 max-w-xl mx-auto">A maioria dos escritórios contábeis ainda lida com certificados digitais de forma antiquada — sem processo, sem desconto, sem controle.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {DORES.map(d => (
              <div key={d.title} className="bg-red-50 border border-red-100 rounded-2xl p-6">
                <div className="h-11 w-11 bg-red-100 rounded-xl flex items-center justify-center mb-4">
                  <d.icon className="h-5 w-5 text-red-500" />
                </div>
                <h3 className="font-bold text-base mb-2 text-[#0f172a]">{d.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{d.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Benefícios ───────────────────────────────────────────────────────── */}
      <section id="beneficios" className="py-16 sm:py-24 bg-[#0f172a] text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <span className="text-[#f59e0b] font-semibold text-sm uppercase tracking-wider">A solução</span>
            <h2 className="text-3xl sm:text-4xl font-black mt-2 mb-3">Tudo que seu escritório precisa em um só lugar</h2>
            <p className="text-blue-300/60 max-w-xl mx-auto">A LealCert foi construída para atender contadores que precisam de agilidade, controle e preço justo.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {BENEFICIOS.map(b => (
              <div key={b.title} className="flex items-start gap-4 p-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/[0.09] transition-colors">
                <div className={`h-11 w-11 rounded-xl ${b.color} flex items-center justify-center shrink-0`}>
                  <b.icon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-base mb-1">{b.title}</h3>
                  <p className="text-blue-200/55 text-sm leading-relaxed">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Portal de gestão — destaque visual ───────────────────────────────── */}
      <section className="py-16 sm:py-24 bg-[#f8fafc]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-lg overflow-hidden">
            <div className="grid md:grid-cols-2 gap-0">
              {/* Texto */}
              <div className="p-10 flex flex-col justify-center">
                <span className="text-[#2563eb] font-semibold text-sm uppercase tracking-wider mb-3">Portal do contador</span>
                <h2 className="text-2xl sm:text-3xl font-black mb-5 leading-tight">
                  Todos os seus clientes.<br />
                  <span className="text-[#2563eb]">Em um único painel.</span>
                </h2>
                <ul className="space-y-3">
                  {[
                    "Abra pedidos para seus clientes em segundos",
                    "Acompanhe o status em tempo real — do pedido ao certificado",
                    "Agende a videoconferência diretamente pelo sistema",
                    "Acesse o histórico completo de todos os pedidos",
                    "Receba notificações automáticas de cada etapa",
                    "Suporte dedicado para o seu escritório",
                  ].map(item => (
                    <li key={item} className="flex items-start gap-3 text-sm text-gray-600">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <a
                  href="/register?userType=contador"
                  className="mt-8 inline-flex items-center gap-2 bg-[#2563eb] text-white font-bold px-6 py-3.5 rounded-xl hover:bg-blue-700 transition-all hover:scale-105 shadow-md shadow-blue-200 text-sm self-start"
                >
                  Acessar o portal agora
                  <ChevronRight className="h-4 w-4" />
                </a>
              </div>
              {/* Visual mockup */}
              <div className="bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-8 flex items-center justify-center min-h-[320px]">
                <div className="w-full max-w-sm space-y-3">
                  {/* Simulated portal cards */}
                  {[
                    { name: "Maria Oliveira — e-CPF 1 ano", status: "Certificado emitido", color: "bg-green-500/20 text-green-400 border-green-500/30" },
                    { name: "Tech Solutions LTDA — e-CNPJ 3 anos", status: "Aguardando videoconferência", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
                    { name: "João Pereira — e-CPF 2 anos", status: "Pagamento aprovado", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
                  ].map(item => (
                    <div key={item.name} className="bg-white/5 border border-white/10 rounded-xl p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-white text-xs font-medium leading-tight">{item.name}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${item.color}`}>
                          {item.status}
                        </span>
                      </div>
                    </div>
                  ))}
                  <div className="text-center pt-2">
                    <span className="text-blue-300/40 text-xs">Seus clientes. Seu controle.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Como funciona ────────────────────────────────────────────────────── */}
      <section id="como-funciona" className="py-16 sm:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <span className="text-[#2563eb] font-semibold text-sm uppercase tracking-wider">Processo simples</span>
            <h2 className="text-3xl sm:text-4xl font-black mt-2 mb-3">Como funciona para o contador</h2>
            <p className="text-gray-500 max-w-xl mx-auto">4 passos rápidos. Sem filas, sem deslocamento, 100% digital. Você controla tudo pelo portal.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {PASSOS.map((s, i) => (
              <div key={s.n} className="relative bg-[#f8fafc] rounded-2xl p-6 border border-gray-100">
                {i < PASSOS.length - 1 && (
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
        </div>
      </section>

      {/* ── Requisitos para cadastro ──────────────────────────────────────────── */}
      <section className="py-16 sm:py-20 bg-[#f8fafc]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <span className="text-[#2563eb] font-semibold text-sm uppercase tracking-wider">Requisitos</span>
            <h2 className="text-2xl sm:text-3xl font-black mt-2 mb-3">O que você precisa para se cadastrar</h2>
            <p className="text-gray-500 max-w-lg mx-auto">O processo é simples e a verificação do CRC é feita automaticamente pelo sistema.</p>
          </div>

          <div className="grid sm:grid-cols-2 gap-5">
            {/* Pessoa Física */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-7">
              <div className="flex items-center gap-3 mb-5">
                <div className="h-10 w-10 bg-[#2563eb]/10 rounded-xl flex items-center justify-center">
                  <UserCheck className="h-5 w-5 text-[#2563eb]" />
                </div>
                <div>
                  <p className="font-black text-base">Contador Pessoa Física</p>
                  <p className="text-xs text-gray-400">Profissional autônomo</p>
                </div>
              </div>
              <ul className="space-y-2.5">
                {[
                  "CPF ativo",
                  "Registro ativo no CRC (ex: SP-100000/O)",
                  "E-mail para verificação de conta",
                  "Telefone de contato",
                ].map(item => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-gray-600">
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Pessoa Jurídica */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-7">
              <div className="flex items-center gap-3 mb-5">
                <div className="h-10 w-10 bg-[#2563eb]/10 rounded-xl flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-[#2563eb]" />
                </div>
                <div>
                  <p className="font-black text-base">Escritório Contábil</p>
                  <p className="text-xs text-gray-400">Pessoa Jurídica</p>
                </div>
              </div>
              <ul className="space-y-2.5">
                {[
                  "CNPJ ativo do escritório",
                  "CPF do responsável técnico com CRC ativo",
                  "E-mail do escritório para verificação",
                  "Telefone de contato",
                ].map(item => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-gray-600">
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3.5 flex gap-3 items-start max-w-2xl mx-auto">
            <span className="text-amber-500 text-lg leading-none mt-0.5">ℹ</span>
            <p className="text-sm text-amber-800">
              <strong>Validação automática:</strong> o sistema consulta o CFC (Conselho Federal de Contabilidade) em tempo real no momento do cadastro. Não é necessário enviar documentos manualmente.
            </p>
          </div>
        </div>
      </section>

      {/* ── CTA Final ────────────────────────────────────────────────────────── */}
      <section id="cadastro" className="py-16 sm:py-24 bg-[#0f172a] text-white">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-[#f59e0b]/20 border border-[#f59e0b]/40 rounded-full px-4 py-1.5 text-sm text-amber-300 mb-6">
            <Star className="h-3.5 w-3.5" />
            <span>Cadastro gratuito · Sem mensalidade · Sem fidelidade</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black mb-4">
            Pronto para simplificar os certificados<br />
            <span className="text-[#f59e0b]">do seu escritório?</span>
          </h2>
          <p className="text-blue-100/70 text-lg mb-8 leading-relaxed">
            Crie sua conta agora como contador. O cadastro é gratuito, a verificação do CRC é automática e o seu portal estará disponível em minutos.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="/register?userType=contador"
              className="inline-flex items-center justify-center gap-3 bg-[#f59e0b] hover:bg-amber-400 text-[#0f172a] font-black px-10 py-4 rounded-xl transition-all hover:scale-105 shadow-xl shadow-amber-900/30"
            >
              Criar conta de contador — grátis
              <ChevronRight className="h-5 w-5" />
            </a>
            <a
              href="/entrar"
              className="inline-flex items-center justify-center gap-3 border border-white/30 hover:bg-white/10 text-white font-semibold px-8 py-4 rounded-xl transition-all"
            >
              Já tenho cadastro
            </a>
          </div>
          <p className="text-blue-200/40 text-sm mt-5">Cadastro gratuito · Sem mensalidade · Validação de CRC automática</p>
        </div>
      </section>

      {/* ── Contato ──────────────────────────────────────────────────────────── */}
      <section className="py-14 bg-[#f8fafc]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-black mb-2">Dúvidas? Fale com a gente</h2>
            <p className="text-gray-500 text-sm">Nossa equipe está disponível para ajudar escritórios contábeis a começar</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
            <a
              href="https://wa.me/551731760105"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm text-center hover:border-green-300 hover:shadow-md transition-all group"
            >
              <div className="h-12 w-12 bg-green-50 group-hover:bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-3 transition-colors">
                <Phone className="h-5 w-5 text-green-600" />
              </div>
              <h3 className="font-bold mb-1">WhatsApp</h3>
              <p className="text-sm text-gray-500">(17) 3176-0105</p>
              <p className="text-xs text-green-600 font-medium mt-1">Clique para abrir</p>
            </a>
            <a
              href="mailto:certificados@lealcert.com.br"
              className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm text-center hover:border-blue-200 hover:shadow-md transition-all group"
            >
              <div className="h-12 w-12 bg-blue-50 group-hover:bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-3 transition-colors">
                <Mail className="h-5 w-5 text-[#2563eb]" />
              </div>
              <h3 className="font-bold mb-1">E-mail</h3>
              <p className="text-sm text-gray-500">certificados@lealcert.com.br</p>
              <p className="text-xs text-[#2563eb] font-medium mt-1">Resposta em até 2h</p>
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="bg-[#0f172a] text-white pt-10 pb-6">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <Logo variant="light" />
            <div className="flex items-center gap-6 text-sm text-gray-400">
              <a href="/" className="hover:text-white transition-colors">Página Inicial</a>
              <a href="/entrar" className="hover:text-white transition-colors">Área do Cliente</a>
              <a href="mailto:certificados@lealcert.com.br" className="hover:text-white transition-colors">Contato</a>
              <a href="/politica-de-privacidade" className="hover:text-white transition-colors">Privacidade</a>
            </div>
          </div>
          <div className="border-t border-white/10 mt-6 pt-5 text-center text-xs text-gray-500">
            © {new Date().getFullYear()} LealCert. Certificadora autorizada ICP-Brasil. Todos os direitos reservados.
          </div>
        </div>
      </footer>
    </div>
  );
}
