import { useEffect, useState } from "react";
import { Plus, Trash2, Pencil, ShieldCheck, UserCheck } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { fmtDate } from "@/lib/meta";

const EMPTY = { name: "", email: "", password: "", role: "user" };

export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await api.get("/users");
    setUsers(data);
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  };

  const openEdit = (u) => {
    setEditing(u);
    setForm({ name: u.name, email: u.email, password: "", role: u.role });
    setOpen(true);
  };

  const submit = async () => {
    setSaving(true);
    try {
      if (editing) {
        const payload = { name: form.name, role: form.role };
        if (form.password) payload.password = form.password;
        await api.put(`/users/${editing.id}`, payload);
        toast.success("User diperbarui");
      } else {
        if (!form.email || !form.password || !form.name) {
          toast.error("Nama, email, dan password wajib diisi");
          setSaving(false);
          return;
        }
        await api.post("/users", form);
        toast.success("User ditambahkan");
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u) => {
    try {
      await api.put(`/users/${u.id}`, { active: !u.active });
      load();
    } catch (e) {
      toast.error(apiErr(e));
    }
  };

  const remove = async (u) => {
    if (!window.confirm(`Hapus user ${u.name}?`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      toast.success("User dihapus");
      load();
    } catch (e) {
      toast.error(apiErr(e));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Manajemen User
          </h1>
          <p className="text-sm text-slate-500 mt-1">Kelola akses Super Admin &amp; marketing bank</p>
        </div>
        <Button onClick={openCreate} className="bg-[#065F46] hover:bg-[#044E38]" data-testid="add-user-btn">
          <Plus className="h-4 w-4 mr-2" /> Tambah User
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto brand-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="px-5 py-3">Nama</th>
                <th className="px-3 py-3">Email</th>
                <th className="px-3 py-3">Peran</th>
                <th className="px-3 py-3">Aktif</th>
                <th className="px-3 py-3 hidden md:table-cell">Dibuat</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50" data-testid={`user-row-${u.id}`}>
                  <td className="px-5 py-3 font-semibold text-slate-900">{u.name}</td>
                  <td className="px-3 py-3 text-slate-600">{u.email}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                        u.role === "super_admin"
                          ? "bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]"
                          : "bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]"
                      }`}
                    >
                      {u.role === "super_admin" ? <ShieldCheck className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                      {u.role === "super_admin" ? "Super Admin" : "Marketing"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <Switch
                      checked={u.active}
                      onCheckedChange={() => toggleActive(u)}
                      disabled={u.id === me?.id}
                      data-testid={`user-active-${u.id}`}
                    />
                  </td>
                  <td className="px-3 py-3 text-slate-500 hidden md:table-cell">{fmtDate(u.created_at)}</td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(u)} data-testid={`edit-user-${u.id}`}>
                        <Pencil className="h-4 w-4 text-slate-500" />
                      </Button>
                      {u.id !== me?.id && (
                        <Button size="icon" variant="ghost" onClick={() => remove(u)} data-testid={`delete-user-${u.id}`}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="user-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit User" : "Tambah User"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nama</Label>
              <Input data-testid="user-form-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                data-testid="user-form-email"
                type="email"
                value={form.email}
                disabled={!!editing}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{editing ? "Password baru (opsional)" : "Password"}</Label>
              <Input
                data-testid="user-form-password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Peran</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger data-testid="user-form-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Marketing (User)</SelectItem>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button onClick={submit} disabled={saving} className="bg-[#065F46] hover:bg-[#044E38]" data-testid="save-user-btn">
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
