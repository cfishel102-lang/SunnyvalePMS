// Each property has its own look: four colours, three fonts and a logo.
// Both the staff side and the guest booking pages are themed from it.
// A property with no brand set uses the SunnyvalePMS look.
import type { CSSProperties } from "react";

export type Brand = {
  colors: { primary: string; accent: string; tint: string; highlight: string };
  fonts: { heading: string; label: string; body: string };
  /** Logo for light backgrounds, and (optionally) one for dark backgrounds. */
  logo?: string;
  logoOnDark?: string;
};

export const PRODUCT = "SunnyvalePMS";
export const DEFAULT_FONT = "Geist";
export const DEFAULT_BRAND: Brand = {
  colors: { primary: "#1F4E5F", accent: "#C8642A", tint: "#C9D3D6", highlight: "#F2C94C" },
  fonts: { heading: DEFAULT_FONT, label: DEFAULT_FONT, body: DEFAULT_FONT },
};

// Fonts a brand deck can name. All are free Google Fonts. Display fonts suit headings; text fonts suit body copy.
export const DISPLAY_FONTS = ["Oswald", "Bebas Neue", "Anton", "Playfair Display", "Merriweather", "Lora", "Roboto Slab", "Roboto Condensed", "Barlow Condensed", "Archivo Black", "Abril Fatface", "Libre Baskerville", "Cormorant Garamond", "DM Serif Display", "Fjalla One", "Alfa Slab One", "Josefin Sans", "Raleway", "Quicksand", "Cabin"];
export const TEXT_FONTS = ["Nunito Sans", "Nunito", "Open Sans", "Lato", "Inter", "Roboto", "Source Sans 3", "Montserrat", "Poppins", "Work Sans", "DM Sans", "Mulish", "Karla", "Rubik", "PT Sans", "Noto Sans", "Figtree", "Manrope", "Barlow", "IBM Plex Sans"];
export const FONTS = [DEFAULT_FONT, ...[...DISPLAY_FONTS, ...TEXT_FONTS].sort()];

const HEX = /^#[0-9a-f]{6}$/i;
const isFont = (f: unknown): f is string => typeof f === "string" && FONTS.includes(f);

/** Read a stored brand, filling anything missing or invalid from the default. */
export function getBrand(raw: unknown): Brand {
  const r = (raw ?? {}) as Partial<Brand>;
  const c = (r.colors ?? {}) as Record<string, unknown>;
  const f = (r.fonts ?? {}) as Record<string, unknown>;
  const col = (k: keyof Brand["colors"]) => (typeof c[k] === "string" && HEX.test(c[k] as string) ? (c[k] as string) : DEFAULT_BRAND.colors[k]);
  const font = (k: keyof Brand["fonts"]) => (isFont(f[k]) ? (f[k] as string) : DEFAULT_FONT);
  return {
    colors: { primary: col("primary"), accent: col("accent"), tint: col("tint"), highlight: col("highlight") },
    fonts: { heading: font("heading"), label: font("label"), body: font("body") },
    logo: typeof r.logo === "string" ? r.logo : undefined,
    logoOnDark: typeof r.logoOnDark === "string" ? r.logoOnDark : undefined,
  };
}

function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
/** Perceived brightness, 0 (black) to 1 (white). */
export function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function saturation(hex: string) {
  const [r, g, b] = rgb(hex);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}
/** White or near-black, whichever reads better on this colour. */
export const textOn = (hex: string) => (luminance(hex) > 0.36 ? "#1c1f1a" : "#ffffff");

/** CSS variables that re-theme everything inside the element they are set on. */
export function brandStyle(b: Brand): CSSProperties {
  const family = (f: string) => (f === DEFAULT_FONT ? "var(--font-geist-sans)" : `"${f}"`) + ", ui-sans-serif, system-ui, sans-serif";
  return {
    "--brand-primary": b.colors.primary,
    "--brand-accent": b.colors.accent,
    "--brand-tint": b.colors.tint,
    "--brand-highlight": b.colors.highlight,
    "--brand-on-primary": textOn(b.colors.primary),
    "--brand-on-accent": textOn(b.colors.accent),
    "--brand-font-heading": family(b.fonts.heading),
    "--brand-font-label": family(b.fonts.label),
    "--brand-font-body": family(b.fonts.body),
  } as CSSProperties;
}

/** Stylesheet address that loads the brand's fonts, or null if it only uses the built-in font. */
export function fontsHref(b: Brand) {
  const names = [...new Set(Object.values(b.fonts))].filter((f) => f !== DEFAULT_FONT);
  if (!names.length) return null;
  return "https://fonts.googleapis.com/css2?" + names.map((f) => `family=${f.replace(/ /g, "+")}:wght@400;500;600;700`).join("&") + "&display=swap";
}

/**
 * Suggest a brand from the text of a brand deck: the colour codes and font names it mentions.
 * Returns only what was found; the person confirms or changes every choice before saving.
 */
export function suggestFromDeck(text: string) {
  const hexes = [...new Set((text.match(/#[0-9a-f]{6}\b/gi) ?? []).map((h) => h.toUpperCase()))];
  // Dark enough for white text: these can carry buttons and headers.
  const dark = hexes.filter((h) => luminance(h) <= 0.36).sort((a, b) => saturation(b) - saturation(a));
  const light = hexes.filter((h) => luminance(h) > 0.36 && luminance(h) < 0.95).sort((a, b) => saturation(b) - saturation(a));
  const colors: Partial<Brand["colors"]> = {};
  if (dark.length) {
    colors.accent = dark[0]; // the most vivid dark colour draws the eye to actions
    colors.primary = dark[dark.length - 1]; // the calmest dark colour carries headers and navigation
  }
  if (light.length) {
    colors.highlight = light[0];
    colors.tint = light[light.length - 1];
  }

  const lower = text.toLowerCase();
  const found = FONTS.filter((f) => f !== DEFAULT_FONT && new RegExp(`\\b${f.toLowerCase()}\\b`).test(lower))
    // "Nunito Sans" also matches "Nunito": keep the longer name only.
    .filter((f, _, all) => !all.some((g) => g !== f && g.startsWith(f + " ")))
    .sort((a, b) => lower.indexOf(a.toLowerCase()) - lower.indexOf(b.toLowerCase()));
  const fonts: Partial<Brand["fonts"]> = {};
  if (found.length) {
    fonts.heading = found.find((f) => DISPLAY_FONTS.includes(f)) ?? found[0];
    const rest = found.filter((f) => f !== fonts.heading);
    fonts.body = [...rest].reverse().find((f) => TEXT_FONTS.includes(f)) ?? rest[rest.length - 1] ?? fonts.heading;
    fonts.label = rest.find((f) => f !== fonts.body) ?? fonts.body;
  }
  return { colors, fonts, hexes, fontsFound: found };
}
