"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Zap, BarChart2, MessageCircle, GitCompareArrows, FileText, Download } from "lucide-react";

// ─── Screen 1: Classification data ───
const REVIEW_TEXT =
  '"Game keeps crashing mid-battle since the last patch, and the inventory menus are impossible to navigate with a controller."';

const TAGS = [
  { label: "stability crashes", color: "bg-red-500/15 text-red-300 border-red-500/30" },
  { label: "menus hud", color: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  { label: "compatibility", color: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" },
];

const BARS = [
  { label: "Stability / Crashes", value: 42, color: "bg-red-500" },
  { label: "Performance / FPS", value: 31, color: "bg-amber-500" },
  { label: "Networking / Multiplayer", value: 18, color: "bg-sky-500" },
];

// ─── Screen 2: Agent Chat data ───
const CHAT_USER_MSG = "Show me what players are requesting most";
const CHAT_AGENT_INTRO = "Based on 1,000 reviews, the top feature requests are:";
const CHAT_BARS = [
  { label: "Ultrawide Support", value: 342 },
  { label: "Mod Support", value: 276 },
  { label: "New Game+", value: 198 },
  { label: "Photo Mode", value: 124 },
];
const CHAT_BARS_MAX = 342;
const CHAT_QUOTES = [
  '"Please add ultrawide support — black bars on a 34-inch monitor is painful."',
  '"Would love mod support — the community could keep this game alive for years."',
  '"A New Game+ mode would make the endgame so much more replayable."',
];

// ─── Screen 3: Compare data ───
const COMPARE_GAMES = [
  { name: "Hollow Knight", score: 94, color: "text-cyan-400", bg: "bg-cyan-500" },
  { name: "Cuphead", score: 88, color: "text-red-400", bg: "bg-red-500" },
];
const COMPARE_CATEGORIES = [
  { label: "Gameplay", a: 96, b: 91, colorA: "bg-cyan-500", colorB: "bg-red-500" },
  { label: "Technical", a: 89, b: 93, colorA: "bg-cyan-500", colorB: "bg-red-500" },
  { label: "Content & Design", a: 97, b: 82, colorA: "bg-cyan-500", colorB: "bg-red-500" },
];

// ─── Screen 4: Reports data ───
const RISK_METRICS = [
  { label: "Recommend Rate", value: "72%", subtext: "↓ 5%", color: "text-amber-400", border: "border-amber-500/30", bg: "bg-amber-500/10" },
  { label: "Refund Risk", value: "12%", subtext: "Low", color: "text-emerald-400", border: "border-emerald-500/30", bg: "bg-emerald-500/10" },
  { label: "Fan Disappointment", value: "22%", subtext: "High", color: "text-red-400", border: "border-red-500/30", bg: "bg-red-500/10" },
];

const TOP_ISSUES = [
  { rank: 1, label: "Performance / FPS", mentions: 234, color: "text-red-400" },
  { rank: 2, label: "Stability / Crashes", mentions: 156, color: "text-amber-400" },
  { rank: 3, label: "Controls / Input", mentions: 89, color: "text-cyan-400" },
];

// ─── Phase config ───
const PHASE_DURATIONS = [4500, 5000, 4000, 4000]; // ms per screen
const TRANSITION_MS = 400;

// ─── Shared transition classes ───
const T_FADE = "transition-opacity duration-500";
const T_SLIDE = "transition-[opacity,transform] duration-500";
const T_SLIDE_FAST = "transition-[opacity,transform] duration-300";
const T_SCALE = "transition-[opacity,transform] duration-500";
const T_WIDTH = "transition-[width] duration-700 ease-out";
const T_HEIGHT = "transition-[height] duration-700 ease-out";

// ═══════════════════════════════════════════
// Screen 1: AI Classification
// ═══════════════════════════════════════════
function ClassificationScreen({ active }: { active: boolean }) {
  const typeRef = useRef<HTMLSpanElement>(null);
  const cursorRef = useRef<HTMLSpanElement>(null);
  const [showBadge, setShowBadge] = useState(false);
  const [visibleTags, setVisibleTags] = useState<number[]>([]);
  const [animatedBars, setAnimatedBars] = useState<number[]>([]);
  const [showDivider, setShowDivider] = useState(false);
  const [showBarHeader, setShowBarHeader] = useState(false);

  useEffect(() => {
    if (!active) {
      if (typeRef.current) typeRef.current.textContent = "";
      if (cursorRef.current) cursorRef.current.style.display = "inline-block";
      setShowBadge(false);
      setVisibleTags([]);
      setAnimatedBars([]);
      setShowDivider(false);
      setShowBarHeader(false);
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];

    // Typewriter via ref — no re-renders
    timers.push(
      setTimeout(() => {
        let i = 0;
        const typeInterval = setInterval(() => {
          i++;
          if (typeRef.current) typeRef.current.textContent = REVIEW_TEXT.slice(0, i);
          if (i >= REVIEW_TEXT.length) {
            clearInterval(typeInterval);
            if (cursorRef.current) cursorRef.current.style.display = "none";
          }
        }, 14);
        timers.push(typeInterval as unknown as ReturnType<typeof setTimeout>);
      }, 300)
    );

    // Badge at ~2.3s
    timers.push(setTimeout(() => setShowBadge(true), 2300));

    // Tags at 2.6, 2.9, 3.2s
    timers.push(setTimeout(() => setVisibleTags((p) => [...p, 0]), 2600));
    timers.push(setTimeout(() => setVisibleTags((p) => [...p, 1]), 2900));
    timers.push(setTimeout(() => setVisibleTags((p) => [...p, 2]), 3200));

    // Divider + bar header
    timers.push(setTimeout(() => setShowDivider(true), 3400));
    timers.push(setTimeout(() => setShowBarHeader(true), 3400));

    // Bars
    timers.push(setTimeout(() => setAnimatedBars((p) => [...p, 0]), 3600));
    timers.push(setTimeout(() => setAnimatedBars((p) => [...p, 1]), 3800));
    timers.push(setTimeout(() => setAnimatedBars((p) => [...p, 2]), 3900));
    timers.push(setTimeout(() => setAnimatedBars((p) => [...p, 3]), 4000));

    return () => timers.forEach(clearTimeout);
  }, [active]);

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-1">
        <Zap className="w-5 h-5 text-[#00F0FF]" />
        <span className="text-[17px] font-bold uppercase tracking-[0.1em] text-[#00F0FF]">
          AI Classification
        </span>
      </div>

      {/* Review card */}
      <div className="bg-[#00F0FF]/[0.03] border border-[#00F0FF]/10 p-5 mb-1">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[14px] text-[#00F0FF]/50 uppercase tracking-wider font-medium">
            Steam Review
          </span>
          <span
            className={`px-3 py-1 bg-red-500/20 text-red-300 border border-red-500/30 text-[14px] font-bold uppercase tracking-wider ${T_SLIDE_FAST} ${
              showBadge ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
            }`}
          >
            Negative
          </span>
        </div>
        <p className="text-[17px] italic text-white/90 leading-relaxed">
          <span ref={typeRef} />
          <span
            ref={cursorRef}
            className="inline-block w-[2px] h-[15px] bg-[#00F0FF] ml-[1px] align-middle animate-pulse"
          />
        </p>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-2.5">
        {TAGS.map((tag, idx) => (
          <div
            key={tag.label}
            className={`px-3.5 py-2 border text-[14px] font-bold uppercase tracking-wider will-change-[opacity,transform] ${T_SCALE} ${tag.color} ${
              visibleTags.includes(idx)
                ? "opacity-100 translate-y-0 scale-100"
                : "opacity-0 translate-y-2 scale-95"
            }`}
          >
            {tag.label}
          </div>
        ))}
      </div>

      {/* Divider */}
      <div
        className={`border-t border-[#00F0FF]/8 ${T_FADE} ${
          showDivider ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Bar chart */}
      <div className={`${T_FADE} ${showBarHeader ? "opacity-100" : "opacity-0"}`}>
        <div className="flex items-center gap-2.5 mb-3">
          <BarChart2 className="w-5 h-5 text-[#00F0FF]" />
          <span className="text-[17px] font-bold uppercase tracking-[0.1em] text-[#00F0FF]">
            Top Issues Found
          </span>
        </div>
        <div className="space-y-3">
          {BARS.map((item, idx) => (
            <div
              key={item.label}
              className={`will-change-[opacity,transform] ${T_SLIDE} ${
                animatedBars.includes(idx) ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[15px] text-white/60">{item.label}</span>
                <span className="text-[15px] text-white/90 font-bold">{item.value}%</span>
              </div>
              <div className="h-[7px] bg-[#00F0FF]/8 overflow-hidden">
                <div
                  className={`h-full ${item.color} ${T_WIDTH}`}
                  style={{ width: animatedBars.includes(idx) ? `${item.value}%` : "0%" }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Screen 2: Agent Chat
// ═══════════════════════════════════════════
function AgentChatScreen({ active }: { active: boolean }) {
  const typeRef = useRef<HTMLSpanElement>(null);
  const cursorRef = useRef<HTMLSpanElement>(null);
  const [showUserMsg, setShowUserMsg] = useState(false);
  const [typingDone, setTypingDone] = useState(false);
  const [visibleBars, setVisibleBars] = useState<number[]>([]);
  const [showQuote, setShowQuote] = useState(false);

  useEffect(() => {
    if (!active) {
      if (typeRef.current) typeRef.current.textContent = "";
      if (cursorRef.current) cursorRef.current.style.display = "inline-block";
      setShowUserMsg(false);
      setTypingDone(false);
      setVisibleBars([]);
      setShowQuote(false);
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];

    // User message slides in at 300ms
    timers.push(setTimeout(() => setShowUserMsg(true), 300));

    // Agent intro types at 1000ms via ref
    timers.push(
      setTimeout(() => {
        let i = 0;
        const typeInterval = setInterval(() => {
          i++;
          if (typeRef.current) typeRef.current.textContent = CHAT_AGENT_INTRO.slice(0, i);
          if (i >= CHAT_AGENT_INTRO.length) {
            clearInterval(typeInterval);
            if (cursorRef.current) cursorRef.current.style.display = "none";
            setTypingDone(true);
          }
        }, 18);
        timers.push(typeInterval as unknown as ReturnType<typeof setTimeout>);
      }, 1000)
    );

    // Bars animate
    timers.push(setTimeout(() => setVisibleBars((p) => [...p, 0]), 2200));
    timers.push(setTimeout(() => setVisibleBars((p) => [...p, 1]), 2500));
    timers.push(setTimeout(() => setVisibleBars((p) => [...p, 2]), 2800));
    timers.push(setTimeout(() => setVisibleBars((p) => [...p, 3]), 3100));

    // Quote fades in
    timers.push(setTimeout(() => setShowQuote(true), 3500));

    return () => timers.forEach(clearTimeout);
  }, [active]);

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-1">
        <MessageCircle className="w-5 h-5 text-[#00F0FF]" />
        <span className="text-[17px] font-bold uppercase tracking-[0.1em] text-[#00F0FF]">
          AI Agent
        </span>
        <span className="flex items-center gap-1.5 ml-auto">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[14px] text-emerald-400/80">Online</span>
        </span>
      </div>

      {/* User message */}
      <div
        className={`flex justify-end will-change-[opacity,transform] ${T_SLIDE} ${
          showUserMsg ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4"
        }`}
      >
        <div className="bg-[#00F0FF]/10 border border-[#00F0FF]/20 px-4 py-3 max-w-[85%]">
          <p className="text-[16px] text-white/90">{CHAT_USER_MSG}</p>
        </div>
      </div>

      {/* Agent response */}
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-[#00F0FF]/20 border border-[#00F0FF]/30 flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-[13px] font-bold text-[#00F0FF]">SN</span>
        </div>
        <div className="flex-1 space-y-3">
          {/* Typed intro */}
          <p className="text-[16px] text-white/80 leading-relaxed">
            <span ref={typeRef} />
            <span
              ref={cursorRef}
              className="inline-block w-[2px] h-[14px] bg-[#00F0FF] ml-[1px] align-middle animate-pulse"
            />
          </p>

          {/* Vertical bar chart — feature requests ranked by mentions */}
          <div className="flex items-end gap-3 h-[120px] pt-2">
            {CHAT_BARS.map((item, idx) => (
              <div
                key={item.label}
                className={`flex-1 flex flex-col items-center justify-end h-full will-change-[opacity,transform] ${T_SLIDE} ${
                  visibleBars.includes(idx) ? "opacity-100" : "opacity-0"
                }`}
              >
                <span className="text-[13px] text-white/90 font-bold mb-1.5">{item.value}</span>
                <div className="w-full bg-[#00F0FF]/8 overflow-hidden relative" style={{ height: "100%" }}>
                  <div
                    className={`absolute bottom-0 left-0 w-full bg-cyan-500 ${T_HEIGHT}`}
                    style={{ height: visibleBars.includes(idx) ? `${(item.value / CHAT_BARS_MAX) * 100}%` : "0%" }}
                  />
                </div>
                <span className="text-[12px] text-white/50 mt-1.5 text-center leading-tight">{item.label}</span>
              </div>
            ))}
          </div>

          {/* Evidence quotes */}
          <div
            className={`space-y-2 will-change-[opacity,transform] ${T_SLIDE} ${
              showQuote ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
            }`}
          >
            {CHAT_QUOTES.map((quote, idx) => (
              <div key={idx} className="border-l-2 border-cyan-500/60 pl-3 py-0.5">
                <p className="text-[14px] italic text-white/50 leading-relaxed">{quote}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Screen 3: Compare
// ═══════════════════════════════════════════
function CompareScreen({ active }: { active: boolean }) {
  const [showCards, setShowCards] = useState(false);
  const [visibleBars, setVisibleBars] = useState<number[]>([]);
  const [showWinner, setShowWinner] = useState(false);

  useEffect(() => {
    if (!active) {
      setShowCards(false);
      setVisibleBars([]);
      setShowWinner(false);
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(setTimeout(() => setShowCards(true), 300));
    timers.push(setTimeout(() => setVisibleBars((p) => [...p, 0]), 1000));
    timers.push(setTimeout(() => setVisibleBars((p) => [...p, 1]), 1300));
    timers.push(setTimeout(() => setVisibleBars((p) => [...p, 2]), 1600));
    timers.push(setTimeout(() => setShowWinner(true), 2200));

    return () => timers.forEach(clearTimeout);
  }, [active]);

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-1">
        <GitCompareArrows className="w-5 h-5 text-[#00F0FF]" />
        <span className="text-[17px] font-bold uppercase tracking-[0.1em] text-[#00F0FF]">
          Game Comparison
        </span>
      </div>

      {/* Game cards */}
      <div
        className={`grid grid-cols-2 gap-4 will-change-[opacity,transform] ${T_SLIDE} ${
          showCards ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
        }`}
      >
        {COMPARE_GAMES.map((game) => (
          <div key={game.name} className="bg-[#00F0FF]/[0.03] border border-[#00F0FF]/10 p-4">
            <p className="text-[16px] font-bold text-white/90 mb-2">{game.name}</p>
            <div className="flex items-center gap-2">
              <span className={`text-[31px] font-bold ${game.color}`}>{game.score}%</span>
              <span className="text-[13px] text-white/40 uppercase tracking-wider">
                Recommend
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Category comparison */}
      <div className="space-y-4 pt-1">
        <div className="grid grid-cols-3 items-center">
          <span className="text-[14px] text-cyan-400/70 font-medium uppercase tracking-wider text-left">
            {COMPARE_GAMES[0].name}
          </span>
          <span className="text-[14px] text-[#00F0FF]/50 font-medium uppercase tracking-wider text-center">
            Recommendation Rate
          </span>
          <span className="text-[14px] text-red-400/70 font-medium uppercase tracking-wider text-right">
            {COMPARE_GAMES[1].name}
          </span>
        </div>
        {COMPARE_CATEGORIES.map((cat, idx) => (
          <div
            key={cat.label}
            className={`will-change-[opacity,transform] ${T_SLIDE} ${
              visibleBars.includes(idx) ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
            }`}
          >
            <div className="text-center mb-1.5">
              <span className="text-[14px] text-white/50">{cat.label}</span>
            </div>
            <div className="flex items-center gap-3">
              {/* Left bar (game A) — grows from right */}
              <div className="flex-1 flex justify-end">
                <div className="w-full h-[8px] bg-[#00F0FF]/8 overflow-hidden relative">
                  <div
                    className={`absolute right-0 top-0 h-full ${cat.colorA} ${T_WIDTH}`}
                    style={{ width: visibleBars.includes(idx) ? `${cat.a}%` : "0%" }}
                  />
                </div>
              </div>
              <span className="text-[14px] text-white/60 font-bold w-16 text-center">
                {cat.a}% / {cat.b}%
              </span>
              {/* Right bar (game B) — grows from left */}
              <div className="flex-1">
                <div className="w-full h-[8px] bg-[#00F0FF]/8 overflow-hidden">
                  <div
                    className={`h-full ${cat.colorB} ${T_WIDTH}`}
                    style={{ width: visibleBars.includes(idx) ? `${cat.b}%` : "0%" }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Winner indicator */}
      <div
        className={`flex items-center justify-center gap-2 pt-1 will-change-[opacity,transform] ${T_SLIDE} ${
          showWinner ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
        }`}
      >
        <span className="text-[14px] text-cyan-400/80 font-bold uppercase tracking-wider">
          Hollow Knight — Leads in 2/3 Categories
        </span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Screen 4: Reports
// ═══════════════════════════════════════════
function ReportsScreen({ active }: { active: boolean }) {
  const [showCard, setShowCard] = useState(false);
  const [visibleMetrics, setVisibleMetrics] = useState<number[]>([]);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    if (!active) {
      setShowCard(false);
      setVisibleMetrics([]);
      setShowButton(false);
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(setTimeout(() => setShowCard(true), 300));
    timers.push(setTimeout(() => setVisibleMetrics((p) => [...p, 0]), 800));
    timers.push(setTimeout(() => setVisibleMetrics((p) => [...p, 1]), 1050));
    timers.push(setTimeout(() => setVisibleMetrics((p) => [...p, 2]), 1300));
    timers.push(setTimeout(() => setShowButton(true), 1800));

    return () => timers.forEach(clearTimeout);
  }, [active]);

  return (
    <div className="p-5 space-y-2.5">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-1">
        <FileText className="w-5 h-5 text-[#00F0FF]" />
        <span className="text-[17px] font-bold uppercase tracking-[0.1em] text-[#00F0FF]">
          Executive Report
        </span>
      </div>

      {/* Report card */}
      <div
        className={`bg-[#00F0FF]/[0.03] border border-[#00F0FF]/10 p-5 will-change-[opacity,transform] ${T_SLIDE} ${
          showCard ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[19px] font-bold text-white/90">Elden Ring</p>
            <p className="text-[14px] text-white/40 mt-0.5">January 2025 Analysis</p>
          </div>
          <div className="text-right">
            <p className="text-[23px] font-bold text-[#00F0FF]">1,000</p>
            <p className="text-[13px] text-[#00F0FF]/50 uppercase tracking-wider">Reviews Analyzed</p>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[#00F0FF]/10 my-3" />

        {/* Risk metrics */}
        <div className="grid grid-cols-3 gap-3">
          {RISK_METRICS.map((metric, idx) => (
            <div
              key={metric.label}
              className={`${metric.bg} border ${metric.border} p-3 text-center will-change-[opacity,transform] ${T_SCALE} ${
                visibleMetrics.includes(idx)
                  ? "opacity-100 translate-y-0 scale-100"
                  : "opacity-0 translate-y-3 scale-95"
              }`}
            >
              <p className={`text-[25px] font-bold ${metric.color}`}>{metric.value}</p>
              <p className={`text-[12px] ${metric.color} font-medium mt-0.5`}>{metric.subtext}</p>
              <p className="text-[12px] text-white/50 uppercase tracking-wider mt-1 leading-tight">
                {metric.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Top issues preview */}
      <div
        className={`bg-[#00F0FF]/[0.02] border border-[#00F0FF]/8 p-4 ${T_FADE} ${
          showCard ? "opacity-100" : "opacity-0"
        }`}
        style={{ transitionDelay: "200ms" }}
      >
        <p className="text-[14px] text-[#00F0FF]/50 uppercase tracking-wider font-medium mb-2">
          Top Issues This Month
        </p>
        <div className="space-y-1.5">
          {TOP_ISSUES.map((issue) => (
            <div key={issue.rank} className="flex items-center justify-between">
              <p className="text-[15px] text-white/60">
                <span className={issue.color}>{issue.rank}.</span> {issue.label}
              </p>
              <span className="text-[13px] text-white/40">{issue.mentions} mentions</span>
            </div>
          ))}
        </div>
      </div>

      {/* Download button */}
      <div
        className={`flex justify-center will-change-[opacity,transform] ${T_SLIDE} ${
          showButton ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
        }`}
      >
        <div className="inline-flex items-center gap-2 bg-[#00F0FF]/10 border border-[#00F0FF]/30 px-8 py-2.5 animate-pulse">
          <Download className="w-4 h-4 text-[#00F0FF]" />
          <span className="text-[13px] font-bold uppercase tracking-wider text-[#00F0FF]">
            Export PDF
          </span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Phase indicator dots
// ═══════════════════════════════════════════
function PhaseIndicator({ phase }: { phase: number }) {
  const labels = ["Classify", "Chat", "Compare", "Report"];
  return (
    <div className="flex items-center justify-center gap-4 px-5 py-2">
      {labels.map((label, idx) => (
        <div key={label} className="flex items-center gap-1.5">
          <div
            className={`w-1.5 h-1.5 rounded-full transition-[background-color,transform] duration-300 ${
              idx === phase ? "bg-[#00F0FF] scale-125" : "bg-white/20"
            }`}
          />
          <span
            className={`text-[13px] uppercase tracking-wider transition-colors duration-300 ${
              idx === phase ? "text-[#00F0FF]/80" : "text-white/20"
            }`}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════
export function AdImageClient() {
  const [phase, setPhase] = useState(0);
  const [visible, setVisible] = useState(true);

  const advancePhase = useCallback(() => {
    // Fade out
    setVisible(false);

    setTimeout(() => {
      // Switch phase
      setPhase((p) => (p + 1) % 4);
      // Fade in
      setVisible(true);
    }, TRANSITION_MS);
  }, []);

  useEffect(() => {
    const timer = setTimeout(advancePhase, PHASE_DURATIONS[phase]);
    return () => clearTimeout(timer);
  }, [phase, advancePhase]);

  return (
    <div className="fixed inset-0 z-[9999] bg-[#030014] flex items-center justify-center">
      <div className="relative w-[1200px] h-[628px] overflow-hidden">
        {/* Background grid pattern */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(0, 240, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 240, 255, 0.03) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Glow effects */}
        <div className="absolute top-1/2 left-[60%] -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-[#00F0FF]/[0.04] rounded-full blur-[120px]" />
        <div className="absolute top-[60%] left-[75%] -translate-x-1/2 -translate-y-1/2 w-[300px] h-[200px] bg-[#FF0080]/[0.03] rounded-full blur-[80px]" />

        {/* Two-column layout */}
        <div className="relative z-10 w-full h-full flex">
          {/* ═══ LEFT: Messaging (static) ═══ */}
          <div className="w-[45%] flex flex-col justify-center pl-14 pr-6">
            {/* Logo + wordmark */}
            <div className="flex items-center gap-3 mb-8">
              <div className="relative w-[44px] h-[44px] flex items-center justify-center border border-[#00F0FF]/40">
                <div className="absolute -top-[2px] -left-[2px] w-1.5 h-1.5 border-t-2 border-l-2 border-[#00F0FF]" />
                <div className="absolute -top-[2px] -right-[2px] w-1.5 h-1.5 border-t-2 border-r-2 border-[#00F0FF]" />
                <div className="absolute -bottom-[2px] -left-[2px] w-1.5 h-1.5 border-b-2 border-l-2 border-[#FF0080]" />
                <div className="absolute -bottom-[2px] -right-[2px] w-1.5 h-1.5 border-b-2 border-r-2 border-[#FF0080]" />
                <span className="text-white font-bold text-[16px] tracking-tighter">SN</span>
              </div>
              <span className="font-bold tracking-[0.25em] text-[17px] uppercase text-white/80">
                SENTINEXT
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-[54px] font-bold leading-[1.10] text-white mb-6 tracking-tight">
              See What Players{" "}
              <span className="text-[#00F0FF]">Actually Hate</span>{" "}
              About Your Game
            </h1>

            {/* Subtitle */}
            {/* Credibility line */}
            <p className="text-[15px] text-[#00F0FF]/60 mb-8">
              Works with any Steam game
            </p>

            {/* CTA */}
            <div>
              <div className="inline-flex">
                <div className="bg-[#00F0FF] px-8 py-3.5">
                  <span className="text-[16px] font-bold uppercase tracking-[0.08em] text-[#030014]">
                    Analyze Your Reviews
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ═══ RIGHT: Product visual (carousel) ═══ */}
          <div className="w-[55%] flex items-center justify-center pr-8">
            <div className="w-[580px] relative">
              {/* App window frame */}
              <div className="border border-[#00F0FF]/20 bg-[#030014]/95 shadow-[0_0_80px_rgba(0,240,255,0.06)]">
                {/* Title bar */}
                <div className="flex items-center gap-2 px-5 py-3 border-b border-[#00F0FF]/10">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/60" />
                    <div className="w-3 h-3 rounded-full bg-amber-500/60" />
                    <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
                  </div>
                  <PhaseIndicator phase={phase} />
                </div>

                {/* Content area — fixed height, fade transition */}
                <div className="relative h-[490px] overflow-hidden">
                  <div
                    className="absolute inset-0 transition-opacity ease-in-out"
                    style={{
                      opacity: visible ? 1 : 0,
                      transitionDuration: `${TRANSITION_MS}ms`,
                    }}
                  >
                    {phase === 0 && <ClassificationScreen active={visible && phase === 0} />}
                    {phase === 1 && <AgentChatScreen active={visible && phase === 1} />}
                    {phase === 2 && <CompareScreen active={visible && phase === 2} />}
                    {phase === 3 && <ReportsScreen active={visible && phase === 3} />}
                  </div>
                </div>
              </div>

              {/* Floating glow behind the card */}
              <div className="absolute -inset-6 -z-10 bg-[#00F0FF]/[0.03] blur-[50px] rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
