import {
  Shield, CheckCircle2, Clock, Award, Users, FileText,
  ChevronRight, Star, Lock, Zap, Phone, Mail, MapPin,
  BadgeCheck, CalendarCheck, CreditCard, Headphones,
} from "lucide-react";

const PRODUCTS = [
  {
    tag: "Mais vendido",
    tagColor: "bg-blue-600 text-white",
    name: "e-CPF A1",
    sub: "Pessoa Física",
    desc: "Para profissionais autônomos, advogados, contadores e qualquer cidadão que precisa assinar documentos digitalmente.",
    features: ["Arquivo digital (nuvem ou PC)", "Válido por 12 meses", "Assinatura eletrônica ICP-Brasil", "Acesso ao Gov.br nível Ouro"],
    price: "R$ 119",
    period: "/ ano",
    cta: "Emitir e-CPF",
    highlight: false,
  },
  {
    tag: "Indicado para empresas",
    tagColor: "bg-amber-500 text-white",
    name: "e-CNPJ A1",
    sub: "Pessoa Jurídica",
    desc: "Obrigatório para emissão de NF-e, eSocial, EFD-Reinf e acesso a portais da Receita Federal e Prefeitura.",
    features: ["Arquivo digital (nuvem ou PC)", "Válido por 12 meses", "NF-e, NFS-e e eSocial", "Receita Federal e Prefeitura"],
    price: "R$ 189",
    period: "/ ano",
    cta: "Emitir e-CNPJ",
    highlight: true,
  },
  {
    tag: "Máxima segurança",
    tagColor: "bg-slate-600 text-white",
    name: "e-CPF / e-CNPJ A3",
    sub: "Cartão ou Token",
    desc: "Certificado armazenado em dispositivo físico criptografado. Validade de 1 a 3 anos e máxima proteção.",
    features: ["Dispositivo físico (cartão/token)", "Validade de 1 a 3 anos", "Portabilidade total", "Compatível com todos sistemas"],
    price: "A partir de R$ 249",
    period: "",
    cta: "Consultar A3",
    highlight: false,
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

const TESTIMONIALS = [
  { name: "Marcos Oliveira", role: "Contador — São Paulo/SP", text: "Processo muito simples e rápido. Emiti o e-CNPJ dos meus 12 clientes em menos de dois dias. Atendimento excelente.", stars: 5 },
  { name: "Fernanda Costa", role: "Advogada — Belo Horizonte/MG", text: "Finalmente uma certificadora que realmente atende online. Tudo sem sair de casa, certificado em menos de 1 hora.", stars: 5 },
  { name: "Roberto Almeida", role: "Empresário — Curitiba/PR", text: "Já renovei 3 vezes com a LealCert. Preço justo e nunca tive problema. Recomendo para qualquer empresa.", stars: 5 },
];

export default function NovaLanding() {
  return (
    <div className="min-h-screen bg-white text-[#0f172a] font-sans">

      {/* Top bar */}
      <div className="bg-[#0f172a] text-xs text-gray-400 text-center py-2 px-4">
        Certificadora autorizada ICP-Brasil &nbsp;·&nbsp; Atendimento em todo o Brasil &nbsp;·&nbsp;
        <span className="text-[#f59e0b] font-medium">Emissão em até 24h úteis</span>
      </div>

      {/* Nav */}
      <nav className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="LealCert" className="h-10 w-auto object-contain" />
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
            <a href="#certificados" className="hover:text-[#2563eb] transition-colors">Certificados</a>
            <a href="#como-funciona" className="hover:text-[#2563eb] transition-colors">Como Funciona</a>
            <a href="#sobre" className="hover:text-[#2563eb] transition-colors">Por que nós</a>
            <a href="#contato" className="hover:text-[#2563eb] transition-colors">Contato</a>
          </div>
          <div className="flex items-center gap-3">
            <a href="/entrar" className="hidden sm:block text-sm font-medium text-gray-600 hover:text-[#2563eb] transition-colors px-4 py-2 rounded-lg border border-gray-200 hover:border-[#2563eb]">
              Acessar conta
            </a>
            <a href="/cadastro" className="bg-[#2563eb] text-white text-sm font-bold px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
              Emitir Certificado
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative bg-[#0f172a] text-white overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0f172a] via-[#1a2e4a] to-[#0f172a]" />
        <div className="absolute right-0 top-0 w-1/2 h-full opacity-10"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%232563eb' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />

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
              <a href="/cadastro"
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

          {/* Stats card */}
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
                <p className="text-xs text-blue-200/60 mt-0.5">Credenciada junto à cadeia ICP-Brasil conforme Medida Provisória 2.200-2/2001</p>
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

      {/* Produtos / Preços */}
      <section id="certificados" className="py-16 sm:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <span className="text-[#2563eb] font-semibold text-sm uppercase tracking-wider">Nossos certificados</span>
            <h2 className="text-3xl sm:text-4xl font-black mt-2 mb-3">Escolha o certificado ideal</h2>
            <p className="text-gray-500 max-w-xl mx-auto">Para pessoa física, jurídica e escritórios de contabilidade — temos a solução certa com o melhor custo-benefício</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {PRODUCTS.map(p => (
              <div key={p.name}
                className={`relative rounded-2xl border-2 p-7 flex flex-col transition-all hover:shadow-xl ${
                  p.highlight
                    ? "border-[#2563eb] shadow-lg shadow-blue-100"
                    : "border-gray-100 shadow-sm hover:border-[#2563eb]/30"
                }`}>
                {p.highlight && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="bg-[#2563eb] text-white text-xs font-bold px-4 py-1.5 rounded-full shadow">MAIS VENDIDO</span>
                  </div>
                )}
                <div className="mb-4">
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${p.tagColor}`}>{p.tag}</span>
                </div>
                <h3 className="text-2xl font-black mb-1">{p.name}</h3>
                <p className="text-[#2563eb] font-semibold text-sm mb-3">{p.sub}</p>
                <p className="text-gray-500 text-sm leading-relaxed mb-5">{p.desc}</p>
                <ul className="space-y-2 mb-6 flex-1">
                  {p.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="border-t border-gray-100 pt-5 mt-auto">
                  <div className="mb-4">
                    <span className="text-2xl font-black text-[#0f172a]">{p.price}</span>
                    {p.period && <span className="text-gray-400 text-sm ml-1">{p.period}</span>}
                  </div>
                  <a href="/cadastro"
                    className={`block w-full text-center font-bold py-3 rounded-xl transition-all hover:scale-105 ${
                      p.highlight
                        ? "bg-[#2563eb] text-white hover:bg-blue-700 shadow-md shadow-blue-200"
                        : "bg-[#0f172a] text-white hover:bg-gray-800"
                    }`}>
                    {p.cta}
                  </a>
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-gray-400 mt-8 flex items-center justify-center gap-1.5">
            <Lock className="h-3.5 w-3.5" />
            Preços válidos para emissão via videoconferência online. Condições especiais para contabilidades com volume. <a href="#contato" className="text-[#2563eb] hover:underline ml-1">Consulte-nos</a>
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
            <a href="/cadastro"
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
              <div key={b.title} className="flex items-start gap-4 p-5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/8 transition-colors">
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

      {/* Depoimentos */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <span className="text-[#2563eb] font-semibold text-sm uppercase tracking-wider">Depoimentos</span>
            <h2 className="text-3xl sm:text-4xl font-black mt-2 mb-3">O que nossos clientes dizem</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map(t => (
              <div key={t.name} className="bg-[#f8fafc] rounded-2xl p-6 border border-gray-100">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-[#f59e0b] text-[#f59e0b]" />
                  ))}
                </div>
                <p className="text-gray-600 text-sm leading-relaxed mb-5">"{t.text}"</p>
                <div>
                  <p className="font-bold text-sm text-[#0f172a]">{t.name}</p>
                  <p className="text-xs text-gray-400">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="py-16 sm:py-20 bg-gradient-to-r from-[#2563eb] to-blue-700 text-white">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-black mb-4">Pronto para emitir seu certificado?</h2>
          <p className="text-blue-100/80 text-lg mb-8">Cadastre-se agora, escolha seu certificado e agende a videoconferência. Em menos de 24h úteis seu certificado estará em mãos.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/cadastro"
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
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm text-center">
              <div className="h-12 w-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Phone className="h-5 w-5 text-[#2563eb]" />
              </div>
              <h3 className="font-bold mb-1">WhatsApp / Chat</h3>
              <p className="text-sm text-gray-500">Atendimento rápido pelo chat integrado no site</p>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm text-center">
              <div className="h-12 w-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Mail className="h-5 w-5 text-[#2563eb]" />
              </div>
              <h3 className="font-bold mb-1">E-mail</h3>
              <p className="text-sm text-gray-500">contato@lealcert.com.br</p>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm text-center">
              <div className="h-12 w-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-4">
                <MapPin className="h-5 w-5 text-[#2563eb]" />
              </div>
              <h3 className="font-bold mb-1">Atendimento nacional</h3>
              <p className="text-sm text-gray-500">Clientes em todo o Brasil, 100% remoto</p>
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
              <a href="/entrar" className="hover:text-white transition-colors">Área do Cliente</a>
              <a href="mailto:contato@lealcert.com.br" className="hover:text-white transition-colors">Contato</a>
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
    </div>
  );
}
