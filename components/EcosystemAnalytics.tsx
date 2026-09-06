"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const SITE = "find";

function getVisitorId() {
  const key = "ecosystem_visitor_id";

  let id = localStorage.getItem(key);

  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }

  return id;
}

function detectSource() {
  const params = new URLSearchParams(window.location.search);

  const utmSource = params.get("utm_source");
  if (utmSource) return utmSource;

  const referrer = document.referrer;

  if (!referrer) return "direct";

  try {
    const host = new URL(referrer).hostname.toLowerCase();

    if (host.includes("tiktok")) return "tiktok";
    if (host.includes("google")) return "google";
    if (host.includes("instagram")) return "instagram";
    if (host.includes("facebook")) return "facebook";
    if (host.includes("reddit")) return "reddit";
    if (host.includes("youtube")) return "youtube";

    return host;
  } catch {
    return "unknown";
  }
}

function looksLikeBot(userAgent: string) {
  return /bot|crawler|spider|headless|preview|facebookexternalhit|slurp|bingpreview/i.test(
    userAgent
  );
}

export default function EcosystemAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    const track = async () => {
      try {
        const supabase = createBrowserSupabaseClient();

        const {
          data: { user },
        } = await supabase.auth.getUser();

        const visitorId = getVisitorId();
        const userAgent = navigator.userAgent;

        await supabase.from("ecosystem_pageviews").insert({
          site: SITE,
          visitor_id: visitorId,
          user_id: user?.id ?? null,
          path: pathname || "/",
          referrer: document.referrer || null,
          source: detectSource(),
          user_agent: userAgent,
          is_likely_bot: looksLikeBot(userAgent),
        });
      } catch {
        // Analytics must never break the site.
      }
    };

    void track();
  }, [pathname]);

  return null;
}
