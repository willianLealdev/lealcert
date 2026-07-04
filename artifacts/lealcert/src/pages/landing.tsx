import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Shield, CheckCircle2, Clock, Award, Users, FileText,
  ChevronRight, MessageCircle, Star, Lock, Zap, Phone, Mail, MapPin, Menu,
} from "lucide-react";
import { ChatWidget } from "@/components/chat-widget";

const CERTS = [
  { name: "e-CPF", desc: "Certificado de pessoa física", detail: "Assinatura eletrônica, acesso a serviços Gov.br, declaração de IR, procurações eletrônicas e muito mais.", icon: "👤" },
  { name: "e-CNPJ", desc: "Certificado de pessoa jurídica", detail: "Emissão de NF-e, NFS-e, eSocial, EFD-Reinf, acesso a portais da Receita Federal e Prefeitura.", icon: "🏢" },
  { name: "A1 — Arquivo Digital", desc: "Instalado no computador ou nuvem", detail: "Prático e seguro, armazenado como arquivo. Renovação anual. Ideal para quem usa sempre no mesmo dispositivo.", icon: "💾" },
  { name: "A3 — Cartão/Token", desc: "Dispositivo físico criptografado", detail: "Máxima segurança. Armazenado em dispositivo físico. Validade de 1 a 3 anos. O cliente precisa ter mídia compatível.", icon: "🔐" },
];

const STEPS = [
  { n: "01", title: "Faça seu cadastro", desc: "Acesse o sistema, crie seu cadastro e escolha o certificado ideal para o seu caso." },
  { n: "02", title: "Forneça seus dados", desc: "Nome, CPF/CNPJ e endereço. Tudo de forma simples e segura, sem complicações." },
  { n: "03", title: "Pague via PIX", desc: "QR Code e chave PIX gerados na hora. Pagamento instantâneo e confirmação automática." },
  { n: "04", title: "Emissão agendada", desc: "Faça seu agendamento após o pagamento. Um Agente irá entrar em contato com você na data e horário agendado." },
];

const BENEFITS = [
  { icon: Zap, title: "Rápido", desc: "Do pedido à emissão em até 24h úteis" },
  { icon: Shield, title: "Seguro", desc: "Tecnologia ICP-Brasil, padrão nacional" },
  { icon: Clock, title: "100% Online", desc: "Sem precisar sair de casa ou do escritório" },
  { icon: Award, title: "Garantia", desc: "Suporte completo durante toda a validade" },
  { icon: Users, title: "Para Todos", desc: "Pessoa física, jurídica e contabilidades" },
  { icon: FileText, title: "Conformidade", desc: "Aceito em todos os sistemas governamentais" },
];


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
            e-CPF e e-CNPJ emitidos com rapidez e segurança. Se você precisar de ajuda, nosso assistente virtual te guia pelo processo completo — do pedido ao certificado.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              id="chat-cta"
              onClick={() => document.querySelector<HTMLButtonElement>("[aria-label='Abrir chat de vendas']")?.click()}
              className="flex items-center justify-center gap-2 bg-[#2563eb] hover:bg-blue-600 text-white font-bold px-8 py-4 rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg shadow-blue-900/30"
            >
              <MessageCircle className="h-5 w-5" />
              Suporte pelo Chat
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
            <Link href="/entrar">
              <button className="inline-flex items-center gap-2 bg-[#2563eb] text-white font-bold px-8 py-4 rounded-xl hover:bg-blue-700 transition-all hover:scale-105 active:scale-95">
                Começar agora
                <ChevronRight className="h-5 w-5" />
              </button>
            </Link>
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
          <p className="text-blue-100/80 text-lg mb-8">Nosso assistente virtual está disponível agora para te ajudar com dúvidas e suporte sobre certificados digitais.</p>
          <button
            onClick={() => document.querySelector<HTMLButtonElement>("[aria-label='Abrir chat de vendas']")?.click()}
            className="inline-flex items-center gap-3 bg-white text-[#2563eb] font-bold px-10 py-4 rounded-xl hover:bg-blue-50 transition-all hover:scale-105 active:scale-95 shadow-xl"
          >
            <MessageCircle className="h-5 w-5" />
            Falar com o assistente agora
          </button>
          <p className="text-blue-200/60 text-sm mt-4">Atendimento rápido · Tire suas dúvidas · Suporte especializado</p>
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
              <p className="text-gray-500 text-sm mb-5">Nosso assistente de IA responde na hora, 24 horas por dia, 7 dias por semana.</p>
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
