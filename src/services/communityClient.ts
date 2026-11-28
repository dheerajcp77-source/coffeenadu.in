import { getAdmin2AuthHeaders } from './admin2Client';
import type {
  AdminCommunityPostView,
  AdminCommunityUserSummary,
  CommunityCategoryId,
  CommunityPostMutationInput,
  CommunityPostStatus,
  CommunityReportRecord,
  CommunitySelfProfile,
  CommunityUserStatus,
  PublicCommunityPost,
} from '../types/community';
import type { CommunityFeedTabId } from '../constants/communityCategories';
import { MAX_COMMUNITY_PHOTO_BYTES } from '../utils/communityHelpers';
import { parseApiJsonResponse } from '../utils/httpResponse';

// Security rule: community Bearer token lives strictly in JS memory (never localStorage/sessionStorage).
// Server also maintains an HttpOnly cookie so page reloads stay signed in seamlessly.
let communityMemoryToken: string | null = null;

export function getCommunityMemoryToken(): string | null {
  return communityMemoryToken;
}

export function setCommunityMemoryToken(token: string | null): void {
  communityMemoryToken = token && token.trim() ? token.trim() : null;
}

function buildCommunityHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Requested-With': 'CoffeenaduCommunity',
    ...extra,
  };
  if (communityMemoryToken) {
    headers.Authorization = `Bearer ${communityMemoryToken}`;
  }
  return headers;
}

async function parseJsonSafe<T>(resp: Response, fallbackMsg: string): Promise<T> {
  let rawText = '';
  try {
    rawText = await resp.text();
  } catch {
    rawText = '';
  }
  const data = parseApiJsonResponse<Record<string, unknown>>(
    resp.status,
    resp.headers.get('content-type'),
    rawText
  );
  if (!resp.ok || data.ok === false) {
    throw new Error(String(data.error || fallbackMsg));
  }
  return data as T;
}

// ============================================================================
// PUBLIC & USER COMMUNITY CLIENT
// ============================================================================

export async function registerCommunityUser(input: {
  fullName: string;
  mobileNumber: string;
}): Promise<{ profile: CommunitySelfProfile }> {
  const resp = await fetch('/api/community/auth/register', {
    method: 'POST',
    credentials: 'same-origin',
    headers: buildCommunityHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
  const json = await parseJsonSafe<{
    ok: true;
    token?: string;
    profile: CommunitySelfProfile;
  }>(resp, 'ನೋಂದಣಿ ವಿಫಲವಾಗಿದೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.');
  if (json.token) {
    communityMemoryToken = json.token;
  }
  return { profile: json.profile };
}

export async function fetchCommunitySession(): Promise<{
  authenticated: boolean;
  profile: CommunitySelfProfile | null;
}> {
  try {
    const resp = await fetch('/api/community/auth/me', {
      credentials: 'same-origin',
      headers: buildCommunityHeaders(),
      cache: 'no-store',
    });
    if (!resp.ok) return { authenticated: false, profile: null };
    const json = (await resp.json()) as {
      authenticated?: boolean;
      profile?: CommunitySelfProfile | null;
    };
    return {
      authenticated: Boolean(json.authenticated && json.profile),
      profile: json.profile || null,
    };
  } catch {
    return { authenticated: false, profile: null };
  }
}

export async function updateCommunityProfile(fullName: string): Promise<CommunitySelfProfile> {
  const resp = await fetch('/api/community/auth/profile', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: buildCommunityHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ fullName }),
  });
  const json = await parseJsonSafe<{ ok: true; profile: CommunitySelfProfile }>(
    resp,
    'ಪ್ರೊಫೈಲ್ ನವೀಕರಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.'
  );
  return json.profile;
}

export async function logoutCommunityUser(): Promise<void> {
  try {
    await fetch('/api/community/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: buildCommunityHeaders(),
    });
  } finally {
    communityMemoryToken = null;
  }
}

export async function fetchCommunityPosts(params?: {
  tab?: CommunityFeedTabId;
  category?: CommunityCategoryId | 'all';
  location?: string;
  nearby?: string;
  q?: string;
  limit?: number;
}): Promise<{ total: number; posts: PublicCommunityPost[] }> {
  const qs = new URLSearchParams();
  if (params?.tab && params.tab !== 'all') qs.set('tab', params.tab);
  if (params?.category && params.category !== 'all') qs.set('category', params.category);
  if (params?.location && params.location !== 'all') qs.set('location', params.location);
  if (params?.nearby && params.nearby !== 'all') qs.set('nearby', params.nearby);
  if (params?.q) qs.set('q', params.q);
  if (params?.limit) qs.set('limit', String(params.limit));

  const queryStr = qs.toString();
  const resp = await fetch(`/api/community/posts${queryStr ? `?${queryStr}` : ''}`, {
    credentials: 'same-origin',
    headers: buildCommunityHeaders(),
    cache: 'no-store',
  });
  return parseJsonSafe<{ ok: true; total: number; posts: PublicCommunityPost[] }>(
    resp,
    'ಸಮುದಾಯ ಮಾಹಿತಿ ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.'
  );
}

export async function fetchCommunityPostBySlug(slugOrId: string): Promise<PublicCommunityPost> {
  const resp = await fetch(`/api/community/posts/${encodeURIComponent(slugOrId)}`, {
    credentials: 'same-origin',
    headers: buildCommunityHeaders(),
    cache: 'no-store',
  });
  const json = await parseJsonSafe<{ ok: true; post: PublicCommunityPost }>(
    resp,
    'ಈ ಸಮುದಾಯ ಪ್ರಕಟಣೆ ಲಭ್ಯವಿಲ್ಲ.'
  );
  return json.post;
}

export async function fetchMyCommunityPosts(): Promise<
  Array<PublicCommunityPost & { status?: CommunityPostStatus }>
> {
  const resp = await fetch('/api/community/my-posts', {
    credentials: 'same-origin',
    headers: buildCommunityHeaders(),
    cache: 'no-store',
  });
  const json = await parseJsonSafe<{
    ok: true;
    posts: Array<PublicCommunityPost & { status?: CommunityPostStatus }>;
  }>(resp, 'ನಿಮ್ಮ ಪ್ರಕಟಣೆಗಳನ್ನು ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.');
  return json.posts;
}

export async function createCommunityPost(
  input: CommunityPostMutationInput
): Promise<PublicCommunityPost> {
  const resp = await fetch('/api/community/posts', {
    method: 'POST',
    credentials: 'same-origin',
    headers: buildCommunityHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
  const json = await parseJsonSafe<{ ok: true; post: PublicCommunityPost }>(
    resp,
    'ಮಾಹಿತಿ ಪ್ರಕಟಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.'
  );
  return json.post;
}

export async function updateCommunityPost(
  postId: string,
  input: CommunityPostMutationInput
): Promise<PublicCommunityPost> {
  const resp = await fetch(`/api/community/posts/${encodeURIComponent(postId)}`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: buildCommunityHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
  const json = await parseJsonSafe<{ ok: true; post: PublicCommunityPost }>(
    resp,
    'ಪ್ರಕಟಣೆ ನವೀಕರಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.'
  );
  return json.post;
}

export async function deleteCommunityPost(postId: string): Promise<void> {
  const resp = await fetch(`/api/community/posts/${encodeURIComponent(postId)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: buildCommunityHeaders(),
  });
  await parseJsonSafe<{ ok: true }>(resp, 'ಪ್ರಕಟಣೆ ಅಳಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.');
}

export function trackCommunityPostShare(postId: string): void {
  void fetch(`/api/community/posts/${encodeURIComponent(postId)}/share`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: buildCommunityHeaders(),
    keepalive: true,
  }).catch(() => {});
}

export async function reportCommunityPost(
  postId: string,
  reason: string,
  details?: string,
  meta?: { postTitle?: string; postSlug?: string; targetType?: 'community' | 'contest' | 'news' }
): Promise<{ duplicatePrevented?: boolean; id?: string }> {
  const resp = await fetch(`/api/community/posts/${encodeURIComponent(postId)}/report`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: buildCommunityHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      reason,
      details,
      postTitle: meta?.postTitle,
      postSlug: meta?.postSlug,
      targetType: meta?.targetType,
    }),
  });
  const json = await parseJsonSafe<{
    ok: true;
    id?: string;
    duplicatePrevented?: boolean;
  }>(resp, 'ವರದಿ ಸಲ್ಲಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.');
  return { duplicatePrevented: json.duplicatePrevented, id: json.id };
}

/**
 * Compresses & validates a user-selected image file in the browser (max 1280px, JPEG quality 0.82)
 * before sending it to the backend, ensuring fast mobile uploads and strict 2 MB compliance.
 */
export async function compressCommunityImageFile(file: File): Promise<string> {
  const allowedMimes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
  const mimeLower = (file.type || '').toLowerCase();
  const hasAllowedExtension = /\.(?:jpe?g|png|webp)$/i.test(file.name || '');
  if ((mimeLower && !allowedMimes.has(mimeLower)) || (!mimeLower && !hasAllowedExtension)) {
    throw new Error('JPG, PNG ಅಥವಾ WebP ಫೋಟೋ ಮಾತ್ರ ಅಪ್‌ಲೋಡ್ ಮಾಡಬಹುದು.');
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('ಫೋಟೋ ಫೈಲ್ ಗಾತ್ರ ತುಂಬಾ ದೊಡ್ಡದಾಗಿದೆ (ಗರಿಷ್ಠ 12 MB ಆಯ್ಕೆಮಾಡಿ).');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('ಫೋಟೋ ಓದಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.'));
    reader.onload = () => {
      const src = String(reader.result || '');
      const img = new Image();
      img.onerror = () => reject(new Error('ಸರಿಯಾದ ಫೋಟೋ ಫೈಲ್ ಆಯ್ಕೆಮಾಡಿ.'));
      img.onload = () => {
        const targetMaxBytes = Math.min(MAX_COMMUNITY_PHOTO_BYTES, 900 * 1024);
        const dimSteps = [1280, 960, 720];
        const qualitySteps = [0.82, 0.68, 0.54, 0.42];
        let bestDataUrl = '';

        for (const maxDim of dimSteps) {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const scale = Math.min(maxDim / width, maxDim / height);
            width = Math.max(1, Math.round(width * scale));
            height = Math.max(1, Math.round(height * scale));
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('ಫೋಟೋ ಪ್ರಕ್ರಿಯೆಗೊಳಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.'));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);

          for (const q of qualitySteps) {
            const dataUrl = canvas.toDataURL('image/jpeg', q);
            bestDataUrl = dataUrl;
            const approxBytes = Math.floor((dataUrl.length * 3) / 4);
            if (approxBytes <= targetMaxBytes) {
              resolve(dataUrl);
              return;
            }
          }
        }

        const finalBytes = Math.floor((bestDataUrl.length * 3) / 4);
        if (finalBytes > MAX_COMMUNITY_PHOTO_BYTES) {
          reject(new Error('ಪ್ರತಿ ಫೋಟೋ ಗರಿಷ್ಠ 2 MB ಒಳಗಿರಬೇಕು. ದಯವಿಟ್ಟು ಚಿಕ್ಕ ಫೋಟೋ ಆಯ್ಕೆಮಾಡಿ.'));
          return;
        }
        resolve(bestDataUrl);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

// ============================================================================
// ADMIN-ONLY PRIVATE USERS & MODERATION CLIENT
// ============================================================================

export interface AdminCommunityUsersResponse {
  ok: true;
  users: AdminCommunityUserSummary[];
  totals: {
    totalUsers: number;
    activeUsers: number;
    suspendedUsers: number;
    totalPosts: number;
    publishedPosts: number;
    openReports: number;
  };
}

export async function fetchAdminCommunityUsers(params?: {
  q?: string;
  status?: 'all' | CommunityUserStatus;
}): Promise<AdminCommunityUsersResponse> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set('q', params.q);
  if (params?.status && params.status !== 'all') qs.set('status', params.status);
  const resp = await fetch(`/api/admin2/community/users${qs.toString() ? `?${qs}` : ''}`, {
    headers: await getAdmin2AuthHeaders(),
    cache: 'no-store',
  });
  return parseJsonSafe<AdminCommunityUsersResponse>(resp, 'Failed to load registered users.');
}

export async function fetchAdminCommunityUserHistory(userId: string): Promise<{
  user: {
    id: string;
    fullName: string;
    mobileNumber: string;
    registeredAt: string;
    lastActiveAt: string;
    status: CommunityUserStatus;
    suspendedReason?: string;
  };
  posts: AdminCommunityPostView[];
}> {
  const resp = await fetch(`/api/admin2/community/users/${encodeURIComponent(userId)}/posts`, {
    headers: await getAdmin2AuthHeaders(),
    cache: 'no-store',
  });
  return parseJsonSafe(resp, 'Failed to load user submission history.');
}

export async function setAdminCommunityUserStatus(
  userId: string,
  status: CommunityUserStatus,
  reason?: string
): Promise<void> {
  const resp = await fetch(`/api/admin2/community/users/${encodeURIComponent(userId)}/status`, {
    method: 'PATCH',
    headers: await getAdmin2AuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ status, reason }),
  });
  await parseJsonSafe(resp, 'Failed to update user account status.');
}

export async function fetchAdminCommunityPosts(params?: {
  q?: string;
  status?: 'all' | CommunityPostStatus;
}): Promise<AdminCommunityPostView[]> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set('q', params.q);
  if (params?.status && params.status !== 'all') qs.set('status', params.status);
  const resp = await fetch(`/api/admin2/community/posts${qs.toString() ? `?${qs}` : ''}`, {
    headers: await getAdmin2AuthHeaders(),
    cache: 'no-store',
  });
  const json = await parseJsonSafe<{ ok: true; posts: AdminCommunityPostView[] }>(
    resp,
    'Failed to load community posts.'
  );
  return json.posts;
}

export async function setAdminCommunityPostStatus(
  postId: string,
  status: CommunityPostStatus,
  reason?: string
): Promise<void> {
  const resp = await fetch(`/api/admin2/community/posts/${encodeURIComponent(postId)}/status`, {
    method: 'PATCH',
    headers: await getAdmin2AuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ status, reason }),
  });
  await parseJsonSafe(resp, 'Failed to update post visibility.');
}

export async function deleteAdminCommunityPost(postId: string): Promise<void> {
  const resp = await fetch(`/api/admin2/community/posts/${encodeURIComponent(postId)}`, {
    method: 'DELETE',
    headers: await getAdmin2AuthHeaders(),
  });
  await parseJsonSafe(resp, 'Failed to delete community post.');
}

export async function fetchAdminCommunityReports(): Promise<CommunityReportRecord[]> {
  const resp = await fetch('/api/admin2/community/reports', {
    headers: await getAdmin2AuthHeaders(),
    cache: 'no-store',
  });
  const json = await parseJsonSafe<{ ok: true; reports: CommunityReportRecord[] }>(
    resp,
    'Failed to load community reports.'
  );
  return json.reports;
}

export async function resolveAdminCommunityReport(
  reportId: string,
  status: 'resolved' | 'dismissed'
): Promise<void> {
  const resp = await fetch(`/api/admin2/community/reports/${encodeURIComponent(reportId)}`, {
    method: 'PATCH',
    headers: await getAdmin2AuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ status }),
  });
  await parseJsonSafe(resp, 'Failed to resolve report.');
}
