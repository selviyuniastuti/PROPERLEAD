import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LOGO_URL } from "@/lib/meta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate("/");
  }, [user, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const res = await login(email.trim(), password);
    setLoading(false);
    if (res.ok) {
      toast.success("Berhasil masuk");
      navigate("/");
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[#F8FAFC]">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-between bg-[#0F172A] p-12 text-white relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, #10B981 0, transparent 40%), radial-gradient(circle at 80% 70%, #D97706 0, transparent 40%)",
          }}
        />
        <div className="relative z-10 flex items-center gap-3">
          <img src={LOGO_URL} alt="PROPERLEAD" className="h-16 w-auto rounded-lg bg-white p-2" />
        </div>
        <div className="relative z-10 max-w-md">
          <h1 className="text-3xl font-extrabold tracking-tight leading-tight">
            Mesin Akuisisi Lead Perumahan untuk Marketing Bank
          </h1>
          <p className="text-slate-300 mt-4 text-sm leading-relaxed">
            Deteksi milestone tata ruang &amp; perizinan (RDTR, KKPR/PKKPR) dari OSS, ubah menjadi
            lead terskor, dan kelola follow-up hingga kerjasama dalam satu CRM.
          </p>
          <div className="flex gap-6 mt-8">
            <div>
              <p className="text-2xl font-extrabold text-[#10B981]">KKPR</p>
              <p className="text-xs text-slate-400">Milestone utama</p>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-[#F5C451]">A/B/C</p>
              <p className="text-xs text-slate-400">Lead scoring</p>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-white">6</p>
              <p className="text-xs text-slate-400">Tahap CRM</p>
            </div>
          </div>
        </div>
        <p className="relative z-10 text-xs text-slate-500">
          PROJECT &amp; FINANCE INTELLIGENCE
        </p>
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm fade-up">
          <div className="lg:hidden flex justify-center mb-6">
            <img src={LOGO_URL} alt="PROPERLEAD" className="h-20 w-auto" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900">Masuk</h2>
          <p className="text-sm text-slate-500 mt-1">Portal marketing PROPERLEAD</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                data-testid="login-email"
                placeholder="nama@bank.co.id"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                data-testid="login-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              data-testid="login-submit"
              disabled={loading}
              className="w-full bg-[#065F46] hover:bg-[#044E38] text-white h-11 font-semibold"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Masuk"}
            </Button>
          </form>

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
            <p className="flex items-center gap-1.5 font-semibold text-slate-600">
              <ShieldCheck className="h-3.5 w-3.5" /> Akun demo
            </p>
            <p className="mt-1.5">Marketing: marketing@properlead.id / Marketing2026!</p>
          </div>
        </div>
      </div>
    </div>
  );
}
