import { createOptimizedPicture } from '../../scripts/aem.js';

/**
 * Flights Promotion block.
 *
 * Renders a hero image + "Flights to New York" offer section powered by an
 * AEM Content Fragment, delivered via a GraphQL persisted query.
 *
 * The block is authorable in Universal Editor (x-walk): every field below is
 * exposed in blocks/flights/_flights.json. The authored values double as the
 * FALLBACK content — used when the live CF cannot be fetched (e.g. the AEM
 * GraphQL endpoint has no CORS policy for *.aem.page / *.aem.live, or the
 * fragment is unavailable). When the fallback is used, the word "fallback" is
 * appended to the end of the body copy so the state is obvious.
 */

const DEFAULT_ENDPOINT = 'https://publish-p147324-e2053365.adobeaemcloud.com/graphql/execute.json/british-airways/GetNewYorkPromotionByPath;path=/content/dam/british-airways/offers/new-york-promotion/new-york-promotion;variation=main';

// Breadcrumb back link (page chrome, not part of the offer content fragment).
const BACK_LABEL = 'USA';
const BACK_URL = '/flights/usa';

// Built-in defaults, mirroring the New York promotion CF. Used when a field is
// left empty by the author so the block always renders something sensible.
const DEFAULTS = {
  image: 'https://publish-p147324-e2053365.adobeaemcloud.com/content/dam/british-airways/offers/new-york-promotion/new-york-skyline.png',
  imageAlt: 'New York City skyline at dusk',
  headline: 'New York is calling — fly there in style',
  subheadline: 'Fares to New York from London, book your city break today',
  bodyCopy: "The city that never sleeps is closer than you think. Book your return flights to New York and start planning the trip you've been promising yourself.",
  priceFraming: 'From {{price}} return',
  urgencyMessage: 'Limited fares available at this price',
  ctaLabel: 'Book New York',
  ctaUrl: '/book?offer=new-york-promotion',
};

// Order MUST match the field order in blocks/flights/_flights.json.
// x-walk caps a block at 4 cells, so only the live endpoint plus the three
// highest-value fallback fields are authorable; the rest come from DEFAULTS.
const FIELD_ORDER = [
  'endpoint',
  'image',
  'headline',
  'bodyCopy',
];

/** Read the authored rows of the block into a keyed object. */
function readAuthored(block) {
  const rows = [...block.children];
  const authored = {};
  FIELD_ORDER.forEach((key, i) => {
    const cell = rows[i]?.querySelector(':scope > div') ?? rows[i];
    if (!cell) return;
    const img = cell.querySelector('img');
    if (key === 'image' && img) {
      authored.image = img.getAttribute('src');
      return;
    }
    const text = cell.textContent.trim();
    if (text) authored[key] = text;
  });
  return authored;
}

/** Map a CF GraphQL item onto the block's data shape. */
function normalize(item) {
  const hero = item.heroImage ?? {};
  return {
    // eslint-disable-next-line no-underscore-dangle
    image: hero._publishUrl || hero._dynamicUrl || DEFAULTS.image,
    imageAlt: item.heroImageAlt || DEFAULTS.imageAlt,
    headline: item.headline || DEFAULTS.headline,
    subheadline: item.subheadline || DEFAULTS.subheadline,
    bodyCopy: item.bodyCopy || DEFAULTS.bodyCopy,
    priceFraming: item.priceFraming || DEFAULTS.priceFraming,
    urgencyMessage: item.urgencyMessage || DEFAULTS.urgencyMessage,
    ctaLabel: item.ctaLabel || DEFAULTS.ctaLabel,
    ctaUrl: item.ctaUrl || DEFAULTS.ctaUrl,
  };
}

/** Fetch the offer from the AEM GraphQL persisted query. */
async function fetchOffer(endpoint) {
  const resp = await fetch(endpoint);
  if (!resp.ok) throw new Error(`Offer request failed: HTTP ${resp.status}`);
  const json = await resp.json();
  const item = json?.data?.flightPromotionOfferByPath?.item;
  if (!item) throw new Error('Offer response contained no item');
  return normalize(item);
}

/** Build the block markup from a resolved data object. */
function render(block, data, { isFallback }) {
  const bodyCopy = isFallback ? `${data.bodyCopy} fallback` : data.bodyCopy;

  block.textContent = '';
  block.classList.toggle('is-fallback', isFallback);

  const media = document.createElement('div');
  media.className = 'flights-media';
  const picture = createOptimizedPicture(data.image, data.imageAlt, true, [{ width: '2000' }]);
  media.append(picture);

  const card = document.createElement('div');
  card.className = 'flights-card';
  card.innerHTML = `
    <a class="flights-back" href="${BACK_URL}">${BACK_LABEL}</a>
    <h1 class="flights-headline">${data.headline}</h1>
    <p class="flights-body">${bodyCopy}</p>
    <a class="flights-cta" href="${data.ctaUrl}">${data.ctaLabel}</a>
  `;

  block.append(media, card);
}

export default async function decorate(block) {
  const authored = readAuthored(block);
  const endpoint = authored.endpoint || DEFAULT_ENDPOINT;
  const fallbackData = { ...DEFAULTS, ...authored };

  block.classList.add('flights-loading');
  try {
    const data = await fetchOffer(endpoint);
    render(block, data, { isFallback: false });
  } catch (error) {
    // CORS block, network error, or missing fragment — degrade gracefully.
    // eslint-disable-next-line no-console
    console.warn('[flights] falling back to authored content:', error.message);
    render(block, fallbackData, { isFallback: true });
  } finally {
    block.classList.remove('flights-loading');
  }
}
