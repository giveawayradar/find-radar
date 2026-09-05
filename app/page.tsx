"use client";

import { useState } from "react";

type Mode = "lost" | "products" | "restock";

export default function Home() {
  const [selected, setSelected] = useState<Mode | null>(null);

  return (
    <main className="findHome">
      {/* Background */}
      <div className="ambientGlow" />
      <div className="backgroundGrid" />

      {/* Centered branding */}
      <header className="hero">
        <div className="radarLogo">
          <span className="logoRing ringOne" />
          <span className="logoRing ringTwo" />
          <span className="logoDot" />
        </div>

        <div className="eyebrow">OPPORTUNITY RADAR</div>

        <h1>
          FIND <span>RADAR</span>
        </h1>

        <p>Find what you&apos;re looking for.</p>
      </header>

      {/* Three Radars */}
      <section className={`modeGrid ${selected ? "hasSelection" : ""}`}>
        {/* LOST & FOUND */}
        <button
          type="button"
          className={`modeCard lostCard ${
            selected === "lost" ? "selected" : ""
          } ${selected && selected !== "lost" ? "dimmed" : ""}`}
          onClick={() => setSelected("lost")}
        >
          <div className="cardNumber">01</div>
          <div className="cardLabel">RECOVER</div>

          <div className="visual lostVisual">
            <div className="mapRoad roadA" />
            <div className="mapRoad roadB" />
            <div className="mapRoad roadC" />

            <div className="searchRadius radiusOne" />
            <div className="searchRadius radiusTwo" />

            <div className="mapPin lostPin">
              <span />
              <small>LOST</small>
            </div>

            <div className="mapPin foundPin">
              <span />
              <small>FOUND</small>
            </div>

            <div className="matchLine" />

            <div className="matchBadge">
              <span className="liveDot" />
              Possible match
            </div>
          </div>

          <div className="cardContent">
            <div className="iconBox">⌖</div>

            <h2>Lost &amp; Found</h2>

            <p>
              Report what you lost or found. Find Radar searches nearby reports
              for likely matches.
            </p>
          </div>

          <div className="cardFooter">
            <span>
              {selected === "lost" ? "RADAR SELECTED" : "OPEN RADAR"}
            </span>
            <strong>→</strong>
          </div>
        </button>

        {/* PRODUCT FINDER */}
        <button
          type="button"
          className={`modeCard productCard ${
            selected === "products" ? "selected" : ""
          } ${selected && selected !== "products" ? "dimmed" : ""}`}
          onClick={() => setSelected("products")}
        >
          <div className="cardNumber">02</div>
          <div className="cardLabel">SEARCH</div>

          <div className="visual productVisual">
            <div className="scannerRing scannerOuter" />
            <div className="scannerRing scannerInner" />
            <div className="scannerSweep" />

            <div className="target">
              <div className="shoe">95</div>
            </div>

            <div className="productChip chipOne">
              <small>SIZE</small>
              <strong>42</strong>
            </div>

            <div className="productChip chipTwo">
              <small>BUDGET</small>
              <strong>≤ 500 zł</strong>
            </div>

            <div className="productChip chipThree">
              <span className="liveDot" />
              MATCH
            </div>
          </div>

          <div className="cardContent">
            <div className="iconBox">◎</div>

            <h2>Product Finder</h2>

            <p>
              Tell Find Radar exactly what you want. Search by product, size,
              budget, condition and distance.
            </p>
          </div>

          <div className="cardFooter">
            <span>
              {selected === "products" ? "RADAR SELECTED" : "OPEN RADAR"}
            </span>
            <strong>→</strong>
          </div>
        </button>

        {/* RESTOCK WATCH */}
        <button
          type="button"
          className={`modeCard restockCard ${
            selected === "restock" ? "selected" : ""
          } ${selected && selected !== "restock" ? "dimmed" : ""}`}
          onClick={() => setSelected("restock")}
        >
          <div className="cardNumber">03</div>
          <div className="cardLabel">MONITOR</div>

          <div className="visual restockVisual">
            <div className="watchCore">
              <span>WATCHING</span>
              <strong>LEGO</strong>
              <small>≤ 700 zł</small>
            </div>

            <div className="sourceNode sourceOne">
              <span />
              OUT
            </div>

            <div className="sourceNode sourceTwo">
              <span />
              OUT
            </div>

            <div className="sourceNode sourceThree">
              <span />
              FOUND
            </div>

            <div className="sourceNode sourceFour">
              <span />
              OUT
            </div>

            <div className="connector connectorOne" />
            <div className="connector connectorTwo" />
            <div className="connector connectorThree" />
            <div className="connector connectorFour" />

            <div className="watchPulse" />
          </div>

          <div className="cardContent">
            <div className="iconBox">◌</div>

            <h2>Restock Watch</h2>

            <p>
              Watch sold-out and hard-to-find products. We keep checking until
              your target appears.
            </p>
          </div>

          <div className="cardFooter">
            <span>
              {selected === "restock" ? "RADAR SELECTED" : "OPEN RADAR"}
            </span>
            <strong>→</strong>
          </div>
        </button>
      </section>

      <footer className="bottomLine">
        <span>FIND RADAR</span>

        <div>
          <span className="liveDot" />
          SYSTEM ONLINE
        </div>

        <span>SELECT A RADAR TO BEGIN</span>
      </footer>
    </main>
  );
}
