"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";

type Mode = "lost" | "products" | "restock";
type Screen = "home" | "lost-found";
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

const DEMO_REPORTS: Report[] = [
  {
    id: "demo-poznan-wallet-lost",
    type: "lost",
    title: "Black leather wallet",
    category: "Wallet",
    description: "Black wallet with cards inside. Lost near the city centre.",
    date: "2026-09-05",
    contact: "Demo",
    lat: 52.4064,
    lng: 16.9252,
    createdAt: 1,
  },
  {
    id: "demo-poznan-wallet-found",
    type: "found",
    title: "Dark wallet",
    category: "Wallet",
    description: "Dark leather wallet found close to a tram stop.",
    date: "2026-09-05",
    contact: "Demo",
    lat: 52.4102,
    lng: 16.9345,
    createdAt: 2,
  },
  {
    id: "demo-london-keys",
    type: "found",
    title: "Keys on silver ring",
    category: "Keys",
    description: "Set of keys found near central London.",
    date: "2026-09-03",
    contact: "Demo",
    lat: 51.5074,
    lng: -0.1278,
    createdAt: 3,
  },
  {
    id: "demo-ny-phone",
    type: "lost",
    title: "Black phone",
    category: "Phone",
    description: "Black smartphone lost while walking through Manhattan.",
    date: "2026-09-02",
    contact: "Demo",
    lat: 40.758,
    lng: -73.9855,
    createdAt: 4,
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
  const earth = 6371;

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;

  return (
    earth *
    2 *
    Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  );
}

function calculateMatchScore(a: Report, b: Report) {
  if (a.type === b.type) return 0;

  let score = 0;

  if (a.category === b.category) {
    score += 45;
  }

  const distance = distanceKm(
    a.lat,
    a.lng,
    b.lat,
    b.lng
  );

  if (distance < 0.25) score += 35;
  else if (distance < 0.75) score += 30;
  else if (distance < 2) score += 23;
  else if (distance < 5) score += 14;
  else if (distance < 15) score += 5;

  const wordsA = `${a.title} ${a.description}`
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length >= 4);

  const textB =
    `${b.title} ${b.description}`.toLowerCase();

  const matchingWords = wordsA.filter((word) =>
    textB.includes(word)
  );

  score += Math.min(matchingWords.length * 6, 19);

  return Math.min(score, 99);
}

export default function Home() {
  const [screen, setScreen] =
    useState<Screen>("home");

  const [selectedMode, setSelectedMode] =
    useState<Mode | null>(null);

  const [reports, setReports] =
    useState<Report[]>(DEMO_REPORTS);

  const [selectedReport, setSelectedReport] =
    useState<Report | null>(null);

  const [reportFilter, setReportFilter] =
    useState<"all" | ReportType>("all");

  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] =
    useState(false);

  const [reportType, setReportType] =
    useState<ReportType>("lost");

  const [title, setTitle] = useState("");
  const [category, setCategory] =
    useState("Wallet");
  const [description, setDescription] =
    useState("");
  const [contact, setContact] =
    useState("");

  const [date, setDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  const [pin, setPin] = useState({
    lat: 52.4064,
    lng: 16.9252,
  });

  const [placingPin, setPlacingPin] =
    useState(false);

  const mapContainer =
    useRef<HTMLDivElement | null>(null);

  const mapRef =
    useRef<MapLibreMap | null>(null);

  const markersRef =
    useRef<Marker[]>([]);

  const draftMarkerRef =
    useRef<Marker | null>(null);

  const placingPinRef =
    useRef(false);

  useEffect(() => {
    placingPinRef.current = placingPin;
  }, [placingPin]);

  useEffect(() => {
    const stored = localStorage.getItem(
      "find-radar-reports"
    );

    if (!stored) return;

    try {
      const parsed =
        JSON.parse(stored) as Report[];

      setReports([
        ...parsed,
        ...DEMO_REPORTS,
      ]);
    } catch {
      // Ignore malformed local storage.
    }
  }, []);

  useEffect(() => {
    if (
      screen !== "lost-found" ||
      !mapContainer.current ||
      mapRef.current
    ) {
      return;
    }

    const map = new maplibregl.Map({
      container: mapContainer.current,

      // WORLD VIEW
      center: [12, 25],
      zoom: 1.7,
      minZoom: 1,

      style: {
        version: 8,

        sources: {
          openstreetmap: {
            type: "raster",

            tiles: [
              "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            ],

            tileSize: 256,

            attribution:
              "© OpenStreetMap contributors",
          },
        },

        layers: [
          {
            id: "world-map",
            type: "raster",
            source: "openstreetmap",

            paint: {
              "raster-saturation": -0.65,
              "raster-contrast": 0.18,
              "raster-brightness-min": 0.05,
              "raster-brightness-max": 0.72,
            },
          },
        ],
      },
    });

    map.addControl(
      new maplibregl.NavigationControl({
        showCompass: true,
        showZoom: true,
      }),
      "bottom-right"
    );

    map.on("click", (event) => {
      if (!placingPinRef.current) return;

      const nextPin = {
        lat: event.lngLat.lat,
        lng: event.lngLat.lng,
      };

      setPin(nextPin);
      setPlacingPin(false);
      placingPinRef.current = false;

      if (draftMarkerRef.current) {
        draftMarkerRef.current.remove();
      }

      const element =
        document.createElement("div");

      element.className =
        "draftLocationMarker";

      draftMarkerRef.current =
        new maplibregl.Marker({
          element,
        })
          .setLngLat([
            nextPin.lng,
            nextPin.lat,
          ])
          .addTo(map);

      setModalOpen(true);
    });

    mapRef.current = map;

    return () => {
      markersRef.current.forEach(
        (marker) => marker.remove()
      );

      draftMarkerRef.current?.remove();

      map.remove();
      mapRef.current = null;
    };
  }, [screen]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) return;

    markersRef.current.forEach(
      (marker) => marker.remove()
    );

    markersRef.current = [];

    reports.forEach((report) => {
      const markerElement =
        document.createElement("button");

      markerElement.className =
        `worldMarker ${report.type}`;

      markerElement.innerHTML = `
        <span class="markerPulse"></span>
        <span class="markerCore"></span>
        <small>${
          report.type === "lost"
            ? "LOST"
            : "FOUND"
        }</small>
      `;

      markerElement.onclick = () => {
        setSelectedReport(report);

        map.flyTo({
          center: [
            report.lng,
            report.lat,
          ],
          zoom: Math.max(
            map.getZoom(),
            14
          ),
          duration: 800,
        });
      };

      const marker =
        new maplibregl.Marker({
          element: markerElement,
          anchor: "bottom",
        })
          .setLngLat([
            report.lng,
            report.lat,
          ])
          .addTo(map);

      markersRef.current.push(marker);
    });
  }, [reports, screen]);

  const filteredReports =
    useMemo(() => {
      return reports.filter(
        (report) => {
          if (
            reportFilter !== "all" &&
            report.type !== reportFilter
          ) {
            return false;
          }

          if (!search.trim()) return true;

          const text =
            `${report.title} ${report.category} ${report.description}`.toLowerCase();

          return text.includes(
            search.toLowerCase()
          );
        }
      );
    }, [
      reports,
      reportFilter,
      search,
    ]);

  const matches = useMemo(() => {
    if (!selectedReport) return [];

    return reports
      .filter(
        (report) =>
          report.id !==
          selectedReport.id
      )
      .map((report) => ({
        report,
        score: calculateMatchScore(
          selectedReport,
          report
        ),
      }))
      .filter(
        (result) => result.score >= 30
      )
      .sort(
        (a, b) =>
          b.score - a.score
      );
  }, [
    selectedReport,
    reports,
  ]);

  function chooseMode(mode: Mode) {
    if (selectedMode === mode) {
      if (mode === "lost") {
        setScreen("lost-found");
      }

      return;
    }

    setSelectedMode(mode);
  }

  function useMyLocation() {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setPin(location);

        mapRef.current?.flyTo({
          center: [
            location.lng,
            location.lat,
          ],
          zoom: 15,
          duration: 1000,
        });
      }
    );
  }

  function showWorld() {
    mapRef.current?.flyTo({
      center: [12, 25],
      zoom: 1.7,
      duration: 1000,
    });
  }

  function openReportModal(
    type: ReportType
  ) {
    setReportType(type);

    const center =
      mapRef.current?.getCenter();

    if (center) {
      setPin({
        lat: center.lat,
        lng: center.lng,
      });
    }

    setModalOpen(true);
  }

  function chooseMapLocation() {
    setModalOpen(false);
    setPlacingPin(true);
    placingPinRef.current = true;
  }

  function submitReport(
    event: FormEvent
  ) {
    event.preventDefault();

    if (!title.trim()) return;

    const newReport: Report = {
      id: crypto.randomUUID(),
      type: reportType,
      title: title.trim(),
      category,
      description:
        description.trim(),
      date,
      contact: contact.trim(),
      lat: pin.lat,
      lng: pin.lng,
      createdAt: Date.now(),
    };

    const localReports = [
      newReport,
      ...reports.filter(
        (report) =>
          !report.id.startsWith(
            "demo-"
          )
      ),
    ];

    localStorage.setItem(
      "find-radar-reports",
      JSON.stringify(localReports)
    );

    setReports((current) => [
      newReport,
      ...current,
    ]);

    setSelectedReport(newReport);

    setModalOpen(false);

    setTitle("");
    setDescription("");
    setContact("");

    draftMarkerRef.current?.remove();
    draftMarkerRef.current = null;

    mapRef.current?.flyTo({
      center: [
        newReport.lng,
        newReport.lat,
      ],
      zoom: 16,
      duration: 900,
    });
  }

  if (screen === "home") {
    return (
      <main className="findHome">
        <div className="ambientGlow" />
        <div className="backgroundGrid" />

        <header className="findHero">
          <div className="heroRadar">
            <span />
            <span />
            <i />
          </div>

          <div className="heroEyebrow">
            OPPORTUNITY RADAR
          </div>

          <h1>
            FIND <b>RADAR</b>
          </h1>

          <p>
            Find what you&apos;re
            looking for.
          </p>
        </header>

        <section className="modeGrid">
          <button
            className={`modeCard ${
              selectedMode === "lost"
                ? "selected"
                : ""
            } ${
              selectedMode &&
              selectedMode !== "lost"
                ? "dimmed"
                : ""
            }`}
            onClick={() =>
              chooseMode("lost")
            }
          >
            <div className="cardTop">
              <span>01</span>
              <span>RECOVER</span>
            </div>

            <div className="lostPreview">
              <div className="previewRoad road1" />
              <div className="previewRoad road2" />
              <div className="previewRoad road3" />

              <div className="previewRing big" />
              <div className="previewRing small" />

              <div className="previewPin lost">
                <i />
                <small>LOST</small>
              </div>

              <div className="previewPin found">
                <i />
                <small>FOUND</small>
              </div>

              <div className="previewMatchLine" />

              <span className="previewMatch">
                ● Possible match
              </span>
            </div>

            <div className="modeContent">
              <div className="modeIcon">
                ⌖
              </div>

              <h2>
                Lost &amp; Found
              </h2>

              <p>
                Report something lost
                or found and search a
                worldwide map for
                possible matches.
              </p>
            </div>

            <div className="modeFooter">
              <span>
                {selectedMode ===
                "lost"
                  ? "CLICK AGAIN TO ENTER"
                  : "OPEN RADAR"}
              </span>

              <strong>→</strong>
            </div>
          </button>

          <button
            className={`modeCard ${
              selectedMode ===
              "products"
                ? "selected"
                : ""
            } ${
              selectedMode &&
              selectedMode !==
                "products"
                ? "dimmed"
                : ""
            }`}
            onClick={() =>
              chooseMode("products")
            }
          >
            <div className="cardTop">
              <span>02</span>
              <span>SEARCH</span>
            </div>

            <div className="productPreview">
              <div className="productCircle outer" />
              <div className="productCircle inner" />
              <div className="productSweep" />

              <div className="productTarget">
                95
              </div>

              <span className="specChip size">
                SIZE
                <b>42</b>
              </span>

              <span className="specChip budget">
                BUDGET
                <b>≤ 500 zł</b>
              </span>

              <span className="matchChip">
                ● MATCH
              </span>
            </div>

            <div className="modeContent">
              <div className="modeIcon">
                ◎
              </div>

              <h2>
                Product Finder
              </h2>

              <p>
                Describe exactly what
                you want and search
                stores and marketplaces
                for real matches.
              </p>
            </div>

            <div className="modeFooter">
              <span>
                COMING NEXT
              </span>
              <strong>→</strong>
            </div>
          </button>

          <button
            className={`modeCard ${
              selectedMode ===
              "restock"
                ? "selected"
                : ""
            } ${
              selectedMode &&
              selectedMode !==
                "restock"
                ? "dimmed"
                : ""
            }`}
            onClick={() =>
              chooseMode("restock")
            }
          >
            <div className="cardTop">
              <span>03</span>
              <span>MONITOR</span>
            </div>

            <div className="restockPreview">
              <div className="restockRing ringA" />
              <div className="restockRing ringB" />

              <div className="watchProduct">
                <small>
                  WATCHING
                </small>
                <strong>
                  LEGO
                </strong>
                <b>≤ 700 zł</b>
              </div>

              <span className="stockNode n1">
                ● OUT
              </span>

              <span className="stockNode n2">
                ● OUT
              </span>

              <span className="stockNode n3 active">
                ● FOUND
              </span>

              <span className="stockNode n4">
                ● OUT
              </span>
            </div>

            <div className="modeContent">
              <div className="modeIcon">
                ◌
              </div>

              <h2>
                Restock Watch
              </h2>

              <p>
                Track sold-out products
                and keep searching until
                Find Radar detects one.
              </p>
            </div>

            <div className="modeFooter">
              <span>
                COMING NEXT
              </span>
              <strong>→</strong>
            </div>
          </button>
        </section>

        <footer className="findFooter">
          <span>FIND RADAR</span>

          <span className="systemOnline">
            ● SYSTEM ONLINE
          </span>

          <span>
            SELECT A RADAR TO BEGIN
          </span>
        </footer>
      </main>
    );
  }

  return (
    <main className="lostFoundApp">
      <header className="appTopbar">
        <button
          className="appBrand"
          onClick={() =>
            setScreen("home")
          }
        >
          <span className="brandRadar">
            F
          </span>

          <span>
            <strong>
              Find Radar
            </strong>
            <small>
              Lost &amp; Found
            </small>
          </span>
        </button>

        <nav className="appTabs">
          <button className="active">
            ⌖ Lost &amp; Found
          </button>

          <button
            onClick={() => {
              setScreen("home");
              setSelectedMode(
                "products"
              );
            }}
          >
            ◎ Product Finder
          </button>

          <button
            onClick={() => {
              setScreen("home");
              setSelectedMode(
                "restock"
              );
            }}
          >
            ◌ Restock Watch
          </button>
        </nav>

        <div className="mapControlsTop">
          <button
            onClick={showWorld}
          >
            ◉ World
          </button>

          <button
            className="locationControl"
            onClick={useMyLocation}
          >
            ◎ My location
          </button>
        </div>
      </header>

      <section className="lostWorkspace">
        <aside className="lostSidebar">
          <div className="sidebarTitle">
            <div>
              <span>
                LOST &amp; FOUND RADAR
              </span>

              <h1>
                Find it again.
              </h1>
            </div>

            <b>
              ● LIVE
            </b>
          </div>

          <p className="sidebarIntro">
            Search reports anywhere in
            the world or activate your
            own Lost / Found signal.
          </p>

          <div className="reportButtons">
            <button
              className="lostButton"
              onClick={() =>
                openReportModal(
                  "lost"
                )
              }
            >
              <strong>−</strong>
              I lost something
            </button>

            <button
              className="foundButton"
              onClick={() =>
                openReportModal(
                  "found"
                )
              }
            >
              <strong>+</strong>
              I found something
            </button>
          </div>

          <div className="reportSearch">
            <span>⌕</span>

            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Search wallet, phone, keys..."
            />
          </div>

          <div className="reportFilters">
            <button
              className={
                reportFilter === "all"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setReportFilter("all")
              }
            >
              All
            </button>

            <button
              className={
                reportFilter === "lost"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setReportFilter(
                  "lost"
                )
              }
            >
              Lost
            </button>

            <button
              className={
                reportFilter ===
                "found"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setReportFilter(
                  "found"
                )
              }
            >
              Found
            </button>
          </div>

          <div className="resultsLabel">
            <span>
              RADAR SIGNALS
            </span>

            <b>
              {
                filteredReports.length
              }
            </b>
          </div>

          <div className="reportFeed">
            {filteredReports.map(
              (report) => (
                <button
                  key={report.id}
                  className={`reportItem ${
                    selectedReport?.id ===
                    report.id
                      ? "selected"
                      : ""
                  }`}
                  onClick={() => {
                    setSelectedReport(
                      report
                    );

                    mapRef.current?.flyTo(
                      {
                        center: [
                          report.lng,
                          report.lat,
                        ],
                        zoom: 15,
                        duration: 800,
                      }
                    );
                  }}
                >
                  <span
                    className={`reportStatus ${report.type}`}
                  >
                    {report.type ===
                    "lost"
                      ? "LOST"
                      : "FOUND"}
                  </span>

                  <div>
                    <strong>
                      {report.title}
                    </strong>

                    <small>
                      {
                        report.category
                      }{" "}
                      · {report.date}
                    </small>

                    <p>
                      {
                        report.description
                      }
                    </p>
                  </div>

                  <b>→</b>
                </button>
              )
            )}
          </div>
        </aside>

        <section className="worldMapArea">
          <div
            ref={mapContainer}
            className="worldMap"
          />

          <div className="worldStatus">
            <span>
              <i />
              WORLD RADAR ACTIVE
            </span>

            <b>
              {reports.length} SIGNALS
            </b>
          </div>

          <div className="mapLegend">
            <span>
              <i className="lostDot" />
              Lost
            </span>

            <span>
              <i className="foundDot" />
              Found
            </span>
          </div>

          {placingPin && (
            <div className="placePinMessage">
              <span>
                LOCATION MODE
              </span>

              <strong>
                Click the exact place on
                the map
              </strong>

              <small>
                Zoom down to the street
                where the item was lost
                or found.
              </small>
            </div>
          )}

          {selectedReport && (
            <aside className="mapReportPanel">
              <div className="mapReportTop">
                <span
                  className={`reportStatus ${selectedReport.type}`}
                >
                  {selectedReport.type.toUpperCase()}
                </span>

                <button
                  onClick={() =>
                    setSelectedReport(
                      null
                    )
                  }
                >
                  ×
                </button>
              </div>

              <h2>
                {
                  selectedReport.title
                }
              </h2>

              <span className="reportMeta">
                {
                  selectedReport.category
                }{" "}
                · {selectedReport.date}
              </span>

              <p>
                {
                  selectedReport.description
                }
              </p>

              <div className="coordinates">
                <span>
                  LOCATION
                </span>

                <strong>
                  {selectedReport.lat.toFixed(
                    4
                  )}
                  ,{" "}
                  {selectedReport.lng.toFixed(
                    4
                  )}
                </strong>
              </div>

              {matches.length > 0 && (
                <div className="matchArea">
                  <div className="matchHeading">
                    <span>
                      ● POSSIBLE MATCHES
                    </span>

                    <b>
                      {
                        matches.length
                      }
                    </b>
                  </div>

                  {matches
                    .slice(0, 3)
                    .map(
                      ({
                        report,
                        score,
                      }) => (
                        <button
                          key={
                            report.id
                          }
                          className="possibleMatch"
                          onClick={() => {
                            setSelectedReport(
                              report
                            );

                            mapRef.current?.flyTo(
                              {
                                center:
                                  [
                                    report.lng,
                                    report.lat,
                                  ],
                                zoom: 16,
                                duration: 700,
                              }
                            );
                          }}
                        >
                          <div>
                            <strong>
                              {
                                report.title
                              }
                            </strong>

                            <small>
                              {report.type.toUpperCase()}{" "}
                              ·{" "}
                              {
                                report.category
                              }
                            </small>
                          </div>

                          <b>
                            {
                              score
                            }
                            %
                          </b>
                        </button>
                      )
                    )}
                </div>
              )}
            </aside>
          )}
        </section>
      </section>

      {modalOpen && (
        <div
          className="reportBackdrop"
          onMouseDown={() =>
            setModalOpen(false)
          }
        >
          <form
            className="reportForm"
            onSubmit={submitReport}
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >
            <div className="formHeader">
              <div>
                <span>
                  {reportType ===
                  "lost"
                    ? "NEW LOST SIGNAL"
                    : "NEW FOUND SIGNAL"}
                </span>

                <h2>
                  {reportType ===
                  "lost"
                    ? "What did you lose?"
                    : "What did you find?"}
                </h2>
              </div>

              <button
                type="button"
                onClick={() =>
                  setModalOpen(false)
                }
              >
                ×
              </button>
            </div>

            <div className="formFields">
              <label className="full">
                <span>
                  ITEM NAME
                </span>

                <input
                  required
                  value={title}
                  onChange={(event) =>
                    setTitle(
                      event.target.value
                    )
                  }
                  placeholder="Black leather wallet"
                />
              </label>

              <label>
                <span>
                  CATEGORY
                </span>

                <select
                  value={category}
                  onChange={(event) =>
                    setCategory(
                      event.target.value
                    )
                  }
                >
                  {categories.map(
                    (item) => (
                      <option
                        key={item}
                      >
                        {item}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                <span>DATE</span>

                <input
                  type="date"
                  value={date}
                  onChange={(event) =>
                    setDate(
                      event.target.value
                    )
                  }
                />
              </label>

              <label className="full">
                <span>
                  DETAILS
                </span>

                <textarea
                  value={description}
                  onChange={(event) =>
                    setDescription(
                      event.target.value
                    )
                  }
                  placeholder="Brand, colour, identifying marks, where you last saw it..."
                />
              </label>

              <label className="full">
                <span>
                  CONTACT
                </span>

                <input
                  value={contact}
                  onChange={(event) =>
                    setContact(
                      event.target.value
                    )
                  }
                  placeholder="Email, phone, social account..."
                />
              </label>
            </div>

            <div className="selectedLocation">
              <div>
                <span>
                  MAP LOCATION
                </span>

                <strong>
                  {pin.lat.toFixed(5)},{" "}
                  {pin.lng.toFixed(5)}
                </strong>
              </div>

              <button
                type="button"
                onClick={
                  chooseMapLocation
                }
              >
                Pick on world map
              </button>
            </div>

            <button
              className="activateSignal"
              type="submit"
            >
              <span>
                Activate Radar Signal
              </span>

              <strong>→</strong>
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
