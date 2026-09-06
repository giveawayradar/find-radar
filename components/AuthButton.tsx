"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import AuthModal from "./AuthModal";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function AuthButton() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [modal, setModal] = useState<"login" | "signup" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!alive) return;
      setSession(nextSession);
      setReady(true);
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    setMenuOpen(false);
  }

  if (!ready) return <div className="sharedAuthLoading">ACCOUNT</div>;

  if (!session?.user) {
    return <div className="sharedAuthButtons"><button className="sharedLoginButton" onClick={() => setModal("login")}>Log in</button><button className="sharedSignupButton" onClick={() => setModal("signup")}>Sign up</button>{modal && <AuthModal initialMode={modal} onClose={() => setModal(null)} />}</div>;
  }

  const email = session.user.email ?? "Radar account";
  return <div className="sharedAccountWrap"><button className="sharedAccountButton" onClick={() => setMenuOpen((open) => !open)}><span className="sharedAccountDot"/><span>{email}</span><b>⌄</b></button>{menuOpen && <div className="sharedAccountMenu"><small>SHARED RADAR ACCOUNT</small><strong>{email}</strong><a href="https://opportunityradar.site/radar-plus">Radar Plus <span>↗</span></a><button onClick={signOut}>Log out</button></div>}</div>;
}
