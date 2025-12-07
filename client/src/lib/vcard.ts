// vCard generation utility for saving contacts

export interface VCardData {
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  company?: string;
  bio?: string;
  website?: string;
  linkedin?: string;
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
 * Generate a vCard 3.0 format string from profile data
 * vCard 3.0 is used for maximum compatibility across devices
 */
export function generateVCard(data: VCardData): string {
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
  lines.push(`N:${escapeVCardValue(lastName || '')};${escapeVCardValue(firstName)};`);

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

  // Bio as note
  if (data.bio) {
    lines.push(`NOTE:${escapeVCardValue(data.bio)}`);
  }

  // Website URL
  if (data.website) {
    lines.push(`URL:${data.website}`);
  }

  // LinkedIn as social profile
  if (data.linkedin) {
    lines.push(`X-SOCIALPROFILE;TYPE=linkedin:${data.linkedin}`);
  }

  // Add source note
  lines.push(`NOTE:Contact saved from Co:Lab Connect`);

  lines.push('END:VCARD');

  return lines.join('\r\n');
}

/**
 * Download a vCard file to the user's device
 */
export function downloadVCard(data: VCardData, filename: string): void {
  const vcardContent = generateVCard(data);

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
