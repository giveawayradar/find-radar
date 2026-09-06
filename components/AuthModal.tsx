"use client";

import { FormEvent, useMemo, useState } from "react";
import { createBrowserSupabaseClient, getRadarRememberMe, setRadarRememberMe } from "@/lib/supabase/client";

type AuthMode = "login" | "signup";

export default function AuthModal({ initialMode = "login", onClose }: { initialMode?: AuthMode; onClose: () => void }) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(getRadarRememberMe());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    setRadarRememberMe(remember);

    if (mode === "login") {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) {
        setError(authError.message);
        setBusy(false);
        return;
      }
      onClose();
      return;
    }

    const { data, error: authError } = await supabase.auth.signUp({ email: email.trim(), password });
    if (authError) {
      setError(authError.message);
      setBusy(false);
      return;
    }

    if (data.session) {
      onClose();
      return;
    }

    setMessage("Account created. Check your email if confirmation is required.");
    setBusy(false);
  }

  return (
    <div className="sharedAuthBackdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="sharedAuthModal" onSubmit={submit}>
        <button type="button" className="sharedAuthClose" onClick={onClose}>×</button>
        <div className="sharedAuthBrand"><span className="sharedRadarIcon"><i/><i/></span><div><b>Opportunity Radar</b><small>ONE ACCOUNT · EVERY RADAR</small></div></div>
        <h2>{mode === "login" ? "Welcome back" : "Create your Radar account"}</h2>
        <p>{mode === "login" ? "Log in with the same account you use across the Radar ecosystem." : "One account connects Opportunity Radar, Giveaway Radar, Friend Radar, Save Radar and Find Radar."}</p>
        <div className="sharedAuthTabs"><button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); setMessage(""); }}>Log in</button><button type="button" className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setError(""); setMessage(""); }}>Sign up</button></div>
        <label className="sharedAuthField"><span>Email</span><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" /></label>
        <label className="sharedAuthField"><span>Password</span><input type="password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
        <label className="sharedRemember"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /><span><b>Remember me</b><small>{remember ? "Keep me signed in on this device" : "Sign me out when this browser session ends"}</small></span></label>
        {error && <div className="sharedAuthError">{error}</div>}
        {message && <div className="sharedAuthMessage">{message}</div>}
        <button className="sharedAuthSubmit" disabled={busy}>{busy ? "Connecting…" : mode === "login" ? "Log in" : "Sign up"}<span>↗</span></button>
        <small className="sharedAuthFoot">Shared account powered by the Opportunity Radar Supabase project.</small>
      </form>
    </div>
  );
}
