import { useState } from "react";
import { useListSlots, useCreateSlot, useDeleteSlot } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Calendar, Clock } from "lucide-react";

function groupByDate(slots: Array<{ id: number; slotDatetime: string; active: boolean }>) {
  const map = new Map<string, typeof slots>();
  for (const s of slots) {
    const key = new Date(s.slotDatetime).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  return Array.from(map.entries());
}

export default function AdminSlots() {
  const { toast } = useToast();
  const { data: slots, isLoading, refetch } = useListSlots();
  const [open, setOpen] = useState(false);
  const [datetime, setDatetime] = useState("");
  const [bulkDates, setBulkDates] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const create = useCreateSlot({ mutation: { onSuccess: () => { toast({ title: "Horário adicionado!" }); setDatetime(""); refetch(); } } });
  const del = useDeleteSlot({ mutation: { onSuccess: () => { toast({ title: "Horário removido." }); setDeleteId(null); refetch(); } } });

  async function handleBulkCreate() {
    const lines = bulkDates.trim().split("\n").map(l => l.trim()).filter(Boolean);
    let added = 0;
    for (const line of lines) {
      const dt = new Date(line);
      if (!isNaN(dt.getTime())) {
        create.mutate({ data: { slotDatetime: dt.toISOString() } });
        added++;
      }
    }
    toast({ title: `${added} horários adicionados.` });
    setOpen(false);
    setBulkDates("");
    setTimeout(() => refetch(), 500);
  }

  const grouped = groupByDate(slots ?? []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agenda de Horários</h1>
          <p className="text-muted-foreground">Gerencie os horários disponíveis para agendamento.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />Adicionar Horários</Button>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground">Carregando...</div>
      ) : !slots?.length ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-10 text-muted-foreground">
              <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhum horário disponível</p>
              <p className="text-sm">Adicione horários para que os contadores possam agendar atendimentos.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, daySlots]) => (
            <Card key={date}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base capitalize flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  {date}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {daySlots.map(slot => (
                    <div key={slot.id} className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg bg-muted/30 text-sm">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{new Date(slot.slotDatetime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Adicionar Horários</DialogTitle></DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Horário único</Label>
              <div className="flex gap-2">
                <Input type="datetime-local" value={datetime} onChange={e => setDatetime(e.target.value)} className="flex-1" />
                <Button onClick={() => { if (datetime) { create.mutate({ data: { slotDatetime: new Date(datetime).toISOString() } }); refetch(); }}} disabled={!datetime || create.isPending}>
                  Adicionar
                </Button>
              </div>
            </div>
            <div className="border-t pt-4 space-y-2">
              <Label>Em lote (um por linha)</Label>
              <textarea
                className="w-full rounded-md border bg-muted/30 px-3 py-2 text-sm font-mono h-28 resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                value={bulkDates}
                onChange={e => setBulkDates(e.target.value)}
                placeholder={"2026-05-20T09:00\n2026-05-20T11:00\n2026-05-20T14:00"}
              />
              <Button className="w-full" onClick={handleBulkCreate} disabled={!bulkDates.trim()}>
                Adicionar em Lote
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover horário?</AlertDialogTitle>
            <AlertDialogDescription>O horário será removido imediatamente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId !== null && del.mutate({ id: deleteId })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
