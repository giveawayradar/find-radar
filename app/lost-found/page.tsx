"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import maplibregl, { Map as MapLibreMap, Marker } from "maplibre-gl";

type ReportType = "lost" | "found";

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

const STARTER_REPORTS: Report[] = [
  {
    id: "demo-1",
    type: "lost",
    title: "Black wallet",
    category: "Wallet",
    description: "Black leather wallet. Possibly lost near the city centre.",
    date: "2026-09-05",
    contact: "Demo report",
    lat: 52.4069,
    lng: 16.9299,
    createdAt: Date.now() - 500000,
  },
  {
    id: "demo-2",
    type: "found",
    title: "Dark leather wallet",
    category: "Wallet",
    description: "Found a dark wallet near a tram stop.",
    date: "2026-09-05",
    contact: "Demo report",
    lat: 52.4102,
    lng: 16.9345,
    createdAt: Date.now() - 300000,
  },
  {
    id: "demo-3",
    type: "found",
    title: "Set of keys",
    category: "Keys",
    description: "Several keys on a silver keyring.",
    date: "2026-09-04",
    contact: "Demo report",
    lat: 52.4028,
    lng: 16.9255,
    createdAt: Date.now() - 800000,
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

function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getMatchScore(a: Report, b: Report) {
  if (a.type === b.type) return 0;

  let score = 0;

  if (a.category === b.category) score += 45;

  const distance = distanceKm(a.lat, a.lng, b.lat, b.lng);

  if (distance < 0.5) score += 35;
  else if (distance < 1) score += 28;
  else if (distance < 3) score += 20;
  else if (distance < 8) score += 10;

  const wordsA = `${a.title} ${a.description}`
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length > 3);

  const wordsB = `${b.title} ${b.description}`.toLowerCase();

  const sharedWords = wordsA.filter((word) => wordsB.includes(word));

  score += Math.min(sharedWords.length * 7, 20);

  return Math.min(score, 99);
}

export default function LostFoundPage() {
  const router = useRouter();

  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);

  const [reports, setReports] = useState<Report[]>(STARTER_REPORTS);
  const [filter, setFilter] = useState<"all" | ReportType>("all");
  const [query, setQuery] = useState("");

  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [reportType, setReportType] = useState<ReportType>("lost");

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Wallet");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [contact, setContact] = useState("");

  const [pin, setPin] = useState({
    lat: 52.4064,
    lng: 16.9252,
  });

  const [placingPin, setPlacingPin] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("find-radar-lost-found");

    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Report[];
        setReports([...STARTER_REPORTS, ...parsed]);
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      center: [16.9252, 52.4064],
      zoom: 13,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: [
              "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            ],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [
          {
            id: "osm",
            type: "raster",
            source: "osm",
            paint: {
              "raster-saturation": -0.9,
              "raster-brightness-max": 0.48,
              "raster-contrast": 0.25,
            },
          },
        ],
      },
    });

    map.addControl(
      new maplibregl.NavigationControl({
        showCompass: false,
      }),
      "bottom-right"
    );

    map.on("click", (event) => {
      if (!placingPin) return;

      setPin({
        lat: event.lngLat.lat,
        lng: event.lngLat.lng,
      });

      setPlacingPin(false);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [placingPin]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    reports.forEach((report) => {
      const element = document.createElement("button");

      element.className = `mapMarker ${report.type}`;

      element.innerHTML = `
        <span></span>
        <small>${report.type === "lost" ? "LOST" : "FOUND"}</small>
      `;

      element.onclick = () => {
        setSelectedReport(report);

        map.flyTo({
          center: [report.lng, report.lat],
          zoom: 16,
          duration: 700,
        });
      };

      const marker = new maplibregl.Marker({
        element,
      })
        .setLngLat([report.lng, report.lat])
        .addTo(map);

      markersRef.current.push(marker);
    });
  }, [reports]);

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      if (filter !== "all" && report.type !== filter) return false;

      if (!query.trim()) return true;

      const haystack = `${report.title} ${report.category} ${report.description}`
        .toLowerCase();

      return haystack.includes(query.toLowerCase());
    });
  }, [reports, filter, query]);

  const possibleMatches = useMemo(() => {
    if (!selectedReport) return [];

    return reports
      .filter((report) => report.id !== selectedReport.id)
      .map((report) => ({
        report,
        score: getMatchScore(selectedReport, report),
      }))
      .filter((match) => match.score >= 30)
      .sort((a, b) => b.score - a.score);
  }, [reports, selectedReport]);

  function useMyLocation() {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition((position) => {
      const next = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };

      setPin(next);

      mapRef.current?.flyTo({
        center: [next.lng, next.lat],
        zoom: 15,
        duration: 900,
      });
    });
  }

  function openReport(type: ReportType) {
    setReportType(type);

    const center = mapRef.current?.getCenter();

    if (center) {
      setPin({
        lat: center.lat,
        lng: center.lng,
      });
    }

    setModalOpen(true);
  }

  function submitReport(event: FormEvent) {
    event.preventDefault();

    if (!title.trim()) return;

    const report: Report = {
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

    const userReports = [
      report,
      ...reports.filter((item) => !item.id.startsWith("demo-")),
    ];

    localStorage.setItem(
      "find-radar-lost-found",
      JSON.stringify(userReports)
    );

    setReports((current) => [report, ...current]);

    setSelectedReport(report);

    setTitle("");
    setDescription("");
    setContact("");
    setModalOpen(false);

    mapRef.current?.flyTo({
      center: [report.lng, report.lat],
      zoom: 16,
      duration: 800,
    });
  }

  return (
    <main className="lfPage">
      <header className="lfTopbar">
        <button className="lfBrand" onClick={() => router.push("/")}>
          <span className="lfBrandMark">F</span>

          <span>
            <strong>Find Radar</strong>
            <small>Lost &amp; Found</small>
          </span>
        </button>

        <nav className="lfTabs">
          <button className="active">⌖ Lost &amp; Found</button>
          <button onClick={() => router.push("/")}>◎ Product Finder</button>
          <button onClick={() => router.push("/")}>◌ Restock Watch</button>
        </nav>

        <button className="locationButton" onClick={useMyLocation}>
          ◎ My location
        </button>
      </header>

      <section className="lfWorkspace">
        <aside className="lfSidebar">
          <div className="lfHeading">
            <div>
              <span className="miniEyebrow">LOST &amp; FOUND RADAR</span>
              <h1>Find it again.</h1>
            </div>

            <span className="onlineBadge">
              <i />
              LIVE
            </span>
          </div>

          <p className="lfIntro">
            Search reports around you or tell the Radar what was lost or
            found.
          </p>

          <div className="reportActions">
            <button
              className="primaryReport"
              onClick={() => openReport("lost")}
            >
              <span>−</span>
              I lost something
            </button>

            <button
              className="secondaryReport"
              onClick={() => openReport("found")}
            >
              <span>+</span>
              I found something
            </button>
          </div>

          <div className="lfSearch">
            <span>⌕</span>

            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Wallet, keys, phone..."
            />
          </div>

          <div className="filterRow">
            <button
              className={filter === "all" ? "active" : ""}
              onClick={() => setFilter("all")}
            >
              All
            </button>

            <button
              className={filter === "lost" ? "active" : ""}
              onClick={() => setFilter("lost")}
            >
              Lost
            </button>

            <button
              className={filter === "found" ? "active" : ""}
              onClick={() => setFilter("found")}
            >
              Found
            </button>
          </div>

          <div className="resultsHeader">
            <span>NEARBY REPORTS</span>
            <strong>{filteredReports.length}</strong>
          </div>

          <div className="reportList">
            {filteredReports.map((report) => (
              <button
                key={report.id}
                className={`reportCard ${
                  selectedReport?.id === report.id ? "selected" : ""
                }`}
                onClick={() => {
                  setSelectedReport(report);

                  mapRef.current?.flyTo({
                    center: [report.lng, report.lat],
                    zoom: 16,
                    duration: 700,
                  });
                }}
              >
                <div className={`reportType ${report.type}`}>
                  {report.type === "lost" ? "LOST" : "FOUND"}
                </div>

                <div className="reportCardBody">
                  <strong>{report.title}</strong>

                  <span>
                    {report.category} · {report.date}
                  </span>

                  <p>{report.description}</p>
                </div>

                <span className="cardArrow">→</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="mapArea">
          <div ref={mapContainer} className="realMap" />

          <div className="mapTopOverlay">
            <div>
              <span className="mapPulse" />
              Searching nearby reports
            </div>

            <span>{reports.length} signals</span>
          </div>

          {placingPin && (
            <div className="placingHint">
              <strong>Choose location</strong>
              <span>Click anywhere on the map</span>
            </div>
          )}

          {selectedReport && (
            <div className="selectedReportPanel">
              <div className="selectedTop">
                <span className={`reportType ${selectedReport.type}`}>
                  {selectedReport.type.toUpperCase()}
                </span>

                <button onClick={() => setSelectedReport(null)}>×</button>
              </div>

              <h2>{selectedReport.title}</h2>

              <div className="selectedMeta">
                {selectedReport.category} · {selectedReport.date}
              </div>

              <p>{selectedReport.description}</p>

              {possibleMatches.length > 0 && (
                <div className="matchSection">
                  <div className="matchTitle">
                    <span>
                      <i />
                      POSSIBLE MATCHES
                    </span>

                    <strong>{possibleMatches.length}</strong>
                  </div>

                  {possibleMatches.slice(0, 3).map(({ report, score }) => (
                    <button
                      key={report.id}
                      className="matchCard"
                      onClick={() => {
                        setSelectedReport(report);

                        mapRef.current?.flyTo({
                          center: [report.lng, report.lat],
                          zoom: 16,
                          duration: 700,
                        });
                      }}
                    >
                      <div>
                        <strong>{report.title}</strong>
                        <span>
                          {report.type.toUpperCase()} · {report.category}
                        </span>
                      </div>

                      <b>{score}%</b>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </section>

      {modalOpen && (
        <div
          className="reportModalBackdrop"
          onMouseDown={() => setModalOpen(false)}
        >
          <form
            className="reportModal"
            onSubmit={submitReport}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modalHeader">
              <div>
                <span className="miniEyebrow">
                  {reportType === "lost"
                    ? "REPORT LOST ITEM"
                    : "REPORT FOUND ITEM"}
                </span>

                <h2>
                  {reportType === "lost"
                    ? "What did you lose?"
                    : "What did you find?"}
                </h2>
              </div>

              <button
                type="button"
                className="modalClose"
                onClick={() => setModalOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="formGrid">
              <label className="full">
                <span>ITEM</span>

                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Black leather wallet"
                  required
                />
              </label>

              <label>
                <span>CATEGORY</span>

                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  {categories.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>DATE</span>

                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>

              <label className="full">
                <span>DETAILS</span>

                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Colour, brand, identifying details, where you last saw it..."
                />
              </label>

              <label className="full">
                <span>CONTACT</span>

                <input
                  value={contact}
                  onChange={(event) => setContact(event.target.value)}
                  placeholder="Email, phone or preferred contact method"
                />
              </label>
            </div>

            <div className="locationPicker">
              <div>
                <span>LOCATION</span>

                <strong>
                  {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
                </strong>
              </div>

              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setPlacingPin(true);
                }}
              >
                Pick on map
              </button>
            </div>

            <button className="submitReport" type="submit">
              <span>Activate report</span>
              <strong>→</strong>
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
