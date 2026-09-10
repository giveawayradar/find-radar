"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const SITE = "find";
const VISITOR_KEY = "opportunity_radar_visitor_id";

function getVisitorId() {
  if (typeof window === "undefined") {
    return null;
  }

  let visitorId =
    window.localStorage.getItem(VISITOR_KEY);

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
          createBrowserSupabaseClient();

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
            .from("ecosystem_pageviews")
            .insert({
              site: SITE,
              visitor_id: visitorId,
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
