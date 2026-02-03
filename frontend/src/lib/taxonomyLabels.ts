/**
 * Shared taxonomy label formatting utilities
 * This module provides DRY label formatting for taxonomy categories and subcategories
 */

export const MAIN_CATEGORY_LABELS: Record<string, string> = {
  gameplay: 'Gameplay',
  technical: 'Technical',
  content_design: 'Content & Design',
  ui_ux_accessibility: 'UI/UX & Accessibility',
  onboarding: 'Onboarding',
  presentation: 'Presentation',
  online_community: 'Online & Community',
  developer_updates: 'Developer & Updates',
  monetization_value: 'Monetization & Value',
  other: 'Other / Meta',
};

/**
 * Titleize a string by capitalizing each word and handling special acronyms
 */
export function titleize(value: string): string {
  return value
    .replace(/_/g, ' ')
    .split(' ')
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === 'ui') return 'UI';
      if (lower === 'ux') return 'UX';
      if (lower === 'ugc') return 'UGC';
      if (lower === 'ai') return 'AI';
      if (lower === 'dlc') return 'DLC';
      if (lower === 'p2w') return 'P2W';
      if (lower === 'ctd') return 'CTD';
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/**
 * Format a taxonomy label (category or subcategory) for display
 * Handles both main categories and subcategories with slash notation
 */
export function formatTaxonomyLabel(value: string | undefined | null): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const normalized = trimmed.toLowerCase();
  const direct = MAIN_CATEGORY_LABELS[normalized];
  if (direct) return direct;
  if (trimmed.includes('/')) {
    const [mainRaw, subRaw] = trimmed.split('/', 2);
    const main = MAIN_CATEGORY_LABELS[mainRaw.toLowerCase()] ?? titleize(mainRaw);
    return `${main} / ${titleize(subRaw)}`;
  }
  return titleize(trimmed);
}
