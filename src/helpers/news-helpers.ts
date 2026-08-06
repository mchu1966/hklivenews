export function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function extractTextPreservingLineBreaks(html: string): string {
  return html
    .split(/<br\s*\/?>/gi)
    .map((part) =>
      part
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .join("\n")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n\n")
    .trim();
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

export function toSafeMediaUrl(value: string | undefined, baseUrl: string): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value, baseUrl);

    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
