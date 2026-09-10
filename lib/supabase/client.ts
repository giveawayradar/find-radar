import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

let browserClient: SupabaseClient | undefined;

const REMEMBER_KEY = "radar_remember_me";

export function setRadarRememberMe(remember: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    REMEMBER_KEY,
    remember ? "true" : "false"
  );
}

export function getRadarRememberMe() {
  if (typeof window === "undefined") {
    return true;
  }

  return (
    window.sessionStorage.getItem(
      REMEMBER_KEY
    ) !== "false"
  );
}

const storage = {
  getItem(key: string) {
    if (typeof window === "undefined") {
      return null;
    }

    return (
      window.sessionStorage.getItem(key) ??
      window.localStorage.getItem(key)
    );
  },

  setItem(key: string, value: string) {
    if (typeof window === "undefined") {
      return;
    }

    const remember =
      getRadarRememberMe();

    if (remember) {
      window.localStorage.setItem(
        key,
        value
      );

      window.sessionStorage.removeItem(
        key
      );
    } else {
      window.sessionStorage.setItem(
        key,
        value
      );

      window.localStorage.removeItem(
        key
      );
    }
  },

  removeItem(key: string) {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};

export function createBrowserSupabaseClient() {
  if (browserClient) {
    return browserClient;
  }

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase public environment variables."
    );
  }

  browserClient = createClient(
    url,
    key,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage,
      },
    }
  );

  return browserClient;
}
