export interface ParsedApiPayload<T = Record<string, unknown>> {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

/**
 * Parses an HTTP Response body text safely without masking HTTP error codes or
 * non-JSON proxy/server error pages behind a generic parse error.
 */
export function parseApiJsonResponse<T extends object = Record<string, unknown>>(
  status: number,
  contentType: string | null | undefined,
  rawText: string
): T & { ok?: boolean; error?: string } {
  const trimmed = String(rawText || '').trim();
  const normalizedType = String(contentType || '').toLowerCase();

  if (trimmed) {
    const looksLikeJson =
      normalizedType.includes('json') ||
      trimmed.startsWith('{') ||
      trimmed.startsWith('[');
    if (looksLikeJson) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object') {
          return parsed as T & { ok?: boolean; error?: string };
        }
      } catch {
        // Fall through to HTTP status diagnostics
      }
    }
  }

  if (status === 413) {
    return {
      ok: false,
      error:
        'ಅಪ್‌ಲೋಡ್ ಮಾಡಿದ ಫೋಟೋಗಳು ತುಂಬಾ ದೊಡ್ಡದಾಗಿವೆ (413). ದಯವಿಟ್ಟು ಚಿಕ್ಕ ಫೋಟೋಗಳನ್ನು ಆಯ್ಕೆಮಾಡಿ.',
    } as T & { ok?: boolean; error?: string };
  }
  if (status === 401 || status === 403) {
    return {
      ok: false,
      error: 'ನಿಮ್ಮ ಆಡ್ಮಿನ್ / ಬಳಕೆದಾರರ ಸೆಷನ್ ಮುಗಿದಿದೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಲಾಗಿನ್ ಮಾಡಿ.',
    } as T & { ok?: boolean; error?: string };
  }
  if (status === 429) {
    return {
      ok: false,
      error: 'ಹೆಚ್ಚು ವಿನಂತಿಗಳು ಬಂದಿವೆ (429). ದಯವಿಟ್ಟು ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಪ್ರಯತ್ನಿಸಿ.',
    } as T & { ok?: boolean; error?: string };
  }
  if (status >= 500) {
    return {
      ok: false,
      error: `ಸರ್ವರ್ ಪ್ರತಿಕ್ರಿಯೆ ದೋಷ (HTTP ${status}). ದಯವಿಟ್ಟು ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.`,
    } as T & { ok?: boolean; error?: string };
  }

  return {
    ok: false,
    error: status
      ? `ಸರ್ವರ್ ಪ್ರತಿಕ್ರಿಯೆ ದೋಷ (HTTP ${status}). ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.`
      : 'ಸರ್ವರ್ ಪ್ರತಿಕ್ರಿಯೆ ದೋಷ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
  } as T & { ok?: boolean; error?: string };
}
