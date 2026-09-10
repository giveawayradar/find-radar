"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SITE = "find";
const VISITOR_KEY = "opportunity_radar_visitor_id";

let analyticsClient: SupabaseClient | undefined;

const storage = {
  getItem(key: string) {
    if (typeof window === "undefined") return null;

    return (
      window.sessionStorage.getItem(key) ??
      window.localStorage.getItem(key)
    );
  },

  setItem(key: string, value: string) {
    if (typeof window === "undefined") return;

    const remember =
      window.sessionStorage.getItem("radar_remember_me") !== "false";

    if (remember) {
      window.localStorage.setItem(key, value);
      window.sessionStorage.removeItem(key);
    } else {
      window.sessionStorage.setItem(key, value);
      window.localStorage.removeItem(key);
    }
  },

  removeItem(key: string) {
    if (typeof window === "undefined") return;

    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};

function getSupabase() {
  if (analyticsClient) {
    return analyticsClient;
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

  analyticsClient = createClient(
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

  return analyticsClient;
}

function getVisitorId() {
  if (typeof window === "undefined") {
    return null;
  }

  let visitorId =
    window.localStorage.getItem(
      VISITOR_KEY
    );

  if (!visitorId) {
    visitorId =
      typeof crypto !== "undefined" &&
      "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}`;

    window.localStorage.setItem(
      VISITOR_KEY,
      visitorId
    );
  }

  return visitorId;
}

export default function EcosystemAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;

    async function trackVisit() {
      try {
        const supabase =
          getSupabase();

        const visitorId =
          getVisitorId();

        if (!visitorId) {
          return;
        }

        const {
          data: { session },
        } =
          await supabase.auth.getSession();

        if (cancelled) {
          return;
        }

        const { error } =
          await supabase
            .from(
              "ecosystem_pageviews"
            )
            .insert({
              site: SITE,
              visitor_id:
                visitorId,
              user_id:
                session?.user?.id ??
                null,
              path:
                pathname || "/",
              referrer:
                document.referrer ||
                null,
              source:
                document.referrer
                  ? "referral"
                  : "direct",
              user_agent:
                navigator.userAgent ||
                null,
              is_likely_bot:
                false,
            });

        if (error) {
          console.error(
            "Find Radar analytics error:",
            error.message
          );
        }
      } catch (error) {
        console.error(
          "Find Radar analytics error:",
          error
        );
      }
    }

    void trackVisit();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}
