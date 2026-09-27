import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import { IconLogo } from "../components/icons";
import { Field, inputClass } from "../components/ProfileFields";
import { buttonStyles } from "../components/ui";

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
    <div className="mx-auto max-w-md py-6 sm:py-10">
      <div className="text-center">
        <IconLogo className="mx-auto text-5xl text-brand-600" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className="mt-1 text-slate-600">{mode === "login" ? "Log in to see your business's obligations." : "It takes about 3 minutes to set up."}</p>
      </div>

      <div className="mt-8 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-lift sm:p-8">
        <div className="mb-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`rounded-lg py-2 transition ${mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {m === "login" ? "Log in" : "Sign up"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === "register" && (
            <Field label="Your name">
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </Field>
          )}
          <Field label="Email">
            <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
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
            <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className={`${buttonStyles.primary} w-full py-3 text-base`}>
            {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        {mode === "login" && (
          <div className="mt-6 rounded-xl border border-dashed border-amber-300 bg-amber-50/70 p-4 text-center">
            <p className="text-sm text-amber-900">
              Just looking? Use the test account <strong>demo@regwise.test</strong>
            </p>
            <button
              type="button"
              onClick={() => {
                setEmail("demo@regwise.test");
                setPassword("RegWise-tZnc-oecR-7jbE");
              }}
              className="mt-2 text-sm font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-700"
            >
              Fill in the test account
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
