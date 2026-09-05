"use client";

import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { LngLatBounds, Map, Marker, NavigationControl } from "maplibre-gl";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";

type Mode = "lost" | "products" | "restock";
type Screen = "home" | "lost-found";
type ReportType = "lost" | "found";
type Filter = "all" | ReportType | "near";

type Report = {
  id: string;
  type: ReportType;
  title: string;
  category: string;
  description: string;
  date: string;
  time?: string;
  contact: string;
  lat: number;
  lng: number;
  createdAt: number;
  imageDataUrl?: string;
};

type PrivateLocation = {
  lat: number;
  lng: number;
  accuracy?: number;
};

const DEMO_REPORTS: Report[] = [
  {
    id: "demo-poznan-wallet-lost",
    type: "lost",
    title: "Black leather wallet",
    category: "Wallet",
    description: "Black leather wallet with bank cards. Last seen near Plac Wolności in Poznań.",
    date: "2026-09-05",
    time: "18:20",
    contact: "Demo report",
    lat: 52.4077,
    lng: 16.9252,
    createdAt: 4,
  },
  {
    id: "demo-poznan-keys-found",
    type: "found",
    title: "Car keys (Toyota)",
    category: "Keys",
    description: "Toyota key fob found by a tram stop near central Poznań.",
    date: "2026-09-05",
    time: "16:10",
    contact: "Demo report",
    lat: 52.4144,
    lng: 16.9413,
    createdAt: 3,
  },
  {
    id: "demo-poznan-phone",
    type: "lost",
    title: "iPhone 13 (black)",
    category: "Phone",
    description: "Black iPhone in a clear case. Lost while walking through Jeżyce.",
    date: "2026-09-05",
    time: "13:45",
    contact: "Demo report",
    lat: 52.4118,
    lng: 16.8967,
    createdAt: 2,
  },
  {
    id: "demo-poznan-ring",
    type: "found",
    title: "Silver ring",
    category: "Jewellery",
    description: "Plain silver ring found beside a bench near Malta Lake.",
    date: "2026-09-04",
    time: "12:00",
    contact: "Demo report",
    lat: 52.4037,
    lng: 16.9848,
    createdAt: 1,
  },
];

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
  if (report.id.startsWith("demo-")) {
    const labels: Record<string, string> = {
      "demo-poznan-wallet-lost": "2h ago",
      "demo-poznan-keys-found": "5h ago",
      "demo-poznan-phone": "8h ago",
      "demo-poznan-ring": "1d ago",
    };
    return labels[report.id] ?? report.date;
  }
  const elapsed = Date.now() - report.createdAt;
  if (elapsed < 60_000) return "now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  return `${Math.floor(elapsed / 86_400_000)}d ago`;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedMode, setSelectedMode] = useState<Mode | null>(null);
  const [reports, setReports] = useState<Report[]>(DEMO_REPORTS);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [reportFilter, setReportFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [reportType, setReportType] = useState<ReportType>("lost");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Wallet");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
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

  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const draftMarkerRef = useRef<MapLibreMarker | null>(null);
  const privateMarkerRef = useRef<MapLibreMarker | null>(null);
  const placingPinRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    placingPinRef.current = placingPin;
  }, [placingPin]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("find-radar-reports");
      if (stored) {
        const parsed = JSON.parse(stored) as Report[];
        const unique = parsed.filter((p) => !DEMO_REPORTS.some((d) => d.id === p.id));
        setReports([...unique, ...DEMO_REPORTS]);
      }
      const choice = localStorage.getItem("find-radar-location-choice");
      if (choice) setLocationChoiceMade(true);
    } catch {
      // Local persistence is optional.
    }
  }, []);

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
            carto: {
              type: "raster",
              tiles: [
                "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
                "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
                "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
              ],
              tileSize: 512,
              attribution: "© OpenStreetMap contributors © CARTO",
            },
          },
          layers: [
            {
              id: "carto-dark",
              type: "raster",
              source: "carto",
              minzoom: 0,
              maxzoom: 20,
              paint: {
                "raster-saturation": -0.2,
                "raster-contrast": 0.18,
                "raster-brightness-min": 0.015,
                "raster-brightness-max": 0.72,
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
      map.on("click", (event) => {
        if (!placingPinRef.current || !map) return;
        const nextPin = { lat: event.lngLat.lat, lng: event.lngLat.lng };
        setPin(nextPin);
        setPlacingPin(false);
        placingPinRef.current = false;
        draftMarkerRef.current?.remove();
        const element = document.createElement("div");
        element.className = "draftLocationMarker";
        element.innerHTML = "<span></span>";
        draftMarkerRef.current = new Marker({ element, anchor: "center" }).setLngLat([nextPin.lng, nextPin.lat]).addTo(map);
        setModalOpen(true);
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
    el.innerHTML = `<span class="privateHalo"></span><span class="privateDot"></span><div class="privateLabel"><b>You (private)</b><small>Only visible to you</small></div>`;
    privateMarkerRef.current = new Marker({ element: el, anchor: "center" })
      .setLngLat([privateLocation.lng, privateLocation.lat])
      .addTo(map);
  }, [privateLocation, mapReady]);

  const filteredReports = useMemo(() => {
    const term = search.trim().toLowerCase();
    return reports.filter((report) => {
      if (reportFilter === "lost" || reportFilter === "found") {
        if (report.type !== reportFilter) return false;
      }
      if (reportFilter === "near") {
        if (!privateLocation || distanceKm(privateLocation.lat, privateLocation.lng, report.lat, report.lng) > 20) return false;
      }
      if (!term) return true;
      return `${report.title} ${report.category} ${report.description}`.toLowerCase().includes(term);
    });
  }, [reports, reportFilter, search, privateLocation]);

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
    setReportType(type);
    const center = mapRef.current?.getCenter();
    if (privateLocation) setPin({ lat: privateLocation.lat, lng: privateLocation.lng });
    else if (center) setPin({ lat: center.lat, lng: center.lng });
    setModalOpen(true);
  }

  function chooseMapLocation() {
    setModalOpen(false);
    setPlacingPin(true);
    placingPinRef.current = true;
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

  function submitReport(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    const newReport: Report = {
      id: crypto.randomUUID(),
      type: reportType,
      title: title.trim(),
      category,
      description: description.trim(),
      date,
      time,
      contact: contact.trim(),
      lat: pin.lat,
      lng: pin.lng,
      createdAt: Date.now(),
      imageDataUrl: photoPreview ?? undefined,
    };
    const userReports = [newReport, ...reports.filter((r) => !r.id.startsWith("demo-"))];
    try {
      localStorage.setItem("find-radar-reports", JSON.stringify(userReports));
    } catch {
      setPhotoError("The report was added, but this browser could not persist the image locally.");
    }
    setReports((current) => [newReport, ...current]);
    setSelectedReport(newReport);
    setModalOpen(false);
    setTitle("");
    setDescription("");
    setContact("");
    setPhotoPreview(null);
    draftMarkerRef.current?.remove();
    draftMarkerRef.current = null;
    mapRef.current?.flyTo({ center: [newReport.lng, newReport.lat], zoom: 15, duration: 900 });
  }

  if (screen === "home") {
    return (
      <main className="landing">
        <div className="landingGrid" /><div className="landingGlow" />
        <header className="landingHeader"><div className="wordmark"><span className="logoOrb">F</span><span>FIND <b>RADAR</b></span></div><div className="systemPill"><i /> SYSTEM ONLINE</div></header>
        <section className="landingHero"><div className="eyebrow">OPPORTUNITY RADAR / DISCOVERY ENGINE</div><h1>Find what matters.<br/><span>Before it disappears.</span></h1><p>One radar for things you lost, products you want, and stock you refuse to miss.</p></section>
        <section className="modeStage">
          <button className="modePanel lostMode" onClick={() => chooseMode("lost")}><div className="modeNumber">01</div><div className="modeVisual mapVisual"><div className="miniMapLine l1"/><div className="miniMapLine l2"/><div className="miniMapLine l3"/><div className="miniRadar r1"/><div className="miniRadar r2"/><span className="miniPin lostPin">LOST</span><span className="miniPin foundPin">FOUND</span><span className="matchLink" /></div><div className="modeCopy"><span className="modeTag">RECOVER</span><h2>Lost &amp; Found</h2><p>Broadcast a lost or found item and let location + detail matching connect the dots.</p></div><div className="enterMode">ENTER RADAR <span>↗</span></div></button>
          <button className={`modePanel ${selectedMode === "products" ? "selectedSoon" : ""}`} onClick={() => setSelectedMode("products")}><div className="modeNumber">02</div><div className="modeVisual productVisual"><div className="scanCircle c1"/><div className="scanCircle c2"/><div className="scanBeam"/><span className="productCore">95</span><span className="floatingSpec s1">SIZE 42</span><span className="floatingSpec s2">≤ 500 zł</span></div><div className="modeCopy"><span className="modeTag">SEARCH</span><h2>Product Finder</h2><p>Describe exactly what you want. Radar searches stores and marketplaces for the closest match.</p></div><div className="enterMode muted">COMING NEXT <span>↗</span></div></button>
          <button className={`modePanel ${selectedMode === "restock" ? "selectedSoon" : ""}`} onClick={() => setSelectedMode("restock")}><div className="modeNumber">03</div><div className="modeVisual stockVisual"><div className="stockOrbit o1"/><div className="stockOrbit o2"/><div className="stockCenter"><small>WATCHING</small><b>LEGO</b><span>≤ 700 zł</span></div><i className="storeNode n1"/><i className="storeNode n2"/><i className="storeNode n3 active"/><i className="storeNode n4"/></div><div className="modeCopy"><span className="modeTag">MONITOR</span><h2>Restock Watch</h2><p>Set the target once. Radar keeps watch and surfaces the moment availability returns.</p></div><div className="enterMode muted">COMING NEXT <span>↗</span></div></button>
        </section>
      </main>
    );
  }

  return (
    <main className="radarApp">
      <header className="topbar">
        <button className="brandButton" onClick={() => setScreen("home")}><span className="logoOrb">F</span><span className="brandText"><strong>Find Radar</strong><small>Lost &amp; Found</small></span></button>
        <nav className="modeTabs"><button className="active"><span>⌾</span> Lost &amp; Found</button><button onClick={() => { setScreen("home"); setSelectedMode("products"); }}><span>◉</span> Product Finder</button><button onClick={() => { setScreen("home"); setSelectedMode("restock"); }}><span>◌</span> Restock Watch</button></nav>
        <div className="topActions"><button className="iconButton" aria-label="Search">⌕</button><button className="avatarButton">D</button></div>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          <div className="sidebarHero">
            <div className="liveRow"><span className="sectionEyebrow">LOST &amp; FOUND RADAR</span><span className="liveBadge"><i/> LIVE</span></div>
            <h1>Find it <em>again.</em></h1>
            <p>Real people. Real items. A global map for what matters.</p>
          </div>

          <div className="quickActions">
            <button className="lostAction" onClick={() => openReportModal("lost")}><span className="actionIcon">−</span><b>Report Lost</b></button>
            <button className="foundAction" onClick={() => openReportModal("found")}><span className="actionIcon">+</span><b>Report Found</b></button>
          </div>

          <div className="searchBox"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items, locations, or keywords…"/><kbd>Ctrl K</kbd></div>

          <div className="filterRow">
            <div className="segmented">
              {(["all", "lost", "found", "near"] as Filter[]).map((filter) => <button key={filter} className={reportFilter === filter ? "active" : ""} onClick={() => setReportFilter(filter)} disabled={filter === "near" && !privateLocation}>{filter === "all" ? "All" : filter === "near" ? "Near me" : filter[0].toUpperCase() + filter.slice(1)}</button>)}
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
            {filteredReports.length === 0 && <div className="emptySignals"><span>⌁</span><b>No signals found</b><p>Try a different search or filter.</p></div>}
          </div>

          <div className={`privateLocationCard ${privateLocation ? "enabled" : ""}`}>
            <span className="privateLocationIcon">⌖</span>
            <div><b>{privateLocation ? "Your location is private" : "Use your location (private)"}</b><small>{privateLocation ? "Visible only on your screen — never added to public reports." : "See nearby signals. Your exact location stays visible only to you."}</small></div>
            {privateLocation ? <button onClick={disablePrivateLocation}>On</button> : <button onClick={requestPrivateLocation}>Enable</button>}
          </div>

          <div className="sidebarStats"><div><strong>1,482</strong><small>Lost items</small></div><div><strong>1,103</strong><small>Found items</small></div><div><strong>78</strong><small>Countries</small></div></div>
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

          {placingPin && <div className="pinMode"><div className="crosshair">+</div><div><b>Choose the exact location</b><span>Zoom to the street, then click the map.</span></div><button onClick={() => { setPlacingPin(false); placingPinRef.current = false; setModalOpen(true); }}>Cancel</button></div>}
          {locationError && <div className="toast">{locationError}<button onClick={() => setLocationError("")}>×</button></div>}

          {selectedReport && (
            <aside className="reportDrawer">
              <button className="closeDrawer" onClick={() => setSelectedReport(null)}>×</button>
              {selectedReport.imageDataUrl && <img className="drawerPhoto" src={selectedReport.imageDataUrl} alt={selectedReport.title}/>} 
              <div className="drawerStatus"><span className={`statusDot ${selectedReport.type}`}/>{selectedReport.type.toUpperCase()} SIGNAL <small>{selectedReport.date}</small></div>
              <h2>{selectedReport.title}</h2>
              <div className="drawerCategory">{selectedReport.category}</div>
              <p>{selectedReport.description}</p>
              <div className="coordBox"><span>LOCATION</span><b>{selectedReport.lat.toFixed(5)}, {selectedReport.lng.toFixed(5)}</b></div>
              <div className="matchHeader"><span>POSSIBLE MATCHES</span><b>{matches.length}</b></div>
              <div className="matchList">{matches.slice(0, 3).map(({ report, score, distance }) => <button key={report.id} className="matchCard" onClick={() => { setSelectedReport(report); mapRef.current?.flyTo({ center: [report.lng, report.lat], zoom: 15, duration: 700 }); }}><div className="scoreRing" style={{ ["--score" as string]: `${score * 3.6}deg` }}><span>{score}%</span></div><div><b>{report.title}</b><small>{formatDistance(distance)} away · {report.category}</small></div><span>↗</span></button>)}{matches.length === 0 && <div className="noMatches">No strong matches yet. The radar keeps comparing new signals.</div>}</div>
              <button className="contactButton">Reveal contact <span>↗</span></button>
            </aside>
          )}

          <div className="mapBottomBar"><div><span className="pulseDot"/><b>Showing signals worldwide</b><small>{reports.length.toLocaleString()} items on your radar</small></div><div className="bottomActions"><button onClick={showWorld}>World</button><button onClick={() => openReportModal("lost")}>+ Create signal</button></div></div>
        </section>
      </section>

      {locationPromptOpen && (
        <div className="locationConsentBackdrop">
          <div className="locationConsent">
            <div className="consentIcon"><span>⌖</span><i/></div>
            <span className="sectionEyebrow">PRIVATE LOCATION</span>
            <h2>See what&apos;s near you?</h2>
            <p>Find Radar can place <b>you</b> on the map and sort nearby lost &amp; found signals. Your live location is only rendered on your device — it is not published as a report or shared with other users.</p>
            <div className="consentPreview"><span className="miniYou"><i/></span><div><b>You (private)</b><small>Only visible to you</small></div></div>
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
              <label><span>CATEGORY</span><select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label><span>CONTACT <em>optional</em></span><input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Email or preferred contact" /></label>
            </div>

            <button type="button" className="locationPicker" onClick={chooseMapLocation}><span className="locationGlyph">⌖</span><span><small>LOCATION *</small><b>{pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}</b><em>Pick the exact spot on the map</em></span><strong>Change ↗</strong></button>
            {privateLocation && <button type="button" className="useCurrentLocation" onClick={() => setPin({ lat: privateLocation.lat, lng: privateLocation.lng })}>⌾ Use my private current location</button>}

            <div className="dateTimeGrid"><label><span>DATE</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><label><span>TIME</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label></div>
            <div className="privacyNote"><span>◈</span><p><b>Your private live location is never published.</b> Only the location you deliberately choose for this report becomes part of the lost/found signal.</p></div>
            <button className="activateButton" type="submit">Publish {reportType} report <span>↗</span></button>
          </form>
        </div>
      )}
    </main>
  );
}
