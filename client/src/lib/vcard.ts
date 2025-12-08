// vCard generation utility for saving contacts

import { SocialLink } from "./utils";

export interface VCardData {
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  company?: string;
  bio?: string;
  avatarUrl?: string;
  socialLinks?: SocialLink[];
}

/**
 * Escape special characters for vCard format
 * vCard requires escaping: backslash, semicolon, comma, newline
 */
function escapeVCardValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Convert image URL to base64 data URI
 */
async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // Extract just the base64 data (remove data:image/...;base64, prefix)
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Map social platform types to vCard X-SOCIALPROFILE types
 */
function getVCardSocialType(platformType: string): string {
  const typeMap: Record<string, string> = {
    linkedin: 'linkedin',
    twitter: 'twitter',
    instagram: 'instagram',
    github: 'github',
    youtube: 'youtube',
    tiktok: 'tiktok',
    facebook: 'facebook',
    dribbble: 'dribbble',
    behance: 'behance',
    website: 'homepage',
  };
  return typeMap[platformType] || platformType;
}

/**
 * Generate a vCard 3.0 format string from profile data
 * vCard 3.0 is used for maximum compatibility across devices
 */
export async function generateVCard(data: VCardData): Promise<string> {
  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
  ];

  // Full name (required)
  lines.push(`FN:${escapeVCardValue(data.name)}`);

  // Structured name (N field) - split first/last name
  const nameParts = data.name.trim().split(/\s+/);
  const lastName = nameParts.length > 1 ? nameParts.pop() : '';
  const firstName = nameParts.join(' ');
  lines.push(`N:${escapeVCardValue(lastName || '')};${escapeVCardValue(firstName)};;;`);

  // Job title
  if (data.role) {
    lines.push(`TITLE:${escapeVCardValue(data.role)}`);
  }

  // Organization/Company
  if (data.company) {
    lines.push(`ORG:${escapeVCardValue(data.company)}`);
  }

  // Email
  if (data.email) {
    lines.push(`EMAIL;TYPE=INTERNET:${escapeVCardValue(data.email)}`);
  }

  // Phone
  if (data.phone) {
    lines.push(`TEL;TYPE=CELL:${escapeVCardValue(data.phone)}`);
  }

  // Photo (base64 encoded)
  if (data.avatarUrl) {
    const base64Photo = await fetchImageAsBase64(data.avatarUrl);
    if (base64Photo) {
      // vCard 3.0 format for photo
      lines.push(`PHOTO;ENCODING=b;TYPE=JPEG:${base64Photo}`);
    }
  }

  // Bio as note
  if (data.bio) {
    lines.push(`NOTE:${escapeVCardValue(data.bio)}`);
  }

  // All social links
  if (data.socialLinks && data.socialLinks.length > 0) {
    for (const link of data.socialLinks) {
      const socialType = getVCardSocialType(link.type);

      // Website type gets URL field, others get X-SOCIALPROFILE
      if (link.type === 'website') {
        lines.push(`URL:${link.url}`);
      } else {
        // X-SOCIALPROFILE is widely supported on iOS/macOS
        lines.push(`X-SOCIALPROFILE;TYPE=${socialType}:${link.url}`);
      }
    }
  }

  lines.push('END:VCARD');

  return lines.join('\r\n');
}

/**
 * Download a vCard file to the user's device
 */
export async function downloadVCard(data: VCardData, filename: string): Promise<void> {
  const vcardContent = await generateVCard(data);

  // Create blob with vCard content
  const blob = new Blob([vcardContent], { type: 'text/vcard;charset=utf-8' });

  // Create download link
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.vcf`;

  // Trigger download
  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
