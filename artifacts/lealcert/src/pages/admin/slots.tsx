import { useState } from "react";
import { useListSlots, useCreateSlot, useDeleteSlot, useGenerateSlots, useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Calendar, Clock, Settings2, Zap, Ban, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

const BRT = "America/Sao_Paulo";

const WEEKDAYS = [
  { iso: 1, label: "Segunda" },
  { iso: 2, label: "Terça" },
  { iso: 3, label: "Quarta" },
  { iso: 4, label: "Quinta" },
  { iso: 5, label: "Sexta" },
  { iso: 6, label: "Sábado" },
  { iso: 7, label: "Domingo" },
];

function groupByDate(slots: Array<{ id: number; slotDatetime: string; active: boolean }>) {
  const map = new Map<string, typeof slots>();
  for (const s of slots) {
    const key = new Date(s.slotDatetime).toLocaleDateString("pt-BR", {
      timeZone: BRT, weekday: "long", day: "2-digit", month: "long", year: "numeric",
    });
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  return Array.from(map.entries());
}

function todayISO() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: BRT });
}

export default function AdminSlots() {
  const { toast } = useToast();
  const { data: slots, isLoading, refetch } = useListSlots();
  const { data: settings, refetch: refetchSettings } = useGetSettings();

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [newDatetime, setNewDatetime] = useState("");

  // Schedule config state
  const [openDays, setOpenDays] = useState<number[] | null>(null);
  const [openHour, setOpenHour] = useState<string | null>(null);
  const [closeHour, setCloseHour] = useState<string | null>(null);
  const [stepMin, setStepMin] = useState<string | null>(null);
  const [closedDateInput, setClosedDateInput] = useState("");

  // Generate state
  const [genFrom, setGenFrom] = useState(todayISO());
  const [genTo, setGenTo] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toLocaleDateString("sv-SE", { timeZone: BRT });
  });

  const create = useCreateSlot({ mutation: { onSuccess: () => { toast({ title: "Horário adicionado!" }); setNewDatetime(""); refetch(); } } });
  const del = useDeleteSlot({ mutation: { onSuccess: () => { toast({ title: "Horário removido." }); setDeleteId(null); refetch(); } } });

  const updateSettings = useUpdateSettings({
    mutation: {
      onSuccess: () => { toast({ title: "Configuração salva!" }); refetchSettings(); },
      onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
    },
  });

  const generateSlots = useGenerateSlots({
    mutation: {
      onSuccess: (data) => {
        toast({ title: `${data.created} horários gerados!`, description: `${data.skipped} já existiam e foram ignorados.` });
        refetch();
      },
      onError: () => toast({ title: "Erro ao gerar horários", variant: "destructive" }),
    },
  });

  const grouped = groupByDate(slots ?? []);

  // Use settings as base, override with local state if changed
  const effectiveOpenDays = openDays ?? (settings?.scheduleOpenDays ?? "1,2,3,4,5").split(",").map(Number);
  const effectiveOpenHour = openHour ?? (settings?.scheduleOpenHour ?? "9");
  const effectiveCloseHour = closeHour ?? (settings?.scheduleCloseHour ?? "18");
  const effectiveStepMin = stepMin ?? (settings?.scheduleStepMin ?? "60");
  const closedDates = (settings?.scheduleClosedDates ?? "").split(",").map(s => s.trim()).filter(Boolean);

  function toggleDay(iso: number) {
    const current = effectiveOpenDays;
    if (current.includes(iso)) setOpenDays(current.filter(d => d !== iso));
    else setOpenDays([...current, iso].sort());
  }

  function addClosedDate() {
    if (!closedDateInput) return;
    const updated = [...new Set([...closedDates, closedDateInput])].sort();
    updateSettings.mutate({ data: { scheduleClosedDates: updated.join(",") } });
    setClosedDateInput("");
  }

  function removeClosedDate(d: string) {
    const updated = closedDates.filter(x => x !== d);
    updateSettings.mutate({ data: { scheduleClosedDates: updated.join(",") } });
  }

  function saveScheduleConfig() {
    updateSettings.mutate({
      data: {
        scheduleOpenDays: effectiveOpenDays.join(","),
        scheduleOpenHour: effectiveOpenHour,
        scheduleCloseHour: effectiveCloseHour,
        scheduleStepMin: effectiveStepMin,
      },
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Agenda de Horários</h1>
        <p className="text-muted-foreground">Configure os dias e horários de atendimento, gere slots e gerencie datas fechadas.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Configuração de Horários */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-primary" />
              Configuração de Horários
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Dias de Atendimento</Label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map(d => (
                  <label key={d.iso} className={[
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-sm transition-colors",
                    effectiveOpenDays.includes(d.iso)
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border text-muted-foreground hover:border-primary/40",
                  ].join(" ")}>
                    <Checkbox
                      checked={effectiveOpenDays.includes(d.iso)}
                      onCheckedChange={() => toggleDay(d.iso)}
                      className="h-3.5 w-3.5"
                    />
                    {d.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Abertura (hora)</Label>
                <Input
                  type="number"
                  min={0} max={23}
                  value={effectiveOpenHour}
                  onChange={e => setOpenHour(e.target.value)}
                  className="text-center"
                />
                <p className="text-xs text-muted-foreground text-center">{effectiveOpenHour}:00</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fechamento (hora)</Label>
                <Input
                  type="number"
                  min={0} max={23}
                  value={effectiveCloseHour}
                  onChange={e => setCloseHour(e.target.value)}
                  className="text-center"
                />
                <p className="text-xs text-muted-foreground text-center">{effectiveCloseHour}:00</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Intervalo (min)</Label>
                <Input
                  type="number"
                  min={15} max={120} step={15}
                  value={effectiveStepMin}
                  onChange={e => setStepMin(e.target.value)}
                  className="text-center"
                />
                <p className="text-xs text-muted-foreground text-center">a cada {effectiveStepMin}min</p>
              </div>
            </div>

            <Button className="w-full" onClick={saveScheduleConfig} disabled={updateSettings.isPending}>
              <Settings2 className="h-4 w-4 mr-2" />
              Salvar Configuração
            </Button>
          </CardContent>
        </Card>

        {/* Datas Fechadas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ban className="h-4 w-4 text-destructive" />
              Dias Fechados / Feriados
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Adicionar data fechada</Label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={closedDateInput}
                  onChange={e => setClosedDateInput(e.target.value)}
                  min={todayISO()}
                  className="flex-1"
                />
                <Button onClick={addClosedDate} disabled={!closedDateInput || updateSettings.isPending} size="sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {closedDates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum dia fechado cadastrado.</p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {closedDates.map(d => (
                  <div key={d} className="flex items-center justify-between px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/20">
                    <span className="text-sm font-medium">
                      {new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
                    </span>
                    <button onClick={() => removeClosedDate(d)} className="text-destructive hover:text-destructive/70 transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Gerar Slots */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            Gerar Horários Automaticamente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="space-y-1.5 flex-1">
              <Label className="text-sm">Data inicial</Label>
              <Input type="date" value={genFrom} onChange={e => setGenFrom(e.target.value)} min={todayISO()} />
            </div>
            <div className="space-y-1.5 flex-1">
              <Label className="text-sm">Data final</Label>
              <Input type="date" value={genTo} onChange={e => setGenTo(e.target.value)} min={genFrom} />
            </div>
            <Button
              onClick={() => generateSlots.mutate({ data: { dateFrom: genFrom, dateTo: genTo } })}
              disabled={generateSlots.isPending || !genFrom || !genTo}
              className="shrink-0"
            >
              <Zap className="h-4 w-4 mr-2" />
              {generateSlots.isPending ? "Gerando..." : "Gerar Horários"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Gera horários conforme a configuração acima para o período selecionado. Slots já existentes são ignorados automaticamente.
          </p>
        </CardContent>
      </Card>

      {/* Adicionar horário manualmente */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            Adicionar Horário Avulso
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              type="datetime-local"
              value={newDatetime}
              onChange={e => setNewDatetime(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={() => { if (newDatetime) { create.mutate({ data: { slotDatetime: new Date(newDatetime).toISOString() } }); } }}
              disabled={!newDatetime || create.isPending}
            >
              Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista de slots agendados */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          Horários Cadastrados ({slots?.length ?? 0})
        </h2>
        {isLoading ? (
          <div className="text-center py-10 text-muted-foreground">Carregando...</div>
        ) : !slots?.length ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-10 text-muted-foreground">
                <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Nenhum horário cadastrado</p>
                <p className="text-sm">Use o botão "Gerar Horários" para criar automaticamente.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {grouped.map(([date, daySlots]) => (
              <Card key={date}>
                <CardHeader className="pb-2 pt-3">
                  <CardTitle className="text-sm capitalize flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-primary" />
                    {date}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-2">
                    {daySlots.map(slot => (
                      <div key={slot.id} className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg bg-muted/30 text-sm">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{new Date(slot.slotDatetime).toLocaleTimeString("pt-BR", { timeZone: BRT, hour: "2-digit", minute: "2-digit" })}</span>
                        <button onClick={() => setDeleteId(slot.id)} className="ml-1 text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover horário?</AlertDialogTitle>
            <AlertDialogDescription>O horário será removido imediatamente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId !== null && del.mutate({ id: deleteId })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
