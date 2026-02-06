/**
 * Steam-specific utilities
 */

export function getSteamImageUrl(appId: number, variant: "capsule" | "header" = "capsule"): string {
  const suffix = variant === "header" ? "header.jpg" : "capsule_184x69.jpg";
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/${suffix}`;
}

export function getSteamImageFallbacks(appId: number, variant: "capsule" | "header" = "capsule"): string[] {
  const oldCdn = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}`;
  const newCdn = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}`;

  if (variant === "header") {
    return [
      `${oldCdn}/header.jpg`,
      `${newCdn}/header.jpg`,
      `${oldCdn}/capsule_616x353.jpg`,
      `${oldCdn}/library_600x900.jpg`,
      `${oldCdn}/capsule_231x87.jpg`,
    ];
  }

  return [
    `${oldCdn}/capsule_184x69.jpg`,
    `${newCdn}/capsule_184x69.jpg`,
    `${oldCdn}/capsule_sm_120.jpg`,
    `${oldCdn}/capsule_231x87.jpg`,
    `${oldCdn}/header.jpg`,
  ];
}

export function getSteamAppUrl(appId: number): string {
  return `https://store.steampowered.com/app/${appId}`;
}

export function extractAppIdFromUrl(url: string): number | null {
  const match = url.match(/app\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}