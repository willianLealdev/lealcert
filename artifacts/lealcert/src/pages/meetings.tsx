import { useState, useMemo, useCallback, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  useListMeetings,
  useCreateMeeting,
  useUpdateMeeting,
  useCancelMeeting,
  useStartMeeting,
  useDeleteMeeting,
  getListMeetingsQueryKey,
  type Meeting,
  type MeetingInput,
  type MeetingUpdate
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  Video, Calendar, Clock, Plus, MoreVertical,
  Copy, X, Trash2, Edit, UserPlus,
  PlayCircle, RefreshCw, XCircle, Users2
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const participantSchema = z.object({
  name: z.string().min(2, "Obrigatório"),
  email: z.string().email("E-mail inválido")
});

const formSchema = z.object({
  title: z.string().min(3, "Título muito curto").max(160, "Título muito longo"),
  description: z.string().max(2000).optional(),
  scheduledAt: z.string().min(1, "Data é obrigatória"),
  durationMinutes: z.coerce.number().min(5).max(480),
  participants: z.array(participantSchema).max(100)
});

type FormValues = z.infer<typeof formSchema>;

const toDatetimeLocal = (isoString?: string) => {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function MeetingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: meetings, isLoading } = useListMeetings();

  const createMutation = useCreateMeeting();
  const updateMutation = useUpdateMeeting();
  const cancelMutation = useCancelMeeting();
  const startMutation = useStartMeeting();
  const deleteMutation = useDeleteMeeting();

  const [formOpen, setFormOpen] = useState(false);
  const [meetingToEdit, setMeetingToEdit] = useState<Meeting | null>(null);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [meetingToDelete, setMeetingToDelete] = useState<Meeting | null>(null);

  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [meetingToCancel, setMeetingToCancel] = useState<Meeting | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      scheduledAt: "",
      durationMinutes: 60,
      participants: []
    }
  });

  const { fields: participants, append: appendParticipant, remove: removeParticipant } = useFieldArray({
    control: form.control,
    name: "participants"
  });

  const openNewForm = useCallback(() => {
    setMeetingToEdit(null);
    form.reset({
      title: "",
      description: "",
      scheduledAt: toDatetimeLocal(new Date(Date.now() + 3600000).toISOString()), // default to 1h from now
      durationMinutes: 60,
      participants: []
    });
    setFormOpen(true);
  }, [form]);

  const openEditForm = useCallback((m: Meeting) => {
    setMeetingToEdit(m);
    form.reset({
      title: m.title,
      description: m.description || "",
      scheduledAt: toDatetimeLocal(m.scheduledAt),
      durationMinutes: m.durationMinutes,
      participants: m.participants.map(p => ({ name: p.name, email: p.email }))
    });
    setFormOpen(true);
  }, [form]);

  const mutateFnRef = useRef(updateMutation.mutate);
  mutateFnRef.current = updateMutation.mutate;

  const createFnRef = useRef(createMutation.mutate);
  createFnRef.current = createMutation.mutate;

  const onFormSubmit = (values: FormValues) => {
    const scheduledAtIso = new Date(values.scheduledAt).toISOString();
    
    if (meetingToEdit) {
      const data: MeetingUpdate = {
        title: values.title,
        description: values.description || null,
        scheduledAt: scheduledAtIso,
        durationMinutes: values.durationMinutes,
        participants: values.participants
      };
      mutateFnRef.current({ id: meetingToEdit.id, data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMeetingsQueryKey() });
          toast({ title: "Reunião atualizada com sucesso!" });
          setFormOpen(false);
        },
        onError: () => {
          toast({ title: "Erro ao atualizar", description: "Verifique os dados e tente novamente.", variant: "destructive" });
        }
      });
    } else {
      const data: MeetingInput = {
        title: values.title,
        description: values.description || null,
        scheduledAt: scheduledAtIso,
        durationMinutes: values.durationMinutes,
        participants: values.participants
      };
      createFnRef.current({ data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMeetingsQueryKey() });
          toast({ title: "Reunião criada com sucesso!" });
          setFormOpen(false);
        },
        onError: () => {
          toast({ title: "Erro ao criar", description: "Verifique os dados e tente novamente.", variant: "destructive" });
        }
      });
    }
  };

  const startMeetingRef = useRef(startMutation.mutate);
  startMeetingRef.current = startMutation.mutate;

  const handleStartOrJoin = (meeting: Meeting) => {
    if (meeting.status === "in_progress") {
      const win = window.open(meeting.joinUrl, "_blank", "noopener,noreferrer");
      if (!win) {
        toast({ title: "Popup bloqueado", description: "Permita popups para acessar a reunião.", variant: "destructive" });
      }
      return;
    }
    
    startMeetingRef.current({ id: meeting.id }, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListMeetingsQueryKey() });
        const url = (data as unknown as Meeting).joinUrl || meeting.joinUrl;
        const win = window.open(url, "_blank", "noopener,noreferrer");
        if (!win) {
          toast({ title: "Popup bloqueado", description: "A reunião foi iniciada. Clique novamente em 'Entrar' e permita popups.", variant: "destructive" });
        }
      },
      onError: () => {
        toast({ title: "Erro", description: "Não foi possível iniciar a reunião.", variant: "destructive" });
      }
    });
  };

  const handleCopyLink = (joinUrl: string) => {
    navigator.clipboard.writeText(joinUrl)
      .then(() => toast({ title: "Link copiado!", description: "O link de convite foi copiado para a área de transferência." }))
      .catch(() => toast({ title: "Erro ao copiar", variant: "destructive" }));
  };

  const deleteMeetingRef = useRef(deleteMutation.mutate);
  deleteMeetingRef.current = deleteMutation.mutate;
  const handleDeleteConfirm = () => {
    if (!meetingToDelete) return;
    deleteMeetingRef.current({ id: meetingToDelete.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMeetingsQueryKey() });
        toast({ title: "Reunião excluída." });
        setDeleteConfirmOpen(false);
      },
      onError: () => toast({ title: "Erro ao excluir.", variant: "destructive" })
    });
  };

  const cancelMeetingRef = useRef(cancelMutation.mutate);
  cancelMeetingRef.current = cancelMutation.mutate;
  const handleCancelConfirm = () => {
    if (!meetingToCancel) return;
    cancelMeetingRef.current({ id: meetingToCancel.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMeetingsQueryKey() });
        toast({ title: "Reunião cancelada." });
        setCancelConfirmOpen(false);
      },
      onError: () => toast({ title: "Erro ao cancelar.", variant: "destructive" })
    });
  };

  const upcoming = useMemo(() => {
    if (!meetings) return [];
    return [...meetings]
      .filter(m => m.status === "scheduled" || m.status === "in_progress")
      .sort((a, b) => {
        if (a.status === "in_progress" && b.status !== "in_progress") return -1;
        if (b.status === "in_progress" && a.status !== "in_progress") return 1;
        return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
      });
  }, [meetings]);

  const history = useMemo(() => {
    if (!meetings) return [];
    return [...meetings]
      .filter(m => m.status === "completed" || m.status === "cancelled")
      .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
  }, [meetings]);

  const renderCard = (meeting: Meeting) => {
    const isPastDate = isPast(new Date(meeting.scheduledAt)) && meeting.status === "scheduled";
    const statusColors = {
      scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800",
      in_progress: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800",
      completed: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700",
      cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
    };
    const statusLabels = {
      scheduled: "Agendada",
      in_progress: "Em Andamento",
      completed: "Concluída",
      cancelled: "Cancelada"
    };

    return (
      <Card key={meeting.id} className="mb-3 hover:shadow-md transition-shadow">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex-1 min-w-0 w-full space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-base sm:text-lg truncate" title={meeting.title}>{meeting.title}</h3>
                <Badge variant="outline" className={statusColors[meeting.status]}>
                  {statusLabels[meeting.status]}
                </Badge>
                {isPastDate && <Badge variant="outline" className="bg-orange-50 text-orange-600 border-orange-200">Atrasada</Badge>}
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5 font-medium text-foreground/80">
                  <Calendar className="h-4 w-4 shrink-0 text-primary/70" />
                  {format(new Date(meeting.scheduledAt), "dd/MM/yyyy", { locale: ptBR })}
                </span>
                <span className="flex items-center gap-1.5 font-medium text-foreground/80">
                  <Clock className="h-4 w-4 shrink-0 text-primary/70" />
                  {format(new Date(meeting.scheduledAt), "HH:mm", { locale: ptBR })} ({meeting.durationMinutes} min)
                </span>
                {meeting.participants.length > 0 && (
                  <span className="flex items-center gap-1.5 font-medium text-foreground/80">
                    <Users2 className="h-4 w-4 shrink-0 text-primary/70" />
                    {meeting.participants.length} convidado{meeting.participants.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              
              {meeting.description && (
                <p className="text-sm text-muted-foreground line-clamp-1 mt-1" title={meeting.description}>
                  {meeting.description}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end mt-2 sm:mt-0">
              {(meeting.status === "scheduled" || meeting.status === "in_progress") && (
                <>
                  <Button 
                    variant={meeting.status === "in_progress" ? "default" : "secondary"}
                    className={meeting.status === "in_progress" ? "bg-accent hover:bg-accent/90 text-accent-foreground font-semibold" : "font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"}
                    onClick={() => handleStartOrJoin(meeting)}
                    disabled={startMutation.isPending}
                  >
                    <PlayCircle className="h-4 w-4 mr-2" />
                    {meeting.status === "in_progress" ? "Entrar na Sala" : "Iniciar Agora"}
                  </Button>
                  <Button 
                    variant="outline" 
                    title="Copiar Link de Convite"
                    onClick={() => handleCopyLink(meeting.joinUrl)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {(meeting.status === "scheduled" || meeting.status === "in_progress") && (
                    <DropdownMenuItem onClick={() => openEditForm(meeting)}>
                      <Edit className="h-4 w-4 mr-2" /> Editar
                    </DropdownMenuItem>
                  )}
                  {(meeting.status === "scheduled" || meeting.status === "in_progress") && (
                    <DropdownMenuItem onClick={() => {
                      setMeetingToCancel(meeting);
                      setCancelConfirmOpen(true);
                    }}>
                      <XCircle className="h-4 w-4 mr-2" /> Cancelar
                    </DropdownMenuItem>
                  )}
                  {isAdmin && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        className="text-destructive focus:text-destructive"
                        onClick={() => {
                          setMeetingToDelete(meeting);
                          setDeleteConfirmOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Excluir
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Agenda de Reuniões</h1>
          <p className="text-muted-foreground mt-1">Gerencie chamadas de vídeo com clientes e equipe.</p>
        </div>
        <Button onClick={openNewForm} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm">
          <Plus className="h-4 w-4 mr-2" /> Nova Reunião
        </Button>
      </div>

      <Tabs defaultValue="upcoming" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="upcoming">
            Próximas <Badge variant="secondary" className="ml-2 bg-background/50 font-mono">{upcoming.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="history">
            Histórico <Badge variant="secondary" className="ml-2 bg-background/50 font-mono">{history.length}</Badge>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="upcoming" className="mt-6">
          {isLoading ? (
            <div className="flex justify-center py-12"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : upcoming.length === 0 ? (
            <Card className="border-dashed border-2 bg-transparent shadow-none">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                <Video className="h-12 w-12 text-muted-foreground/30" />
                <p className="text-lg font-medium text-muted-foreground">Nenhuma reunião programada</p>
                <Button variant="link" onClick={openNewForm} className="text-primary">Agendar uma nova reunião</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-1">
              {upcoming.map(renderCard)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          {isLoading ? (
            <div className="flex justify-center py-12"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : history.length === 0 ? (
            <Card className="border-dashed border-2 bg-transparent shadow-none">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                <Calendar className="h-12 w-12 text-muted-foreground/30" />
                <p className="text-lg font-medium text-muted-foreground">Nenhum histórico disponível</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-1">
              {history.map(renderCard)}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b bg-muted/20">
            <DialogTitle className="text-xl">{meetingToEdit ? "Editar Reunião" : "Nova Reunião"}</DialogTitle>
            <DialogDescription>
              {meetingToEdit ? "Altere os detalhes do agendamento." : "Crie uma nova sala de videoconferência."}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 overflow-y-auto p-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onFormSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Título da Reunião</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Alinhamento de Certificado" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="scheduledAt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data e Hora</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="durationMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Duração</FormLabel>
                        <Select 
                          value={field.value.toString()} 
                          onValueChange={(val) => field.onChange(parseInt(val))}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione a duração" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="15">15 minutos</SelectItem>
                            <SelectItem value="30">30 minutos</SelectItem>
                            <SelectItem value="45">45 minutos</SelectItem>
                            <SelectItem value="60">1 hora</SelectItem>
                            <SelectItem value="90">1h 30m</SelectItem>
                            <SelectItem value="120">2 horas</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descrição (Opcional)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Pauta da reunião, links úteis, etc." className="resize-none h-20" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <p className="text-base font-semibold">Participantes</p>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      onClick={() => appendParticipant({ name: "", email: "" })}
                    >
                      <UserPlus className="h-4 w-4 mr-2" /> Adicionar
                    </Button>
                  </div>
                  
                  {participants.length === 0 && (
                    <div className="text-sm text-muted-foreground p-4 bg-muted/50 rounded-lg text-center border border-dashed">
                      Nenhum participante adicionado. Você poderá compartilhar o link posteriormente.
                    </div>
                  )}

                  <div className="space-y-3">
                    {participants.map((item, index) => (
                      <div key={item.id} className="flex items-start gap-2 bg-muted/30 p-3 rounded-lg border">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1">
                          <FormField
                            control={form.control}
                            name={`participants.${index}.name`}
                            render={({ field }) => (
                              <FormItem className="space-y-1">
                                <FormControl>
                                  <Input placeholder="Nome" {...field} className="h-9 bg-background" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`participants.${index}.email`}
                            render={({ field }) => (
                              <FormItem className="space-y-1">
                                <FormControl>
                                  <Input placeholder="E-mail" type="email" {...field} className="h-9 bg-background" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon" 
                          className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                          onClick={() => removeParticipant(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </form>
            </Form>
          </ScrollArea>
          
          <DialogFooter className="px-6 py-4 border-t bg-muted/20">
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={form.handleSubmit(onFormSubmit)} disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? "Salvando..." : "Salvar Reunião"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirm */}
      <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar reunião?</AlertDialogTitle>
            <AlertDialogDescription>
              A reunião "{meetingToCancel?.title}" será cancelada e os participantes serão notificados (se possuírem e-mail cadastrado).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelConfirm} className="bg-red-600 hover:bg-red-700 text-white font-medium">
              Confirmar Cancelamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirm */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir reunião permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A reunião "{meetingToDelete?.title}" será apagada do sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-medium">
              Excluir Permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
