import { useState, type FormEvent, type PropsWithChildren } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { useAuth } from "../context/AuthContext";
import { getApiErrorMessage } from "../lib/apiError";

export default function Login() {
  const login = useAuth((state) => state.login);
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(form.email, form.password);
      navigate(location.state?.from || "/account", { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, "Login failed."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard title="Welcome back" subtitle="Login to your ShopHub account.">
      <form onSubmit={submit} className="space-y-4">
        <Input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <Input type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} />
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <Button className="w-full" disabled={submitting}>{submitting ? "Logging in..." : "Login"}</Button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-500">Don't have an account? <Link className="font-medium text-slate-900 underline" to="/register">Register</Link></p>
    </AuthCard>
  );
}

interface AuthCardProps extends PropsWithChildren {
  title: string;
  subtitle: string;
}

function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle>{title}</CardTitle><p className="mt-1 text-sm text-slate-500">{subtitle}</p></CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}