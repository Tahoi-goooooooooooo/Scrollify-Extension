/**
 * Classifies a domain as productive or unproductive
 */
const UNPRODUCTIVE_DOMAINS = ['youtube.com', 'tiktok.com', 'instagram.com'];

export function classifyDomain(domain: string | null): 'productive' | 'unproductive' | null {
  if (!domain) return null;

  const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');
  
  for (const unproductiveDomain of UNPRODUCTIVE_DOMAINS) {
    if (normalizedDomain === unproductiveDomain || normalizedDomain.endsWith(`.${unproductiveDomain}`)) {
      return 'unproductive';
    }
  }
  
  return 'productive';
}

export function extractDomain(url: string | undefined): string | null {
  if (!url) return null;
  
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

