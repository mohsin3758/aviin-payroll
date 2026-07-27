'use client';

import { useState, useEffect, useCallback } from 'react';
import { LifeBuoy, Loader2, Plus, Send } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSessionContext } from '@/hooks/session-context';

const STATUS_BADGE: Record<string, string> = {
  open: 'bg-amber-100 text-amber-800 border-amber-200',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-200',
  resolved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  closed: 'bg-gray-100 text-gray-700 border-gray-200',
};

interface Ticket {
  id: string;
  subject: string;
  message: string;
  category: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  employee?: { firstName: string; lastName: string | null; employeeCode: string };
  _count?: { replies: number };
}

interface Reply { id: string; authorName: string; message: string; createdAt: string; }

export default function HelpDeskView() {
  const { user } = useSessionContext();
  const isStaff = user?.role === 'admin' || user?.role === 'hr';

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  const [createOpen, setCreateOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('general');
  const [creating, setCreating] = useState(false);

  const [selected, setSelected] = useState<Ticket | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/helpdesk?${params}`);
      const data = await res.json();
      setTickets(data.data ?? []);
    } catch { toast.error('Failed to load tickets'); } finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const handleCreate = async () => {
    if (!subject.trim() || !message.trim()) { toast.error('Subject and message are required'); return; }
    setCreating(true);
    try {
      const res = await fetch('/api/helpdesk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), message: message.trim(), category }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create ticket');
      toast.success('Ticket raised');
      setCreateOpen(false); setSubject(''); setMessage('');
      fetchTickets();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to create ticket'); } finally { setCreating(false); }
  };

  const openTicket = async (ticket: Ticket) => {
    setSelected(ticket);
    setLoadingThread(true);
    try {
      const res = await fetch(`/api/helpdesk/${ticket.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load ticket');
      setReplies(data.data.replies ?? []);
    } catch { toast.error('Failed to load ticket thread'); } finally { setLoadingThread(false); }
  };

  const handleReply = async () => {
    if (!selected || !replyText.trim()) return;
    setSendingReply(true);
    try {
      const res = await fetch(`/api/helpdesk/${selected.id}/reply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replyText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reply');
      setReplies((prev) => [...prev, data.data]);
      setReplyText('');
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to reply'); } finally { setSendingReply(false); }
  };

  const handleStatusChange = async (status: string) => {
    if (!selected) return;
    try {
      const res = await fetch(`/api/helpdesk/${selected.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update status');
      setSelected(data.data);
      toast.success(`Ticket marked ${status.replace('_', ' ')}`);
      fetchTickets();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to update status'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"><LifeBuoy className="h-5 w-5" /></div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Help Desk</h1>
            <p className="text-sm text-muted-foreground">{isStaff ? 'Manage and respond to employee tickets' : 'Raise a query for HR/Admin'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isStaff && (
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setCreateOpen(true)}><Plus className="size-4" />New Ticket</Button>
            <DialogContent>
              <DialogHeader><DialogTitle>Raise a Ticket</DialogTitle><DialogDescription>HR/Admin will respond as soon as possible.</DialogDescription></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5"><Label>Subject</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="payroll">Payroll</SelectItem>
                      <SelectItem value="leave">Leave</SelectItem>
                      <SelectItem value="it">IT</SelectItem>
                      <SelectItem value="hr">HR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Message</Label><Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={creating} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {creating ? <Loader2 className="size-4 animate-spin" /> : null}Submit
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6"><Skeleton className="h-32 w-full" /></div>
          ) : tickets.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">No tickets yet.</p>
          ) : (
            <div className="divide-y">
              {tickets.map((t) => (
                <button key={t.id} onClick={() => openTicket(t)} className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{t.subject}</span>
                      {isStaff && t.employee && <span className="text-xs text-muted-foreground ml-2">{t.employee.firstName} {t.employee.lastName ?? ''} ({t.employee.employeeCode})</span>}
                    </div>
                    <Badge variant="outline" className={STATUS_BADGE[t.status]}>{t.status.replace('_', ' ')}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">{t.message}</p>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selected.subject}
                  <Badge variant="outline" className={STATUS_BADGE[selected.status]}>{selected.status.replace('_', ' ')}</Badge>
                </DialogTitle>
                <DialogDescription>{selected.message}</DialogDescription>
              </DialogHeader>

              {isStaff && (
                <div className="flex gap-2">
                  {(['open', 'in_progress', 'resolved', 'closed'] as const).map((s) => (
                    <Button key={s} size="sm" variant={selected.status === s ? 'default' : 'outline'} onClick={() => handleStatusChange(s)}>{s.replace('_', ' ')}</Button>
                  ))}
                </div>
              )}

              <Separator />
              <div className="max-h-64 overflow-y-auto space-y-3">
                {loadingThread ? <Skeleton className="h-20 w-full" /> : replies.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No replies yet.</p>
                ) : replies.map((r) => (
                  <div key={r.id} className="text-sm">
                    <div className="flex items-center gap-2"><span className="font-medium">{r.authorName}</span><span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString('en-IN')}</span></div>
                    <p className="text-muted-foreground">{r.message}</p>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Input value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Type a reply…" onKeyDown={(e) => e.key === 'Enter' && handleReply()} />
                <Button onClick={handleReply} disabled={sendingReply || !replyText.trim()}>
                  {sendingReply ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
