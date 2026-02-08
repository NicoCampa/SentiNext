'use client';

import { useState, useEffect, useCallback } from 'react';
import { Portal } from './Portal';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SentiNextLogo } from './SentiNextLogo';
import { createCheckoutSession } from '@/lib/api';

const TOTAL_STEPS = 5;

export function Onboarding() {
  const { showOnboarding, markOnboardingComplete } = useOnboarding();
  const { t } = useLanguage();
  const [currentStep, setCurrentStep] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (showOnboarding) {
      setMounted(true);
      setCurrentStep(0);
    }
  }, [showOnboarding]);

  const handleNext = useCallback(() => {
    if (currentStep < TOTAL_STEPS - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      markOnboardingComplete();
    }
  }, [currentStep, markOnboardingComplete]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  const handleSkip = useCallback(() => {
    markOnboardingComplete();
  }, [markOnboardingComplete]);

  // Keyboard navigation
  useEffect(() => {
    if (!showOnboarding) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handleBack();
      } else if (e.key === 'Escape') {
        handleSkip();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showOnboarding, handleNext, handleBack, handleSkip]);

  if (!showOnboarding) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
        {/* Background grid effect */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `
              linear-gradient(rgba(0, 255, 255, 0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0, 255, 255, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px',
          }}
        />

        {/* Modal content - larger size */}
        <Card
          variant="glass"
          className={`relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto ${mounted ? 'animate-modal-content' : 'opacity-0'}`}
          padding="lg"
        >
          {/* Progress dots */}
          <div className="absolute top-6 right-6 flex gap-2">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div
                key={i}
                className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                  i === currentStep
                    ? 'bg-[rgb(0,255,255)] scale-125'
                    : i < currentStep
                    ? 'bg-[rgb(0,255,255)]/50'
                    : 'bg-[rgb(0,255,255)]/20'
                }`}
              />
            ))}
          </div>

          {/* Step content */}
          <div className="min-h-[420px] flex flex-col">
            {currentStep === 0 && <StepWelcome />}
            {currentStep === 1 && <StepSearchAnalyze />}
            {currentStep === 2 && <StepInsights />}
            {currentStep === 3 && <StepAIFeatures />}
            {currentStep === 4 && <StepPricing onComplete={markOnboardingComplete} />}
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-[rgb(0,255,255)]/10">
            <div>
              {currentStep > 0 ? (
                <Button variant="ghost" size="md" onClick={handleBack}>
                  {t('onboarding.back')}
                </Button>
              ) : (
                <Button variant="ghost" size="md" onClick={handleSkip}>
                  {t('onboarding.skip')}
                </Button>
              )}
            </div>
            <Button variant="primary" size="lg" onClick={handleNext}>
              {currentStep === TOTAL_STEPS - 1 ? t('onboarding.getStarted') : t('onboarding.next')}
            </Button>
          </div>
        </Card>
      </div>
    </Portal>
  );
}

function StepWelcome() {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col items-center justify-center text-center flex-1 py-8">
      {/* Logo */}
      <div className="mb-8">
        <SentiNextLogo size="xl" glow className="mx-auto" />
      </div>

      <h1 className="text-3xl font-bold text-white mb-3">
        {t('onboarding.welcome')}
      </h1>
      <p className="text-[rgb(150,150,170)] text-base max-w-md mb-8">
        {t('onboarding.welcomeDesc')}
      </p>

      {/* Feature highlights */}
      <div className="grid grid-cols-3 gap-4 w-full max-w-lg">
        {[
          { label: t('onboarding.stat.reviewsAnalyzed'), value: '1,000+' },
          { label: t('onboarding.stat.aiCategories'), value: '60+' },
          { label: t('onboarding.stat.languages'), value: '29' },
        ].map((stat, i) => (
          <div
            key={i}
            className="p-3 bg-[rgb(10,10,25)]/50 border border-[rgb(0,255,255)]/10 animate-fade-slide-up"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <p className="text-lg font-bold text-[rgb(0,255,255)]">{stat.value}</p>
            <p className="text-[10px] uppercase tracking-wider text-[rgb(100,100,120)]">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepSearchAnalyze() {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col flex-1">
      {/* Header */}
      <div className="mb-6">
        <div className="w-10 h-10 mb-4 flex items-center justify-center bg-[rgb(0,255,255)]/10 border border-[rgb(0,255,255)]/30">
          <svg className="w-5 h-5 text-[rgb(0,255,255)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">
          {t('onboarding.step1.title')}
        </h2>
        <p className="text-[rgb(150,150,170)] text-sm">
          {t('onboarding.step1.desc')}
        </p>
      </div>

      {/* Visual: Search + Classification pipeline */}
      <div className="flex-1 grid grid-cols-2 gap-6">
        {/* Left: Search */}
        <div className="space-y-3">
          <p className="text-[10px] uppercase tracking-wider text-[rgb(0,255,255)]/70 mb-2">1. Search Game</p>
          <div className="bg-[rgb(10,10,25)] border border-[rgb(0,255,255)]/20 p-3">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-[rgb(0,255,255)]/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="text-[rgb(0,255,255)] text-xs">Elden Ring</span>
              <span className="ml-auto text-[rgb(0,255,255)]/50 text-[10px]">Enter</span>
            </div>
            <div className="space-y-1.5">
              {['Elden Ring', 'Elden Ring: Shadow of the Erdtree'].map((game, i) => (
                <div
                  key={game}
                  className={`p-2 flex items-center gap-2 animate-fade-slide-up ${i === 0 ? 'bg-[rgb(0,255,255)]/10 border border-[rgb(0,255,255)]/30' : 'bg-[rgb(15,15,35)]/50 border border-transparent'}`}
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="w-6 h-6 bg-[rgb(0,255,255)]/20" />
                  <span className="text-[11px] text-white truncate">{game}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Classification */}
        <div className="space-y-3">
          <p className="text-[10px] uppercase tracking-wider text-[rgb(0,255,255)]/70 mb-2">2. AI Classification</p>
          <div className="bg-[rgb(10,10,25)] border border-[rgb(0,255,255)]/20 p-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] text-[rgb(100,100,120)]">Processing reviews...</span>
              <span className="text-[10px] text-[rgb(0,255,255)]">847/1000</span>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 bg-[rgb(0,255,255)]/10 mb-4">
              <div className="h-full bg-[rgb(0,255,255)] w-[85%] animate-pulse" />
            </div>
            {/* Categories being detected */}
            <div className="space-y-1.5">
              {[
                { cat: 'gameplay/difficulty', count: 234 },
                { cat: 'technical/performance', count: 156 },
                { cat: 'content_design/narrative_characters', count: 98 },
              ].map((item, i) => (
                <div
                  key={item.cat}
                  className="flex items-center justify-between text-[11px] animate-fade-slide-up"
                  style={{ animationDelay: `${(i + 2) * 100}ms` }}
                >
                  <span className="text-[rgb(150,150,170)]">{item.cat}</span>
                  <span className="text-[rgb(0,255,255)]">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepInsights() {
  const { t } = useLanguage();

  // Mini bar chart data
  const categoryData = [
    { name: 'Gameplay', value: 85, color: 'bg-emerald-500' },
    { name: 'Technical', value: 62, color: 'bg-amber-500' },
    { name: 'Content', value: 78, color: 'bg-sky-500' },
    { name: 'Value', value: 71, color: 'bg-purple-500' },
  ];

  // Mini trend data points
  const trendPoints = [40, 45, 42, 55, 60, 58, 72, 75, 80, 85, 82, 87];

  return (
    <div className="flex flex-col flex-1">
      {/* Header */}
      <div className="mb-6">
        <div className="w-10 h-10 mb-4 flex items-center justify-center bg-[rgb(0,255,255)]/10 border border-[rgb(0,255,255)]/30">
          <svg className="w-5 h-5 text-[rgb(0,255,255)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">
          {t('onboarding.step2.title')}
        </h2>
        <p className="text-[rgb(150,150,170)] text-sm">
          {t('onboarding.step2.desc')}
        </p>
      </div>

      {/* Dashboard preview */}
      <div className="flex-1 grid grid-cols-2 gap-4">
        {/* KPIs */}
        <div className="space-y-3">
          <p className="text-[10px] uppercase tracking-wider text-[rgb(0,255,255)]/70">{t('onboarding.step2.keyMetrics')}</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Recommendation', value: '87%', color: 'text-emerald-400', border: 'border-l-emerald-500' },
              { label: 'Issue Rate', value: '23%', color: 'text-amber-400', border: 'border-l-amber-500' },
              { label: 'Request Rate', value: '15%', color: 'text-sky-400', border: 'border-l-sky-500' },
              { label: 'Reviews', value: '1,000', color: 'text-[rgb(0,255,255)]', border: 'border-l-[rgb(0,255,255)]' },
            ].map((kpi, i) => (
              <div
                key={kpi.label}
                className={`bg-[rgb(10,10,25)]/50 border border-[rgb(0,255,255)]/10 border-l-2 ${kpi.border} p-2.5 animate-fade-slide-up`}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <p className="text-[9px] uppercase tracking-wider text-[rgb(100,100,120)] mb-0.5">{kpi.label}</p>
                <p className={`text-base font-bold ${kpi.color}`}>{kpi.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Trend chart */}
        <div className="space-y-3">
          <p className="text-[10px] uppercase tracking-wider text-[rgb(0,255,255)]/70">{t('onboarding.step2.sentimentTrend')}</p>
          <div className="bg-[rgb(10,10,25)]/50 border border-[rgb(0,255,255)]/10 p-3 h-[100px]">
            <div className="h-full flex items-end gap-1">
              {trendPoints.map((value, i) => (
                <div
                  key={i}
                  className="flex-1 bg-[rgb(0,255,255)]/60 animate-scale-in"
                  style={{
                    height: `${value}%`,
                    animationDelay: `${i * 50}ms`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Category breakdown */}
        <div className="col-span-2 space-y-3">
          <p className="text-[10px] uppercase tracking-wider text-[rgb(0,255,255)]/70">{t('onboarding.step2.categoryBreakdown')}</p>
          <div className="bg-[rgb(10,10,25)]/50 border border-[rgb(0,255,255)]/10 p-3">
            <div className="space-y-2">
              {categoryData.map((cat, i) => (
                <div key={cat.name} className="animate-fade-slide-up" style={{ animationDelay: `${(i + 4) * 80}ms` }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-[rgb(150,150,170)]">{cat.name}</span>
                    <span className="text-[11px] text-white font-medium">{cat.value}%</span>
                  </div>
                  <div className="h-1.5 bg-[rgb(0,255,255)]/10">
                    <div className={`h-full ${cat.color}`} style={{ width: `${cat.value}%` }} />
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

function StepAIFeatures() {
  const { t } = useLanguage();

  // Mini chart data for the response
  const issueData = [
    { label: 'Performance', value: 45 },
    { label: 'Bugs', value: 28 },
    { label: 'Crashes', value: 15 },
  ];

  const features = [
    {
      icon: (
        <svg className="w-5 h-5 text-[rgb(0,255,255)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
      title: t('onboarding.feature.chat'),
      desc: t('onboarding.feature.chatDesc'),
      borderColor: 'border-l-[rgb(0,255,255)]',
    },
    {
      icon: (
        <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      title: t('onboarding.feature.summary'),
      desc: t('onboarding.feature.summaryDesc'),
      borderColor: 'border-l-emerald-500',
    },
    {
      icon: (
        <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      ),
      title: t('onboarding.feature.compare'),
      desc: t('onboarding.feature.compareDesc'),
      borderColor: 'border-l-purple-500',
    },
  ];

  return (
    <div className="flex flex-col flex-1">
      {/* Header */}
      <div className="mb-5">
        <div className="w-10 h-10 mb-4 flex items-center justify-center bg-[rgb(0,255,255)]/10 border border-[rgb(0,255,255)]/30">
          <svg className="w-5 h-5 text-[rgb(0,255,255)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">
          {t('onboarding.step3.title')}
        </h2>
        <p className="text-[rgb(150,150,170)] text-sm">
          {t('onboarding.step3.desc')}
        </p>
      </div>

      {/* Feature cards grid */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {features.map((feature, i) => (
          <div
            key={i}
            className={`bg-[rgb(10,10,25)]/50 border border-[rgb(0,255,255)]/10 border-l-2 ${feature.borderColor} p-3 animate-fade-slide-up`}
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="mb-2">{feature.icon}</div>
            <p className="text-xs font-semibold text-white mb-1">{feature.title}</p>
            <p className="text-[10px] text-[rgb(100,100,120)] leading-snug">{feature.desc}</p>
          </div>
        ))}
      </div>

      {/* Compact chat preview */}
      <div className="flex-1 bg-[rgb(10,10,25)]/50 border border-[rgb(0,255,255)]/10 p-3">
        {/* User message */}
        <div className="flex justify-end mb-3 animate-fade-slide-up" style={{ animationDelay: '250ms' }}>
          <div className="max-w-[75%] bg-[rgb(0,255,255)]/10 border border-[rgb(0,255,255)]/30 p-2.5">
            <p className="text-xs text-white">What are the main technical issues?</p>
          </div>
        </div>

        {/* AI response with chart */}
        <div className="flex gap-2.5 animate-fade-slide-up" style={{ animationDelay: '400ms' }}>
          <div className="w-7 h-7 flex-shrink-0 bg-[rgb(0,255,255)]/20 border border-[rgb(0,255,255)]/30 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-[rgb(0,255,255)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="flex-1 space-y-2">
            <p className="text-xs text-[rgb(200,200,210)]">
              Based on 1,000 reviews, the main technical issues:
            </p>
            <div className="bg-[rgb(5,5,15)] border border-[rgb(0,255,255)]/10 p-2.5">
              <div className="space-y-1.5">
                {issueData.map((item, i) => (
                  <div key={item.label} className="animate-fade-slide-up" style={{ animationDelay: `${(i + 5) * 80}ms` }}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] text-[rgb(150,150,170)]">{item.label}</span>
                      <span className="text-[10px] text-amber-400 font-medium">{item.value}%</span>
                    </div>
                    <div className="h-1.5 bg-[rgb(0,255,255)]/10">
                      <div className="h-full bg-amber-500/80" style={{ width: `${item.value}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepPricing({ onComplete }: { onComplete: () => void }) {
  const { t } = useLanguage();
  const [upgradeLoading, setUpgradeLoading] = useState<string | null>(null);

  async function handleSubscribe(tier: "indie") {
    setUpgradeLoading(tier);
    try {
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      const result = await createCheckoutSession(
        tier,
        `${baseUrl}/dashboard?view=home&upgrade=success`,
        `${baseUrl}/dashboard?view=home&upgrade=cancelled`,
        "monthly"
      );
      if (result.checkout_url) {
        window.location.href = result.checkout_url;
      }
    } catch (err) {
      console.error("Failed to create checkout session", err);
    } finally {
      setUpgradeLoading(null);
    }
  }

  const tiers = [
    {
      name: t('onboarding.tier.free'),
      price: '$0',
      priceLabel: '',
      credits: t('onboarding.tier.trialCredits'),
      color: 'border-t-slate-400',
      textColor: 'text-slate-300',
      btnClass: 'border-slate-500/30 text-slate-300 hover:bg-slate-500/10',
      badge: null,
      action: 'free' as const,
    },
    {
      name: t('onboarding.tier.indie'),
      price: '$8',
      priceLabel: t('onboarding.tier.perMonth'),
      credits: t('onboarding.tier.indieCredits'),
      color: 'border-t-emerald-500',
      textColor: 'text-emerald-400',
      btnClass: 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10',
      badge: null,
      action: 'indie' as const,
    },
    {
      name: t('onboarding.tier.enterprise'),
      price: t('onboarding.tier.custom'),
      priceLabel: '',
      credits: t('onboarding.tier.custom'),
      color: 'border-t-purple-500',
      textColor: 'text-purple-400',
      btnClass: 'border-purple-500/30 text-purple-400 hover:bg-purple-500/10',
      badge: null,
      action: 'enterprise' as const,
    },
  ];

  return (
    <div className="flex flex-col flex-1">
      {/* Header */}
      <div className="mb-5">
        <div className="w-10 h-10 mb-4 flex items-center justify-center bg-[rgb(0,255,255)]/10 border border-[rgb(0,255,255)]/30">
          <svg className="w-5 h-5 text-[rgb(0,255,255)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">
          {t('onboarding.step4.title')}
        </h2>
        <p className="text-[rgb(150,150,170)] text-sm">
          {t('onboarding.step4.desc')}
        </p>
      </div>

      {/* Tier cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {tiers.map((tier, i) => (
          <div
            key={i}
            className={`relative bg-[rgb(10,10,25)]/50 border border-[rgb(0,255,255)]/10 border-t-2 ${tier.color} p-3 animate-fade-slide-up flex flex-col`}
            style={{ animationDelay: `${i * 80}ms` }}
          >
            {tier.badge && (
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-sky-500 text-white text-[8px] uppercase tracking-wider px-2 py-0.5 font-semibold">
                {tier.badge}
              </div>
            )}
            <p className={`text-xs font-semibold ${tier.textColor} mb-2`}>{tier.name}</p>
            <p className="text-lg font-bold text-white leading-tight">
              {tier.price}
              {tier.priceLabel && <span className="text-[10px] font-normal text-[rgb(100,100,120)]">/{tier.priceLabel}</span>}
            </p>
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[rgb(100,100,120)]">{t('onboarding.tier.creditsLabel')}</span>
                <span className="text-[10px] text-white font-medium ml-auto">{tier.credits}</span>
              </div>
            </div>
            {/* Action button */}
            <button
              onClick={() => {
                if (tier.action === 'free') {
                  onComplete();
                } else if (tier.action === 'enterprise') {
                  onComplete();
                  window.location.href = '/support';
                } else {
                  handleSubscribe(tier.action);
                }
              }}
              disabled={upgradeLoading !== null}
              className={`mt-auto pt-3 w-full py-1.5 border text-[10px] uppercase tracking-wider transition-all disabled:opacity-50 ${tier.btnClass}`}
            >
              {upgradeLoading === tier.action
                ? '...'
                : tier.action === 'free'
                ? t('onboarding.tier.tryFree')
                : tier.action === 'enterprise'
                ? t('onboarding.tier.contactUs')
                : t('onboarding.tier.subscribe')}
            </button>
          </div>
        ))}
      </div>

    </div>
  );
}
