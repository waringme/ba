/**
 * Flights Promotion block.
 *
 * Editable in AEM via Universal Editor: the author picks a Content Fragment
 * (aem-content-fragment picker) and a variation. The block reads the picked
 * CF path + variation, fetches the offer from the AEM GraphQL persisted query,
 * and renders the britishairways.com-style New York hero.
 *
 * - In the author environment the CF is fetched same-origin (works inside UE)
 *   and CF fields are instrumented with data-aue-* for in-context editing.
 * - On the published site the CF is fetched from the publish host; if that is
 *   blocked (no CORS) the block degrades to fallback content, with the word
 *   "fallback" appended to the body copy.
 */

const PERSISTED_QUERY = '/graphql/execute.json/british-airways/GetNewYorkPromotionByPath';
const PUBLISH_HOST = 'https://publish-p147324-e2053365.adobeaemcloud.com';
const DEFAULT_CF_PATH = '/content/dam/british-airways/offers/new-york-promotion/new-york-promotion';
const DEFAULT_VARIATION = 'main';

// Breadcrumb back link — page chrome, not part of the content fragment.
const BACK_LABEL = 'USA';
const BACK_URL = '/flights/usa';

// Offer-shaped fallback, mirroring the New York promotion CF.
const FALLBACK_ITEM = {
  headline: 'New York is calling — fly there in style',
  bodyCopy: "The city that never sleeps is closer than you think. Book your return flights to New York and start planning the trip you've been promising yourself.",
  ctaLabel: 'Plan your trip to New York',
  ctaUrl: '/book?offer=new-york-promotion',
  heroImageAlt: 'New York City skyline at dusk',
  heroImage: {
    _publishUrl: `${PUBLISH_HOST}/content/dam/british-airways/offers/new-york-promotion/new-york-skyline.png`,
  },
};

function isAuthorEnvironment() {
  return window.location.hostname.includes('author')
    || window.location.hostname.includes('.adobeaemcloud.');
}

function esc(value = '') {
  return String(value).replace(/[&<>"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  }[c]));
}

/** Read the CF path and variation the author selected in Universal Editor. */
function readSelection(block) {
  const firstRow = block.querySelector(':scope > div:nth-child(1)');
  const cfPath = firstRow?.querySelector('a')?.textContent?.trim()
    || firstRow?.textContent?.trim()
    || DEFAULT_CF_PATH;
  const variation = block.querySelector(':scope > div:nth-child(2)')?.textContent?.trim()
    ?.toLowerCase().replace(/\s+/g, '_') || DEFAULT_VARIATION;
  return { cfPath, variation };
}

/** Fetch the offer item from the AEM GraphQL persisted query. */
async function fetchOffer(cfPath, variation, isAuthor) {
  const host = isAuthor ? window.location.origin : PUBLISH_HOST;
  const url = `${host}${PERSISTED_QUERY};path=${cfPath};variation=${variation};ts=${Date.now()}`;
  const resp = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
  if (!resp.ok) throw new Error(`Offer request failed: HTTP ${resp.status}`);
  const json = await resp.json();
  const item = json?.data?.flightPromotionOfferByPath?.item;
  if (!item) throw new Error('Offer response contained no item');
  return item;
}

/** Build the block markup, adding UE instrumentation in the author env. */
function render(block, item, {
  cfPath, variation, isAuthor, isFallback,
}) {
  const hero = item.heroImage || {};
  /* eslint-disable no-underscore-dangle */
  const heroUrl = isAuthor ? hero._authorUrl : hero._publishUrl;
  const imgUrl = heroUrl || FALLBACK_ITEM.heroImage._publishUrl;
  /* eslint-enable no-underscore-dangle */
  const bodyCopy = `${item.bodyCopy || FALLBACK_ITEM.bodyCopy}${isFallback ? ' fallback' : ''}`;
  const resource = `urn:aemconnection:${cfPath}/jcr:content/data/${variation}`;

  // data-aue-* attributes are only meaningful inside Universal Editor.
  const cfAttrs = isAuthor
    ? `data-aue-resource="${esc(resource)}" data-aue-type="reference" data-aue-label="Flights Offer (${esc(variation)})"`
    : '';
  const prop = (name, type, label) => (isAuthor
    ? `data-aue-prop="${name}" data-aue-type="${type}" data-aue-label="${label}"` : '');

  block.classList.toggle('is-fallback', isFallback);
  block.innerHTML = `
    <div class="flights-cf" ${cfAttrs}>
      <div class="flights-media" ${prop('heroImage', 'media', 'Hero image')}>
        <img src="${esc(imgUrl)}" alt="${esc(item.heroImageAlt || FALLBACK_ITEM.heroImageAlt)}" loading="eager">
      </div>
      <div class="flights-card">
        <a class="flights-back" href="${BACK_URL}">${BACK_LABEL}</a>
        <h1 class="flights-headline" ${prop('headline', 'text', 'Headline')}>${esc(item.headline || FALLBACK_ITEM.headline)}</h1>
        <p class="flights-body" ${prop('bodyCopy', 'text', 'Body copy')}>${esc(bodyCopy)}</p>
        <a class="flights-cta" href="${esc(item.ctaUrl || FALLBACK_ITEM.ctaUrl)}" ${prop('ctaLabel', 'text', 'CTA label')}>${esc(item.ctaLabel || FALLBACK_ITEM.ctaLabel)}</a>
      </div>
    </div>`;
}

export default async function decorate(block) {
  const { cfPath, variation } = readSelection(block);
  const isAuthor = isAuthorEnvironment();

  block.classList.add('flights-loading');
  try {
    const item = await fetchOffer(cfPath, variation, isAuthor);
    render(block, item, {
      cfPath, variation, isAuthor, isFallback: false,
    });
  } catch (error) {
    // CORS block, network error, or missing fragment — degrade gracefully.
    // eslint-disable-next-line no-console
    console.warn('[flights] falling back to default content:', error.message);
    render(block, FALLBACK_ITEM, {
      cfPath, variation, isAuthor, isFallback: true,
    });
  } finally {
    block.classList.remove('flights-loading');
  }
}
