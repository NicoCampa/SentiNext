"use client";

import { Zap, MessageSquare, BarChart2, GitCompare } from "lucide-react";

export function AdImageClient() {
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
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[400px] bg-[#00F0FF]/[0.06] rounded-full blur-[120px]" />
        <div className="absolute top-[60%] left-[65%] -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] bg-[#FF0080]/[0.04] rounded-full blur-[80px]" />

        {/* Outer frame corner markers */}
        <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-[#00F0FF]/50 z-20" />
        <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-[#00F0FF]/50 z-20" />
        <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-[#FF0080]/50 z-20" />
        <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-[#FF0080]/50 z-20" />

        {/* Dense grid — 1px cyan gaps act as shared borders */}
        <div
          className="relative z-10 w-full h-full grid grid-cols-[400px_1fr_400px] grid-rows-2"
          style={{ gap: "1px", background: "rgba(0, 240, 255, 0.12)" }}
        >
          {/* ═══ TOP-LEFT: AI Classification ═══ */}
          <div className="bg-[#030014] p-4 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center border border-[#00F0FF]/20 bg-[#00F0FF]/5">
                <Zap className="w-4 h-4 text-[#00F0FF]" />
              </div>
              <div className="text-[12px] font-bold uppercase tracking-[0.15em] text-[#00F0FF]">
                AI Classification
              </div>
            </div>

            {/* Review card */}
            <div className="bg-[#00F0FF]/5 border border-[#00F0FF]/10 p-3 mb-2.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-[#00F0FF]/50 uppercase tracking-widest">Review</span>
                <span className="px-2 py-0.5 bg-red-500/20 text-red-300 border border-red-500/30 text-[9px] font-bold uppercase tracking-wider">Negative</span>
              </div>
              <p className="text-[11px] italic text-[#00F0FF]/70 leading-relaxed">
                &quot;Game keeps crashing mid-battle since the last patch, and the inventory menus are impossible to navigate with a controller.&quot;
              </p>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {[
                { label: "stability crashes", color: "bg-red-500/20 text-red-300 border-red-500/30", type: "ISSUE" },
                { label: "menus hud", color: "bg-amber-500/20 text-amber-300 border-amber-500/30", type: "ISSUE" },
                { label: "compatibility", color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30", type: "REQ" },
              ].map((tag) => (
                <div
                  key={tag.label}
                  className={`px-2 py-1 border text-[9px] font-bold uppercase tracking-wider ${tag.color}`}
                >
                  {tag.type}: {tag.label}
                </div>
              ))}
            </div>

            {/* Evidence quotes */}
            <div className="space-y-2 mt-auto">
              <div className="border-l-2 border-red-500/50 pl-2.5">
                <p className="text-[10px] italic text-[#00F0FF]/60">&quot;keeps crashing mid-battle&quot;</p>
              </div>
              <div className="border-l-2 border-amber-500/50 pl-2.5">
                <p className="text-[10px] italic text-[#00F0FF]/60">&quot;inventory menus impossible to navigate&quot;</p>
              </div>
            </div>
          </div>

          {/* ═══ CENTER: Logo + Pricing (spans 2 rows) ═══ */}
          <div className="bg-[#030014]/80 row-span-2 flex flex-col items-center justify-center relative px-5 py-4">
            {/* SN logo box */}
            <div className="relative w-[56px] h-[56px] flex items-center justify-center font-bold text-xl border border-[#00F0FF]/40 mb-2">
              <div className="absolute -top-[2px] -left-[2px] w-2 h-2 border-t-2 border-l-2 border-[#00F0FF]" />
              <div className="absolute -top-[2px] -right-[2px] w-2 h-2 border-t-2 border-r-2 border-[#00F0FF]" />
              <div className="absolute -bottom-[2px] -left-[2px] w-2 h-2 border-b-2 border-l-2 border-[#FF0080]" />
              <div className="absolute -bottom-[2px] -right-[2px] w-2 h-2 border-b-2 border-r-2 border-[#FF0080]" />
              <span className="text-white font-bold tracking-tighter">SN</span>
            </div>

            <span className="font-bold tracking-[0.35em] text-[18px] uppercase text-white mb-1">
              SENTINEXT
            </span>

            <span className="text-[10px] uppercase tracking-[0.2em] text-[#9D9AB4] font-mono mb-5">
              Steam Review Intelligence
            </span>

            {/* Pricing tiers */}
            <div className="w-full max-w-[340px] space-y-2 mb-4">
              {/* Free */}
              <div className="relative border border-[#00F0FF]/15 bg-[#00F0FF]/[0.02] p-3 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#00F0FF]/60 mb-0.5">Free</div>
                  <div className="text-[10px] text-[#9D9AB4]">1,000 credits / month</div>
                </div>
                <div className="text-[22px] font-bold text-white tracking-tight">$0</div>
              </div>

              {/* Indie — highlighted */}
              <div className="relative border border-[#00F0FF]/40 bg-[#00F0FF]/[0.05] p-3 flex items-center justify-between shadow-[0_0_15px_rgba(0,240,255,0.08)]">
                <div className="absolute -top-[1px] -left-[1px] w-2 h-2 border-t border-l border-[#00F0FF]" />
                <div className="absolute -top-[1px] -right-[1px] w-2 h-2 border-t border-r border-[#00F0FF]" />
                <div className="absolute -bottom-[1px] -left-[1px] w-2 h-2 border-b border-l border-[#FF0080]" />
                <div className="absolute -bottom-[1px] -right-[1px] w-2 h-2 border-b border-r border-[#FF0080]" />
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#00F0FF] mb-0.5">Indie</div>
                  <div className="text-[10px] text-[#9D9AB4]">5,000 credits / month</div>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-[22px] font-bold text-[#00F0FF] tracking-tight">$8</span>
                  <span className="text-[10px] text-[#00F0FF]/40 uppercase">/mo</span>
                </div>
              </div>

              {/* Enterprise */}
              <div className="relative border border-[#00F0FF]/15 bg-[#00F0FF]/[0.02] p-3 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#00F0FF]/60 mb-0.5">Enterprise</div>
                  <div className="text-[10px] text-[#9D9AB4]">Custom credits &amp; limits</div>
                </div>
                <div className="text-[16px] font-bold text-white/60 tracking-wider uppercase">Custom</div>
              </div>
            </div>

            <span className="text-[11px] uppercase tracking-[0.25em] text-[#00F0FF]/70 font-bold">
              Try free &mdash; no card required
            </span>
          </div>

          {/* ═══ TOP-RIGHT: Agent Chat ═══ */}
          <div className="bg-[#030014] p-4 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center border border-[#00F0FF]/20 bg-[#00F0FF]/5">
                <MessageSquare className="w-4 h-4 text-[#00F0FF]" />
              </div>
              <div className="text-[12px] font-bold uppercase tracking-[0.15em] text-[#00F0FF]">
                Agent Chat
              </div>
            </div>

            {/* User message */}
            <div className="flex justify-end mb-3">
              <div className="max-w-[85%] bg-[#00F0FF]/10 border border-[#00F0FF]/30 p-2.5">
                <p className="text-[11px] text-white">What are the top technical issues?</p>
              </div>
            </div>

            {/* Agent response with bar chart */}
            <div className="flex gap-2.5 flex-1">
              <div className="w-6 h-6 flex-shrink-0 bg-[#00F0FF]/20 border border-[#00F0FF]/30 flex items-center justify-center mt-0.5">
                <MessageSquare className="w-3 h-3 text-[#00F0FF]" />
              </div>
              <div className="flex-1 flex flex-col min-w-0">
                <p className="text-[10px] text-[#00F0FF]/70 leading-relaxed mb-2">
                  Across 1,000 reviews, top technical issues:
                </p>
                {/* Horizontal bars */}
                <div className="bg-black/30 border border-[#00F0FF]/10 p-2.5 space-y-2 mb-2">
                  {[
                    { label: "Stability / Crashes", value: 42, color: "bg-red-500" },
                    { label: "Performance", value: 31, color: "bg-amber-500" },
                    { label: "Networking", value: 18, color: "bg-sky-500" },
                    { label: "Save Data", value: 9, color: "bg-purple-500" },
                  ].map((item) => (
                    <div key={item.label}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[9px] text-[#00F0FF]/50">{item.label}</span>
                        <span className="text-[9px] text-white/80 font-bold">{item.value}%</span>
                      </div>
                      <div className="h-[5px] bg-[#00F0FF]/10 overflow-hidden">
                        <div className={`h-full ${item.color}`} style={{ width: `${item.value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                {/* Evidence */}
                <div className="border-l-2 border-red-500/50 pl-2.5 mt-auto">
                  <p className="text-[10px] italic text-[#00F0FF]/60">
                    &quot;crashes every time I enter the third act&quot;
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ═══ BOTTOM-LEFT: Dashboard Insights ═══ */}
          <div className="bg-[#030014] p-4 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center border border-[#00F0FF]/20 bg-[#00F0FF]/5">
                <BarChart2 className="w-4 h-4 text-[#00F0FF]" />
              </div>
              <div className="text-[12px] font-bold uppercase tracking-[0.15em] text-[#00F0FF]">
                Dashboard Insights
              </div>
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {[
                { label: "Rec. Rate", value: "87%", color: "text-emerald-400", border: "border-l-emerald-500" },
                { label: "Issue Rate", value: "23%", color: "text-amber-400", border: "border-l-amber-500" },
                { label: "Req. Rate", value: "15%", color: "text-sky-400", border: "border-l-sky-500" },
                { label: "Reviews", value: "1,000", color: "text-[#00F0FF]", border: "border-l-[#00F0FF]" },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className={`bg-[#00F0FF]/5 border border-[#00F0FF]/10 border-l-2 ${kpi.border} p-1.5`}
                >
                  <p className="text-[8px] uppercase tracking-wider text-[#00F0FF]/40 truncate">{kpi.label}</p>
                  <p className={`text-[12px] font-bold ${kpi.color}`}>{kpi.value}</p>
                </div>
              ))}
            </div>

            {/* Sentiment bar chart */}
            <div className="text-[9px] text-[#00F0FF]/40 font-mono uppercase tracking-widest mb-1.5">Sentiment Trend</div>
            <div className="bg-[#00F0FF]/5 border border-[#00F0FF]/10 p-2 h-[55px] mb-3">
              <div className="h-full flex items-end gap-[3px]">
                {[40, 45, 42, 55, 60, 58, 72, 75, 80, 85, 82, 87].map((v, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-[#00F0FF]/50 border-x border-[#00F0FF]/20"
                    style={{ height: `${v}%` }}
                  />
                ))}
              </div>
            </div>

            {/* Category breakdown */}
            <div className="text-[9px] text-[#00F0FF]/40 font-mono uppercase tracking-widest mb-1.5">Categories</div>
            <div className="space-y-2 flex-1">
              {[
                { name: "Gameplay", value: 85, color: "bg-emerald-500" },
                { name: "Technical", value: 62, color: "bg-amber-500" },
                { name: "Content", value: 78, color: "bg-sky-500" },
                { name: "Value", value: 71, color: "bg-purple-500" },
              ].map((cat) => (
                <div key={cat.name}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] text-[#00F0FF]/50">{cat.name}</span>
                    <span className="text-[10px] text-white/70 font-bold">{cat.value}%</span>
                  </div>
                  <div className="h-[5px] bg-[#00F0FF]/10 overflow-hidden">
                    <div className={`h-full ${cat.color}`} style={{ width: `${cat.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ═══ BOTTOM-RIGHT: Game Compare ═══ */}
          <div className="bg-[#030014] p-4 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center border border-[#00F0FF]/20 bg-[#00F0FF]/5">
                <GitCompare className="w-4 h-4 text-[#00F0FF]" />
              </div>
              <div className="text-[12px] font-bold uppercase tracking-[0.15em] text-[#00F0FF]">
                Game Compare
              </div>
            </div>

            {/* Compare header */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-[#00F0FF]/5 border border-[#00F0FF]/10 p-2.5 text-center">
                <p className="text-[9px] text-[#00F0FF]/40 uppercase tracking-wider mb-1">Game A</p>
                <p className="text-[16px] font-bold text-emerald-400">87%</p>
                <p className="text-[8px] text-[#00F0FF]/30 uppercase">Rec. Rate</p>
              </div>
              <div className="bg-[#00F0FF]/5 border border-[#00F0FF]/10 p-2.5 text-center">
                <p className="text-[9px] text-[#00F0FF]/40 uppercase tracking-wider mb-1">Game B</p>
                <p className="text-[16px] font-bold text-amber-400">72%</p>
                <p className="text-[8px] text-[#00F0FF]/30 uppercase">Rec. Rate</p>
              </div>
            </div>

            {/* Comparison bars */}
            <div className="text-[9px] text-[#00F0FF]/40 font-mono uppercase tracking-widest mb-2">Category Comparison</div>
            <div className="space-y-2.5 flex-1">
              {[
                { name: "Gameplay", a: 85, b: 68 },
                { name: "Technical", a: 62, b: 78 },
                { name: "Content", a: 78, b: 55 },
                { name: "UI/UX", a: 45, b: 60 },
                { name: "Value", a: 71, b: 82 },
              ].map((cat) => (
                <div key={cat.name}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] text-[#00F0FF]/50">{cat.name}</span>
                    <span className="text-[9px] text-white/60">{cat.a}% vs {cat.b}%</span>
                  </div>
                  <div className="flex gap-1">
                    <div className="flex-1 h-[5px] bg-[#00F0FF]/10 overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${cat.a}%` }} />
                    </div>
                    <div className="flex-1 h-[5px] bg-[#00F0FF]/10 overflow-hidden">
                      <div className="h-full bg-amber-500" style={{ width: `${cat.b}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
