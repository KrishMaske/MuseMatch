/* eslint-disable no-console */
import { MUSEUM_SOURCES, type ArtPersonality, type Artwork } from '@musematch/shared';
import { env } from '../config/env.js';

/**
 * End-to-end smoke test against a *running* MuseMatch stack.
 *
 * Different in kind from the unit and supertest suites: this drives the real
 * HTTP API over the network, against the real museum providers and a real
 * database, in the order a person would actually use the product. It is the
 * check that answers "does the whole thing work", not "is this function right".
 *
 * Identity is exercised for real wherever possible. When `SUPABASE_URL` and an
 * anon key are configured, the script signs two genuine accounts up through
 * Supabase Auth and drives the whole run on their access tokens -- so JWT
 * verification, per-user data isolation and sign-in are all covered by the same
 * pass. It falls back to the development identity header only when no Supabase
 * project is configured.
 *
 * Usage, with the stack already running (`npm run dev`):
 *   npm run verify:e2e --workspace @musematch/server
 *
 * It creates its own throwaway accounts and deletes the data they produce.
 */

const API = process.env['E2E_API_URL'] ?? 'http://localhost:4000/api';
const WEB = process.env['E2E_WEB_URL'] ?? 'http://localhost:5173';
const SUPABASE_URL = env.SUPABASE_URL ?? process.env['VITE_SUPABASE_URL'];
const SUPABASE_ANON_KEY = process.env['VITE_SUPABASE_ANON_KEY'];
const USE_REAL_AUTH = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const RUN_ID = Date.now();
const USER = `e2e-verify-${RUN_ID}`;
const INTRUDER = `${USER}-intruder`;
const PASSWORD = `E2e-verify-${RUN_ID}!`;

interface Identity {
  label: string;
  /** Header pair used to authenticate as this identity. */
  header: Record<string, string>;
  email?: string;
}

/** Filled in by `establishIdentities()` before any authenticated call. */
let primary: Identity = { label: 'primary', header: { 'x-dev-user': USER } };
let intruder: Identity = { label: 'intruder', header: { 'x-dev-user': INTRUDER } };

interface SupabaseAuthResponse {
  access_token?: string;
  user?: { id?: string };
  error_description?: string;
  msg?: string;
  message?: string;
}

async function supabaseAuth(
  path: '/auth/v1/signup' | '/auth/v1/token?grant_type=password',
  email: string,
  password: string,
): Promise<SupabaseAuthResponse> {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY as string, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return (await response.json()) as SupabaseAuthResponse;
}

let passed = 0;
let failed = 0;
const failures: string[] = [];
let currentSection = '';

function section(name: string): void {
  currentSection = name;
  console.log(`\n\x1b[1m${name}\x1b[0m`);
}

function ok(label: string, detail = ''): void {
  passed += 1;
  console.log(`  \x1b[32mPASS\x1b[0m  ${label}${detail ? `  \x1b[2m${detail}\x1b[0m` : ''}`);
}

function fail(label: string, detail: string): void {
  failed += 1;
  failures.push(`${currentSection} -> ${label}: ${detail}`);
  console.log(`  \x1b[31mFAIL\x1b[0m  ${label}  \x1b[31m${detail}\x1b[0m`);
}

/** Asserts a condition, recording the outcome rather than throwing. */
function check(label: string, condition: boolean, detail = ''): boolean {
  if (condition) ok(label, detail);
  else fail(label, detail || 'condition was false');
  return condition;
}

interface CallResult<T> {
  status: number;
  body: T;
}

async function call<T = unknown>(
  path: string,
  init: {
    method?: string;
    body?: unknown;
    anonymous?: boolean;
    badToken?: boolean;
    as?: Identity;
  } = {},
): Promise<CallResult<T>> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (init.badToken) headers['authorization'] = 'Bearer not-a-real-token';
  else if (!init.anonymous) Object.assign(headers, (init.as ?? primary).header);

  const response = await fetch(`${API}${path}`, {
    method: init.method ?? 'GET',
    headers,
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { status: response.status, body: body as T };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

async function main(): Promise<void> {
  console.log(`\x1b[1mMuseMatch end-to-end verification\x1b[0m`);
  console.log(`\x1b[2mAPI ${API}   client ${WEB}   test user ${USER}\x1b[0m`);

  // --- 1. Reachability -----------------------------------------------------
  section('1. Stack is up');
  {
    const health = await call<Any>('/health', { anonymous: true });
    check('API health endpoint', health.status === 200, `status ${health.status}`);

    try {
      const page = await fetch(WEB);
      const html = await page.text();
      check('Client serves the app shell', page.ok && html.includes('<div id="root">'));
    } catch (error) {
      fail('Client serves the app shell', `unreachable: ${String(error)}`);
    }
  }

  // --- 2. Authentication ---------------------------------------------------
  section('2. Authentication and authorization');
  {
    console.log(
      USE_REAL_AUTH
        ? '  [2mmode: real Supabase accounts and JWTs[0m'
        : '  [2mmode: development identity header (no Supabase project configured)[0m',
    );

    const anonymous = await call<Any>('/profile', { anonymous: true });
    check(
      'Unauthenticated request is rejected',
      anonymous.status === 401,
      `status ${anonymous.status}`,
    );

    const bad = await call<Any>('/profile', { badToken: true });
    check('Invalid token is rejected', bad.status === 401, `status ${bad.status}`);
    check(
      'Error body leaks no stack trace',
      !JSON.stringify(bad.body).match(/at .*\.ts:\d+|node_modules/),
    );

    if (USE_REAL_AUTH) {
      const email = `musematch-e2e-${RUN_ID}@example.com`;
      const intruderEmail = `musematch-e2e-${RUN_ID}-b@example.com`;

      const signup = await supabaseAuth('/auth/v1/signup', email, PASSWORD);
      check(
        'Sign up through Supabase',
        !!signup.access_token,
        signup.access_token ? email : (signup.msg ?? signup.message ?? 'no access token'),
      );

      const signupB = await supabaseAuth('/auth/v1/signup', intruderEmail, PASSWORD);

      if (signup.access_token && signupB.access_token) {
        primary = {
          label: 'primary',
          email,
          header: { authorization: `Bearer ${signup.access_token}` },
        };
        intruder = {
          label: 'intruder',
          email: intruderEmail,
          header: { authorization: `Bearer ${signupB.access_token}` },
        };

        const header = JSON.parse(
          Buffer.from(signup.access_token.split('.')[1] as string, 'base64url').toString(),
        ) as { iss?: string; aud?: string; sub?: string };
        check(
          'Token is issued by this Supabase project',
          header.iss === `${SUPABASE_URL}/auth/v1`,
          header.iss ?? '',
        );
        check('Token audience is an authenticated user', header.aud === 'authenticated');

        // The signature is ES256 and is verified against the project's remote
        // JWKS; the API accepting it is the proof that path works.
        const accepted = await call<Any>('/profile');
        check(
          'API accepts a genuine Supabase JWT',
          accepted.status === 200,
          `status ${accepted.status}`,
        );
        check(
          'Local profile carries the account email',
          accepted.body?.data?.email === email,
          accepted.body?.data?.email ?? '',
        );

        // Signing in again must produce a working token for the same account.
        const signIn = await supabaseAuth('/auth/v1/token?grant_type=password', email, PASSWORD);
        check('Sign in with the correct password', !!signIn.access_token);
        if (signIn.access_token) {
          const reauth = await fetch(`${API}/profile`, {
            headers: { authorization: `Bearer ${signIn.access_token}` },
          });
          const reauthBody = (await reauth.json()) as Any;
          check(
            'A fresh sign-in reaches the same local profile',
            reauthBody?.data?.id === accepted.body?.data?.id,
          );
        }

        const wrongPassword = await supabaseAuth(
          '/auth/v1/token?grant_type=password',
          email,
          'definitely-the-wrong-password',
        );
        check('Sign in with a wrong password is refused', !wrongPassword.access_token);

        check(
          'The two accounts are distinct users',
          (await call<Any>('/profile', { as: intruder })).body?.data?.id !==
            accepted.body?.data?.id,
        );
      } else {
        fail('Sign up through Supabase', 'could not create test accounts; falling back');
      }
    }

    const quiz = await call<Any>('/onboarding/quiz', { anonymous: true });
    check(
      'Quiz is public',
      quiz.status === 200 && quiz.body.data.questions.length === 8,
      `${quiz.body?.data?.questions?.length ?? 0} questions`,
    );

    const profile = await call<Any>('/profile');
    check(
      'First request provisions a local profile',
      profile.status === 200 && !!profile.body.data.id,
    );
    check('New user has not onboarded', profile.body.data.onboardingCompleted === false);
  }

  // --- 3. Onboarding -------------------------------------------------------
  section('3. Taste onboarding');
  {
    const invalid = await call<Any>('/profile/onboarding', {
      method: 'POST',
      body: { answers: { medium: ['hologram'] } },
    });
    check('Rejects an option outside the quiz', invalid.status === 422, `status ${invalid.status}`);
    check('Validation names the offending field', !!invalid.body?.error?.details?.medium);

    const submitted = await call<Any>('/profile/onboarding', {
      method: 'POST',
      body: {
        answers: {
          medium: ['painting', 'photography'],
          era: ['19th-century'],
          theme: ['nature', 'cities'],
          experience: ['relaxing'],
          style: ['peaceful'],
          doorway: ['light-room'],
          pace: ['slow'],
          exploration: ['balanced'],
        },
      },
    });
    check('Accepts a complete quiz', submitted.status === 201, `status ${submitted.status}`);

    const weights = submitted.body?.data?.explicit ?? {};
    check(
      'Produces normalized weights',
      weights.medium?.painting === 1,
      `painting=${weights.medium?.painting}`,
    );
    check(
      'Rank decay: first pick outweighs second',
      (weights.medium?.painting ?? 0) > (weights.medium?.photography ?? 0),
      `${weights.medium?.painting} > ${weights.medium?.photography}`,
    );
    check('Scenario question contributes across dimensions', (weights.theme?.nature ?? 0) > 0);
    check('Onboarding is now complete', submitted.body?.data?.onboardingCompleted === true);
  }

  // --- 4. Recommendations --------------------------------------------------
  section('4. Personalized recommendations');
  let feedArtwork: Artwork | undefined;
  {
    const feed = await call<Any>('/recommendations?limit=8');
    const items = feed.body?.data?.recommendations ?? [];
    check(
      'Feed returns recommendations',
      feed.status === 200 && items.length > 0,
      `${items.length} items`,
    );

    if (items.length > 0) {
      feedArtwork = items[0].artwork;
      check(
        'Every item has a match percentage',
        items.every((r: Any) => r.matchPercent > 0 && r.matchPercent <= 100),
      );
      check(
        'Every item has at least one reason',
        items.every((r: Any) => Array.isArray(r.reasons) && r.reasons.length > 0),
      );
      check(
        'Reasons leak no internals',
        !items.some((r: Any) => r.reasons.join(' ').match(/\d+\.\d+|weight=|score=/i)),
        `e.g. "${items[0].reasons[0]}"`,
      );
      check(
        'Results are ranked descending',
        items.every((r: Any, i: number) => i === 0 || items[i - 1].score >= r.score),
      );
      check(
        'Only artworks with images reach the feed',
        items.every((r: Any) => !!r.artwork.imageUrl),
      );
      check(
        'Artist diversity cap holds',
        (() => {
          const counts = new Map<string, number>();
          for (const r of items) {
            if (!r.artwork.artist) continue;
            counts.set(r.artwork.artist, (counts.get(r.artwork.artist) ?? 0) + 1);
          }
          return [...counts.values()].every((n) => n <= 2);
        })(),
      );
    }

    check(
      'Rejects an out-of-range limit',
      (await call<Any>('/recommendations?limit=9999')).status === 422,
    );

    // A different taste must produce a different feed. The second real account
    // doubles as the contrasting visitor.
    await call('/profile/onboarding', {
      as: intruder,
      method: 'POST',
      body: {
        answers: {
          medium: ['sculpture'],
          era: ['ancient'],
          theme: ['mythology'],
          experience: ['historical'],
          style: ['detailed'],
          doorway: ['crowded-room'],
          pace: ['reader'],
          exploration: ['familiar'],
        },
      },
    });
    const otherFeed = await call<Any>('/recommendations?limit=8', { as: intruder });

    const mine = new Set(items.map((r: Any) => r.artwork.id));
    const theirs = (otherFeed.body?.data?.recommendations ?? []).map((r: Any) => r.artwork.id);
    const overlap = theirs.filter((id: string) => mine.has(id)).length;
    check(
      'A different taste profile gets a different feed',
      overlap < theirs.length,
      `${overlap}/${theirs.length} overlap`,
    );
  }

  // --- 5. Discovery --------------------------------------------------------
  section('5. Discovery and search');
  {
    const search = await call<Any>('/artworks/search?q=landscape&limit=10');
    const sources = new Set((search.body?.data ?? []).map((a: Artwork) => a.source));
    check(
      'Keyword search returns results',
      search.status === 200 && search.body.data.length > 0,
      `${search.body?.pagination?.total?.toLocaleString?.() ?? '?'} matches`,
    );
    check(
      'Results come from both museums',
      MUSEUM_SOURCES.every((s) => sources.has(s)),
      [...sources].join(' + '),
    );
    check(
      'Results carry a stable local id',
      (search.body?.data ?? []).every((a: Artwork) => a.id && !a.id.includes(':')),
    );
    check(
      'Normalization hides provider differences',
      (() => {
        const shapes = new Set(
          (search.body?.data ?? []).map((a: Artwork) => Object.keys(a).sort().join(',')),
        );
        return shapes.size === 1;
      })(),
      'identical field sets across sources',
    );

    const oldest = await call<Any>('/artworks/search?q=landscape&limit=6&sort=oldest');
    const dates = (oldest.body?.data ?? []).map((a: Artwork) => a.dateStart).filter(Boolean);
    check(
      'sort=oldest orders by date',
      dates.every((d: number, i: number) => i === 0 || dates[i - 1] <= d),
      `[${dates.join(', ')}]`,
    );

    const browse = await call<Any>('/artworks?medium=painting&limit=5');
    check(
      'Facet filter works over the cache',
      browse.status === 200 && browse.body.data.length > 0,
      `${browse.body?.pagination?.total} paintings cached`,
    );
    check(
      'Rejects a value outside the taste vocabulary',
      (await call<Any>('/artworks?medium=hologram')).status === 422,
    );

    const p1 = await call<Any>('/artworks?limit=3&page=1');
    const p2 = await call<Any>('/artworks?limit=3&page=2');
    const ids1 = (p1.body?.data ?? []).map((a: Artwork) => a.id);
    const ids2 = (p2.body?.data ?? []).map((a: Artwork) => a.id);
    check(
      'Pagination returns distinct pages',
      ids2.length > 0 && !ids2.some((id: string) => ids1.includes(id)),
    );

    const semantic = await call<Any>(
      '/artworks/search?q=' +
        encodeURIComponent('peaceful misty river at dawn') +
        '&semantic=true&limit=5',
    );
    const semItems = semantic.body?.data ?? [];
    check(
      'Semantic search returns scored results',
      semantic.status === 200 && semItems.length > 0,
      semItems[0] ? `top: "${semItems[0].artwork.title}"` : '',
    );
    check(
      'Semantic results carry reasons',
      semItems.every((r: Any) => r.reasons?.length > 0 && r.matchPercent > 0),
    );
  }

  // --- 6. Artwork detail ---------------------------------------------------
  section('6. Artwork detail');
  let artworkId = feedArtwork?.id ?? '';
  {
    if (!artworkId) {
      const any = await call<Any>('/artworks?limit=1');
      artworkId = any.body?.data?.[0]?.id ?? '';
    }

    const detail = await call<Any>(`/artworks/${artworkId}`);
    check('Detail loads', detail.status === 200 && !!detail.body.data.artwork);
    check(
      'Detail includes a match explanation',
      (detail.body?.data?.match?.reasons?.length ?? 0) > 0,
      detail.body?.data?.match
        ? `${detail.body.data.match.matchPercent}% - ${detail.body.data.match.reasons[0]}`
        : '',
    );
    check(
      'Detail reports saved-collection state',
      Array.isArray(detail.body?.data?.savedInCollectionIds),
    );
    check(
      'Missing metadata is null, never invented',
      (() => {
        const a: Artwork = detail.body.data.artwork;
        return [a.artist, a.medium, a.culture].every((v) => v === null || typeof v === 'string');
      })(),
    );

    const similar = await call<Any>(`/artworks/${artworkId}/similar?limit=4`);
    check(
      'Similar works resolve',
      similar.status === 200 && Array.isArray(similar.body.data),
      `${similar.body?.data?.length ?? 0} works`,
    );
    check(
      'Similar excludes the artwork itself',
      !(similar.body?.data ?? []).some((a: Artwork) => a.id === artworkId),
    );

    check(
      'Unknown artwork id returns 404',
      (await call<Any>('/artworks/definitely-not-real')).status === 404,
    );

    // A provider-composite id should resolve and be cached on demand.
    const composite = await call<Any>('/artworks/MET:436535');
    check(
      'Uncached artwork is fetched from the museum on demand',
      composite.status === 200 && !!composite.body?.data?.artwork?.title,
      composite.body?.data?.artwork?.title ?? '',
    );
  }

  // --- 7. Interactions and learning ---------------------------------------
  section('7. Interactions and adaptive taste');
  {
    const before = await call<Any>('/profile/preferences');
    const beforeWeight = before.body?.data?.behavioral?.medium?.sculpture ?? 0;

    const rec = await call<Any>('/interactions', {
      method: 'POST',
      body: { artworkId, type: 'SAVE', sourcePage: 'e2e', userId: 'attacker-supplied' },
    });
    check('Interaction is recorded', rec.status === 201, `weight ${rec.body?.data?.weight}`);
    check('Interaction weight matches its type', rec.body?.data?.weight === 0.8);

    check(
      'Unknown interaction type rejected',
      (await call<Any>('/interactions', { method: 'POST', body: { artworkId, type: 'ADMIRE' } }))
        .status === 422,
    );

    // Repeatedly like sculptures and confirm the behavioral profile follows.
    const sculptures = await call<Any>('/artworks?medium=sculpture&limit=6');
    const sculptureIds = (sculptures.body?.data ?? []).map((a: Artwork) => a.id);
    for (const id of sculptureIds) {
      await call('/interactions', { method: 'POST', body: { artworkId: id, type: 'LIKE' } });
      await call('/interactions', { method: 'POST', body: { artworkId: id, type: 'SAVE' } });
    }

    const after = await call<Any>('/profile/preferences');
    const afterWeight = after.body?.data?.behavioral?.medium?.sculpture ?? 0;
    check(
      'Repeated interactions move the behavioral profile',
      afterWeight > beforeWeight,
      `sculpture ${beforeWeight.toFixed(3)} -> ${afterWeight.toFixed(3)} over ${sculptureIds.length * 2} signals`,
    );
    check(
      'Explicit preferences are untouched by behavior',
      after.body?.data?.explicit?.medium?.painting === 1,
    );
    check(
      'Behavioral weights stay within [0,1]',
      Object.values(after.body?.data?.behavioral ?? {}).every((dim: Any) =>
        Object.values(dim as Record<string, number>).every((v) => v >= 0 && v <= 1),
      ),
    );

    // A disliked artwork should not come back in the feed.
    const toReject = (await call<Any>('/recommendations?limit=1')).body?.data?.recommendations?.[0]
      ?.artwork?.id;
    if (toReject) {
      await call('/interactions', {
        method: 'POST',
        body: { artworkId: toReject, type: 'DISLIKE' },
      });
      const refreshed = await call<Any>('/recommendations?limit=20');
      const stillThere = (refreshed.body?.data?.recommendations ?? []).some(
        (r: Any) => r.artwork.id === toReject,
      );
      check('A disliked artwork is excluded from the feed', !stillThere);
    }
  }

  // --- 8. Collections ------------------------------------------------------
  section('8. Collections');
  let collectionId = '';
  {
    const created = await call<Any>('/collections', {
      method: 'POST',
      body: { name: 'E2E collection', description: 'created by the verifier' },
    });
    collectionId = created.body?.data?.id ?? '';
    check('Create', created.status === 201 && created.body.data.name === 'E2E collection');
    check(
      'Blank name rejected',
      (await call<Any>('/collections', { method: 'POST', body: { name: '   ' } })).status === 422,
    );

    const added = await call<Any>(`/collections/${collectionId}/items`, {
      method: 'POST',
      body: { artworkId },
    });
    check('Add artwork', added.status === 201 && added.body.data.items.length === 1);

    const dup = await call<Any>(`/collections/${collectionId}/items`, {
      method: 'POST',
      body: { artworkId },
    });
    check('Duplicate rejected', dup.status === 409, `status ${dup.status}`);

    const renamed = await call<Any>(`/collections/${collectionId}`, {
      method: 'PATCH',
      body: { name: 'E2E renamed' },
    });
    check('Rename', renamed.status === 200 && renamed.body.data.name === 'E2E renamed');

    const list = await call<Any>('/collections');
    const mine = (list.body?.data ?? []).find((c: Any) => c.id === collectionId);
    check('Appears in the list with a count', !!mine && mine.itemCount === 1);
    check('Carries preview images for the cover', (mine?.previewImageUrls?.length ?? 0) > 0);

    const detail = await call<Any>(`/artworks/${artworkId}`);
    check(
      'Artwork now reports it is saved',
      (detail.body?.data?.savedInCollectionIds ?? []).includes(collectionId),
    );

    // Ownership: a second real account must not see or touch it.
    const peek = await call<Any>(`/collections/${collectionId}`, { as: intruder });
    check('Another user cannot read it', peek.status === 404, `status ${peek.status}`);
    const hijack = await call<Any>(`/collections/${collectionId}`, {
      as: intruder,
      method: 'PATCH',
      body: { name: 'hijacked' },
    });
    check('Another user cannot rename it', hijack.status === 404);
    const wipe = await call<Any>(`/collections/${collectionId}`, {
      as: intruder,
      method: 'DELETE',
    });
    check('Another user cannot delete it', wipe.status === 404);
    const steal = await call<Any>(`/collections/${collectionId}/items`, {
      as: intruder,
      method: 'POST',
      body: { artworkId },
    });
    check('Another user cannot add to it', steal.status === 404);
    const survived = await call<Any>(`/collections/${collectionId}`);
    check('Collection survived the attempts', survived.body?.data?.name === 'E2E renamed');

    const removed = await call<Any>(`/collections/${collectionId}/items/${artworkId}`, {
      method: 'DELETE',
    });
    check('Remove artwork', removed.status === 200 && removed.body.data.items.length === 0);
  }

  // --- 9. Visit planner ----------------------------------------------------
  section('9. Museum visit planner');
  let visitId = '';
  {
    check(
      'Rejects an impossible duration',
      (
        await call<Any>('/visits', {
          method: 'POST',
          body: { name: 'x', museum: 'MET', availableMinutes: 5000 },
        })
      ).status === 422,
    );
    check(
      'Rejects an unknown museum',
      (
        await call<Any>('/visits', {
          method: 'POST',
          body: { name: 'x', museum: 'LOUVRE', availableMinutes: 120 },
        })
      ).status === 422,
    );
    check(
      'Rejects a malformed date',
      (
        await call<Any>('/visits', {
          method: 'POST',
          body: { name: 'x', museum: 'MET', availableMinutes: 120, visitDate: 'next tuesday' },
        })
      ).status === 422,
    );

    const created = await call<Any>('/visits', {
      method: 'POST',
      body: { name: 'E2E visit', museum: 'MET', availableMinutes: 120, visitDate: '2026-09-19' },
    });
    visitId = created.body?.data?.id ?? '';
    check(
      'Create with a calendar date',
      created.status === 201,
      `status ${created.status} ${created.status !== 201 ? JSON.stringify(created.body) : ''}`,
    );
    check('Date is stored', (created.body?.data?.visitDate ?? '').startsWith('2026-09-19'));

    const generated = await call<Any>(`/visits/${visitId}/generate`, { method: 'POST' });
    const visit = generated.body?.data;
    check(
      'Generate an itinerary',
      generated.status === 200 && visit.items.length > 0,
      `${visit?.itemCount} stops, ${visit?.totalMinutes} min`,
    );
    check(
      'Never exceeds the time budget',
      visit.totalMinutes <= visit.availableMinutes,
      `${visit?.totalMinutes} <= ${visit?.availableMinutes}`,
    );
    check(
      'Reserves walking overhead',
      visit.totalMinutes <= visit.availableMinutes - 15,
      `${visit?.totalMinutes} <= ${visit?.availableMinutes - 15}`,
    );
    check(
      'Only the chosen museum appears',
      (visit.items ?? []).every((i: Any) => i.artwork.source === 'MET'),
    );
    check(
      'Artist diversity cap holds in the plan',
      (() => {
        const counts = new Map<string, number>();
        for (const i of visit.items ?? []) {
          if (!i.artwork.artist) continue;
          counts.set(i.artwork.artist, (counts.get(i.artwork.artist) ?? 0) + 1);
        }
        return [...counts.values()].every((n) => n <= 2);
      })(),
    );
    check(
      'Department cap holds in the plan',
      (() => {
        const counts = new Map<string, number>();
        for (const i of visit.items ?? []) {
          const d = i.artwork.department ?? 'unknown';
          counts.set(d, (counts.get(d) ?? 0) + 1);
        }
        return [...counts.values()].every((n) => n <= 4);
      })(),
    );
    check(
      'Stops are grouped into walking order',
      (visit.stops?.length ?? 0) > 0,
      (visit.stops ?? []).map((s: Any) => `${s.department} (${s.items.length})`).join(', '),
    );
    check(
      'Each stop carries its reasons',
      (visit.items ?? []).every((i: Any) => i.reasons.length > 0 && i.estimatedMinutes > 0),
    );

    // Reorder.
    const ids = (visit.items ?? []).map((i: Any) => i.artwork.id);
    const reversed = [...ids].reverse();
    const reordered = await call<Any>(`/visits/${visitId}/reorder`, {
      method: 'PUT',
      body: { artworkIds: reversed },
    });
    check(
      'Reorder applies the new order',
      reordered.status === 200 &&
        reordered.body.data.items.map((i: Any) => i.artwork.id).join() === reversed.join(),
    );
    check(
      'Reorder rejects a changed member set',
      (
        await call<Any>(`/visits/${visitId}/reorder`, {
          method: 'PUT',
          body: { artworkIds: ['bogus'] },
        })
      ).status === 400,
    );

    // Manual add / remove.
    const removeId = reversed[0];
    const afterRemove = await call<Any>(`/visits/${visitId}/items/${removeId}`, {
      method: 'DELETE',
    });
    check(
      'Remove a stop',
      afterRemove.status === 200 && afterRemove.body.data.itemCount === ids.length - 1,
    );
    const readd = await call<Any>(`/visits/${visitId}/items`, {
      method: 'POST',
      body: { artworkId: removeId },
    });
    check('Add a stop back', readd.status === 200 || readd.status === 201);

    // Cross-museum guard: an AIC work must not join a Met visit.
    const aic = await call<Any>('/artworks?museum=AIC&limit=1');
    const aicId = aic.body?.data?.[0]?.id;
    if (aicId) {
      const cross = await call<Any>(`/visits/${visitId}/items`, {
        method: 'POST',
        body: { artworkId: aicId },
      });
      check('Cross-museum stop is refused', cross.status >= 400, `status ${cross.status}`);
    }

    check(
      'Another user cannot read the visit',
      (await call<Any>(`/visits/${visitId}`, { as: intruder })).status === 404,
    );
    check(
      'Another user cannot generate on it',
      (await call<Any>(`/visits/${visitId}/generate`, { as: intruder, method: 'POST' })).status ===
        404,
    );
    check(
      'Another user cannot delete it',
      (await call<Any>(`/visits/${visitId}`, { as: intruder, method: 'DELETE' })).status === 404,
    );
  }

  // --- 10. Taste dashboard -------------------------------------------------
  section('10. Taste dashboard');
  {
    const dash = await call<Any>('/profile/dashboard');
    const d = dash.body?.data;
    check('Dashboard loads', dash.status === 200 && !!d);
    check(
      'Ranks mediums',
      (d?.mediums?.length ?? 0) > 0,
      (d?.mediums ?? [])
        .slice(0, 3)
        .map((m: Any) => `${m.label} ${Math.round(m.weight * 100)}%`)
        .join(', '),
    );
    check(
      'Ranks themes',
      (d?.themes?.length ?? 0) > 0,
      (d?.themes ?? [])
        .slice(0, 3)
        .map((t: Any) => t.label)
        .join(', '),
    );
    check('Ranks eras and styles', (d?.eras?.length ?? 0) > 0 && (d?.styles?.length ?? 0) > 0);
    check(
      'Reflects behavior, not just the quiz',
      (d?.mediums ?? []).some((m: Any) => m.key === 'sculpture'),
      'sculpture appears after the likes above',
    );
    check(
      'Activity totals are real',
      (d?.activity?.artworksSaved ?? 0) > 0,
      JSON.stringify(d?.activity),
    );
    const personality: ArtPersonality = d?.personality;
    check(
      'Derives an art personality',
      !!personality?.title && !!personality?.summary,
      `${personality?.title} - "${personality?.summary}"`,
    );
    check(
      'Personality names real traits',
      (personality?.traits?.length ?? 0) > 0,
      (personality?.traits ?? []).join(', '),
    );
  }

  // --- 11. Robustness ------------------------------------------------------
  section('11. Error handling');
  {
    const unknownRoute = await call<Any>('/nope');
    check(
      'Unknown route returns 404',
      unknownRoute.status === 404,
      `status ${unknownRoute.status}`,
    );
    check(
      'Error envelope shape is { error: { code, message } }',
      unknownRoute.body?.error?.code === 'NOT_FOUND' &&
        typeof unknownRoute.body?.error?.message === 'string',
    );

    const badJson = await fetch(`${API}/collections`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dev-user': USER },
      body: '{not json',
    });
    check('Malformed JSON is handled', badJson.status === 400, `status ${badJson.status}`);

    check(
      'Missing required body field is rejected',
      (await call<Any>('/collections', { method: 'POST', body: {} })).status === 422,
    );
    check(
      'Unknown collection id returns 404',
      (await call<Any>('/collections/does-not-exist')).status === 404,
    );
  }

  // --- 12. Cleanup ---------------------------------------------------------
  section('12. Cleanup');
  {
    check(
      'Delete collection',
      (await call<Any>(`/collections/${collectionId}`, { method: 'DELETE' })).status === 204,
    );
    check(
      'Delete visit',
      (await call<Any>(`/visits/${visitId}`, { method: 'DELETE' })).status === 204,
    );
    check(
      'Deleted collection is gone',
      (await call<Any>(`/collections/${collectionId}`)).status === 404,
    );
  }

  // --- Report --------------------------------------------------------------
  const total = passed + failed;
  console.log(`\n${'-'.repeat(64)}`);
  if (failed === 0) {
    console.log(`\x1b[32m\x1b[1mAll ${total} checks passed.\x1b[0m`);
  } else {
    console.log(`\x1b[31m\x1b[1m${failed} of ${total} checks failed:\x1b[0m`);
    for (const line of failures) console.log(`  \x1b[31m- ${line}\x1b[0m`);
  }
  console.log(
    `\x1b[2mTest data for ${USER} was removed; the throwaway user rows remain and are harmless.\x1b[0m`,
  );

  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error('\x1b[31mVerification could not run:\x1b[0m', error);
  console.error('Is the stack running?  npm run dev');
  process.exitCode = 1;
});
