import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import { Field, inputClass } from "../components/ProfileFields";

export default function LoginPage() {
  const { user, hasProfile, loading, login, register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">(params.get("mode") === "register" ? "register" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to={hasProfile ? "/dashboard" : "/setup"} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        const r = await login(email, password);
        navigate(r.hasProfile ? "/dashboard" : "/setup");
      } else {
        await register(name, email, password);
        navigate("/setup");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-8">
      <h1 className="text-2xl font-bold">{mode === "login" ? "Log in" : "Create your account"}</h1>
      <form onSubmit={submit} className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {mode === "register" && (
          <Field label="Your name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          </Field>
        )}
        <Field label="Email">
          <input
            className={inputClass}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </Field>
        <Field label="Password" why={mode === "register" ? "At least 8 characters." : undefined}>
          <input
            className={inputClass}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
          />
        </Field>

        {error && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-blue-700 px-4 py-2.5 font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
        </button>

        {mode === "login" && (
          <button
            type="button"
            onClick={() => {
              setEmail("demo@civicpulse.test");
              setPassword("demo1234");
            }}
            className="w-full rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100"
          >
            Use test account
          </button>
        )}
      </form>

      <p className="mt-4 text-center text-sm text-slate-600">
        {mode === "login" ? "New here? " : "Already have an account? "}
        <button
          className="font-medium text-blue-700 underline"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
        >
          {mode === "login" ? "Create an account" : "Log in"}
        </button>
      </p>
    </div>
  );
}
