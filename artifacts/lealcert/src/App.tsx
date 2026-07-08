import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useState, useEffect, useRef, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("App error:", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8 bg-background">
          <div className="max-w-lg w-full rounded-lg border border-destructive/40 bg-destructive/5 p-6 space-y-3">
            <h2 className="text-lg font-semibold text-destructive">Erro na aplicação</h2>
            <p className="text-sm text-muted-foreground font-mono break-all">{this.state.error.message}</p>
            <button className="text-sm underline text-primary" onClick={() => { this.setState({ error: null }); window.location.reload(); }}>
              Recarregar página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { BrandingProvider } from "@/lib/branding";
import { InstallPrompt } from "@/components/install-prompt";
import { PwaUpdateBanner } from "@/components/pwa-update-banner";
import NotFound from "@/pages/not-found";
import Layout from "@/components/layout";
import Landing from "@/pages/landing";

import Login from "@/pages/login";
import Register from "@/pages/register";
import VerifyEmail from "@/pages/verify-email";
import ForgotPassword from "@/pages/forgot-password";
import ChangePassword from "@/pages/change-password";
import Dashboard from "@/pages/dashboard";
import Orders from "@/pages/orders/index";
import NewOrder from "@/pages/orders/new";
import OrderDetail from "@/pages/orders/detail";
import Support from "@/pages/support/index";
import NewTicket from "@/pages/support/new";
import TicketDetail from "@/pages/support/detail";
import Profile from "@/pages/profile";
import AdminUsers from "@/pages/admin/users";
import AdminCertificates from "@/pages/admin/certificates";
import AdminSlots from "@/pages/admin/slots";
import AdminSettings from "@/pages/admin/settings";
import AdminMarketing from "@/pages/admin/marketing";
import AdminRenovacoes from "@/pages/admin/renovacoes";
import AdminCoupons from "@/pages/admin/coupons";
import AdminIpSecurity from "@/pages/admin/ip-security";
import AdminAgentes from "@/pages/admin/agentes";
import AdminRelatoriosGar from "@/pages/admin/relatorios-gar";
import AdminReviews from "@/pages/admin/reviews";
import AgenteConsultar from "@/pages/agente/consultar";
import PrivacyPolicy from "@/pages/privacy-policy";
import ComprarPage from "@/pages/comprar";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 10_000 },
  },
});

function ProtectedRoute({ component: Component, adminOnly = false, agenteOnly = false, resetKey = 0 }: { component: React.ComponentType; adminOnly?: boolean; agenteOnly?: boolean; resetKey?: number }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="text-2xl font-extrabold tracking-tight text-foreground">LEAL<span className="text-blue-500">CERT</span></div>
          <div className="h-1 w-32 bg-primary/20 rounded-full overflow-hidden">
            <div className="h-full w-1/2 bg-primary rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) return <Login />;
  if (adminOnly && user.role !== "admin") return <NotFound />;
  if (agenteOnly && user.role !== "agente") return <NotFound />;

  return (
    <Layout>
      <Component key={resetKey} />
    </Layout>
  );
}

function Router() {
  const [location] = useLocation();
  const [newOrderKey, setNewOrderKey] = useState(0);
  const prevLocationRef = useRef("");

  useEffect(() => {
    if (location === "/orders/new" && prevLocationRef.current !== "/orders/new") {
      setNewOrderKey(k => k + 1);
    }
    prevLocationRef.current = location;
  }, [location]);

  return (
    <Switch>
      {/* Public routes */}
      <Route path="/" component={Landing} />
      <Route path="/entrar" component={Login} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/change-password" component={ChangePassword} />
      <Route path="/politica-de-privacidade" component={PrivacyPolicy} />
      <Route path="/comprar/:certId" component={ComprarPage} />
      {/* Protected user routes */}
      <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/orders" component={() => <ProtectedRoute component={Orders} />} />
      <Route path="/orders/new" component={() => <ProtectedRoute component={NewOrder} resetKey={newOrderKey} />} />
      <Route path="/orders/:id" component={() => <ProtectedRoute component={OrderDetail} />} />
      <Route path="/support" component={() => <ProtectedRoute component={Support} />} />
      <Route path="/support/new" component={() => <ProtectedRoute component={NewTicket} />} />
      <Route path="/support/:id" component={() => <ProtectedRoute component={TicketDetail} />} />
      <Route path="/profile" component={() => <ProtectedRoute component={Profile} />} />
      {/* Protected admin routes */}
      <Route path="/admin/users" component={() => <ProtectedRoute component={AdminUsers} adminOnly />} />
      <Route path="/admin/certificates" component={() => <ProtectedRoute component={AdminCertificates} adminOnly />} />
      <Route path="/admin/slots" component={() => <ProtectedRoute component={AdminSlots} adminOnly />} />
      <Route path="/admin/settings" component={() => <ProtectedRoute component={AdminSettings} adminOnly />} />
      <Route path="/admin/marketing" component={() => <ProtectedRoute component={AdminMarketing} adminOnly />} />
      <Route path="/admin/renovacoes" component={() => <ProtectedRoute component={AdminRenovacoes} adminOnly />} />
      <Route path="/admin/coupons" component={() => <ProtectedRoute component={AdminCoupons} adminOnly />} />
      <Route path="/admin/ip-security" component={() => <ProtectedRoute component={AdminIpSecurity} adminOnly />} />
      <Route path="/admin/agentes" component={() => <ProtectedRoute component={AdminAgentes} adminOnly />} />
      <Route path="/admin/relatorios-gar" component={() => <ProtectedRoute component={AdminRelatoriosGar} adminOnly />} />
      <Route path="/admin/reviews" component={() => <ProtectedRoute component={AdminReviews} adminOnly />} />
      {/* Agente routes */}
      <Route path="/consultar" component={() => <ProtectedRoute component={AgenteConsultar} agenteOnly />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <BrandingProvider>
              <AuthProvider>
                <ErrorBoundary>
                  <Router />
                </ErrorBoundary>
              </AuthProvider>
            </BrandingProvider>
          </WouterRouter>
          <Toaster />
          <InstallPrompt />
          <PwaUpdateBanner />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
