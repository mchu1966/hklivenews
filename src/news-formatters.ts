import { getNewsSourceDefinition } from "./handlers/news-source-handler";

const HONG_KONG_UTC_OFFSET_MS = 8 * 60 * 60 * 1_000;

export type NewsSource = "rthk" | "now";

export function getSourceLabel(source: string): string {
  return source === "rthk" || source === "now" ? getNewsSourceDefinition(source).label : source;
}

export function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 3) {
    return ".".repeat(maxLength);
  }

  return value.slice(0, maxLength - 3) + "...";
}

export function formatNewsPosition(currentIndex: number, totalNews: number): string {
  return `${currentIndex + 1}/${totalNews}`;
}

export function formatPublishedAt(publishedAt: number): string {
  const date = new Date(publishedAt + HONG_KONG_UTC_OFFSET_MS);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hour}:${minute} HKT`;
}

export function getNextNewsIndex(currentIndex: number, totalNews: number): number {
  return totalNews === 0 ? 0 : (currentIndex + 1) % totalNews;
}

export function truncateHeadline(headline: string, maxLength: number): string {
  const characters = Array.from(headline);

  if (characters.length <= maxLength) {
    return headline;
  }

  return `${characters.slice(0, maxLength - 3).join("")}...`;
}

export function formatHeadline(headline: string, maxLength: number): string {
  const displayHeadline = truncateHeadline(headline, maxLength);
  const paddingLength = Math.max(0, maxLength - Array.from(displayHeadline).length);

  return `${displayHeadline}${"\u00a0".repeat(paddingLength)}`;
}
