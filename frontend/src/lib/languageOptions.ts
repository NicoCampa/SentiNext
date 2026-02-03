export const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All languages" },
  { value: "english", label: "English" },
  { value: "german", label: "German" },
  { value: "french", label: "French" },
  { value: "spanish", label: "Spanish" },
  { value: "italian", label: "Italian" },
  { value: "portuguese", label: "Portuguese" },
  { value: "brazilian", label: "Brazilian PT" },
  { value: "russian", label: "Russian" },
  { value: "polish", label: "Polish" },
  { value: "turkish", label: "Turkish" },
  { value: "japanese", label: "Japanese" },
  { value: "koreana", label: "Korean" },
  { value: "schinese", label: "Simplified CN" },
  { value: "tchinese", label: "Traditional CN" },
];

export function languageLabelFor(value: string): string {
  const normalized = (value || "").toLowerCase();
  const match = LANGUAGE_OPTIONS.find((option) => option.value === normalized);
  return match ? match.label : value;
}
