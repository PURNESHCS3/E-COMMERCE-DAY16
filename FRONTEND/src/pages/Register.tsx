import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { registerUser } from "../services/auth";
import { getApiErrorMessage } from "../lib/apiError";

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await registerUser(form);
      navigate("/login", { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, "Registration failed."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle>Create an account</CardTitle><p className="mt-1 text-sm text-slate-500">Register using the FastAPI authentication API.</p></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <Input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} />
            <Input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <Input type="password" placeholder="Password (minimum 6 characters)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} />
            {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <Button className="w-full" disabled={submitting}>{submitting ? "Creating account..." : "Register"}</Button>
          </form>
          <p className="mt-5 text-center text-sm text-slate-500">Already registered? <Link className="font-medium text-slate-900 underline" to="/login">Login</Link></p>
        </CardContent>
      </Card>
    </div>
  );
}