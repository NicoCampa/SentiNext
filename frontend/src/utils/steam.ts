/**
 * Steam-specific utilities
 */

export function getSteamImageUrl(appId: number, variant: "capsule" | "header" = "capsule"): string {
  const suffix = variant === "header" ? "header.jpg" : "capsule_184x69.jpg";
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/${suffix}`;
}

export function getSteamImageFallbacks(appId: number, variant: "capsule" | "header" = "capsule"): string[] {
  const baseUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}`;

  if (variant === "header") {
    return [
      `${baseUrl}/header.jpg`,
      `${baseUrl}/capsule_616x353.jpg`,
      `${baseUrl}/library_600x900.jpg`,
      `${baseUrl}/capsule_231x87.jpg`,
    ];
  }

  return [
    `${baseUrl}/capsule_184x69.jpg`,
    `${baseUrl}/capsule_sm_120.jpg`,
    `${baseUrl}/capsule_231x87.jpg`,
    `${baseUrl}/header.jpg`,
  ];
}

export function getSteamAppUrl(appId: number): string {
  return `https://store.steampowered.com/app/${appId}`;
}

export function extractAppIdFromUrl(url: string): number | null {
  const match = url.match(/app\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}