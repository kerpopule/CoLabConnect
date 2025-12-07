import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normalizes a URL by adding https:// if no protocol is present
 */
export function normalizeUrl(url: string): string {
  if (!url || url.trim() === "") return "";

  const trimmed = url.trim();

  // If it already has a protocol, return as-is
  if (trimmed.match(/^https?:\/\//i)) {
    return trimmed;
  }

  // Remove www. prefix if present (we'll add it back with https://)
  const withoutWww = trimmed.replace(/^www\./i, "");

  // Add https:// prefix
  return `https://${withoutWww}`;
}

/**
 * Social link types with their metadata
 */
export const SOCIAL_PLATFORMS = {
  linkedin: {
    name: "LinkedIn",
    icon: "Linkedin",
    placeholder: "linkedin.com/in/username",
    urlPattern: /linkedin\.com/i,
  },
  twitter: {
    name: "X / Twitter",
    icon: "Twitter",
    placeholder: "x.com/username",
    urlPattern: /x\.com|twitter\.com/i,
  },
  instagram: {
    name: "Instagram",
    icon: "Instagram",
    placeholder: "instagram.com/username",
    urlPattern: /instagram\.com/i,
  },
  github: {
    name: "GitHub",
    icon: "Github",
    placeholder: "github.com/username",
    urlPattern: /github\.com/i,
  },
  youtube: {
    name: "YouTube",
    icon: "Youtube",
    placeholder: "youtube.com/@channel",
    urlPattern: /youtube\.com|youtu\.be/i,
  },
  tiktok: {
    name: "TikTok",
    icon: "Music2",
    placeholder: "tiktok.com/@username",
    urlPattern: /tiktok\.com/i,
  },
  facebook: {
    name: "Facebook",
    icon: "Facebook",
    placeholder: "facebook.com/username",
    urlPattern: /facebook\.com|fb\.com/i,
  },
  dribbble: {
    name: "Dribbble",
    icon: "Dribbble",
    placeholder: "dribbble.com/username",
    urlPattern: /dribbble\.com/i,
  },
  behance: {
    name: "Behance",
    icon: "Palette",
    placeholder: "behance.net/username",
    urlPattern: /behance\.net/i,
  },
  website: {
    name: "Website",
    icon: "Globe",
    placeholder: "yourwebsite.com",
    urlPattern: /.*/,
  },
} as const;

export type SocialPlatformType = keyof typeof SOCIAL_PLATFORMS;

export interface SocialLink {
  id: string;
  type: SocialPlatformType;
  url: string;
  order: number;
}

/**
 * Generate a unique ID for social links
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Detect social platform type from URL
 */
export function detectPlatformFromUrl(url: string): SocialPlatformType {
  const normalizedUrl = url.toLowerCase();

  for (const [type, platform] of Object.entries(SOCIAL_PLATFORMS)) {
    if (type !== "website" && platform.urlPattern.test(normalizedUrl)) {
      return type as SocialPlatformType;
    }
  }

  return "website";
}

/**
 * Convert old social_links format to new SocialLink array format
 */
export function migrateOldSocialLinks(oldLinks: any): SocialLink[] {
  if (!oldLinks) return [];

  // If it's already an array, return as-is (new format)
  if (Array.isArray(oldLinks)) {
    return oldLinks;
  }

  // Convert old object format to new array format
  const links: SocialLink[] = [];
  let order = 0;

  if (oldLinks.linkedin) {
    links.push({ id: generateId(), type: 'linkedin', url: oldLinks.linkedin, order: order++ });
  }
  if (oldLinks.twitter) {
    links.push({ id: generateId(), type: 'twitter', url: oldLinks.twitter, order: order++ });
  }
  if (oldLinks.instagram) {
    links.push({ id: generateId(), type: 'instagram', url: oldLinks.instagram, order: order++ });
  }
  if (oldLinks.website) {
    links.push({ id: generateId(), type: 'website', url: oldLinks.website, order: order++ });
  }
  if (oldLinks.github) {
    links.push({ id: generateId(), type: 'github', url: oldLinks.github, order: order++ });
  }
  if (oldLinks.youtube) {
    links.push({ id: generateId(), type: 'youtube', url: oldLinks.youtube, order: order++ });
  }
  if (oldLinks.facebook) {
    links.push({ id: generateId(), type: 'facebook', url: oldLinks.facebook, order: order++ });
  }
  if (oldLinks.tiktok) {
    links.push({ id: generateId(), type: 'tiktok', url: oldLinks.tiktok, order: order++ });
  }

  return links;
}
