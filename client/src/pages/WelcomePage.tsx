import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth";

const CARDS = [
  {
    title: "Obligations",
    text: "What you're required to do right now: registrations, filings, payments, postings, and deadlines.",
  },
  {
    title: "Regulatory Radar",
    text: "New and upcoming law and regulation changes, sorted by whether they affect you.",
  },
  {
    title: "Local Risk",
    text: "Construction, road work, and permitted projects near your address.",
  },
];

export default function WelcomePage() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="py-8">
      <section className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-semibold tracking-wide text-blue-700 uppercase">For Maryland small businesses</p>
        <h1 className="mt-3 text-3xl font-bold text-slate-900 sm:text-4xl">
          Know what your Maryland business owes, what's changing, and what's happening outside your door.
        </h1>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/login?mode=register" className="rounded-md bg-blue-700 px-6 py-3 font-semibold text-white hover:bg-blue-800">
            Get started
          </Link>
          <Link to="/login" className="rounded-md border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-800 hover:bg-slate-50">
            Log in
          </Link>
        </div>
        <p className="mt-4 inline-block rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Try it with the test account: <strong>demo@civicpulse.test</strong> / <strong>demo1234</strong>
        </p>
      </section>

      <section className="mt-12 grid gap-4 md:grid-cols-3">
        {CARDS.map((c) => (
          <div key={c.title} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">{c.title}</h2>
            <p className="mt-2 text-slate-600">{c.text}</p>
          </div>
        ))}
      </section>

      <p className="mt-10 text-center text-sm text-slate-500">
        Works for any Maryland address. Baltimore City and Baltimore County have the deepest local data; other areas show
        clear "coverage limited" notes.
      </p>
    </div>
  );
}
