import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

/**
 * Browser-driven verification of the MuseMatch UI.
 *
 * The API suite proves the server is correct; this proves the app a person
 * actually touches is. That gap is not theoretical -- it is where a crash in a
 * `useEffect` cleanup and a sign-out button hidden behind a media query both
 * slipped through, because neither is visible to an HTTP test.
 *
 * It signs a real account up through Supabase, walks the full journey, and
 * fails on any console error or unhandled page error along the way.
 *
 * Usage, with the stack running (`npm run dev`):
 *   npm run verify:ui
 */

const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:5173';
const RUN = Date.now();
const EMAIL = `ui-verify-${RUN}@example.com`;
const PASSWORD = `UiVerify-${RUN}!`;

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].filter(Boolean);

const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error('Could not find Chrome. Set CHROME_PATH to its executable.');
  process.exit(1);
}

let passed = 0;
const failures = [];
/** Console errors and page errors seen since the last checkpoint. */
let pageProblems = [];

function section(name) {
  console.log(`\n\x1b[1m${name}\x1b[0m`);
}

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  \x1b[32mPASS\x1b[0m  ${label}${detail ? `  \x1b[2m${detail}\x1b[0m` : ''}`);
  } else {
    failures.push(`${label}: ${detail || 'condition was false'}`);
    console.log(`  \x1b[31mFAIL\x1b[0m  ${label}  \x1b[31m${detail}\x1b[0m`);
  }
  return condition;
}

/** Asserts nothing threw in the browser since the last call. */
function checkNoErrors(where) {
  const problems = pageProblems;
  pageProblems = [];
  check(`No console or page errors during ${where}`, problems.length === 0, problems.join(' | '));
}

const browser = await chromium.launch({ executablePath, headless: process.env.HEADED !== '1' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  const text = msg.text();
  // A missing favicon is noise, not a defect in the app.
  if (text.includes('favicon')) return;
  pageProblems.push(`console: ${text.slice(0, 200)}`);
});
page.on('pageerror', (error) => pageProblems.push(`pageerror: ${error.message}`));

/**
 * The page's visible text, normalized.
 *
 * Lower-cased because `innerText` reflects CSS `text-transform`, and several
 * section labels are uppercased by the `.eyebrow` class -- comparing against
 * the JSX spelling would fail for a page that renders perfectly.
 */
const text = async () =>
  (await page.locator('body').innerText()).replace(/\s+/g, ' ').toLowerCase();

try {
  console.log('\x1b[1mMuseMatch browser verification\x1b[0m');
  console.log(`\x1b[2m${WEB}   account ${EMAIL}\x1b[0m`);

  // --- Landing and auth gating --------------------------------------------
  section('1. Landing page and route protection');
  await page.goto(WEB, { waitUntil: 'networkidle' });
  check(
    'Landing page renders',
    (await page.locator('h1').first().textContent())?.includes('museum'),
  );
  check(
    'Offers sign in and sign up',
    (await page.locator('a[href="/login"]').count()) > 0 &&
      (await page.locator('a[href="/signup"]').count()) > 0,
  );

  await page.goto(`${WEB}/home`, { waitUntil: 'networkidle' });
  check(
    'A protected route redirects a signed-out visitor to sign in',
    page.url().includes('/login'),
    page.url(),
  );
  checkNoErrors('landing');

  // --- Sign up -------------------------------------------------------------
  section('2. Sign up');
  await page.goto(`${WEB}/signup`, { waitUntil: 'networkidle' });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/onboarding', { timeout: 20000 });
  check(
    'Sign up lands on onboarding, not a dead confirmation screen',
    page.url().endsWith('/onboarding'),
    page.url(),
  );
  checkNoErrors('sign up');

  // --- Onboarding ----------------------------------------------------------
  section('3. Taste quiz');
  // Wait for the quiz to arrive rather than reading mid-fetch.
  await page.waitForSelector('section h1', { timeout: 20000 });
  check('First question renders', (await text()).includes('1 of 8'));

  const guard = await (async () => {
    await page.getByRole('button', { name: 'Next' }).click();
    return (await text()).includes('choose at least');
  })();
  check('Refuses to advance with no answer selected', guard);

  // Answer all eight questions by picking the first option on each.
  for (let step = 1; step <= 8; step += 1) {
    const options = page.locator('section button[aria-pressed]');
    await options.first().click();

    const last = step === 8;
    await page.getByRole('button', { name: last ? 'See my matches' : 'Next' }).click();
    if (!last) await page.waitForTimeout(250);
  }

  await page.waitForURL('**/home', { timeout: 30000 });
  check('Completing the quiz lands on the personalized feed', page.url().endsWith('/home'));
  checkNoErrors('onboarding');

  // --- Feed ----------------------------------------------------------------
  section('4. Personalized feed');
  await page.waitForSelector('article', { timeout: 30000 });
  const cards = await page.locator('article').count();
  check('Feed renders artwork cards', cards > 0, `${cards} cards`);
  check('Cards show a match percentage', (await text()).includes('% match'));

  const images = await page.locator('article img').count();
  check('Artwork images render', images > 0, `${images} images`);
  // Images are lazy-loaded, so give the first one a moment to decode before
  // asking whether it really resolved.
  const firstImage = page.locator('article img').first();
  await firstImage.scrollIntoViewIfNeeded();
  await page
    .waitForFunction(
      () => {
        const img = document.querySelector('article img');
        return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0;
      },
      { timeout: 20000 },
    )
    .catch(() => undefined);
  check(
    'Museum images actually load (not broken)',
    await firstImage.evaluate((img) => img.naturalWidth > 0),
    await firstImage.evaluate((img) => `${img.naturalWidth}px wide`),
  );

  checkNoErrors('feed');

  // --- Navigation ----------------------------------------------------------
  section('5. Navigation');
  for (const [label, path] of [
    ['Discover', '/discover'],
    ['Collections', '/collections'],
    ['Visits', '/visits'],
    ['Taste', '/profile'],
  ]) {
    await page.getByRole('link', { name: label, exact: true }).first().click();
    await page.waitForURL(`**${path}`, { timeout: 20000 });
    await page.waitForTimeout(1200);
    check(`${label} page loads`, page.url().endsWith(path));
    checkNoErrors(`${label} page`);
  }

  // --- Discover ------------------------------------------------------------
  section('6. Discover and search');
  await page.goto(`${WEB}/discover`, { waitUntil: 'networkidle' });
  await page.fill('#art-search', 'landscape');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.waitForSelector('article', { timeout: 40000 });
  check(
    'Keyword search returns results',
    (await page.locator('article').count()) > 0,
    `${await page.locator('article').count()} results`,
  );
  check('Search term is reflected in the URL', page.url().includes('q=landscape'));
  checkNoErrors('search');

  // --- Artwork detail ------------------------------------------------------
  section('7. Artwork detail');
  await page.goto(`${WEB}/home`, { waitUntil: 'networkidle' });
  await page.waitForSelector('article h3 a', { timeout: 30000 });
  await page.locator('article h3 a').first().click();
  await page.waitForURL('**/artworks/**', { timeout: 20000 });
  await page.waitForTimeout(1500);

  const detail = await text();
  check('Detail page opens', page.url().includes('/artworks/'));
  check('Shows the match explanation', detail.includes('why it matches'));
  check('Offers save and add-to-visit', detail.includes('save') && detail.includes('add to visit'));
  checkNoErrors('artwork detail');

  // --- Save to a collection ------------------------------------------------
  section('8. Save to a collection');
  await page.getByRole('button', { name: 'Save', exact: true }).first().click();
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  check('Save dialog opens', await page.locator('[role="dialog"]').isVisible());

  await page.fill('#new-collection', 'Browser verified');
  await page.getByRole('button', { name: /Create & save/i }).click();
  await page.waitForTimeout(2500);

  await page.goto(`${WEB}/collections`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  check(
    'Collection was created and holds the artwork',
    (await text()).includes('browser verified'),
  );
  checkNoErrors('collections');

  // --- Visit planner -------------------------------------------------------
  section('9. Visit planner');
  await page.goto(`${WEB}/visits/new`, { waitUntil: 'networkidle' });
  await page.fill('#visit-name', 'Browser verified visit');
  await page.fill('#visit-date', '2026-09-19');
  await page.getByRole('button', { name: '2 hours' }).click();
  await page.getByRole('button', { name: 'Create visit' }).click();
  await page.waitForURL('**/visits/**', { timeout: 20000 });
  check('Visit created with a date', page.url().includes('/visits/'));
  checkNoErrors('visit creation');

  await page
    .getByRole('button', { name: /Generate itinerary/i })
    .first()
    .click();
  await page.waitForTimeout(12000);
  const itinerary = await text();
  check(
    'Itinerary generated',
    /\d+ of 120 minutes/.test(itinerary),
    itinerary.match(/\d+ of 120 minutes · \d+ stops/)?.[0] ?? '',
  );
  check('Walking order is shown', itinerary.includes('walking order'));
  check(
    'Stops are draggable',
    (await page.locator('button[aria-label^="Move "]').count()) > 0,
    `${await page.locator('button[aria-label^="Move "]').count()} handles`,
  );
  checkNoErrors('itinerary');

  // --- Profile -------------------------------------------------------------
  section('10. Taste profile');
  await page.goto(`${WEB}/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const profile = await text();
  check('Dashboard renders', profile.length > 200);
  check(
    'Shows an art personality',
    /the .+(explorer|historian|minimalist|traditionalist|collector|naturalist|reader|documentarian|visitor)/.test(
      profile,
    ),
    profile.match(
      /the \w+ (explorer|historian|minimalist|traditionalist|collector|naturalist|reader|documentarian|visitor)/,
    )?.[0] ?? '',
  );
  checkNoErrors('profile');

  // --- Sign out and back in ------------------------------------------------
  section('11. Sign out and sign back in');
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await page.waitForTimeout(2500);
  check(
    'Sign out returns to the signed-out app',
    /\/(login)?$/.test(new URL(page.url()).pathname),
    page.url(),
  );

  await page.goto(`${WEB}/home`, { waitUntil: 'networkidle' });
  check('Protected route is protected again after sign out', page.url().includes('/login'));

  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/home', { timeout: 20000 });
  check('Sign back in reaches the feed, skipping onboarding', page.url().endsWith('/home'));

  await page.goto(`${WEB}/collections`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  check('Saved data persisted across the session', (await text()).includes('browser verified'));
  checkNoErrors('sign in again');

  // --- Mobile --------------------------------------------------------------
  section('12. Mobile layout');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${WEB}/home`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  check('Bottom navigation appears', await page.getByLabel('Bottom navigation').isVisible());

  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await page.waitForTimeout(400);
  check(
    'Sign out is reachable on a small screen',
    await page.getByRole('button', { name: 'Sign out' }).first().isVisible(),
  );
  check('Mobile menu names the signed-in account', (await text()).includes(EMAIL.toLowerCase()));
  checkNoErrors('mobile');
} catch (error) {
  failures.push(`walkthrough aborted: ${error.message}`);
  console.log(`\n\x1b[31mWalkthrough aborted:\x1b[0m ${error.message}`);
  try {
    await page.screenshot({ path: 'verify-ui-failure.png' });
    console.log('Screenshot written to verify-ui-failure.png');
  } catch {
    /* screenshot is best-effort */
  }
} finally {
  await browser.close();
}

const total = passed + failures.length;
console.log(`\n${'-'.repeat(64)}`);
if (failures.length === 0) {
  console.log(`\x1b[32m\x1b[1mAll ${total} browser checks passed.\x1b[0m`);
} else {
  console.log(`\x1b[31m\x1b[1m${failures.length} of ${total} browser checks failed:\x1b[0m`);
  for (const line of failures) console.log(`  \x1b[31m- ${line}\x1b[0m`);
}
process.exitCode = failures.length === 0 ? 0 : 1;
