"use client";

import { useState } from "react";

type RadarMode = "places" | "events" | "finds";

const modes: {
  id: RadarMode;
  number: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: string;
}[] = [
  {
    id: "places",
    number: "01",
    eyebrow: "EXPLORE",
    title: "Places",
    description:
      "Find restaurants, hidden spots, shops and places worth knowing around you.",
    icon: "⌖",
  },
  {
    id: "events",
    number: "02",
    eyebrow: "HAPPENING NOW",
    title: "Events",
    description:
      "See concerts, festivals, pop-ups and things happening around you.",
    icon: "◉",
  },
  {
    id: "finds",
    number: "03",
    eyebrow: "DISCOVER",
    title: "Finds",
    description:
      "Spot interesting things, opportunities and discoveries hiding nearby.",
    icon: "◇",
  },
];

export default function Home() {
  const [selected, setSelected] = useState<RadarMode | null>(null);

  return (
    <main className="welcome">
      <header className="topbar">
        <div className="brand">
          <div className="brandMark">F</div>

          <div>
            <div className="brandName">Find Radar</div>
            <div className="brandSub">Opportunity Radar</div>
          </div>
        </div>

        <div className="status">
          <span className="statusDot" />
          Radar online
        </div>
      </header>

      <section className="intro">
        <div className="introTag">WELCOME TO FIND RADAR</div>
        <h1>What are we finding?</h1>
        <p>Choose a radar to start exploring.</p>
      </section>

      <section className="radarSelector">
        {modes.map((mode) => {
          const active = selected === mode.id;
          const anotherSelected = selected !== null && !active;

          return (
            <button
              key={mode.id}
              className={[
                "radarPanel",
                active ? "selected" : "",
                anotherSelected ? "unselected" : "",
              ].join(" ")}
              onClick={() => setSelected(mode.id)}
              type="button"
            >
              <div className="panelGlow" />
              <div className="radarGrid" />

              <div className="panelTop">
                <span>{mode.number}</span>
                <span>{mode.eyebrow}</span>
              </div>

              <div className="panelCenter">
                <div className="modeIcon">{mode.icon}</div>
                <h2>{mode.title}</h2>
                <p>{mode.description}</p>
              </div>

              <div className="panelBottom">
                <span>{active ? "Selected" : "Enter radar"}</span>
                <span className="arrow">→</span>
              </div>
            </button>
          );
        })}
      </section>

      <footer className="welcomeFooter">
        <span>FIND RADAR</span>
        <span>Find what&apos;s around you.</span>
      </footer>
    </main>
  );
}
