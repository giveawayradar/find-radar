import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const REMEMBER_KEY = "radar-auth-remember";
let browserClient: SupabaseClient | null = null;

function selectedStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem(REMEMBER_KEY) === "false"
    ? window.sessionStorage
    : window.localStorage;
}

const sharedStorage = {
  getItem(key: string) {
    if (typeof window === "undefined") return null;
    return selectedStorage()?.getItem(key) ?? null;
  },
  setItem(key: string, value: string) {
    if (typeof window === "undefined") return;
    const target = selectedStorage();
    const other = target === window.localStorage ? window.sessionStorage : window.localStorage;
    other.removeItem(key);
    target?.setItem(key, value);
  },
  removeItem(key: string) {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};

export function setRadarRememberMe(remember: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REMEMBER_KEY, String(remember));
}

export function getRadarRememberMe() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(REMEMBER_KEY) !== "false";
}

export function createBrowserSupabaseClient() {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  browserClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: sharedStorage,
      storageKey: "opportunity-radar-auth",
    },
  });

  return browserClient;
}
