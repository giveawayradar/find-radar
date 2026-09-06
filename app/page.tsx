"use client";

import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import AuthButton from "@/components/AuthButton";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { LngLatBounds, Map, Marker, NavigationControl } from "maplibre-gl";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";

type Mode = "lost" | "products" | "restock";
type Screen = "home" | "lost-found" | "products";
type ReportType = "lost" | "found";
type Filter = "all" | ReportType | "near" | "mine";

type Report = {
  id: string;
  type: ReportType;
  title: string;
  category: string;
  description: string;
  date: string;
  time?: string;
  lat: number;
  lng: number;
  createdAt: number;
  imageDataUrl?: string;
  userId: string;
};


type Conversation = {
  id: string;
  reportId?: string;
  reportTitle: string;
  ownerUserId: string;
  participantUserId: string;
  createdAt: number;
  updatedAt: number;
};

type ChatMessage = {
  id: string;
  conversationId: string;
  senderUserId: string;
  body: string;
  createdAt: number;
  readAt?: number;
};

type PrivateLocation = {
  lat: number;
  lng: number;
  accuracy?: number;
};

const categories = ["Wallet", "Keys", "Phone", "Bag", "Clothing", "Jewellery", "Electronics", "Documents", "Pet", "Other"];

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateMatchScore(a: Report, b: Report) {
  if (a.type === b.type) return 0;
  let score = a.category === b.category ? 48 : 0;
  const distance = distanceKm(a.lat, a.lng, b.lat, b.lng);
  if (distance < 0.25) score += 35;
  else if (distance < 0.75) score += 31;
  else if (distance < 2) score += 24;
  else if (distance < 5) score += 15;
  else if (distance < 15) score += 6;

  const words = `${a.title} ${a.description}`.toLowerCase().split(/\W+/).filter((word) => word.length >= 4);
  const other = `${b.title} ${b.description}`.toLowerCase();
  score += Math.min(new Set(words.filter((word) => other.includes(word))).size * 6, 16);
  return Math.min(score, 99);
}

function formatDistance(km: number) {
  if (km < 1) return `${Math.max(1, Math.round(km * 1000))} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

function relativeDate(report: Report) {
  const elapsed = Date.now() - report.createdAt;
  if (elapsed < 60_000) return "now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  return `${Math.floor(elapsed / 86_400_000)}d ago`;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [productQuery, setProductQuery] = useState("");
  const [productBudget, setProductBudget] = useState("");
  const [productCurrency, setProductCurrency] = useState("PLN");
  const [productCountry, setProductCountry] = useState("Poland");
  const [productCondition, setProductCondition] = useState("Any");
  const [productMustHave, setProductMustHave] = useState("");
  const [productExclude, setProductExclude] = useState("");
  const [productSources, setProductSources] = useState<string[]>(["stores", "marketplaces"]);
  const [productResults, setProductResults] = useState<Array<{title:string;url:string;source:string;snippet:string;score:number;price?:string;availability?:string;condition?:string;image?:string;brand?:string;verified?:boolean;evidence?:"page"|"listing"|"search";evidenceLabel?:string;reasons?:string[];discoveredBy?:string[]}>>([]);
  const [productStoreSearches, setProductStoreSearches] = useState<Array<{source:string;url:string;label:string}>>([]);
  const [productSearchMeta, setProductSearchMeta] = useState<{query?:string;candidatesDiscovered?:number;storesScanned?:number;providers?:string[];elapsedMs?:number;pageVerified?:number;listingVerified?:number;crossChecked?:number}|null>(null);
  const [productSearching, setProductSearching] = useState(false);
  const [productSearchError, setProductSearchError] = useState("");
  const [productSearched, setProductSearched] = useState(false);
  const [selectedMode, setSelectedMode] = useState<Mode | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [reportFilter, setReportFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [reportType, setReportType] = useState<ReportType>("lost");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Wallet");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(new Date().toTimeString().slice(0, 5));
  const [pin, setPin] = useState({ lat: 52.4064, lng: 16.9252 });
  const [placingPin, setPlacingPin] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [locationError, setLocationError] = useState("");
  const [privateLocation, setPrivateLocation] = useState<PrivateLocation | null>(null);
  const [locationPromptOpen, setLocationPromptOpen] = useState(false);
  const [locationChoiceMade, setLocationChoiceMade] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [mapMode, setMapMode] = useState<"map" | "list">("map");
  const [locationColor, setLocationColor] = useState("#3f8dff");
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [radarSplashOpen, setRadarSplashOpen] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [accountUserId, setAccountUserId] = useState<string | null>(null);
  const [postingError, setPostingError] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [submissionId, setSubmissionId] = useState(() => crypto.randomUUID());
  const [reportsLoading, setReportsLoading] = useState(true);
  const [radarPlus, setRadarPlus] = useState(false);
  const [plusReady, setPlusReady] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const draftMarkerRef = useRef<MapLibreMarker | null>(null);
  const privateMarkerRef = useRef<MapLibreMarker | null>(null);
  const placingPinRef = useRef(false);
  const pinBeforePlacementRef = useRef<{ lat: number; lng: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const publishingRef = useRef(false);

  useEffect(() => {
    placingPinRef.current = placingPin;
  }, [placingPin]);

  useEffect(() => {
    try {
      const choice = localStorage.getItem("find-radar-location-choice");
      if (choice) setLocationChoiceMade(true);
      const savedColor = localStorage.getItem("find-radar-location-color");
      if (savedColor) setLocationColor(savedColor);
      localStorage.removeItem("find-radar-reports");
    } catch {
      // Local preferences are optional.
    }
  }, []);

  useEffect(() => {
    let alive = true;
    async function loadReports() {
      setReportsLoading(true);
      const { data, error } = await supabase
        .from("find_radar_reports")
        .select("id,user_id,type,title,category,description,date,time,lat,lng,created_at,image_data_url")
        .order("created_at", { ascending: false });
      if (!alive) return;
      if (error) {
        console.warn("Find Radar reports unavailable", error.message);
        setReports([]);
        setReportsLoading(false);
        return;
      }
      setReports((data ?? []).map((row) => ({
        id: row.id, userId: row.user_id,
        type: row.type as ReportType, title: row.title, category: row.category,
        description: row.description ?? "", date: row.date, time: row.time ?? undefined,
        lat: Number(row.lat), lng: Number(row.lng),
        createdAt: new Date(row.created_at).getTime(), imageDataUrl: row.image_data_url ?? undefined,
      })));
      setReportsLoading(false);
    }
    void loadReports();
    return () => { alive = false; };
  }, [supabase]);

  useEffect(() => {
    let alive = true;

    async function loadSharedAccount() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;

      setAccountEmail(session?.user?.email ?? null);
      setAccountUserId(session?.user?.id ?? null);

      if (!session?.user) {
        setRadarPlus(false);
        setPlusReady(true);
        return;
      }

      const { data } = await supabase
        .from("radar_plus_memberships")
        .select("status,expires_at")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!alive) return;
      setRadarPlus(
        data?.status === "active" &&
        typeof data.expires_at === "string" &&
        new Date(data.expires_at).getTime() > Date.now()
      );
      setPlusReady(true);
    }

    void loadSharedAccount();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void loadSharedAccount();
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    let alive = true;

    async function loadConversations() {
      if (!accountUserId) {
        setConversations([]);
        setActiveConversation(null);
        setChatMessages([]);
        return;
      }

      const { data, error } = await supabase
        .from("find_radar_conversations")
        .select("id,report_id,report_title,owner_user_id,participant_user_id,created_at,updated_at")
        .or(`owner_user_id.eq.${accountUserId},participant_user_id.eq.${accountUserId}`)
        .order("updated_at", { ascending: false });

      if (!alive) return;
      if (error) {
        console.warn("Find Radar conversations unavailable", error.message);
        setConversations([]);
        return;
      }

      setConversations((data ?? []).map((row) => ({
        id: row.id,
        reportId: row.report_id ?? undefined,
        reportTitle: row.report_title,
        ownerUserId: row.owner_user_id,
        participantUserId: row.participant_user_id,
        createdAt: new Date(row.created_at).getTime(),
        updatedAt: new Date(row.updated_at).getTime(),
      })));
    }

    void loadConversations();
    const timer = window.setInterval(() => void loadConversations(), 5000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [supabase, accountUserId]);

  useEffect(() => {
    if (!activeConversation || !accountUserId || !messagesOpen) return;
    let alive = true;

    async function refreshMessages() {
      const { data, error } = await supabase
        .from("find_radar_messages")
        .select("id,conversation_id,sender_user_id,body,created_at,read_at")
        .eq("conversation_id", activeConversation!.id)
        .order("created_at", { ascending: true });
      if (!alive || error) return;
      setChatMessages((data ?? []).map((row) => ({
        id: row.id,
        conversationId: row.conversation_id,
        senderUserId: row.sender_user_id,
        body: row.body,
        createdAt: new Date(row.created_at).getTime(),
        readAt: row.read_at ? new Date(row.read_at).getTime() : undefined,
      })));
    }

    const timer = window.setInterval(() => void refreshMessages(), 3000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [supabase, activeConversation, accountUserId, messagesOpen]);

  useEffect(() => {
    if (!radarSplashOpen) return;
    const timer = window.setTimeout(() => setRadarSplashOpen(false), 1450);
    return () => window.clearTimeout(timer);
  }, [radarSplashOpen]);

  useEffect(() => {
    if (screen === "lost-found" && !locationChoiceMade && !privateLocation) {
      const timer = window.setTimeout(() => setLocationPromptOpen(true), 450);
      return () => window.clearTimeout(timer);
    }
  }, [screen, locationChoiceMade, privateLocation]);

  useEffect(() => {
    if (screen !== "lost-found" || !mapContainer.current || mapRef.current) return;

    let map: MapLibreMap | null = null;
    try {
      map = new Map({
        container: mapContainer.current,
        center: [16.9252, 52.4064],
        zoom: 10.9,
        minZoom: 1,
        maxZoom: 19,
        attributionControl: {},
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              maxzoom: 19,
              attribution: "© OpenStreetMap contributors",
            },
          },
          layers: [
            {
              id: "osm-dark",
              type: "raster",
              source: "osm",
              minzoom: 0,
              maxzoom: 19,
              paint: {
                "raster-saturation": -0.9,
                "raster-contrast": 0.38,
                "raster-brightness-min": 0.01,
                "raster-brightness-max": 0.28,
              },
            },
          ],
        },
      });

      map.addControl(new NavigationControl({ showCompass: false, showZoom: true }), "top-right");
      map.on("load", () => {
        setMapReady(true);
        requestAnimationFrame(() => map?.resize());
      });
      map.on("error", (event) => {
        console.error("Find Radar map error", event.error);
        setMapError("Map tiles could not load. Check your connection, then refresh.");
      });

      mapRef.current = map;
    } catch (error) {
      console.error(error);
      setMapError("The map engine failed to start. Refresh the page to retry.");
    }

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      privateMarkerRef.current?.remove();
      privateMarkerRef.current = null;
      draftMarkerRef.current?.remove();
      draftMarkerRef.current = null;
      map?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [screen]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || screen !== "lost-found" || !mapReady) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    reports.forEach((report) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = `radarMarker ${report.type}`;
      el.setAttribute("aria-label", `${report.type}: ${report.title}`);
      el.innerHTML = `<span class="radarMarkerPulse"></span><span class="radarMarkerPin"><span class="radarMarkerCore"></span></span>`;
      el.onclick = () => {
        setSelectedReport(report);
        map.flyTo({ center: [report.lng, report.lat], zoom: Math.max(map.getZoom(), 14), duration: 850 });
      };
      markersRef.current.push(new Marker({ element: el, anchor: "bottom" }).setLngLat([report.lng, report.lat]).addTo(map));
    });
  }, [reports, screen, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    privateMarkerRef.current?.remove();
    privateMarkerRef.current = null;
    if (!privateLocation) return;

    const el = document.createElement("div");
    el.className = "privateLocationMarker";
    el.style.setProperty("--private-color", locationColor);
    el.innerHTML = `<span class="privateHalo"></span><span class="privateDot"></span><div class="privateLabel"><b>Your location</b><small><span class="privacyLock">◆</span> Private · only visible to you</small></div>`;
    privateMarkerRef.current = new Marker({ element: el, anchor: "center" })
      .setLngLat([privateLocation.lng, privateLocation.lat])
      .addTo(map);
  }, [privateLocation, mapReady, locationColor]);

  const filteredReports = useMemo(() => {
    const term = search.trim().toLowerCase();
    return reports.filter((report) => {
      if (reportFilter === "lost" || reportFilter === "found") {
        if (report.type !== reportFilter) return false;
      }
      if (reportFilter === "near") {
        if (!privateLocation || distanceKm(privateLocation.lat, privateLocation.lng, report.lat, report.lng) > 20) return false;
      }
      if (reportFilter === "mine") {
        if (!accountUserId || report.userId !== accountUserId) return false;
      }
      if (!term) return true;
      return `${report.title} ${report.category} ${report.description}`.toLowerCase().includes(term);
    });
  }, [reports, reportFilter, search, privateLocation, accountUserId]);

  const matches = useMemo(() => {
    if (!selectedReport) return [];
    return reports
      .filter((report) => report.id !== selectedReport.id)
      .map((report) => ({ report, score: calculateMatchScore(selectedReport, report), distance: distanceKm(selectedReport.lat, selectedReport.lng, report.lat, report.lng) }))
      .filter((result) => result.score >= 30)
      .sort((a, b) => b.score - a.score);
  }, [selectedReport, reports]);

  const lostCount = reports.filter((r) => r.type === "lost").length;
  const foundCount = reports.filter((r) => r.type === "found").length;

  function chooseMode(mode: Mode) {
    if (mode === "lost") {
      setSelectedMode("lost");
      setRadarSplashOpen(true);
      setScreen("lost-found");
      return;
    }
    setSelectedMode(mode);
  }

  function requestPrivateLocation() {
    setLocationError("");
    setLocationPromptOpen(false);
    setLocationChoiceMade(true);
    localStorage.setItem("find-radar-location-choice", "allowed");

    if (!navigator.geolocation) {
      setLocationError("Location is unavailable in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy };
        setPrivateLocation(location);
        setPin({ lat: location.lat, lng: location.lng });
        mapRef.current?.flyTo({ center: [location.lng, location.lat], zoom: 14.3, duration: 1100 });
      },
      () => setLocationError("Location permission was blocked. You can enable it later from the private-location card."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60_000 }
    );
  }

  function declinePrivateLocation() {
    setLocationPromptOpen(false);
    setLocationChoiceMade(true);
    localStorage.setItem("find-radar-location-choice", "declined");
  }

  function disablePrivateLocation() {
    setPrivateLocation(null);
    privateMarkerRef.current?.remove();
    privateMarkerRef.current = null;
    localStorage.setItem("find-radar-location-choice", "declined");
  }


  function chooseLocationColor(color: string) {
    setLocationColor(color);
    localStorage.setItem("find-radar-location-color", color);
    setColorPickerOpen(false);
  }

  function showWorld() {
    mapRef.current?.flyTo({ center: [10, 26], zoom: 1.65, duration: 900 });
    setSelectedReport(null);
  }

  function fitSignals() {
    const map = mapRef.current;
    if (!map || reports.length === 0) return;
    const bounds = new LngLatBounds();
    reports.forEach((r) => bounds.extend([r.lng, r.lat]));
    if (privateLocation) bounds.extend([privateLocation.lng, privateLocation.lat]);
    map.fitBounds(bounds, { padding: 90, maxZoom: 11, duration: 900 });
  }

  function openReportModal(type: ReportType) {
    if (!accountUserId) {
      setPostingError("Log in or sign up to publish a lost/found report.");
      window.setTimeout(() => setPostingError(""), 4200);
      return;
    }
    setPostingError("");
    setSubmissionId(crypto.randomUUID());
    setReportType(type);
    const center = mapRef.current?.getCenter();
    if (privateLocation) setPin({ lat: privateLocation.lat, lng: privateLocation.lng });
    else if (center) setPin({ lat: center.lat, lng: center.lng });
    setModalOpen(true);
  }

  function chooseMapLocation() {
    const map = mapRef.current;
    if (!map) return;
    pinBeforePlacementRef.current = { ...pin };
    setModalOpen(false);
    setPlacingPin(true);
    placingPinRef.current = true;
    draftMarkerRef.current?.remove();

    window.requestAnimationFrame(() => {
      const currentMap = mapRef.current;
      if (!currentMap) return;
      currentMap.resize();
      const element = document.createElement("div");
      element.className = "draftLocationMarker draggable";
      element.innerHTML = '<span></span><i></i><b>DRAG ME</b>';
      const marker = new Marker({ element, anchor: "center", draggable: true })
        .setLngLat([pin.lng, pin.lat])
        .addTo(currentMap);
      marker.setDraggable(true);
      const syncPin = () => {
        const position = marker.getLngLat();
        setPin({ lat: position.lat, lng: position.lng });
      };
      marker.on("dragstart", () => element.classList.add("dragging"));
      marker.on("drag", syncPin);
      marker.on("dragend", () => { element.classList.remove("dragging"); syncPin(); });
      draftMarkerRef.current = marker;
      currentMap.easeTo({ center: [pin.lng, pin.lat], zoom: Math.max(currentMap.getZoom(), 15), duration: 500 });
    });
  }

  function lockMapLocation() {
    const marker = draftMarkerRef.current;
    if (marker) {
      const position = marker.getLngLat();
      setPin({ lat: position.lat, lng: position.lng });
      marker.remove();
      draftMarkerRef.current = null;
    }
    pinBeforePlacementRef.current = null;
    setPlacingPin(false);
    placingPinRef.current = false;
    setModalOpen(true);
  }

  function cancelMapLocation() {
    if (pinBeforePlacementRef.current) {
      setPin(pinBeforePlacementRef.current);
    }
    pinBeforePlacementRef.current = null;
    draftMarkerRef.current?.remove();
    draftMarkerRef.current = null;
    setPlacingPin(false);
    placingPinRef.current = false;
    setModalOpen(true);
  }

  function processPhoto(file?: File) {
    setPhotoError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError("Choose a JPG, PNG or WEBP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError("Image must be under 5 MB for this prototype.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    processPhoto(event.target.files?.[0]);
  }

  function handlePhotoDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    processPhoto(event.dataTransfer.files?.[0]);
  }

  async function submitReport(event: FormEvent) {
    event.preventDefault();

    // A ref blocks double-clicks immediately, before React has time to re-render
    // the disabled button. The submission id gives us a second layer of
    // idempotency in Supabase if the same request is ever retried.
    if (publishingRef.current) return;

    if (!accountUserId) {
      setPostingError("You must be logged in to publish a report.");
      setModalOpen(false);
      return;
    }
    if (!title.trim()) return;

    publishingRef.current = true;
    setIsPublishing(true);
    setPostingError("");

    try {
      const { data, error } = await supabase
        .from("find_radar_reports")
        .upsert({
          client_submission_id: submissionId,
          user_id: accountUserId,
          type: reportType,
          title: title.trim(),
          category,
          description: description.trim(),
          date,
          time: time || null,
          lat: pin.lat,
          lng: pin.lng,
          image_data_url: photoPreview ?? null,
        }, { onConflict: "client_submission_id", ignoreDuplicates: false })
        .select("id,user_id,type,title,category,description,date,time,lat,lng,created_at,image_data_url")
        .single();

      if (error || !data) {
        setPostingError(error?.message || "Could not publish this report.");
        return;
      }

      const newReport: Report = {
        id: data.id,
        userId: data.user_id,
        type: data.type as ReportType,
        title: data.title,
        category: data.category,
        description: data.description ?? "",
        date: data.date,
        time: data.time ?? undefined,
        lat: Number(data.lat),
        lng: Number(data.lng),
        createdAt: new Date(data.created_at).getTime(),
        imageDataUrl: data.image_data_url ?? undefined,
      };

      setReports((current) => [newReport, ...current.filter((item) => item.id !== newReport.id)]);
      setSelectedReport(newReport);
      setModalOpen(false);
      setTitle("");
      setDescription("");
      setPhotoPreview(null);
      setSubmissionId(crypto.randomUUID());
      draftMarkerRef.current?.remove();
      draftMarkerRef.current = null;
      mapRef.current?.flyTo({ center: [newReport.lng, newReport.lat], zoom: 15, duration: 900 });
    } finally {
      publishingRef.current = false;
      setIsPublishing(false);
    }
  }

  async function loadConversationMessages(conversation: Conversation) {
    setActiveConversation(conversation);
    setMessagesOpen(true);
    setChatLoading(true);
    setChatError("");

    const { data, error } = await supabase
      .from("find_radar_messages")
      .select("id,conversation_id,sender_user_id,body,created_at,read_at")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true });

    if (error) {
      setChatError(error.message);
      setChatMessages([]);
      setChatLoading(false);
      return;
    }

    setChatMessages((data ?? []).map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      senderUserId: row.sender_user_id,
      body: row.body,
      createdAt: new Date(row.created_at).getTime(),
      readAt: row.read_at ? new Date(row.read_at).getTime() : undefined,
    })));
    setChatLoading(false);

    if (accountUserId) {
      await supabase
        .from("find_radar_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("conversation_id", conversation.id)
        .neq("sender_user_id", accountUserId)
        .is("read_at", null);
    }
  }

  async function messageReportOwner(report: Report) {
    if (!accountUserId) {
      setPostingError("Log in or sign up to message this Radar account.");
      return;
    }
    if (report.userId === accountUserId) {
      setMessagesOpen(true);
      const related = conversations.filter((conversation) => conversation.reportId === report.id);
      if (related[0]) void loadConversationMessages(related[0]);
      return;
    }

    setChatError("");
    const existing = conversations.find((conversation) =>
      conversation.reportId === report.id && conversation.participantUserId === accountUserId
    );
    if (existing) {
      await loadConversationMessages(existing);
      return;
    }

    const { data, error } = await supabase
      .from("find_radar_conversations")
      .insert({
        report_id: report.id,
        report_title: report.title,
        owner_user_id: report.userId,
        participant_user_id: accountUserId,
      })
      .select("id,report_id,report_title,owner_user_id,participant_user_id,created_at,updated_at")
      .single();

    if (error || !data) {
      setChatError(error?.message || "Could not start this conversation.");
      setMessagesOpen(true);
      return;
    }

    const conversation: Conversation = {
      id: data.id,
      reportId: data.report_id ?? undefined,
      reportTitle: data.report_title,
      ownerUserId: data.owner_user_id,
      participantUserId: data.participant_user_id,
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
    };
    setConversations((current) => [conversation, ...current]);
    setSelectedReport(null);
    await loadConversationMessages(conversation);
  }

  async function sendChatMessage(event: FormEvent) {
    event.preventDefault();
    if (!activeConversation || !accountUserId || !chatDraft.trim()) return;

    const body = chatDraft.trim().slice(0, 1200);
    setChatDraft("");
    const { data, error } = await supabase
      .from("find_radar_messages")
      .insert({
        conversation_id: activeConversation.id,
        sender_user_id: accountUserId,
        body,
      })
      .select("id,conversation_id,sender_user_id,body,created_at,read_at")
      .single();

    if (error || !data) {
      setChatDraft(body);
      setChatError(error?.message || "Could not send this message.");
      return;
    }

    setChatMessages((current) => [...current, {
      id: data.id,
      conversationId: data.conversation_id,
      senderUserId: data.sender_user_id,
      body: data.body,
      createdAt: new Date(data.created_at).getTime(),
      readAt: data.read_at ? new Date(data.read_at).getTime() : undefined,
    }]);

    const now = Date.now();
    setConversations((current) => current
      .map((conversation) => conversation.id === activeConversation.id ? { ...conversation, updatedAt: now } : conversation)
      .sort((a, b) => b.updatedAt - a.updatedAt));
  }

  function toggleProductSource(source: string) {
    setProductSources((current) => current.includes(source) ? current.filter((item) => item !== source) : [...current, source]);
  }

  async function runProductSearch(event?: FormEvent) {
    event?.preventDefault();
    if (!productQuery.trim() || productSearching) return;
    setProductSearching(true);
    setProductSearchError("");
    setProductSearched(true);
    try {
      const response = await fetch("/api/product-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: productQuery.trim(), budget: productBudget.trim(), currency: productCurrency,
          country: productCountry, condition: productCondition, mustHave: productMustHave.trim(),
          exclude: productExclude.trim(), sources: productSources,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Product search failed.");
      setProductResults(Array.isArray(payload.results) ? payload.results : []);
      setProductStoreSearches(Array.isArray(payload.storeSearches) ? payload.storeSearches : []);
      setProductSearchMeta(payload?.meta && typeof payload.meta === "object" ? payload.meta : null);
    } catch (error) {
      setProductResults([]);
      setProductStoreSearches([]);
      setProductSearchMeta(null);
      setProductSearchError(error instanceof Error ? error.message : "Product search failed.");
    } finally { setProductSearching(false); }
  }

  function openProductMode() { setSelectedMode("products"); setScreen("products"); }

  async function deleteReport(report: Report) {
    if (!accountUserId || report.userId !== accountUserId) return;
    if (!window.confirm(`Delete “${report.title}”? This cannot be undone.`)) return;

    const { error } = await supabase
      .from("find_radar_reports")
      .delete()
      .eq("id", report.id)
      .eq("user_id", accountUserId);

    if (error) {
      setPostingError(error.message);
      return;
    }

    setReports((current) => current.filter((item) => item.id !== report.id));
    setSelectedReport((current) => current?.id === report.id ? null : current);
  }

  if (screen === "home") {
    return (
      <main className="landing">
        <div className="landingGrid" /><div className="landingGlow" />
        <header className="landingHeader"><div className="wordmark"><img className="brandLogoImage" src="/find-radar-logo.svg" alt="Find Radar logo"/><span>FIND <b>RADAR</b></span></div><div className="landingHeaderActions"><div className="systemPill"><i /> SYSTEM ONLINE</div><AuthButton /></div></header>
        <section className="landingHero"><div className="eyebrow">OPPORTUNITY RADAR / DISCOVERY ENGINE</div><h1>Find what matters.<br/><span>Before it disappears.</span></h1><p>One radar for things you lost, products you want, and stock you refuse to miss.</p></section>
        <section className="modeStage">
          <button className="modePanel lostMode" onClick={() => chooseMode("lost")}><div className="modeNumber">01</div><div className="modeVisual mapVisual"><div className="miniMapLine l1"/><div className="miniMapLine l2"/><div className="miniMapLine l3"/><div className="miniRadar r1"/><div className="miniRadar r2"/><span className="miniPin lostPin">LOST</span><span className="miniPin foundPin">FOUND</span><span className="matchLink" /></div><div className="modeCopy"><span className="modeTag">RECOVER</span><h2>Lost &amp; Found</h2><p>Broadcast a lost or found item and let location + detail matching connect the dots.</p></div><div className="enterMode">ENTER RADAR <span>↗</span></div></button>
          <button className={`modePanel ${selectedMode === "products" ? "selectedSoon" : ""}`} onClick={openProductMode}><div className="modeNumber">02</div><div className="modeVisual productVisual"><div className="scanCircle c1"/><div className="scanCircle c2"/><div className="scanBeam"/><span className="productCore">95</span><span className="floatingSpec s1">SIZE 42</span><span className="floatingSpec s2">≤ 500 zł</span></div><div className="modeCopy"><span className="modeTag">SEARCH</span><h2>Product Finder</h2><p>Describe exactly what you want. Radar searches stores and marketplaces for the closest match.</p></div><div className="enterMode">ENTER RADAR <span>↗</span></div></button>
          <button className={`modePanel ${selectedMode === "restock" ? "selectedSoon" : ""}`} onClick={() => setSelectedMode("restock")}><div className="modeNumber">03</div><div className="modeVisual stockVisual"><div className="stockOrbit o1"/><div className="stockOrbit o2"/><div className="stockCenter"><small>WATCHING</small><b>LEGO</b><span>≤ 700 zł</span></div><i className="storeNode n1"/><i className="storeNode n2"/><i className="storeNode n3 active"/><i className="storeNode n4"/></div><div className="modeCopy"><span className="modeTag">MONITOR</span><h2>Restock Watch</h2><p>Set the target once. Radar keeps watch and surfaces the moment availability returns.</p></div><div className="enterMode muted">COMING NEXT <span>↗</span></div></button>
        </section>
      </main>
    );
  }

  if (screen === "products") {
    const sourceLabels: Record<string,string> = { stores: "Retail stores", marketplaces: "Marketplaces", secondhand: "Second-hand" };
    return (
      <main className="productApp">
        <div className="productGridBg" />
        <header className="topbar productTopbar">
          <button className="brandButton" onClick={() => setScreen("home")}><img className="brandLogoImage small" src="/find-radar-logo.svg" alt="Find Radar logo"/><span className="brandText"><strong>Find Radar</strong><small>Product Finder</small></span></button>
          <nav className="modeTabs"><button onClick={() => setScreen("lost-found")}><span>⌾</span> Lost &amp; Found</button><button className="active"><span>◉</span> Product Finder</button><button onClick={() => { setScreen("home"); setSelectedMode("restock"); }}><span>◌</span> Restock Watch</button></nav>
          <div className="topActions"><a className={`plusBadge ${radarPlus ? "active" : ""}`} href="https://opportunityradar.site/radar-plus"><span>✦</span>{plusReady && radarPlus ? "RADAR+ ACTIVE" : "Radar Plus"}</a><AuthButton /></div>
        </header>

        <section className="productHero">
          <div><span className="sectionEyebrow">PRODUCT FINDER / LIVE WEB SEARCH</span><h1>Describe it. <em>Radar finds it.</em></h1><p>Turn a messy idea into an exact buying brief, then scan stores and marketplaces for the closest real matches.</p></div>
          <div className="productPulse"><span>SEARCH ENGINE</span><b>{productSearching ? "SCANNING" : "READY"}</b><i className={productSearching ? "spinning" : ""}/></div>
        </section>

        <section className="productWorkspace">
          <form className="productBrief" onSubmit={runProductSearch}>
            <div className="briefHeader"><div><span>01 / TARGET</span><h2>What exactly are you looking for?</h2></div><span className="briefStatus">SPEC BUILDER</span></div>
            <label className="productMainQuery"><span>DESCRIBE THE PRODUCT</span><textarea value={productQuery} onChange={(e)=>setProductQuery(e.target.value)} placeholder="e.g. Black leather men's jacket, minimal branding, real leather, size M, preferably under 700 zł…"/></label>
            <div className="productFieldGrid">
              <label><span>MAX BUDGET</span><div className="fieldPair"><input inputMode="decimal" value={productBudget} onChange={(e)=>setProductBudget(e.target.value.replace(/[^0-9.,]/g,""))} placeholder="No limit"/><select value={productCurrency} onChange={(e)=>setProductCurrency(e.target.value)}><option>PLN</option><option>EUR</option><option>USD</option></select></div></label>
              <label><span>SHOPPING REGION</span><select value={productCountry} onChange={(e)=>setProductCountry(e.target.value)}><option>Poland</option><option>European Union</option><option>Worldwide</option><option>United States</option><option>United Kingdom</option></select></label>
              <label><span>CONDITION</span><select value={productCondition} onChange={(e)=>setProductCondition(e.target.value)}><option>Any</option><option>New only</option><option>Used allowed</option><option>Used only</option></select></label>
            </div>
            <div className="productFieldGrid two">
              <label><span>MUST HAVE</span><input value={productMustHave} onChange={(e)=>setProductMustHave(e.target.value)} placeholder="real leather, size M, black"/></label>
              <label><span>EXCLUDE</span><input value={productExclude} onChange={(e)=>setProductExclude(e.target.value)} placeholder="faux leather, oversized logos"/></label>
            </div>
            <div className="sourcePicker"><span>SEARCH SOURCES</span><div>{Object.entries(sourceLabels).map(([key,label])=><button type="button" key={key} className={productSources.includes(key)?"active":""} onClick={()=>toggleProductSource(key)}><i/>{label}</button>)}</div></div>
            <div className="searchSummary"><div><span>RADAR BRIEF</span><p>{productQuery.trim() || "Your product description will appear here."}</p><small>{productBudget ? `≤ ${productBudget} ${productCurrency}` : "No budget ceiling"} · {productCountry} · {productCondition}</small></div><button className="productSearchButton" disabled={!productQuery.trim() || productSearching}>{productSearching ? <><i/> Scanning the web…</> : <>Run Product Radar <span>↗</span></>}</button></div>
          </form>

          <section className="productResultsPanel">
            <div className="resultsHead"><div><span>02 / RESULTS</span><h2>{productSearching ? "Radar is scanning…" : productSearched ? `${productResults.length} matches surfaced` : "Matches will appear here"}</h2>{!productSearching && productSearched && productSearchMeta && <div className="searchTelemetry"><span>{productSearchMeta.candidatesDiscovered ?? 0} candidates</span><span>{productSearchMeta.storesScanned ?? 0} stores scanned</span><span>{productSearchMeta.elapsedMs ? `${(productSearchMeta.elapsedMs/1000).toFixed(1)}s scan` : ""}</span></div>}</div>{productSearched && !productSearching && <button onClick={()=>void runProductSearch()}>↻ Scan again</button>}</div>
            {productSearchError && <div className="productSearchError"><b>Search engine needs attention</b><p>{productSearchError}</p><small>Find Radar automatically falls back between live web search and retailer-direct searches, so no separate search key is required.</small></div>}
            {!productSearched && <div className="productEmpty"><div className="productRadarArt"><i/><i/><i/><span>◎</span></div><h3>Build a target, not a keyword.</h3><p>The more specific you are about size, price, material, color and exclusions, the stronger the ranking becomes.</p><div className="exampleChips"><button onClick={()=>setProductQuery("Sony WH-1000XM5 headphones, black, new or excellent condition")}>Sony XM5 under budget</button><button onClick={()=>setProductQuery("LEGO Star Wars set, sealed, preferably retired or discounted")}>LEGO Star Wars</button><button onClick={()=>setProductQuery("Men's black leather jacket, real leather, minimal branding, size M")}>Leather jacket</button></div></div>}
            {productSearching && <div className="scanLoading"><div className="scanOrb"><i/></div><b>Scanning stores & marketplaces</b><span>Comparing titles, descriptions and your constraints…</span></div>}
            {!productSearching && productSearched && !productSearchError && productResults.length===0 && <div className="productEmpty"><h3>No trustworthy matches surfaced.</h3><p>Radar scanned multiple discovery layers but could not gather enough evidence for a real listing. The direct store searches below are still available, but they are not scored as matches.</p>{productSearchMeta?.providers?.length ? <small className="providerNote">Scanners reached: {productSearchMeta.providers.join(" · ")}</small> : null}</div>}
            {!productSearching && productResults.length>0 && <><div className="evidenceSummary"><div><span>PAGE VERIFIED</span><b>{productSearchMeta?.pageVerified ?? 0}</b></div><div><span>STORE LISTINGS</span><b>{productSearchMeta?.listingVerified ?? 0}</b></div><div><span>CROSS-CHECKED</span><b>{productSearchMeta?.crossChecked ?? 0}</b></div></div><div className="productResultList">{productResults.map((result,index)=><a className={`productResultCard verifiedProductCard evidence-${result.evidence || "page"}`} href={result.url} target="_blank" rel="noreferrer" key={`${result.url}-${index}`}>{result.image&&<div className="productThumb"><img src={result.image} alt=""/></div>}<div className="matchScore"><b>{result.score}</b><span>MATCH</span></div><div className="resultCopy"><div><span className="resultSource">{result.source}</span><span className={`verifiedBadge ${result.evidence || "page"}`}>{result.evidenceLabel || (result.verified ? "VERIFIED" : "DISCOVERED")}</span>{index===0&&<span className="bestMatch">BEST MATCH</span>}</div><h3>{result.title}</h3><div className="productFacts">{result.price&&<strong>{result.price}</strong>}{result.availability&&<span>{result.availability}</span>}{result.condition&&<span>{result.condition}</span>}</div><p>{result.snippet}</p>{result.reasons&&result.reasons.length>0&&<div className="matchReasons">{result.reasons.map((reason)=><span key={reason}>✓ {reason}</span>)}</div>}{result.discoveredBy&&result.discoveredBy.length>0&&<div className="discoveryTrail">Found via {result.discoveredBy.join(" + ")}</div>}</div><div className="resultOpen"><span>VIEW PRODUCT</span>↗</div></a>)}</div></>}
            {!productSearching && productSearched && productStoreSearches.length>0 && <div className="storeFallback"><div className="storeFallbackHead"><span>DIRECT STORE SEARCHES</span><h3>Still want to look wider?</h3><p>These open the stores' own search pages. They are useful fallbacks, but Find Radar does not call them matches until it can verify an actual product listing.</p></div><div className="storeFallbackGrid">{productStoreSearches.map((item)=><a key={item.source} href={item.url} target="_blank" rel="noreferrer"><b>{item.source}</b><span>{item.label} ↗</span></a>)}</div></div>}
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="radarApp">
      <header className="topbar">
        <button className="brandButton" onClick={() => setScreen("home")}><img className="brandLogoImage small" src="/find-radar-logo.svg" alt="Find Radar logo"/><span className="brandText"><strong>Find Radar</strong><small>Lost &amp; Found</small></span></button>
        <nav className="modeTabs"><button className="active"><span>⌾</span> Lost &amp; Found</button><button onClick={openProductMode}><span>◉</span> Product Finder</button><button onClick={() => { setScreen("home"); setSelectedMode("restock"); }}><span>◌</span> Restock Watch</button></nav>
        <div className="topActions"><a className={`plusBadge ${radarPlus ? "active" : ""}`} href="https://opportunityradar.site/radar-plus"><span>✦</span>{plusReady && radarPlus ? "RADAR+ ACTIVE" : "Radar Plus"}</a>{accountUserId && <button className="messagesButton" onClick={() => { setMessagesOpen(true); setActiveConversation(null); }}>Messages{conversations.length > 0 ? <span>{conversations.length}</span> : null}</button>}<button className="iconButton" aria-label="Search">⌕</button><AuthButton /></div>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          <div className="sidebarHero">
            <div className="liveRow"><span className="sectionEyebrow">LOST &amp; FOUND RADAR</span><span className="liveBadge"><i/> LIVE</span></div>
            <h1>Find it <em>again.</em></h1>
            <p>Real people. Real items. A global map for what matters.</p>
          </div>

          <div className="quickActions">
            <button className="lostAction" onClick={() => openReportModal("lost")}><span className="actionIcon">−</span><b>{accountUserId ? "Report Lost" : "Log in to report"}</b></button>
            <button className="foundAction" onClick={() => openReportModal("found")}><span className="actionIcon">+</span><b>{accountUserId ? "Report Found" : "Log in to report"}</b></button>
          </div>

          <div className="searchBox"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items, locations, or keywords…"/><kbd>Ctrl K</kbd></div>

          <div className="filterRow">
            <div className="segmented">
              {(["all", "lost", "found", "near", "mine"] as Filter[]).map((filter) => <button key={filter} className={reportFilter === filter ? "active" : ""} onClick={() => setReportFilter(filter)} disabled={(filter === "near" && !privateLocation) || (filter === "mine" && !accountUserId)}>{filter === "all" ? "All" : filter === "near" ? "Near me" : filter === "mine" ? "My posts" : filter[0].toUpperCase() + filter.slice(1)}</button>)}
            </div>
            <button className="moreFilter">More⌄</button>
          </div>

          <div className="recentHeader"><h2>Recent Signals</h2><button onClick={fitSignals}>View all →</button></div>

          <div className="signalList">
            {filteredReports.slice(0, 6).map((report) => {
              const distance = privateLocation ? distanceKm(privateLocation.lat, privateLocation.lng, report.lat, report.lng) : null;
              return (
                <button key={report.id} className={`signalCard ${selectedReport?.id === report.id ? "selected" : ""}`} onClick={() => { setSelectedReport(report); mapRef.current?.flyTo({ center: [report.lng, report.lat], zoom: 14, duration: 800 }); }}>
                  <span className={`signalThumb ${report.type}`}>{report.imageDataUrl ? <img src={report.imageDataUrl} alt=""/> : <span>{report.category.slice(0, 1)}</span>}</span>
                  <span className="signalInfo"><span className={`statusPill ${report.type}`}>{report.type.toUpperCase()}</span><b>{report.title}</b><small>Poznań, Poland {distance !== null ? `· ${formatDistance(distance)}` : ""}</small></span>
                  <span className="signalSide"><small>{relativeDate(report)}</small><span>♡</span></span>
                </button>
              );
            })}
            {reportsLoading ? <div className="emptySignals"><span>⌁</span><b>Loading real signals…</b></div> : filteredReports.length === 0 && <div className="emptySignals"><span>⌁</span><b>{reportFilter === "mine" ? "You haven’t posted anything yet" : "No real signals yet"}</b><p>{reportFilter === "mine" ? "Publish a lost or found item and it will appear here." : "Be the first person to publish a genuine lost or found item."}</p></div>}
          </div>

          <div className={`privateLocationCard ${privateLocation ? "enabled" : ""}`}>
            <span className="privateLocationIcon">⌖</span>
            <div><b>{privateLocation ? "Your location is private" : "Use your location (private)"}</b><small>{privateLocation ? "Visible only on your screen — never added to public reports." : "See nearby signals. Your exact location stays visible only to you."}</small></div>
            {privateLocation ? <div className="privateLocationActions"><button className="locationColorButton" onClick={() => setColorPickerOpen(true)} title="Change your private marker color"><i style={{ background: locationColor }}/><span>Color</span></button><button onClick={disablePrivateLocation}>On</button></div> : <button onClick={requestPrivateLocation}>Enable</button>}
          </div>

          <div className="sidebarStats"><div><strong>{lostCount}</strong><small>Lost items</small></div><div><strong>{foundCount}</strong><small>Found items</small></div><div><strong>{accountUserId ? reports.filter((r) => r.userId === accountUserId).length : 0}</strong><small>My posts</small></div></div>
        </aside>

        <section className="mapShell">
          <div ref={mapContainer} className="worldMap" />
          <div className="mapVignette" />
          {!mapReady && !mapError && <div className="mapLoading"><div className="loadingRadar"><i/><i/><span/></div><b>Calibrating world radar</b><small>Loading streets, places and active signals…</small></div>}
          {mapError && <div className="mapError"><b>Map offline</b><span>{mapError}</span><button onClick={() => location.reload()}>Retry map</button></div>}

          <div className="viewSwitch"><button className={mapMode === "map" ? "active" : ""} onClick={() => setMapMode("map")}>▣ Map</button><button className={mapMode === "list" ? "active" : ""} onClick={() => setMapMode("list")}>☷ List</button></div>
          <div className="mapSearch"><span>⌕</span><input placeholder="Search this area…"/><button onClick={fitSignals}>◎</button></div>
          <div className="mapLegend"><b>Signal type</b><span><i className="lost"/>Lost</span><span><i className="found"/>Found</span></div>
          <div className="mapScale">2 km</div>

          {placingPin && <div className="pinMode"><div className="crosshair">⌖</div><div><b>Drag the pin to the exact location</b><span>Move the green point, then lock it in when it&apos;s right.</span></div><div className="pinModeActions"><button className="pinCancel" onClick={cancelMapLocation}>Cancel</button><button className="pinLock" onClick={lockMapLocation}>Lock location</button></div></div>}
          {locationError && <div className="toast">{locationError}<button onClick={() => setLocationError("")}>×</button></div>}
          {postingError && <div className="toast authToast">{postingError}<button onClick={() => setPostingError("")}>×</button></div>}

          {selectedReport && (
            <aside className="reportDrawer">
              <button className="closeDrawer" onClick={() => setSelectedReport(null)}>×</button>
              {selectedReport.imageDataUrl && <img className="drawerPhoto" src={selectedReport.imageDataUrl} alt={selectedReport.title}/>} 
              <div className="drawerStatus"><span className={`statusDot ${selectedReport.type}`}/>{selectedReport.type.toUpperCase()} SIGNAL <small>{selectedReport.date}</small></div>
              <h2>{selectedReport.title}</h2>
              <div className="drawerCategory">{selectedReport.category}</div>
              <p>{selectedReport.description}</p>
              <div className="coordBox"><span>LOCATION</span><b>{selectedReport.lat.toFixed(5)}, {selectedReport.lng.toFixed(5)}</b></div>
              {accountUserId === selectedReport.userId && <div className="ownerTools"><span>YOUR POST</span><button onClick={() => void deleteReport(selectedReport)}>Delete post</button></div>}
              <div className="matchHeader"><span>POSSIBLE MATCHES</span><b>{matches.length}</b></div>
              <div className="matchList">{matches.slice(0, 3).map(({ report, score, distance }) => <button key={report.id} className="matchCard" onClick={() => { setSelectedReport(report); mapRef.current?.flyTo({ center: [report.lng, report.lat], zoom: 15, duration: 700 }); }}><div className="scoreRing" style={{ ["--score" as string]: `${score * 3.6}deg` }}><span>{score}%</span></div><div><b>{report.title}</b><small>{formatDistance(distance)} away · {report.category}</small></div><span>↗</span></button>)}{matches.length === 0 && <div className="noMatches">No strong matches yet. The radar keeps comparing new signals.</div>}</div>
              {accountUserId === selectedReport.userId ? (
                <button className="contactButton" onClick={() => { setMessagesOpen(true); setActiveConversation(null); }}>Messages about this post <span>↗</span></button>
              ) : (
                <button className="contactButton" onClick={() => void messageReportOwner(selectedReport)}>Message owner <span>↗</span></button>
              )}
            </aside>
          )}

          <div className="mapBottomBar"><div><span className="pulseDot"/><b>Showing signals worldwide</b><small>{reports.length.toLocaleString()} items on your radar</small></div><div className="bottomActions"><button onClick={showWorld}>World</button><button onClick={() => openReportModal("lost")}>+ Create signal</button></div></div>
        </section>
      </section>

      {radarSplashOpen && (
        <div className="radarSplash" aria-hidden="true">
          <div className="radarSplashCard">
            <div className="radarSplashLogo">
              <img src="/find-radar-logo.svg" alt=""/>
            </div>
            <div className="radarSplashWordmark"><strong>Find <em>Radar</em></strong><span>LOST &amp; FOUND</span></div>
            <div className="splashProgress"><i/></div>
          </div>
        </div>
      )}

      {colorPickerOpen && (
        <div className="colorPickerBackdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setColorPickerOpen(false); }}>
          <div className="colorPickerPanel">
            <button className="colorPickerClose" onClick={() => setColorPickerOpen(false)}>×</button>
            <span className="sectionEyebrow">PRIVATE MAP MARKER</span>
            <h2>Choose your color</h2>
            <p>This only changes how <b>your private location</b> looks on your own map.</p>
            <div className="colorChoices">
              {["#3f8dff", "#8b5cf6", "#ec4899", "#ef4444", "#f59e0b", "#facc15", "#51f0b4", "#14b8a6", "#38bdf8", "#6366f1", "#8ff7df", "#f4f7f6"].map((color) => (
                <button key={color} className={locationColor === color ? "active" : ""} style={{ ["--swatch" as string]: color }} onClick={() => chooseLocationColor(color)} aria-label={`Use ${color} for my location`}><i/></button>
              ))}
            </div>
            <div className="colorPreview">
              <span className="previewPrivateMarker" style={{ ["--private-color" as string]: locationColor }}><i/></span>
              <div><b>Your location</b><small>Private · only visible to you</small></div>
            </div>
          </div>
        </div>
      )}

      {messagesOpen && (
        <div className="messageBackdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setMessagesOpen(false); }}>
          <section className="messageCenter">
            <aside className="conversationRail">
              <div className="messageRailHead"><div><span>PRIVATE RADAR CHAT</span><h2>Messages</h2></div><button onClick={() => setMessagesOpen(false)}>×</button></div>
              {!accountUserId ? <div className="messageEmpty"><b>Log in to use messages</b><small>Chats are tied to your shared Radar account.</small></div> : conversations.length === 0 ? <div className="messageEmpty"><b>No conversations yet</b><small>Open a Lost or Found post and choose Message owner.</small></div> : <div className="conversationList">{conversations.map((conversation) => {
                const amOwner = conversation.ownerUserId === accountUserId;
                return <button key={conversation.id} className={activeConversation?.id === conversation.id ? "active" : ""} onClick={() => void loadConversationMessages(conversation)}><span className="conversationIcon">◌</span><span><b>{conversation.reportTitle}</b><small>{amOwner ? "Someone messaged about your post" : "Chat with post owner"}</small></span><em>›</em></button>;
              })}</div>}
            </aside>
            <div className="chatPane">
              {!activeConversation ? <div className="chatWelcome"><div className="chatRadar">◌</div><h3>Select a conversation</h3><p>Private messages stay between the two Radar accounts in this chat.</p></div> : <>
                <header className="chatHead"><div><span>{activeConversation.reportId ? "ABOUT THIS SIGNAL" : "POST REMOVED · CHAT KEPT"}</span><h3>{activeConversation.reportTitle}</h3></div><button onClick={() => setActiveConversation(null)}>← Inbox</button></header>
                <div className="chatStream">{chatLoading ? <div className="messageEmpty"><small>Loading messages…</small></div> : chatMessages.length === 0 ? <div className="chatFirst"><b>Start the conversation.</b><small>Keep personal contact details private until you actually want to share them.</small></div> : chatMessages.map((message) => {
                  const mine = message.senderUserId === accountUserId;
                  return <div key={message.id} className={`chatBubbleRow ${mine ? "mine" : "theirs"}`}><div className="chatBubble"><p>{message.body}</p><small>{new Date(message.createdAt).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</small></div></div>;
                })}</div>
                {chatError && <div className="chatError">{chatError}</div>}
                <form className="chatComposer" onSubmit={sendChatMessage}><textarea value={chatDraft} onChange={(e) => setChatDraft(e.target.value)} placeholder="Message this Radar account…" maxLength={1200} rows={2}/><button type="submit" disabled={!chatDraft.trim()}>Send ↗</button></form>
              </>}
            </div>
          </section>
        </div>
      )}

      {locationPromptOpen && (
        <div className="locationConsentBackdrop">
          <div className="locationConsent">
            <div className="consentIcon"><span>⌖</span><i/></div>
            <span className="sectionEyebrow">PRIVATE LOCATION</span>
            <h2>See what&apos;s near you?</h2>
            <p>Find Radar can place <b>you</b> on the map and sort nearby lost &amp; found signals. Your live location is only rendered on your device — it is not published as a report or shared with other users.</p>
            <div className="consentPreview"><span className="miniYou" style={{ ["--private-color" as string]: locationColor }}><i/></span><div><b>Your location</b><small>Private · visible only on this device</small></div></div>
            <button className="allowLocation" onClick={requestPrivateLocation}>Allow my location <span>↗</span></button>
            <button className="notNow" onClick={declinePrivateLocation}>Not now</button>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="modalBackdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <form className="reportModal wideReportModal" onSubmit={submitReport}>
            <div className="modalTop"><div><span className="sectionEyebrow">REPORT AN ITEM</span><h2>{reportType === "lost" ? "Report a lost item" : "Report a found item"}</h2><p>Add a photo and details so Radar can make stronger matches.</p></div><button type="button" onClick={() => setModalOpen(false)}>×</button></div>
            <div className="typeSwitch"><button type="button" className={reportType === "lost" ? "active lost" : ""} onClick={() => setReportType("lost")}>● Lost</button><button type="button" className={reportType === "found" ? "active found" : ""} onClick={() => setReportType("found")}>● Found</button></div>

            <div className="photoSection">
              <span className="fieldLabel">ADD A PHOTO</span>
              <input ref={fileInputRef} className="hiddenFileInput" type="file" accept="image/png,image/jpeg,image/webp" onChange={handlePhotoChange}/>
              {!photoPreview ? (
                <button type="button" className="photoDropzone" onClick={() => fileInputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={handlePhotoDrop}>
                  <span className="photoGlyph">▧</span><b>Drag &amp; drop a photo here</b><small>or click to upload · PNG, JPG, WEBP · max 5MB</small>
                </button>
              ) : (
                <div className="photoPreviewWrap"><img src={photoPreview} alt="Selected item preview"/><div><b>Photo added</b><small>This image will appear on the report.</small><span><button type="button" onClick={() => fileInputRef.current?.click()}>Replace</button><button type="button" onClick={() => setPhotoPreview(null)}>Remove</button></span></div></div>
              )}
              {photoError && <small className="photoError">{photoError}</small>}
            </div>

            <div className="formGrid">
              <label className="span2"><span>ITEM TITLE *</span><input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Black leather wallet" /></label>
              <label className="span2"><span>DESCRIPTION</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brand, colour, unique marks, case, contents…" rows={4}/></label>
              <label className="span2"><span>CATEGORY</span><select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
              <div className="span2 radarMessagingNote"><span>◌</span><div><b>Contact stays private</b><small>People can message your Radar account directly. Your email and phone number are never shown on the post.</small></div></div>
            </div>

            <button type="button" className="locationPicker" onClick={chooseMapLocation}><span className="locationGlyph">⌖</span><span><small>LOCATION *</small><b>{pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}</b><em>Drag the pin, then lock the location</em></span><strong>Change ↗</strong></button>
            {privateLocation && <button type="button" className="useCurrentLocation" onClick={() => setPin({ lat: privateLocation.lat, lng: privateLocation.lng })}>⌾ Use my private current location</button>}

            <div className="dateTimeGrid"><label><span>DATE</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><label><span>TIME</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label></div>
            <div className="privacyNote"><span>◈</span><p><b>Your private live location is never published.</b> Only the location you deliberately choose for this report becomes part of the lost/found signal.</p></div>
            <button className="activateButton" type="submit" disabled={isPublishing} aria-busy={isPublishing}>{isPublishing ? <>Publishing… <span className="publishSpinner">◌</span></> : <>Publish {reportType} report <span>↗</span></>}</button>
          </form>
        </div>
      )}
    </main>
  );
}
