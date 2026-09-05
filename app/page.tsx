"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Map, Marker, NavigationControl, LngLatBounds } from "maplibre-gl";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";

type Mode = "lost" | "products" | "restock";
type Screen = "home" | "lost-found";
type ReportType = "lost" | "found";
type Filter = "all" | ReportType;

type Report = {
  id: string;
  type: ReportType;
  title: string;
  category: string;
  description: string;
  date: string;
  contact: string;
  lat: number;
  lng: number;
  createdAt: number;
};

const GREEN = "#51f0b4";
const GOLD = "#f5b85c";

const DEMO_REPORTS: Report[] = [
  {
    id: "demo-poznan-wallet-lost",
    type: "lost",
    title: "Black leather wallet",
    category: "Wallet",
    description: "Black leather wallet with bank cards. Last seen near Plac Wolności in Poznań.",
    date: "2026-09-05",
    contact: "Demo report",
    lat: 52.4077,
    lng: 16.9252,
    createdAt: 4,
  },
  {
    id: "demo-poznan-wallet-found",
    type: "found",
    title: "Dark wallet",
    category: "Wallet",
    description: "Dark leather wallet found beside a tram stop near the city centre.",
    date: "2026-09-05",
    contact: "Demo report",
    lat: 52.4101,
    lng: 16.9344,
    createdAt: 3,
  },
  {
    id: "demo-london-keys",
    type: "found",
    title: "Keys on silver ring",
    category: "Keys",
    description: "Set of keys found close to Trafalgar Square in central London.",
    date: "2026-09-03",
    contact: "Demo report",
    lat: 51.508,
    lng: -0.1281,
    createdAt: 2,
  },
  {
    id: "demo-ny-phone",
    type: "lost",
    title: "Black phone",
    category: "Phone",
    description: "Black smartphone lost while walking near Times Square, Manhattan.",
    date: "2026-09-02",
    contact: "Demo report",
    lat: 40.758,
    lng: -73.9855,
    createdAt: 1,
  },
];

const categories = [
  "Wallet",
  "Keys",
  "Phone",
  "Bag",
  "Clothing",
  "Jewellery",
  "Electronics",
  "Documents",
  "Pet",
  "Other",
];

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
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

  const words = `${a.title} ${a.description}`
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length >= 4);
  const other = `${b.title} ${b.description}`.toLowerCase();
  const overlap = new Set(words.filter((word) => other.includes(word))).size;
  score += Math.min(overlap * 6, 16);
  return Math.min(score, 99);
}

function formatDistance(km: number) {
  if (km < 1) return `${Math.max(1, Math.round(km * 1000))} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
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
  const [pin, setPin] = useState({ lat: 52.4064, lng: 16.9252 });
  const [placingPin, setPlacingPin] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [locationError, setLocationError] = useState("");

  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const draftMarkerRef = useRef<MapLibreMarker | null>(null);
  const placingPinRef = useRef(false);

  useEffect(() => {
    placingPinRef.current = placingPin;
  }, [placingPin]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("find-radar-reports");
      if (!stored) return;
      const parsed = JSON.parse(stored) as Report[];
      const unique = parsed.filter((p) => !DEMO_REPORTS.some((d) => d.id === p.id));
      setReports([...unique, ...DEMO_REPORTS]);
    } catch {
      // Keep demo reports if local storage is malformed.
    }
  }, []);

  useEffect(() => {
    if (screen !== "lost-found" || !mapContainer.current || mapRef.current) return;

    let map: MapLibreMap | null = null;
    try {
      map = new Map({
        container: mapContainer.current,
        center: [10, 26],
        zoom: 1.65,
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
                "raster-saturation": -0.22,
                "raster-contrast": 0.14,
                "raster-brightness-min": 0.02,
                "raster-brightness-max": 0.78,
              },
            },
          ],
        },
      });

      map.addControl(new NavigationControl({ showCompass: true, showZoom: true }), "bottom-right");
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
        draftMarkerRef.current = new Marker({ element, anchor: "center" })
          .setLngLat([nextPin.lng, nextPin.lat])
          .addTo(map);
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
      draftMarkerRef.current?.remove();
      draftMarkerRef.current = null;
      map?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [screen]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || screen !== "lost-found") return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    reports.forEach((report) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = `radarMarker ${report.type}`;
      el.setAttribute("aria-label", `${report.type}: ${report.title}`);
      el.innerHTML = `<span class="radarMarkerPulse"></span><span class="radarMarkerCore"></span><span class="radarMarkerLabel">${report.type.toUpperCase()}</span>`;
      el.onclick = () => {
        setSelectedReport(report);
        map.flyTo({ center: [report.lng, report.lat], zoom: Math.max(map.getZoom(), 14), duration: 850 });
      };
      const marker = new Marker({ element: el, anchor: "bottom" })
        .setLngLat([report.lng, report.lat])
        .addTo(map);
      markersRef.current.push(marker);
    });
  }, [reports, screen, mapReady]);

  const filteredReports = useMemo(() => {
    const term = search.trim().toLowerCase();
    return reports.filter((report) => {
      if (reportFilter !== "all" && report.type !== reportFilter) return false;
      if (!term) return true;
      return `${report.title} ${report.category} ${report.description}`.toLowerCase().includes(term);
    });
  }, [reports, reportFilter, search]);

  const matches = useMemo(() => {
    if (!selectedReport) return [];
    return reports
      .filter((report) => report.id !== selectedReport.id)
      .map((report) => ({
        report,
        score: calculateMatchScore(selectedReport, report),
        distance: distanceKm(selectedReport.lat, selectedReport.lng, report.lat, report.lng),
      }))
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

  function useMyLocation() {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError("Location is unavailable in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = { lat: position.coords.latitude, lng: position.coords.longitude };
        setPin(location);
        mapRef.current?.flyTo({ center: [location.lng, location.lat], zoom: 14.5, duration: 1000 });
      },
      () => setLocationError("Location permission was blocked. You can still pick a point on the map."),
      { enableHighAccuracy: true, timeout: 8000 }
    );
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
    map.fitBounds(bounds, { padding: 90, maxZoom: 11, duration: 900 });
  }

  function openReportModal(type: ReportType) {
    setReportType(type);
    const center = mapRef.current?.getCenter();
    if (center) setPin({ lat: center.lat, lng: center.lng });
    setModalOpen(true);
  }

  function chooseMapLocation() {
    setModalOpen(false);
    setPlacingPin(true);
    placingPinRef.current = true;
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
      contact: contact.trim(),
      lat: pin.lat,
      lng: pin.lng,
      createdAt: Date.now(),
    };
    const userReports = [newReport, ...reports.filter((r) => !r.id.startsWith("demo-"))];
    localStorage.setItem("find-radar-reports", JSON.stringify(userReports));
    setReports((current) => [newReport, ...current]);
    setSelectedReport(newReport);
    setModalOpen(false);
    setTitle("");
    setDescription("");
    setContact("");
    draftMarkerRef.current?.remove();
    draftMarkerRef.current = null;
    mapRef.current?.flyTo({ center: [newReport.lng, newReport.lat], zoom: 15, duration: 900 });
  }

  if (screen === "home") {
    return (
      <main className="landing">
        <div className="landingGrid" />
        <div className="landingGlow" />
        <header className="landingHeader">
          <div className="wordmark"><span className="logoOrb">F</span><span>FIND <b>RADAR</b></span></div>
          <div className="systemPill"><i /> SYSTEM ONLINE</div>
        </header>

        <section className="landingHero">
          <div className="eyebrow">OPPORTUNITY RADAR / DISCOVERY ENGINE</div>
          <h1>Find what matters.<br/><span>Before it disappears.</span></h1>
          <p>One radar for things you lost, products you want, and stock you refuse to miss.</p>
        </section>

        <section className="modeStage">
          <button className="modePanel lostMode" onClick={() => chooseMode("lost")}> 
            <div className="modeNumber">01</div>
            <div className="modeVisual mapVisual">
              <div className="miniMapLine l1"/><div className="miniMapLine l2"/><div className="miniMapLine l3"/>
              <div className="miniRadar r1"/><div className="miniRadar r2"/>
              <span className="miniPin lostPin">LOST</span><span className="miniPin foundPin">FOUND</span>
              <span className="matchLink" />
            </div>
            <div className="modeCopy"><span className="modeTag">RECOVER</span><h2>Lost &amp; Found</h2><p>Broadcast a lost or found item and let location + detail matching connect the dots.</p></div>
            <div className="enterMode">ENTER RADAR <span>↗</span></div>
          </button>

          <button className={`modePanel ${selectedMode === "products" ? "selectedSoon" : ""}`} onClick={() => setSelectedMode("products")}> 
            <div className="modeNumber">02</div>
            <div className="modeVisual productVisual"><div className="scanCircle c1"/><div className="scanCircle c2"/><div className="scanBeam"/><span className="productCore">95</span><span className="floatingSpec s1">SIZE 42</span><span className="floatingSpec s2">≤ 500 zł</span></div>
            <div className="modeCopy"><span className="modeTag">SEARCH</span><h2>Product Finder</h2><p>Describe exactly what you want. Radar searches stores and marketplaces for the closest match.</p></div>
            <div className="enterMode muted">COMING NEXT <span>↗</span></div>
          </button>

          <button className={`modePanel ${selectedMode === "restock" ? "selectedSoon" : ""}`} onClick={() => setSelectedMode("restock")}> 
            <div className="modeNumber">03</div>
            <div className="modeVisual stockVisual"><div className="stockOrbit o1"/><div className="stockOrbit o2"/><div className="stockCenter"><small>WATCHING</small><b>LEGO</b><span>≤ 700 zł</span></div><i className="storeNode n1"/><i className="storeNode n2"/><i className="storeNode n3 active"/><i className="storeNode n4"/></div>
            <div className="modeCopy"><span className="modeTag">MONITOR</span><h2>Restock Watch</h2><p>Set the target once. Radar keeps watch and surfaces the moment availability returns.</p></div>
            <div className="enterMode muted">COMING NEXT <span>↗</span></div>
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="radarApp">
      <header className="topbar">
        <button className="brandButton" onClick={() => setScreen("home")}>
          <span className="logoOrb">F</span>
          <span className="brandText"><strong>Find Radar</strong><small>Lost &amp; Found</small></span>
        </button>
        <nav className="modeTabs">
          <button className="active"><span>⌖</span> Lost &amp; Found</button>
          <button onClick={() => { setScreen("home"); setSelectedMode("products"); }}><span>◎</span> Product Finder</button>
          <button onClick={() => { setScreen("home"); setSelectedMode("restock"); }}><span>◌</span> Restock Watch</button>
        </nav>
        <div className="topActions">
          <button onClick={fitSignals}>Fit signals</button>
          <button onClick={showWorld}>World</button>
          <button className="primaryGhost" onClick={useMyLocation}>⌖ My location</button>
        </div>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          <div className="sidebarHero">
            <div className="liveRow"><span className="sectionEyebrow">LOST &amp; FOUND RADAR</span><span className="liveBadge"><i/> LIVE</span></div>
            <h1>Find it again.</h1>
            <p>Turn a missing item into a searchable signal. Every report gets mapped, compared and ranked.</p>
          </div>

          <div className="quickActions">
            <button className="lostAction" onClick={() => openReportModal("lost")}><span className="actionIcon">−</span><span><small>REPORT</small><b>I lost something</b></span></button>
            <button className="foundAction" onClick={() => openReportModal("found")}><span className="actionIcon">+</span><span><small>REPORT</small><b>I found something</b></span></button>
          </div>

          <div className="searchBox"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item, category, detail…"/><kbd>⌘ K</kbd></div>

          <div className="filterRow">
            <div className="segmented">
              {(["all", "lost", "found"] as Filter[]).map((filter) => <button key={filter} className={reportFilter === filter ? "active" : ""} onClick={() => setReportFilter(filter)}>{filter === "all" ? "All" : filter[0].toUpperCase() + filter.slice(1)}</button>)}
            </div>
            <span className="resultCount">{filteredReports.length} signals</span>
          </div>

          <div className="signalList">
            {filteredReports.map((report) => (
              <button key={report.id} className={`signalCard ${selectedReport?.id === report.id ? "selected" : ""}`} onClick={() => { setSelectedReport(report); mapRef.current?.flyTo({ center: [report.lng, report.lat], zoom: 14, duration: 800 }); }}>
                <span className={`signalType ${report.type}`}>{report.type === "lost" ? "L" : "F"}</span>
                <span className="signalInfo"><span className="signalMeta"><b>{report.title}</b><small>{report.date}</small></span><small>{report.category} · {report.description}</small></span>
                <span className="signalArrow">↗</span>
              </button>
            ))}
            {filteredReports.length === 0 && <div className="emptySignals"><span>⌁</span><b>No signals found</b><p>Try a different search or filter.</p></div>}
          </div>

          <div className="sidebarStats">
            <div><small>LOST</small><strong>{lostCount}</strong></div><div><small>FOUND</small><strong>{foundCount}</strong></div><div><small>MATCHES</small><strong>{selectedReport ? matches.length : "—"}</strong></div>
          </div>
        </aside>

        <section className="mapShell">
          <div ref={mapContainer} className="worldMap" />
          <div className="mapVignette" />
          {!mapReady && !mapError && <div className="mapLoading"><div className="loadingRadar"><i/><i/><span/></div><b>Calibrating world radar</b><small>Loading streets, places and active signals…</small></div>}
          {mapError && <div className="mapError"><b>Map offline</b><span>{mapError}</span><button onClick={() => location.reload()}>Retry map</button></div>}

          <div className="mapHud topLeft"><span className="hudDot"/> WORLD RADAR <b>{reports.length} SIGNALS</b></div>
          <div className="mapHud topRight"><span className="legendDot lost"/> Lost <span className="legendDot found"/> Found</div>

          {placingPin && <div className="pinMode"><div className="crosshair">+</div><div><b>Choose the exact location</b><span>Zoom to the street, then click the map.</span></div><button onClick={() => { setPlacingPin(false); placingPinRef.current = false; setModalOpen(true); }}>Cancel</button></div>}
          {locationError && <div className="toast">{locationError}<button onClick={() => setLocationError("")}>×</button></div>}

          {selectedReport && (
            <aside className="reportDrawer">
              <button className="closeDrawer" onClick={() => setSelectedReport(null)}>×</button>
              <div className="drawerStatus"><span className={`statusDot ${selectedReport.type}`}/>{selectedReport.type.toUpperCase()} SIGNAL <small>{selectedReport.date}</small></div>
              <h2>{selectedReport.title}</h2>
              <div className="drawerCategory">{selectedReport.category}</div>
              <p>{selectedReport.description}</p>
              <div className="coordBox"><span>LOCATION</span><b>{selectedReport.lat.toFixed(5)}, {selectedReport.lng.toFixed(5)}</b></div>
              <div className="matchHeader"><span>POSSIBLE MATCHES</span><b>{matches.length}</b></div>
              <div className="matchList">
                {matches.slice(0, 3).map(({ report, score, distance }) => (
                  <button key={report.id} className="matchCard" onClick={() => { setSelectedReport(report); mapRef.current?.flyTo({ center: [report.lng, report.lat], zoom: 15, duration: 700 }); }}>
                    <div className="scoreRing" style={{ ["--score" as string]: `${score * 3.6}deg` }}><span>{score}%</span></div>
                    <div><b>{report.title}</b><small>{formatDistance(distance)} away · {report.category}</small></div><span>↗</span>
                  </button>
                ))}
                {matches.length === 0 && <div className="noMatches">No strong matches yet. The radar keeps comparing new signals.</div>}
              </div>
              <button className="contactButton">Reveal contact <span>↗</span></button>
            </aside>
          )}

          <div className="mapBottomBar">
            <div><span className="pulseDot"/><b>Scanning globally</b><small>Street-level map · live matching</small></div>
            <button onClick={() => openReportModal("lost")}>+ Create signal</button>
          </div>
        </section>
      </section>

      {modalOpen && (
        <div className="modalBackdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <form className="reportModal" onSubmit={submitReport}>
            <div className="modalTop"><div><span className="sectionEyebrow">CREATE RADAR SIGNAL</span><h2>{reportType === "lost" ? "What did you lose?" : "What did you find?"}</h2><p>Precise details make the matching engine much stronger.</p></div><button type="button" onClick={() => setModalOpen(false)}>×</button></div>
            <div className="typeSwitch"><button type="button" className={reportType === "lost" ? "active lost" : ""} onClick={() => setReportType("lost")}>− Lost item</button><button type="button" className={reportType === "found" ? "active found" : ""} onClick={() => setReportType("found")}>+ Found item</button></div>
            <div className="formGrid">
              <label className="span2"><span>ITEM NAME</span><input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Black leather wallet" /></label>
              <label><span>CATEGORY</span><select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label><span>DATE</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
              <label className="span2"><span>DETAILS</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Color, brand, unique marks, where you last remember having it…" rows={4}/></label>
              <label className="span2"><span>CONTACT <em>optional</em></span><input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Email, phone or preferred contact method" /></label>
            </div>
            <button type="button" className="locationPicker" onClick={chooseMapLocation}><span className="locationGlyph">⌖</span><span><small>PIN LOCATION</small><b>{pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}</b><em>Choose exact spot on world map</em></span><strong>↗</strong></button>
            <div className="privacyNote"><span>◈</span><p><b>Privacy-aware by design.</b> Exact contact details stay inside the report and can later be gated behind match confirmation.</p></div>
            <button className="activateButton" type="submit">Activate {reportType === "lost" ? "lost" : "found"} signal <span>↗</span></button>
          </form>
        </div>
      )}
    </main>
  );
}
