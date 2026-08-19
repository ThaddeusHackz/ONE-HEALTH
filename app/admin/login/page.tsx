"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLogin() {
  const [email, setEmail] = useState("admin@ghs.gov.gh");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();
    if (!res.ok) {
      setErr(json.error || "Login failed");
      return;
    }
    router.push("/admin");
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <form onSubmit={(e) => void submit(e)} className="w-full max-w-md rounded-[28px] border border-line bg-white p-8 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ghana-green">Ghana Health Service</p>
        <h1 className="font-display mt-2 text-3xl">Admin CMS</h1>
        <p className="mt-2 text-sm text-muted">Edit every public string, colour, and stored record. Keys never appear in full.</p>
        <label className="mt-6 block text-sm">
          Email
          <input className="mt-1 w-full rounded-2xl border border-line px-3 py-3" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="mt-3 block text-sm">
          Password
          <input type="password" className="mt-1 w-full rounded-2xl border border-line px-3 py-3" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {err && <p className="mt-3 text-sm text-ghana-red">{err}</p>}
        <button className="mt-6 w-full rounded-2xl bg-ink py-3 text-sm font-semibold text-white">Enter the desk</button>
      </form>
    </div>
  );
}
