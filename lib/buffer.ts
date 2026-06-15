type GraphQLError = { message?: string; extensions?: { code?: string } };

const BUFFER_API_URL = 'https://api.buffer.com';

export type BufferAccount = {
  id: string;
  email?: string;
  name?: string | null;
  timezone?: string | null;
  organizations: { id: string; name?: string | null }[];
};

export type BufferChannel = {
  id: string;
  name: string;
  displayName?: string | null;
  descriptor?: string;
  service: string;
  type: string;
  timezone?: string;
  isDisconnected: boolean;
  isLocked: boolean;
  isQueuePaused: boolean;
  externalLink?: string | null;
  manageable?: boolean;
  platformLabel?: string;
};

export type BufferPostDraftRequest = {
  channelIds: string[];
  text: string;
  dueAt?: string | null;
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  tiktokTitle?: string | null;
  isAiGenerated?: boolean;
  saveToDraft?: boolean;
  mode?: 'addToQueue' | 'shareNow' | 'shareNext' | 'customScheduled';
  schedulingType?: 'automatic' | 'notification';
};

type NormalizedMediaUrl = {
  originalUrl: string;
  url: string;
  source: 'google-drive' | 'direct';
  fileId?: string;
  note?: string;
};

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  twitter: 'X / Twitter',
  threads: 'Threads',
  pinterest: 'Pinterest',
  bluesky: 'Bluesky',
  mastodon: 'Mastodon',
  googlebusiness: 'Google Business',
};

function token() {
  return process.env.BUFFER_ACCESS_TOKEN || process.env.BUFFER_API_KEY || '';
}

function assertToken() {
  const value = token();
  if (!value) throw new Error('Missing BUFFER_ACCESS_TOKEN or BUFFER_API_KEY');
  return value;
}

function graphqlErrors(errors?: GraphQLError[]) {
  if (!errors?.length) return null;
  return errors.map(e => e.message || e.extensions?.code || 'Buffer GraphQL error').join('; ');
}

export function hasBufferToken() {
  return Boolean(token());
}

export function extractGoogleDriveFileId(input: string) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (!/(^|\.)drive\.google\.com$/.test(url.hostname) && !/(^|\.)docs\.google\.com$/.test(url.hostname)) return null;

    const queryId = url.searchParams.get('id');
    if (queryId) return queryId;

    const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
    if (fileMatch?.[1]) return fileMatch[1];

    const foldersMatch = url.pathname.match(/\/folders\/([^/]+)/);
    if (foldersMatch?.[1]) return null;
  } catch {
    const fileMatch = raw.match(/drive\.google\.com\/file\/d\/([^/\s?]+)/);
    if (fileMatch?.[1]) return fileMatch[1];
  }

  return null;
}

export function normalizeMediaUrl(input: string): NormalizedMediaUrl | null {
  const originalUrl = String(input || '').trim();
  if (!originalUrl) return null;

  const fileId = extractGoogleDriveFileId(originalUrl);
  if (fileId) {
    return {
      originalUrl,
      url: `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`,
      source: 'google-drive',
      fileId,
      note: 'Google Drive link converted to a direct download URL. The Drive file must be shared as “Anyone with the link can view”.',
    };
  }

  return { originalUrl, url: originalUrl, source: 'direct' };
}

export function normalizeGoogleDriveThumbnail(input: string) {
  const originalUrl = String(input || '').trim();
  if (!originalUrl) return '';
  const fileId = extractGoogleDriveFileId(originalUrl);
  return fileId ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1200` : originalUrl;
}

export async function bufferGraphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(BUFFER_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${assertToken()}`,
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.message || `Buffer API HTTP ${res.status}`);
  const graphError = graphqlErrors(payload.errors);
  if (graphError) throw new Error(graphError);
  return payload.data as T;
}

export async function getBufferAccountAndChannels() {
  const accountQuery = `
    query PodkashBufferAccount {
      account {
        id
        email
        name
        timezone
        organizations { id name }
      }
    }
  `;
  const accountData = await bufferGraphql<{ account: BufferAccount }>(accountQuery);
  const organizationId = accountData.account.organizations?.[0]?.id;

  let channels: BufferChannel[] = [];
  if (organizationId) {
    const channelsQuery = `
      query PodkashBufferChannels($organizationId: OrganizationId!) {
        channels(input: { organizationId: $organizationId, filter: { product: publish } }) {
          id
          name
          displayName
          descriptor
          service
          type
          timezone
          isDisconnected
          isLocked
          isQueuePaused
          externalLink
        }
      }
    `;
    const channelsData = await bufferGraphql<{ channels: BufferChannel[] }>(channelsQuery, { organizationId });
    channels = (channelsData.channels || []).map((channel) => ({
      ...channel,
      manageable: !channel.isDisconnected && !channel.isLocked,
      platformLabel: PLATFORM_LABELS[channel.service] || channel.service,
    }));
  }

  return { account: accountData.account, organizationId, channels };
}

function postFields() {
  return `
    __typename
    ... on PostActionSuccess {
      post { id status text dueAt channelId channelService shareMode externalLink }
    }
    ... on MutationError { message }
    ... on RestProxyError { message link code }
    ... on LimitReachedError { message }
    ... on InvalidInputError { message }
    ... on UnauthorizedError { message }
    ... on NotFoundError { message }
    ... on UnexpectedError { message }
  `;
}

export async function createBufferDrafts(input: BufferPostDraftRequest) {
  const channelIds = [...new Set((input.channelIds || []).map(String).filter(Boolean))];
  const text = String(input.text || '').trim();
  const normalizedMedia = normalizeMediaUrl(String(input.mediaUrl || '').trim());
  const mediaUrl = normalizedMedia?.url || '';
  const thumbnailUrl = normalizeGoogleDriveThumbnail(String(input.thumbnailUrl || '').trim());
  const tiktokTitle = String(input.tiktokTitle || '').trim();
  const saveToDraft = input.saveToDraft !== false;
  const mode = input.mode || (input.dueAt ? 'customScheduled' : 'addToQueue');
  const schedulingType = input.schedulingType || 'automatic';
  if (!channelIds.length) throw new Error('בחר לפחות ערוץ Buffer אחד');
  if (!text) throw new Error('חסר טקסט לפוסט');
  if (mode === 'customScheduled' && !input.dueAt) throw new Error('בחר תאריך ושעה לפרסום מתוזמן');

  const mutation = `
    mutation PodkashCreateBufferDraft($input: CreatePostInput!) {
      createPost(input: $input) { ${postFields()} }
    }
  `;

  const results = [];
  for (const channelId of channelIds) {
    const assets = mediaUrl
      ? [{ video: { url: mediaUrl, ...(thumbnailUrl ? { thumbnailUrl } : {}) } }]
      : [];
    const variables = {
      input: {
        channelId,
        text,
        schedulingType,
        mode,
        dueAt: input.dueAt || undefined,
        assets,
        metadata: {
          tiktok: {
            ...(tiktokTitle ? { title: tiktokTitle } : {}),
            isAiGenerated: Boolean(input.isAiGenerated),
          },
        },
        source: 'podkash',
        aiAssisted: false,
        saveToDraft,
      },
    };
    const data = await bufferGraphql<{ createPost: { __typename: string; message?: string; post?: unknown } }>(mutation, variables);
    results.push({ channelId, result: data.createPost, media: normalizedMedia });
  }
  return results;
}
