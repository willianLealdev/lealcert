import { useRef, useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useListCertificates, useCreateOrder, useConsultaPrevia, getCnpjLookupQueryOptions, useValidateCoupon } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Search, MapPin, Upload, FileText, X, Info, ShieldCheck, ShieldAlert, ShieldQuestion, Building2, User, Tag, CheckCircle, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Link } from "wouter";
function maskCpfCnpj(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_, a, b, c, e) =>
      [a, b, c].filter(Boolean).join(".") + (e ? "-" + e : "")
    );
  }
  return d
    .replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, (_, a, b, c, dd, e) =>
      [a, b, c].filter(Boolean).join(".").replace(/^(\d{2})/, "$1") +
      "/" + dd + (e ? "-" + e : "")
    )
    .replace(/^(\d{2})(\d{3})/, "$1.$2")
    .replace(/\.(\d{3})(\d{3})/, ".$1.$2");
}

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d{4})(\d{0,4})/, (_, a, b, c) =>
      `(${a}) ${b}${c ? `-${c}` : ""}`
    );
  }
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, (_, a, b, c) =>
    `(${a}) ${b}${c ? `-${c}` : ""}`
  );
}

function maskCepFn(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length > 5) return d.slice(0, 5) + "-" + d.slice(5);
  return d;
}

function maskDate(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length > 4) return d.slice(0, 2) + "/" + d.slice(2, 4) + "/" + d.slice(4);
  if (d.length > 2) return d.slice(0, 2) + "/" + d.slice(2);
  return d;
}

function parseBrDate(v: string): string {
  const parts = v.split("/");
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  }
  return v;
}

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
export default function NewOrder() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: certificates } = useListCertificates({ activeOnly: true });

  function certPrice(c: NonNullable<typeof certificates>[number]) {
    if (user?.userType === "contador" && c.priceContador != null) return c.priceContador;
    return c.price;
  }

  function validityLabel(months: number) {
    if (months < 12) return `${months} ${months === 1 ? "mês" : "meses"}`;
    const years = months / 12;
    return years === 1 ? "1 ano" : `${years} anos`;
  }

  const [form, setForm] = useState({
    certificateId: "",
    clientType: "cpf",
    customerName: "",
    customerCpfCnpj: "",
    customerEmail: "",
    customerPhone: "",
    customerBirthDate: "",
    companyName: "",
    inssNumber: "",
    extendedWarranty: false,
    addressZipcode: "",
    addressStreet: "",
    addressNumber: "",
    addressNeighborhood: "",
    addressCity: "",
    addressState: "",
    repName: "",
    repBirthDate: "",
    repCpf: "",
    repDocTipo: "0",
    repDocNumero: "",
    repDocOrgan: "",
    repDocUf: "",
    customerCei: "",
    customerNis: "",
    repNumeroTipo: "" as "" | "cei" | "nis" | "pis",
    addressComplement: "",
    representanteAddressZipcode: "",
    representanteAddressStreet: "",
    representanteAddressNumber: "",
    representanteAddressComplement: "",
    representanteAddressNeighborhood: "",
    representanteAddressCity: "",
    representanteAddressState: "",
  });

  type PsbioStatus = null | "loading" | { hasPsbio: boolean; mensagem: string; requiresPresencial: boolean; apiError?: boolean };
  const [psbioStatus, setPsbioStatus] = useState<PsbioStatus>(null);
  const [cnpjToQuery, setCnpjToQuery] = useState("");
  const [autoFilledCustomerName, setAutoFilledCustomerName] = useState(false);
  const [autoFilledRepName, setAutoFilledRepName] = useState(false);
  const psbioContextRef = useRef<"customer" | "rep">("customer");
  // NF type (only for e-CPF certs): "fisica" | "juridica"
  const [nfType, setNfType] = useState<"fisica" | "juridica">("fisica");

  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; type: string; value: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  // Cascading certificate selector state
  const [pickedProduct, setPickedProduct] = useState("");
  const [pickedIssuance, setPickedIssuance] = useState("");
  const [pickedValidity, setPickedValidity] = useState("");

  const [warrantyInfoOpen, setWarrantyInfoOpen] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepFilled, setCepFilled] = useState(false);
  const [repCepLoading, setRepCepLoading] = useState(false);
  const [repCepFilled, setRepCepFilled] = useState(false);
  const [cnhFile, setCnhFile] = useState<File | null>(null);
  const [cnhUploading, setCnhUploading] = useState(false);
  const [cnhKey, setCnhKey] = useState<string | null>(null);
  const cnhInputRef = useRef<HTMLInputElement>(null);
  const [cartaoFile, setCartaoFile] = useState<File | null>(null);
  const [cartaoUploading, setCartaoUploading] = useState(false);
  const [cartaoKey, setCartaoKey] = useState<string | null>(null);
  const cartaoInputRef = useRef<HTMLInputElement>(null);
  const [fichaFile, setFichaFile] = useState<File | null>(null);
  const [fichaUploading, setFichaUploading] = useState(false);
  const [fichaKey, setFichaKey] = useState<string | null>(null);
  const fichaInputRef = useRef<HTMLInputElement>(null);

  const createOrder = useCreateOrder({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Pedido criado!", description: `Pedido ${data.orderNumber} criado com sucesso.` });
        setLocation(`/orders/${data.id}`);
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? (err as Error)?.message ?? "Erro ao criar pedido.";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      },
    },
  });

  const checkPsbio = useConsultaPrevia({
    mutation: {
      onSuccess: (data) => {
        // PSBio status só é exibido no contexto do representante legal (CNPJ)
        // Para o titular PF (nota fiscal), apenas preenchemos o nome
        if (psbioContextRef.current === "rep") {
          setPsbioStatus({ hasPsbio: data.hasPsbio, mensagem: data.mensagem, requiresPresencial: data.requiresPresencial });
        }
        if (data.customerName) {
          if (psbioContextRef.current === "rep") {
            setForm(prev => ({ ...prev, repName: data.customerName!, customerName: prev.customerName || data.customerName! }));
            setAutoFilledRepName(true);
            setAutoFilledCustomerName(true);
          } else {
            setForm(prev => ({ ...prev, customerName: prev.customerName || data.customerName! }));
            setAutoFilledCustomerName(true);
          }
        }
      },
      onError: (err: unknown) => {
        if (psbioContextRef.current === "rep") {
          const msg = (err as { message?: string })?.message ?? "Erro ao consultar biometria";
          setPsbioStatus({ hasPsbio: false, mensagem: msg, requiresPresencial: true, apiError: true });
        }
      },
    },
  });

  const { data: cnpjData, isFetching: cnpjFetching, isError: cnpjError } = useQuery({
    ...getCnpjLookupQueryOptions({ cnpj: cnpjToQuery }),
    enabled: cnpjToQuery.length === 14,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  useEffect(() => {
    if (!cnpjData) return;
    const cepMasked = cnpjData.cep ? maskCepFn(cnpjData.cep.replace(/\D/g, "")) : "";
    setForm(prev => ({
      ...prev,
      companyName: prev.companyName || cnpjData.razaoSocial,
      customerName: prev.customerName || cnpjData.razaoSocial,
      ...(cepMasked ? { addressZipcode: cepMasked } : {}),
      ...(cnpjData.logradouro ? { addressStreet: cnpjData.logradouro } : {}),
      ...(cnpjData.numero ? { addressNumber: cnpjData.numero } : {}),
      ...(cnpjData.bairro ? { addressNeighborhood: cnpjData.bairro } : {}),
      ...(cnpjData.municipio ? { addressCity: cnpjData.municipio } : {}),
      ...(cnpjData.uf ? { addressState: cnpjData.uf } : {}),
    }));
    if (cnpjData.razaoSocial) setAutoFilledCustomerName(true);
    if (cnpjData.logradouro || cnpjData.cep) setCepFilled(true);
  }, [cnpjData]);

  const triggerPsbioCheck = useCallback((cpfCnpj: string, birthDate: string, clientType: string, repCpf?: string, repBirthDate?: string, context?: "customer" | "rep") => {
    const digits = cpfCnpj.replace(/\D/g, "");
    const isCpf = clientType === "cpf" && digits.length === 11;
    const isCnpj = clientType === "cnpj" && digits.length === 14;

    if (isCpf && birthDate) {
      // Para o titular PF: consulta na RFB apenas para buscar o nome (sem PSBio)
      psbioContextRef.current = context ?? "customer";
      const dateIso = birthDate.includes("/") ? parseBrDate(birthDate) : birthDate;
      checkPsbio.mutate({ data: { cpf: digits, dataNascimento: dateIso } });
    } else if (isCnpj && repCpf && repBirthDate) {
      // Para o representante CNPJ: consulta PSBio (biometria + nome)
      const repDigits = repCpf.replace(/\D/g, "");
      const repDateIso = repBirthDate.includes("/") ? parseBrDate(repBirthDate) : repBirthDate;
      if (repDigits.length === 11 && repDateIso.length === 10) {
        psbioContextRef.current = "rep";
        setPsbioStatus("loading");
        checkPsbio.mutate({ data: { cnpj: digits, cpfResponsavel: repDigits, dataNascimento: repDateIso } });
      }
    } else {
      setPsbioStatus(null);
    }
  }, [checkPsbio]);

  const validateCouponMutation = useValidateCoupon({
    mutation: {
      onSuccess: (data) => {
        setAppliedCoupon({ code: data.code, type: data.type, value: data.value });
        setCouponError(null);
        toast({ title: "Cupom aplicado!", description: `Desconto de ${data.type === "percent" ? data.value + "%" : formatBRL(data.value)} aplicado.` });
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "Cupom inválido.";
        setCouponError(msg);
        setAppliedCoupon(null);
      },
    },
  });

  // Cascade selector derived state
  const PRODUCT_OPTIONS_ORDER = ["e-CPF", "e-CNPJ", "e-PF", "e-PJ"];
  const ISSUANCE_ORDER = ["Presencial", "Videoconferência", "Fast", "Renovação"];

  const certsWithMeta = certificates ?? [];

  const availableProducts = PRODUCT_OPTIONS_ORDER.filter(p =>
    certsWithMeta.some(c => c.product === p)
  );

  const availableIssuances = ISSUANCE_ORDER.filter(i =>
    certsWithMeta.some(c => c.product === pickedProduct && c.issuanceType === i)
  );

  const availableValidities = Array.from(
    new Set(
      certsWithMeta
        .filter(c => c.product === pickedProduct && c.issuanceType === pickedIssuance)
        .map(c => c.validityMonths)
    )
  ).sort((a, b) => (a ?? 0) - (b ?? 0));

  const filteredCerts = certsWithMeta.filter(c =>
    c.product === pickedProduct &&
    c.issuanceType === pickedIssuance &&
    (c.validityMonths ?? 0) === Number(pickedValidity)
  );

  // When product changes, reset downstream
  function pickProduct(p: string) {
    setPickedProduct(p);
    setPickedIssuance("");
    setPickedValidity("");
    set("certificateId", "");
  }
  function pickIssuance(i: string) {
    setPickedIssuance(i);
    setPickedValidity("");
    set("certificateId", "");
  }
  function pickValidity(v: string) {
    setPickedValidity(v);
    set("certificateId", "");
  }

  const selectedCert = certificates?.find(c => String(c.id) === form.certificateId);
  const subtotal = (selectedCert ? certPrice(selectedCert) : 0) + (form.extendedWarranty ? 15 : 0);
  const discount = appliedCoupon
    ? appliedCoupon.type === "percent"
      ? Math.round(subtotal * appliedCoupon.value) / 100
      : Math.min(appliedCoupon.value, subtotal)
    : 0;
  const total = Math.max(0, subtotal - discount);

  // Derived: is the selected certificate an e-CNPJ type?
  const isCnpjCert = selectedCert
    ? (selectedCert.product === "e-CNPJ" || selectedCert.product === "e-PJ" || /cnpj/i.test(selectedCert.name))
    : false;
  // Show CNPJ/company fields either for e-CNPJ cert OR e-CPF cert with NF jurídica
  const showCnpjFields = isCnpjCert || (!isCnpjCert && nfType === "juridica");

  // Auto-set clientType when certificate changes
  useEffect(() => {
    if (!selectedCert) return;
    const certIsCnpj = selectedCert.product === "e-CNPJ" || selectedCert.product === "e-PJ" || /cnpj/i.test(selectedCert.name);
    setForm(prev => ({ ...prev, clientType: certIsCnpj ? "cnpj" : "cpf" }));
    if (!certIsCnpj) setNfType("fisica");
    setCnpjToQuery("");
    setAutoFilledCustomerName(false);
    setPsbioStatus(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.certificateId]);


  function set(field: string, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function maskCep(v: string) { return maskCepFn(v); }

  async function fetchCep(raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length !== 8) { if (cepFilled) setCepFilled(false); return; }
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm(prev => ({
          ...prev,
          addressStreet: data.logradouro || prev.addressStreet,
          addressNeighborhood: data.bairro || prev.addressNeighborhood,
          addressCity: data.localidade || prev.addressCity,
          addressState: data.uf || prev.addressState,
        }));
        setCepFilled(true);
        toast({ title: "CEP encontrado!", description: `${data.localidade} — ${data.uf}` });
      } else {
        setCepFilled(false);
        toast({ title: "CEP não encontrado", description: "Verifique o CEP e preencha o endereço manualmente.", variant: "destructive" });
      }
    } catch (_) {
      setCepFilled(false);
      toast({ title: "Erro ao buscar CEP", description: "Verifique sua conexão.", variant: "destructive" });
    }
    setCepLoading(false);
  }

  async function fetchRepCep(raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length !== 8) { if (repCepFilled) setRepCepFilled(false); return; }
    setRepCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm(prev => ({
          ...prev,
          representanteAddressStreet: data.logradouro || prev.representanteAddressStreet,
          representanteAddressNeighborhood: data.bairro || prev.representanteAddressNeighborhood,
          representanteAddressCity: data.localidade || prev.representanteAddressCity,
          representanteAddressState: data.uf || prev.representanteAddressState,
        }));
        setRepCepFilled(true);
        toast({ title: "CEP do representante encontrado!", description: `${data.localidade} — ${data.uf}` });
      } else {
        setRepCepFilled(false);
        toast({ title: "CEP não encontrado", description: "Preencha o endereço manualmente.", variant: "destructive" });
      }
    } catch (_) {
      setRepCepFilled(false);
      toast({ title: "Erro ao buscar CEP", description: "Verifique sua conexão.", variant: "destructive" });
    }
    setRepCepLoading(false);
  }

  async function uploadDoc(
    file: File,
    tipo: "cnh" | "cartao-cnpj" | "ficha-cadastral",
    setUploading: (v: boolean) => void,
    setKey: (k: string) => void,
    label: string,
  ): Promise<string | null> {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/upload/${tipo}`, { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload falhou");
      const json = await res.json() as { key: string; url: string };
      setKey(json.key);
      toast({ title: `${label} enviado com sucesso!` });
      return json.key;
    } catch {
      toast({ title: `Erro ao enviar ${label}`, description: "Tente novamente.", variant: "destructive" });
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.certificateId) {
      toast({ title: "Atenção", description: "Selecione um modelo de certificado.", variant: "destructive" });
      return;
    }
    if (!form.customerEmail) {
      toast({ title: "Atenção", description: "E-mail é obrigatório.", variant: "destructive" });
      return;
    }
    if (!form.customerPhone) {
      toast({ title: "Atenção", description: "Telefone é obrigatório.", variant: "destructive" });
      return;
    }
    if (!cnhFile && !cnhKey) {
      toast({ title: "Atenção", description: "Envie uma foto ou cópia da CNH / RG.", variant: "destructive" });
      return;
    }
    if (isCnpjCert) {
      if (form.repDocTipo === "0") {
        toast({ title: "Atenção", description: "Selecione o tipo de documento do representante legal.", variant: "destructive" });
        return;
      }
      if (!form.repDocNumero) {
        toast({ title: "Atenção", description: "Informe o número do documento do representante legal.", variant: "destructive" });
        return;
      }
      if (!cartaoFile && !cartaoKey) {
        toast({ title: "Atenção", description: "Envie o Cartão CNPJ.", variant: "destructive" });
        return;
      }
      if (!fichaFile && !fichaKey) {
        toast({ title: "Atenção", description: "Envie a Ficha Cadastral.", variant: "destructive" });
        return;
      }
    }

    let uploadedKey = cnhKey;
    if (cnhFile && !cnhKey) {
      uploadedKey = await uploadDoc(cnhFile, "cnh", setCnhUploading, setCnhKey, "CNH/RG");
      if (!uploadedKey) return;
    }
    if (isCnpjCert) {
      if (cartaoFile && !cartaoKey) {
        const k = await uploadDoc(cartaoFile, "cartao-cnpj", setCartaoUploading, setCartaoKey, "Cartão CNPJ");
        if (!k) return;
      }
      if (fichaFile && !fichaKey) {
        const k = await uploadDoc(fichaFile, "ficha-cadastral", setFichaUploading, setFichaKey, "Ficha Cadastral");
        if (!k) return;
      }
    }

    const hasPsbioValue = psbioStatus && psbioStatus !== "loading" ? psbioStatus.hasPsbio : undefined;

    createOrder.mutate({
      data: {
        certificateId: Number(form.certificateId),
        clientType: isCnpjCert ? "cnpj" : "cpf",
        customerName: form.customerName,
        customerCpfCnpj: form.customerCpfCnpj,
        customerEmail: form.customerEmail,
        customerPhone: form.customerPhone,
        customerBirthDate: form.customerBirthDate ? parseBrDate(form.customerBirthDate) : undefined,
        hasPsbio: hasPsbioValue,
        companyName: form.companyName || undefined,
        inssNumber: form.inssNumber || undefined,
        extendedWarranty: form.extendedWarranty,
        addressZipcode: form.addressZipcode || undefined,
        addressStreet: form.addressStreet || undefined,
        addressNumber: form.addressNumber || undefined,
        addressComplement: form.addressComplement || undefined,
        addressNeighborhood: form.addressNeighborhood || undefined,
        addressCity: form.addressCity || undefined,
        addressState: form.addressState || undefined,
        representanteCpf: isCnpjCert && form.repCpf ? form.repCpf : undefined,
        representanteAddressZipcode: isCnpjCert && form.representanteAddressZipcode ? form.representanteAddressZipcode : undefined,
        representanteAddressStreet: isCnpjCert && form.representanteAddressStreet ? form.representanteAddressStreet : undefined,
        representanteAddressNumber: isCnpjCert && form.representanteAddressNumber ? form.representanteAddressNumber : undefined,
        representanteAddressComplement: isCnpjCert && form.representanteAddressComplement ? form.representanteAddressComplement : undefined,
        representanteAddressNeighborhood: isCnpjCert && form.representanteAddressNeighborhood ? form.representanteAddressNeighborhood : undefined,
        representanteAddressCity: isCnpjCert && form.representanteAddressCity ? form.representanteAddressCity : undefined,
        representanteAddressState: isCnpjCert && form.representanteAddressState ? form.representanteAddressState : undefined,
        representanteNascimento: isCnpjCert && form.repBirthDate ? parseBrDate(form.repBirthDate) : undefined,
        cnhPath: uploadedKey || undefined,
        cartaoCnpjPath: cartaoKey || undefined,
        fichaCadastralPath: fichaKey || undefined,
        customerCei: form.customerCei || undefined,
        customerNis: form.customerNis || undefined,
        representanteDocTipo: form.repDocTipo !== "0" ? form.repDocTipo as "1" | "2" | "3" | "4" : undefined,
        representanteDocNumero: form.repDocTipo !== "0" && form.repDocNumero ? form.repDocNumero : undefined,
        representanteDocEmissor: form.repDocTipo !== "0" && form.repDocOrgan && form.repDocUf
          ? (form.repDocOrgan + form.repDocUf).toUpperCase()
          : undefined,
      },
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/orders">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Novo Pedido</h1>
          <p className="text-muted-foreground">Preencha os dados do cliente para emitir o certificado digital.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Certificado Digital *</CardTitle>
                <p className="text-sm text-muted-foreground">Selecione as opções abaixo para encontrar seu Certificado Digital.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Step 1 — Cascade header */}
                <div className="grid grid-cols-3 divide-x border rounded-lg overflow-hidden">
                  {/* Produto */}
                  <div className="p-3 space-y-1.5">
                    <p className="text-xs font-semibold text-primary uppercase tracking-wider">Produto</p>
                    <div className="relative">
                      <select
                        value={pickedProduct}
                        onChange={e => pickProduct(e.target.value)}
                        className="w-full appearance-none bg-transparent text-sm font-medium pr-6 focus:outline-none cursor-pointer"
                      >
                        <option value="">Selecione ▾</option>
                        {availableProducts.length > 0
                          ? availableProducts.map(p => <option key={p} value={p}>{p}</option>)
                          : ["e-CPF", "e-CNPJ", "e-PF", "e-PJ"].map(p => <option key={p} value={p}>{p}</option>)
                        }
                      </select>
                    </div>
                  </div>
                  {/* Emissão */}
                  <div className={["p-3 space-y-1.5 transition-opacity", !pickedProduct ? "opacity-40 pointer-events-none" : ""].join(" ")}>
                    <p className="text-xs font-semibold text-primary uppercase tracking-wider">Emissão</p>
                    <select
                      value={pickedIssuance}
                      onChange={e => pickIssuance(e.target.value)}
                      disabled={!pickedProduct}
                      className="w-full appearance-none bg-transparent text-sm font-medium pr-6 focus:outline-none cursor-pointer disabled:cursor-default"
                    >
                      <option value="">Selecione ▾</option>
                      {availableIssuances.length > 0
                        ? availableIssuances.map(i => <option key={i} value={i}>{i}</option>)
                        : ["Presencial", "Videoconferência", "Fast", "Renovação"].map(i => <option key={i} value={i}>{i}</option>)
                      }
                    </select>
                  </div>
                  {/* Validade */}
                  <div className={["p-3 space-y-1.5 transition-opacity", !pickedIssuance ? "opacity-40 pointer-events-none" : ""].join(" ")}>
                    <p className="text-xs font-semibold text-primary uppercase tracking-wider">Validade</p>
                    <select
                      value={pickedValidity}
                      onChange={e => pickValidity(e.target.value)}
                      disabled={!pickedIssuance}
                      className="w-full appearance-none bg-transparent text-sm font-medium pr-6 focus:outline-none cursor-pointer disabled:cursor-default"
                    >
                      <option value="">Selecione ▾</option>
                      {availableValidities.map(v => (
                        <option key={v} value={String(v ?? 0)}>{validityLabel(v ?? 0)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Step 2 — Filtered certificate list */}
                {pickedProduct && pickedIssuance && pickedValidity && (
                  filteredCerts.length === 0 ? (
                    <p className="text-sm text-center text-muted-foreground py-3">Nenhum certificado disponível para essa combinação.</p>
                  ) : (
                    <div className="border rounded-lg overflow-hidden divide-y">
                      <div className="grid grid-cols-[1fr_auto_auto] items-center px-4 py-2 bg-muted/50">
                        <p className="text-xs font-semibold text-muted-foreground">Produtos</p>
                        <p className="text-xs font-semibold text-muted-foreground text-right pr-8">Valores</p>
                      </div>
                      {filteredCerts.map(c => {
                        const selected = form.certificateId === String(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => set("certificateId", String(c.id))}
                            className={[
                              "w-full grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3 text-left transition-colors",
                              selected ? "bg-primary/5" : "hover:bg-muted/40",
                            ].join(" ")}
                          >
                            <span className={["text-sm font-medium", selected ? "text-primary" : "text-foreground"].join(" ")}>
                              {c.name}
                            </span>
                            <span className={["text-sm font-bold tabular-nums", selected ? "text-primary" : "text-foreground"].join(" ")}>
                              {formatBRL(certPrice(c))}
                            </span>
                            <span className={[
                              "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0",
                              selected ? "border-primary bg-primary" : "border-muted-foreground/40",
                            ].join(" ")}>
                              {selected && (
                                <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )
                )}

                {!pickedProduct && !certificates?.length && (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum modelo disponível. Configure os certificados no painel admin.</p>
                )}
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <Checkbox
                    id="warranty"
                    checked={form.extendedWarranty}
                    onCheckedChange={(v) => set("extendedWarranty", !!v)}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="warranty" className="cursor-pointer font-medium">Garantia Estendida (+R$ 15,00)</Label>
                      <button
                        type="button"
                        onClick={() => setWarrantyInfoOpen(true)}
                        className="text-muted-foreground hover:text-primary transition-colors"
                        aria-label="Saiba mais sobre a Garantia Estendida"
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">Protege contra imprevistos durante a emissão.</p>
                  </div>
                </div>

                <Dialog open={warrantyInfoOpen} onOpenChange={setWarrantyInfoOpen}>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Info className="h-5 w-5 text-blue-600" />
                        Garantia Estendida
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                      <p>
                        A <strong className="text-foreground">Garantia Estendida</strong> oferece o direito de emitir
                        um novo certificado digital sem custo adicional caso o certificado atual seja danificado ou
                        extraviado, dentro do prazo de <strong className="text-foreground">90 dias</strong> a partir
                        da data de emissão.
                      </p>
                      <p>
                        Toda reemissão realizada dentro do período de garantia é <strong className="text-foreground">gratuita</strong> para o cliente.
                      </p>
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800">
                        <p className="font-medium mb-1">Importante</p>
                        <p className="text-xs">
                          Alterações de dados cadastrais ou informações inerentes ao certificado <strong>não são cobertas</strong> pela Garantia Estendida, independentemente do prazo.
                        </p>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>

            {/* Accordion — tipos de emissão */}
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-center text-sm font-semibold text-foreground mb-3">Entenda a diferença entre os tipos de emissão</p>
                <Accordion type="multiple" className="divide-y border rounded-lg overflow-hidden">
                  {/* Videoconferência */}
                  <AccordionItem value="videoconferencia" className="border-0">
                    <AccordionTrigger className="px-4 py-3 text-sm font-semibold text-primary hover:no-underline hover:bg-muted/30 [&[data-state=open]]:bg-muted/20">
                      Videoconferência
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 pt-1">
                      <div className="flex gap-4 items-start">
                        <div className="flex-1 space-y-2">
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            É o método em que o Certificado Digital é feito através de videoconferência, no qual o Titular/Responsável pode realizar a validação de qualquer lugar.
                          </p>
                          <ol className="text-sm space-y-1 list-none">
                            {["Compra do Certificado", "Validação dos documentos (caso necessário)", "Agendamento da videoconferência", "Videoconferência", "Emissão"].map((s, i) => (
                              <li key={i} className="flex gap-1.5">
                                <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                                {i === 1 ? (
                                  <span><strong>Validação dos documentos</strong> (caso necessário)</span>
                                ) : (
                                  <strong>{s.replace(" (caso necessário)", "")}</strong>
                                )}
                              </li>
                            ))}
                          </ol>
                        </div>
                        <div className="shrink-0 hidden sm:flex items-center justify-center w-28 h-20 rounded-xl bg-blue-50 dark:bg-blue-950/20">
                          <svg viewBox="0 0 80 56" className="w-20 h-14 text-primary" fill="none">
                            <rect x="4" y="4" width="72" height="48" rx="6" stroke="currentColor" strokeWidth="2.5" fill="none"/>
                            <rect x="14" y="12" width="52" height="32" rx="3" fill="currentColor" fillOpacity=".08"/>
                            <circle cx="40" cy="28" r="9" fill="currentColor" fillOpacity=".15" stroke="currentColor" strokeWidth="2"/>
                            <path d="M36 28l3 3 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <rect x="28" y="52" width="24" height="2.5" rx="1.25" fill="currentColor" fillOpacity=".3"/>
                          </svg>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Presencial */}
                  <AccordionItem value="presencial" className="border-0">
                    <AccordionTrigger className="px-4 py-3 text-sm font-semibold text-primary hover:no-underline hover:bg-muted/30 [&[data-state=open]]:bg-muted/20">
                      Presencial
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 pt-1">
                      <div className="flex gap-4 items-start">
                        <div className="flex-1 space-y-2">
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            É o método de emissão em que o Titular/Responsável escolhe um local de atendimento para emitir presencialmente seu Certificado Digital.
                          </p>
                          <ol className="text-sm space-y-1 list-none">
                            {[
                              { label: "Compra do Certificado", suffix: "" },
                              { label: "Agendamento do atendimento", suffix: "" },
                              { label: "Atendimento presencial para emissão", suffix: "" },
                              { label: "Validação dos documentos", suffix: " (caso necessário)" },
                            ].map((s, i) => (
                              <li key={i} className="flex gap-1.5">
                                <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                                <span><strong>{s.label}</strong>{s.suffix}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                        <div className="shrink-0 hidden sm:flex items-center justify-center w-28 h-20 rounded-xl bg-emerald-50 dark:bg-emerald-950/20">
                          <svg viewBox="0 0 80 56" className="w-20 h-14 text-emerald-600" fill="none">
                            <rect x="10" y="10" width="28" height="36" rx="4" stroke="currentColor" strokeWidth="2.5"/>
                            <rect x="14" y="18" width="20" height="3" rx="1.5" fill="currentColor" fillOpacity=".4"/>
                            <rect x="14" y="24" width="14" height="3" rx="1.5" fill="currentColor" fillOpacity=".4"/>
                            <circle cx="56" cy="24" r="10" stroke="currentColor" strokeWidth="2.5"/>
                            <path d="M52 24l3 3 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M46 44c0-5.523 4.477-10 10-10s10 4.477 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                          </svg>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Fast */}
                  <AccordionItem value="fast" className="border-0">
                    <AccordionTrigger className="px-4 py-3 text-sm font-semibold text-primary hover:no-underline hover:bg-muted/30 [&[data-state=open]]:bg-muted/20">
                      Fast
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 pt-1">
                      <div className="flex gap-4 items-start">
                        <div className="flex-1 space-y-2">
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            É o método em que o próprio titular realiza a emissão do Certificado Digital de forma imediata, utilizando um e-CPF A3 dentro do prazo de validade (em token, cartão ou SafeID) para se identificar em nossa plataforma, sem precisar de um atendente. É a forma mais rápida e prática de obter seu certificado, disponível 24 horas por dia.
                          </p>
                          <ol className="text-sm space-y-1 list-none">
                            {["Compra do certificado", "Validação do pagamento", "Emissão"].map((s, i) => (
                              <li key={i} className="flex gap-1.5">
                                <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                                <strong>{s}</strong>
                              </li>
                            ))}
                          </ol>
                        </div>
                        <div className="shrink-0 hidden sm:flex items-center justify-center w-28 h-20 rounded-xl bg-amber-50 dark:bg-amber-950/20">
                          <svg viewBox="0 0 80 56" className="w-20 h-14 text-amber-600" fill="none">
                            <path d="M40 8l6 16h16l-13 10 5 16-14-10-14 10 5-16L18 24h16z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/>
                            <circle cx="40" cy="28" r="10" fill="currentColor" fillOpacity=".08"/>
                            <path d="M37 28l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Renovação */}
                  <AccordionItem value="renovacao" className="border-0">
                    <AccordionTrigger className="px-4 py-3 text-sm font-semibold text-primary hover:no-underline hover:bg-muted/30 [&[data-state=open]]:bg-muted/20">
                      Renovação
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 pt-1">
                      <div className="flex gap-4 items-start">
                        <div className="flex-1 space-y-2">
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            É o método de renovação de Certificado Digital totalmente on-line e autônoma, feita exclusivamente pelo Titular/Responsável. Permite que você renove o seu Certificado Digital a partir de um certificado já existente (modelo A3, com mídia, dentro do prazo de validade, sem nenhuma alteração nas informações na RFB).
                          </p>
                          <ol className="text-sm space-y-1 list-none">
                            {["Escolha do certificado", "Validação do certificado válido já existente", "Compra do certificado escolhido", "Emissão"].map((s, i) => (
                              <li key={i} className="flex gap-1.5">
                                <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                                <strong>{s}</strong>
                              </li>
                            ))}
                          </ol>
                        </div>
                        <div className="shrink-0 hidden sm:flex items-center justify-center w-28 h-20 rounded-xl bg-violet-50 dark:bg-violet-950/20">
                          <svg viewBox="0 0 80 56" className="w-20 h-14 text-violet-600" fill="none">
                            <path d="M20 28a20 20 0 0 1 38-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                            <path d="M60 28a20 20 0 0 1-38 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                            <path d="M58 16l2 6-6 2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M22 40l-2-6 6-2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                            <circle cx="40" cy="28" r="6" fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth="2"/>
                          </svg>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>

            {!selectedCert && (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                <FileText className="h-8 w-8 opacity-40" />
                <p className="text-sm">Selecione um certificado acima para preencher os dados do pedido.</p>
              </div>
            )}

            {selectedCert && <>
            <Card>
              <CardHeader>
                <CardTitle>Dados do Cliente</CardTitle>
                {/* Cert type badge */}
                {selectedCert && (
                  <div className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full w-fit mt-1 ${isCnpjCert ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>
                    {isCnpjCert ? <Building2 className="h-3 w-3" /> : <User className="h-3 w-3" />}
                    {isCnpjCert ? "e-CNPJ — Pessoa Jurídica" : "e-CPF — Pessoa Física"}
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">

                {/* NF type selector — only for e-CPF */}
                {!isCnpjCert && selectedCert && (
                  <div className="space-y-2 pb-2 border-b">
                    <Label className="text-sm font-medium">Nota fiscal do certificado em nome de:</Label>
                    <RadioGroup value={nfType} onValueChange={v => { setNfType(v as "fisica" | "juridica"); setForm(prev => ({ ...prev, companyName: "", customerName: "", customerCpfCnpj: "" })); setCnpjToQuery(""); setAutoFilledCustomerName(false); }} className="flex gap-4 mt-1">
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="fisica" id="nf-fisica" />
                        <Label htmlFor="nf-fisica" className="cursor-pointer font-normal flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5" /> Pessoa Física
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="juridica" id="nf-juridica" />
                        <Label htmlFor="nf-juridica" className="cursor-pointer font-normal flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5" /> Pessoa Jurídica (empresa)
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  {/* CNPJ/CPF — sempre o primeiro campo */}
                  <div className="space-y-2">
                    <Label>{showCnpjFields ? "CNPJ *" : "CPF *"}</Label>
                    <div className="relative">
                      <Input value={form.customerCpfCnpj} onChange={e => {
                        const v = maskCpfCnpj(e.target.value);
                        set("customerCpfCnpj", v);
                        const digits = v.replace(/\D/g, "");
                        if (showCnpjFields) {
                          if (digits.length === 14) setCnpjToQuery(digits);
                          else { setCnpjToQuery(""); setAutoFilledCustomerName(false); }
                        } else {
                          // CPF Pessoa Física — dispara consulta quando CPF completo + data preenchida
                          if (digits.length === 11 && form.customerBirthDate.length === 10) {
                            triggerPsbioCheck(v, form.customerBirthDate, "cpf");
                          } else if (digits.length < 11) {
                            setPsbioStatus(null);
                          }
                        }
                      }} required placeholder={showCnpjFields ? "00.000.000/0001-00" : "000.000.000-00"} className="pr-8" />
                      {cnpjFetching && showCnpjFields && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />
                      )}
                      {cnpjError && showCnpjFields && cnpjToQuery.length === 14 && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-destructive">!</span>
                      )}
                    </div>
                    {cnpjError && showCnpjFields && cnpjToQuery.length === 14 && (
                      <p className="text-xs text-destructive">CNPJ não encontrado na Receita Federal.</p>
                    )}
                    {cnpjData && showCnpjFields && cnpjData.situacao && cnpjData.situacao !== "ATIVA" && (
                      <p className="text-xs text-amber-600">Situação: {cnpjData.situacao}</p>
                    )}
                  </div>

                  {/* PF: Data de Nascimento — ao lado do CPF */}
                  {!showCnpjFields && (
                    <div className="space-y-2">
                      <Label>Data de Nascimento</Label>
                      <div className="relative">
                        <Input
                          value={form.customerBirthDate}
                          onChange={e => {
                            const v = maskDate(e.target.value);
                            set("customerBirthDate", v);
                            // Dispara consulta quando data completa + CPF completo
                            const cpfDigits = form.customerCpfCnpj.replace(/\D/g, "");
                            if (v.length === 10 && cpfDigits.length === 11) {
                              triggerPsbioCheck(form.customerCpfCnpj, v, "cpf");
                            } else if (v.length < 10) {
                              setPsbioStatus(null);
                            }
                          }}
                          placeholder="dd/mm/aaaa"
                          maxLength={10}
                          className="pr-8"
                        />
                        {checkPsbio.isPending && psbioContextRef.current === "customer" && (
                          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />
                        )}
                        {!checkPsbio.isPending && autoFilledCustomerName && (
                          <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
                        )}
                      </div>
                    </div>
                  )}

                  {/* PJ: Razão Social — ao lado do CNPJ, auto-preenchida */}
                  {showCnpjFields && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        Razão Social *
                        {cnpjData && form.companyName && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}
                        {cnpjFetching && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                      </Label>
                      <Input
                        value={form.companyName}
                        onChange={e => set("companyName", e.target.value)}
                        required
                        className={cnpjData && form.companyName ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200" : ""}
                        placeholder={cnpjFetching ? "Buscando..." : ""}
                      />
                    </div>
                  )}

                  {/* PF: Nome Completo — linha inteira, auto-preenchido pelo PSBio do representante */}
                  {!showCnpjFields && (
                    <div className="space-y-2 sm:col-span-2">
                      <Label className="flex items-center gap-1">
                        Nome Completo *
                        {autoFilledCustomerName && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}
                      </Label>
                      <Input
                        value={form.customerName}
                        onChange={e => { set("customerName", e.target.value); setAutoFilledCustomerName(false); }}
                        required
                        className={autoFilledCustomerName ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200" : ""}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>E-mail *</Label>
                    <Input type="email" value={form.customerEmail} onChange={e => set("customerEmail", e.target.value)} required placeholder="cliente@email.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone / WhatsApp *</Label>
                    <Input value={form.customerPhone} onChange={e => set("customerPhone", maskPhone(e.target.value))} required placeholder="(11) 99999-0000" />
                  </div>
                </div>

              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  Endereço
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  {/* CEP — busca automática */}
                  <div className="space-y-2">
                    <Label>CEP</Label>
                    <div className="relative">
                      <Input
                        value={form.addressZipcode}
                        onChange={e => {
                          const masked = maskCep(e.target.value);
                          set("addressZipcode", masked);
                          fetchCep(masked);
                        }}
                        placeholder="00000-000"
                        maxLength={9}
                        className="pr-9"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                        {cepLoading
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Search className="h-4 w-4" />}
                      </div>
                    </div>
                    {cepLoading && (
                      <p className="text-xs text-primary animate-pulse">Buscando endereço...</p>
                    )}
                  </div>

                  {/* Rua / Logradouro */}
                  <div className="space-y-2 sm:col-span-2">
                    <Label className="flex items-center gap-1">
                      Rua / Logradouro
                      {cepFilled && form.addressStreet && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}
                    </Label>
                    <Input
                      value={form.addressStreet}
                      onChange={e => set("addressStreet", e.target.value)}
                      className={cepFilled && form.addressStreet ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200" : ""}
                    />
                  </div>

                  {/* Número — sempre manual */}
                  <div className="space-y-2">
                    <Label>Número <span className="text-xs text-muted-foreground">(preencha manualmente)</span></Label>
                    <Input
                      value={form.addressNumber}
                      onChange={e => set("addressNumber", e.target.value)}
                      placeholder="Ex: 123"
                      autoFocus={cepFilled}
                    />
                  </div>

                  {/* Complemento */}
                  <div className="space-y-2">
                    <Label>Complemento <span className="text-xs text-muted-foreground">(opcional)</span></Label>
                    <Input
                      value={form.addressComplement}
                      onChange={e => set("addressComplement", e.target.value)}
                      placeholder="Apto, Sala, Bloco..."
                      maxLength={20}
                    />
                  </div>

                  {/* Bairro */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      Bairro
                      {cepFilled && form.addressNeighborhood && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}
                    </Label>
                    <Input
                      value={form.addressNeighborhood}
                      onChange={e => set("addressNeighborhood", e.target.value)}
                      className={cepFilled && form.addressNeighborhood ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200" : ""}
                    />
                  </div>

                  {/* Cidade */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      Cidade
                      {cepFilled && form.addressCity && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}
                    </Label>
                    <Input
                      value={form.addressCity}
                      onChange={e => set("addressCity", e.target.value)}
                      className={cepFilled && form.addressCity ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200" : ""}
                    />
                  </div>

                  {/* UF */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      UF
                      {cepFilled && form.addressState && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}
                    </Label>
                    <Input
                      value={form.addressState}
                      onChange={e => set("addressState", e.target.value)}
                      maxLength={2}
                      placeholder="SP"
                      className={cepFilled && form.addressState ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200" : ""}
                    />
                  </div>
                </div>

                {cepFilled && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    Endereço preenchido automaticamente pelo CEP. Confira e ajuste se necessário.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Dados do Representante Legal — sempre visível */}
            <Card>
              <CardHeader>
                <CardTitle>Dados do Representante Legal</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {isCnpjCert
                    ? "Pessoa física responsável pela empresa para emissão do certificado."
                    : "Responsável pela emissão do certificado digital."}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* CPF + Data — topo, disparam consulta automática */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>CPF do Representante *</Label>
                    <Input
                      value={form.repCpf}
                      onChange={e => {
                        const v = maskCpfCnpj(e.target.value);
                        set("repCpf", v);
                        if (v.replace(/\D/g, "").length === 11 && form.repBirthDate.length === 10) {
                          if (isCnpjCert) {
                            triggerPsbioCheck(form.customerCpfCnpj, form.customerBirthDate, "cnpj", v, form.repBirthDate);
                          } else {
                            triggerPsbioCheck(v, form.repBirthDate, "cpf", undefined, undefined, "rep");
                          }
                        }
                      }}
                      placeholder="000.000.000-00"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data de Nascimento *</Label>
                    <Input
                      value={form.repBirthDate}
                      onChange={e => {
                        const v = maskDate(e.target.value);
                        set("repBirthDate", v);
                        if (form.repCpf.replace(/\D/g, "").length === 11 && v.length === 10) {
                          if (isCnpjCert) {
                            triggerPsbioCheck(form.customerCpfCnpj, form.customerBirthDate, "cnpj", form.repCpf, v);
                          } else {
                            triggerPsbioCheck(form.repCpf, v, "cpf", undefined, undefined, "rep");
                          }
                        }
                      }}
                      placeholder="dd/mm/aaaa"
                      maxLength={10}
                      required
                    />
                  </div>
                </div>

                {/* Botão manual de consulta PSBio */}
                {form.repCpf.replace(/\D/g, "").length === 11 && form.repBirthDate.length === 10 && (
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={psbioStatus === "loading"}
                      onClick={() => {
                        if (isCnpjCert) {
                          triggerPsbioCheck(form.customerCpfCnpj, form.customerBirthDate, "cnpj", form.repCpf, form.repBirthDate);
                        } else {
                          triggerPsbioCheck(form.repCpf, form.repBirthDate, "cpf", undefined, undefined, "rep");
                        }
                      }}
                    >
                      {psbioStatus === "loading"
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        : <Search className="h-3.5 w-3.5 mr-1.5" />}
                      Consultar Biometria
                    </Button>
                  </div>
                )}

                {/* Status PSBio — consulta automática ao preencher os campos */}
                {psbioStatus === "loading" && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 rounded-lg px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    Verificando biometria PSBio...
                  </div>
                )}
                {psbioStatus && psbioStatus !== "loading" && psbioStatus.hasPsbio && (
                  <div className="flex items-start gap-2 text-sm bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg px-4 py-3">
                    <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-emerald-700 dark:text-emerald-400">Biometria PSBio disponível</p>
                      <p className="text-emerald-600/80 dark:text-emerald-500 text-xs">{psbioStatus.mensagem}</p>
                    </div>
                  </div>
                )}
                {psbioStatus && psbioStatus !== "loading" && !psbioStatus.hasPsbio && !psbioStatus.apiError && (
                  <div className="flex items-start gap-2 text-sm bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3">
                    <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-700 dark:text-amber-400">Sem biometria PSBio — atendimento presencial</p>
                      <p className="text-amber-600/80 dark:text-amber-500 text-xs">{psbioStatus.mensagem}</p>
                    </div>
                  </div>
                )}
                {/* Fallback manual — só aparece quando a consulta automática falhou */}
                {psbioStatus && psbioStatus !== "loading" && psbioStatus.apiError && (
                  <div className="flex items-start justify-between gap-2 text-sm bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
                    <div className="flex items-start gap-2">
                      <ShieldAlert className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-red-700 dark:text-red-400">Consulta automática falhou</p>
                        <p className="text-red-600/80 dark:text-red-500 text-xs">Tente novamente ou continue manualmente.</p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 text-xs h-7"
                      onClick={() => {
                        psbioContextRef.current = isCnpjCert ? "rep" : "customer";
                        setPsbioStatus("loading");
                        const repDigits = form.repCpf.replace(/\D/g, "");
                        const repDateIso = form.repBirthDate.includes("/") ? parseBrDate(form.repBirthDate) : form.repBirthDate;
                        if (isCnpjCert) {
                          checkPsbio.mutate({ data: { cnpj: form.customerCpfCnpj.replace(/\D/g, ""), cpfResponsavel: repDigits, dataNascimento: repDateIso } });
                        } else {
                          checkPsbio.mutate({ data: { cpf: repDigits, dataNascimento: repDateIso } });
                        }
                      }}
                    >
                      <Search className="h-3 w-3 mr-1" /> Tentar novamente
                    </Button>
                  </div>
                )}

                {/* Nome — somente leitura, preenchido pela consulta */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Nome Completo do Representante
                    {autoFilledRepName && (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-normal">
                        <CheckCircle className="h-3 w-3" /> preenchido automaticamente
                      </span>
                    )}
                  </Label>
                  <Input
                    value={form.repName}
                    readOnly
                    placeholder="Preenchido automaticamente após consulta"
                    className={autoFilledRepName
                      ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 text-foreground"
                      : "bg-muted/40 text-muted-foreground cursor-not-allowed"}
                  />
                </div>

                {/* CEI / NIS / PIS-IMEI — exclusivos */}
                <div className="space-y-3 pt-1">
                  <p className="text-sm font-medium text-foreground">Número Adicional <span className="text-muted-foreground font-normal text-xs">(opcional — escolha apenas um)</span></p>
                  <div className="flex flex-wrap gap-4">
                    {(["cei", "nis", "pis"] as const).map(tipo => (
                      <label key={tipo} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="radio"
                          name="repNumeroTipo"
                          value={tipo}
                          checked={form.repNumeroTipo === tipo}
                          onChange={() => setForm(f => ({
                            ...f,
                            repNumeroTipo: tipo,
                            customerCei: tipo === "cei" ? f.customerCei : "",
                            customerNis: tipo === "nis" ? f.customerNis : "",
                            inssNumber: tipo === "pis" ? f.inssNumber : "",
                          }))}
                          className="accent-primary"
                        />
                        <span className="text-sm font-medium">{tipo === "pis" ? "PIS" : tipo.toUpperCase()}</span>
                      </label>
                    ))}
                    {form.repNumeroTipo && (
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, repNumeroTipo: "", customerCei: "", customerNis: "", inssNumber: "" }))}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        limpar
                      </button>
                    )}
                  </div>
                  {form.repNumeroTipo === "cei" && (
                    <Input
                      value={form.customerCei}
                      onChange={e => set("customerCei", e.target.value.replace(/\D/g, "").slice(0, 12))}
                      placeholder="CEI — até 12 dígitos"
                      maxLength={12}
                    />
                  )}
                  {form.repNumeroTipo === "nis" && (
                    <Input
                      value={form.customerNis}
                      onChange={e => set("customerNis", e.target.value.replace(/\D/g, "").slice(0, 11))}
                      placeholder="NIS — até 11 dígitos"
                      maxLength={11}
                    />
                  )}
                  {form.repNumeroTipo === "pis" && (
                    <Input
                      value={form.inssNumber}
                      onChange={e => set("inssNumber", e.target.value.replace(/\D/g, "").slice(0, 11))}
                      placeholder="PIS — 11 dígitos"
                      maxLength={11}
                    />
                  )}
                </div>

                {/* Endereço do representante legal (Titular_* Safeweb) */}
                <div className="space-y-3 pt-1">
                  <p className="text-sm font-medium text-foreground flex items-center gap-1">
                    <MapPin className="h-4 w-4 text-primary" />
                    Endereço do Representante Legal *
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>CEP *</Label>
                      <div className="relative">
                        <Input
                          value={form.representanteAddressZipcode}
                          onChange={e => {
                            const masked = maskCep(e.target.value);
                            set("representanteAddressZipcode", masked);
                            fetchRepCep(masked);
                          }}
                          placeholder="00000-000"
                          maxLength={9}
                          className="pr-9"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                          {repCepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label className="flex items-center gap-1">
                        Rua / Logradouro *
                        {repCepFilled && form.representanteAddressStreet && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}
                      </Label>
                      <Input
                        value={form.representanteAddressStreet}
                        onChange={e => set("representanteAddressStreet", e.target.value)}
                        className={repCepFilled && form.representanteAddressStreet ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200" : ""}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Número *</Label>
                      <Input
                        value={form.representanteAddressNumber}
                        onChange={e => set("representanteAddressNumber", e.target.value)}
                        placeholder="Ex: 123"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Complemento <span className="text-xs text-muted-foreground">(opcional)</span></Label>
                      <Input
                        value={form.representanteAddressComplement}
                        onChange={e => set("representanteAddressComplement", e.target.value)}
                        placeholder="Apto, Sala..."
                        maxLength={20}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        Bairro
                        {repCepFilled && form.representanteAddressNeighborhood && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}
                      </Label>
                      <Input
                        value={form.representanteAddressNeighborhood}
                        onChange={e => set("representanteAddressNeighborhood", e.target.value)}
                        className={repCepFilled && form.representanteAddressNeighborhood ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200" : ""}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        Cidade
                        {repCepFilled && form.representanteAddressCity && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}
                      </Label>
                      <Input
                        value={form.representanteAddressCity}
                        onChange={e => set("representanteAddressCity", e.target.value)}
                        className={repCepFilled && form.representanteAddressCity ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200" : ""}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        UF
                        {repCepFilled && form.representanteAddressState && <span className="text-xs text-emerald-500 font-normal">(auto)</span>}
                      </Label>
                      <Input
                        value={form.representanteAddressState}
                        onChange={e => set("representanteAddressState", e.target.value)}
                        maxLength={2}
                        placeholder="SP"
                        className={repCepFilled && form.representanteAddressState ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200" : ""}
                      />
                    </div>
                  </div>
                </div>

                {/* Documento de identificação do representante — obrigatório */}
                <div className="space-y-3 pt-1">
                  <p className="text-sm font-medium text-foreground">Documento de Identificação *</p>
                  <div className="space-y-2">
                    <Label>Tipo de Documento *</Label>
                    <select
                      value={form.repDocTipo}
                      onChange={e => setForm(f => ({ ...f, repDocTipo: e.target.value, repDocNumero: "", repDocOrgan: "", repDocUf: "" }))}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="0">Selecione o tipo</option>
                      <option value="1">RG</option>
                      <option value="2">RNE</option>
                      <option value="3">Passaporte</option>
                      <option value="4">CNH</option>
                    </select>
                  </div>
                  {form.repDocTipo !== "0" && (
                    <>
                      <div className="space-y-2">
                        <Label>Número do Documento</Label>
                        <Input
                          value={form.repDocNumero}
                          onChange={e => set("repDocNumero", e.target.value)}
                          placeholder={form.repDocTipo === "3" ? "Ex: BR123456" : "Ex: 12.345.678-9"}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>Órgão Expedidor <span className="text-muted-foreground font-normal text-xs">(máx. 4 car.)</span></Label>
                          <Input
                            value={form.repDocOrgan}
                            onChange={e => set("repDocOrgan", e.target.value.toUpperCase().slice(0, 4))}
                            placeholder="Ex: SSP"
                            maxLength={4}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>UF</Label>
                          <select
                            value={form.repDocUf}
                            onChange={e => set("repDocUf", e.target.value)}
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          >
                            <option value="">Selecione</option>
                            {["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"].map(uf => (
                              <option key={uf} value={uf}>{uf}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* CNH / RG Upload */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Documento de Identidade — CNH ou RG *
                </CardTitle>
                <p className="text-sm text-muted-foreground">Envie uma foto ou cópia da CNH ou RG (PDF, JPG ou PNG, máx. 5 MB).</p>
              </CardHeader>
              <CardContent>
                <input ref={cnhInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                  onChange={e => { const f = e.target.files?.[0] ?? null; if (f && f.size > 5*1024*1024) { toast({ title: "Arquivo muito grande", description: "Máx. 5 MB.", variant: "destructive" }); return; } setCnhFile(f); setCnhKey(null); }} />
                {!cnhFile ? (
                  <button type="button" onClick={() => cnhInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-border hover:border-primary/50 rounded-xl py-10 flex flex-col items-center gap-3 text-muted-foreground transition-colors hover:bg-primary/5 cursor-pointer">
                    <Upload className="h-8 w-8 opacity-40" />
                    <div className="text-center"><p className="font-medium text-sm">Clique para selecionar arquivo</p><p className="text-xs">PDF, JPG, JPEG ou PNG — máx. 5 MB</p></div>
                  </button>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-muted/30">
                    <FileText className="h-8 w-8 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{cnhFile.name}</p>
                      <p className="text-xs text-muted-foreground">{(cnhFile.size/1024).toFixed(0)} KB</p>
                      {cnhKey && <p className="text-xs text-emerald-600 font-medium mt-0.5">✓ Enviado com sucesso</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!cnhKey && (
                        <Button type="button" size="sm" variant="outline"
                          onClick={() => uploadDoc(cnhFile, "cnh", setCnhUploading, setCnhKey, "CNH/RG")}
                          disabled={cnhUploading}>
                          {cnhUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                          {cnhUploading ? "Enviando..." : "Enviar"}
                        </Button>
                      )}
                      <button type="button" onClick={() => { setCnhFile(null); setCnhKey(null); if (cnhInputRef.current) cnhInputRef.current.value = ""; }}
                        className="text-muted-foreground hover:text-destructive transition-colors"><X className="h-4 w-4" /></button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Cartão CNPJ — apenas pessoa jurídica */}
            {form.clientType === "cnpj" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Cartão CNPJ *
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Cartão CNPJ emitido pela Receita Federal (PDF, JPG ou PNG, máx. 5 MB).</p>
                </CardHeader>
                <CardContent>
                  <input ref={cartaoInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                    onChange={e => { const f = e.target.files?.[0] ?? null; if (f && f.size > 5*1024*1024) { toast({ title: "Arquivo muito grande", description: "Máx. 5 MB.", variant: "destructive" }); return; } setCartaoFile(f); setCartaoKey(null); }} />
                  {!cartaoFile ? (
                    <button type="button" onClick={() => cartaoInputRef.current?.click()}
                      className="w-full border-2 border-dashed border-border hover:border-primary/50 rounded-xl py-10 flex flex-col items-center gap-3 text-muted-foreground transition-colors hover:bg-primary/5 cursor-pointer">
                      <Upload className="h-8 w-8 opacity-40" />
                      <div className="text-center"><p className="font-medium text-sm">Clique para selecionar arquivo</p><p className="text-xs">PDF, JPG, JPEG ou PNG — máx. 5 MB</p></div>
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-muted/30">
                      <FileText className="h-8 w-8 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{cartaoFile.name}</p>
                        <p className="text-xs text-muted-foreground">{(cartaoFile.size/1024).toFixed(0)} KB</p>
                        {cartaoKey && <p className="text-xs text-emerald-600 font-medium mt-0.5">✓ Enviado com sucesso</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!cartaoKey && (
                          <Button type="button" size="sm" variant="outline"
                            onClick={() => uploadDoc(cartaoFile, "cartao-cnpj", setCartaoUploading, setCartaoKey, "Cartão CNPJ")}
                            disabled={cartaoUploading}>
                            {cartaoUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                            {cartaoUploading ? "Enviando..." : "Enviar"}
                          </Button>
                        )}
                        <button type="button" onClick={() => { setCartaoFile(null); setCartaoKey(null); if (cartaoInputRef.current) cartaoInputRef.current.value = ""; }}
                          className="text-muted-foreground hover:text-destructive transition-colors"><X className="h-4 w-4" /></button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Ficha Cadastral — apenas pessoa jurídica */}
            {form.clientType === "cnpj" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Ficha Cadastral Completa *
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Ficha cadastral completa da empresa (PDF, JPG ou PNG, máx. 5 MB).</p>
                </CardHeader>
                <CardContent>
                  <input ref={fichaInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                    onChange={e => { const f = e.target.files?.[0] ?? null; if (f && f.size > 5*1024*1024) { toast({ title: "Arquivo muito grande", description: "Máx. 5 MB.", variant: "destructive" }); return; } setFichaFile(f); setFichaKey(null); }} />
                  {!fichaFile ? (
                    <button type="button" onClick={() => fichaInputRef.current?.click()}
                      className="w-full border-2 border-dashed border-border hover:border-primary/50 rounded-xl py-10 flex flex-col items-center gap-3 text-muted-foreground transition-colors hover:bg-primary/5 cursor-pointer">
                      <Upload className="h-8 w-8 opacity-40" />
                      <div className="text-center"><p className="font-medium text-sm">Clique para selecionar arquivo</p><p className="text-xs">PDF, JPG, JPEG ou PNG — máx. 5 MB</p></div>
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-muted/30">
                      <FileText className="h-8 w-8 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{fichaFile.name}</p>
                        <p className="text-xs text-muted-foreground">{(fichaFile.size/1024).toFixed(0)} KB</p>
                        {fichaKey && <p className="text-xs text-emerald-600 font-medium mt-0.5">✓ Enviado com sucesso</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!fichaKey && (
                          <Button type="button" size="sm" variant="outline"
                            onClick={() => uploadDoc(fichaFile, "ficha-cadastral", setFichaUploading, setFichaKey, "Ficha Cadastral")}
                            disabled={fichaUploading}>
                            {fichaUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                            {fichaUploading ? "Enviando..." : "Enviar"}
                          </Button>
                        )}
                        <button type="button" onClick={() => { setFichaFile(null); setFichaKey(null); if (fichaInputRef.current) fichaInputRef.current.value = ""; }}
                          className="text-muted-foreground hover:text-destructive transition-colors"><X className="h-4 w-4" /></button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
              <CardContent className="pt-5">
                <div className="flex items-start gap-3 text-sm text-blue-800 dark:text-blue-300">
                  <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-600" />
                  <p>
                    <strong>Agendamento após pagamento.</strong> O horário de atendimento será selecionado na tela de detalhes do pedido,
                    assim que o pagamento for confirmado e o certificado for registrado no provedor.
                  </p>
                </div>
              </CardContent>
            </Card>
            </>}
          </div>

          <div className="space-y-4">
            <Card className="sticky top-6">
              <CardHeader><CardTitle>Resumo do Pedido</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {selectedCert ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{selectedCert.name}</span>
                      <span>{formatBRL(certPrice(selectedCert))}</span>
                    </div>
                    {form.extendedWarranty && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Garantia Estendida</span>
                        <span>{formatBRL(15)}</span>
                      </div>
                    )}
                    {appliedCoupon && (
                      <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
                        <span className="flex items-center gap-1">
                          <Tag className="h-3.5 w-3.5" />
                          Cupom {appliedCoupon.code}
                        </span>
                        <span>- {formatBRL(discount)}</span>
                      </div>
                    )}
                    <div className="border-t pt-4 flex justify-between font-bold">
                      <span>Total</span>
                      <span className="text-primary text-lg">{formatBRL(total)}</span>
                    </div>

                    {/* Coupon input */}
                    <div className="space-y-2 pt-1">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Tag className="h-3.5 w-3.5" /> Cupom de desconto
                      </Label>
                      {appliedCoupon ? (
                        <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2">
                          <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span className="flex-1 text-sm font-mono font-semibold text-emerald-700 dark:text-emerald-400">{appliedCoupon.code}</span>
                          <button
                            type="button"
                            onClick={() => { setAppliedCoupon(null); setCouponCode(""); setCouponError(null); }}
                            className="text-emerald-600 hover:text-emerald-800 transition-colors"
                            title="Remover cupom"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex gap-2">
                            <Input
                              value={couponCode}
                              onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponError(null); }}
                              placeholder="CÓDIGO"
                              className={`font-mono uppercase text-sm ${couponError ? "border-destructive" : ""}`}
                              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (couponCode.trim()) validateCouponMutation.mutate({ data: { code: couponCode.trim() } }); } }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                              disabled={!couponCode.trim() || validateCouponMutation.isPending}
                              onClick={() => validateCouponMutation.mutate({ data: { code: couponCode.trim() } })}
                            >
                              {validateCouponMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aplicar"}
                            </Button>
                          </div>
                          {couponError && (
                            <p className="flex items-center gap-1.5 text-xs text-destructive">
                              <XCircle className="h-3.5 w-3.5 shrink-0" /> {couponError}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Selecione um certificado para ver o resumo.</p>
                )}

                <Button type="submit" className="w-full" disabled={createOrder.isPending}>
                  {createOrder.isPending
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Criando...</>
                    : "Criar Pedido"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}
