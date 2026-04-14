const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const mandiCache = new Map();

// Configure these values in your environment before running.
const API_KEY = process.env.DATA_GOV_API_KEY || '579b464db66ec23bdd000001000f97b4ed854b4252afb28a6b06686a';
const RESOURCE_ID = process.env.DATA_GOV_RESOURCE_ID || "35985678-0d79-46b4-9ed6-6f13308a1d24";
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'client')));

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function toNumber(value) {
  const parsed = Number(String(value || '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function getField(record, keys) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
      return record[key];
    }
  }

  return '';
}

async function fetchJsonWithRetry(url, retries = 2) {
  let lastStatus = null;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return { ok: true, payload: await response.json() };
      }

      lastStatus = response.status;
    } catch (error) {
      lastError = error;
    }
  }

  return {
    ok: false,
    status: lastStatus,
    error: lastError
  };
}

function toTimestamp(dateStr) {
  const value = String(dateStr || '').trim();
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    return 0;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

app.get('/api/mandis', async (req, res) => {
  const commodity = (req.query.commodity || '').trim();
  const state = (req.query.state || 'Maharashtra').trim();

  if (!commodity) {
    return res.status(400).json({
      success: false,
      message: 'Commodity is required.'
    });
  }

  const cacheKey = `${normalizeText(commodity)}|${normalizeText(state)}`;
  const cacheEntry = mandiCache.get(cacheKey);

  if (cacheEntry && Date.now() - cacheEntry.timestamp < CACHE_TTL_MS) {
    return res.json({
      ...cacheEntry.data,
      cached: true
    });
  }

  if (API_KEY === 'YOUR_API_KEY' || RESOURCE_ID === 'RESOURCE_ID') {
    return res.status(500).json({
      success: false,
      message: 'Server is not configured. Add DATA_GOV_API_KEY and DATA_GOV_RESOURCE_ID.'
    });
  }

  try {
    const limit = 1000;
    const maxPages = 5;
    const records = [];

    for (let page = 0; page < maxPages; page += 1) {
      const query = new URLSearchParams({
        'api-key': API_KEY,
        format: 'json',
        limit: String(limit),
        offset: String(page * limit),
        'filters[state]': state,
        'filters[commodity]': commodity
      });

      const endpoint = `https://api.data.gov.in/resource/${RESOURCE_ID}?${query.toString()}`;
      const upstream = await fetchJsonWithRetry(endpoint, 2);
      if (!upstream.ok) {
        if (cacheEntry) {
          return res.json({
            ...cacheEntry.data,
            cached: true,
            warning: 'Showing last successful data due to upstream timeout.'
          });
        }

        return res.status(502).json({
          success: false,
          message: `Upstream API failed with status ${upstream.status || 504}.`,
          error: upstream.error ? upstream.error.message : undefined
        });
      }

      const payload = upstream.payload;
      const pageRecords = Array.isArray(payload.records) ? payload.records : [];
      records.push(...pageRecords);

      if (pageRecords.length < limit) {
        break;
      }
    }

    const commodityNorm = normalizeText(commodity);
    const stateNorm = normalizeText(state);

    const filtered = records
      .filter((record) => {
        const recordCommodity = normalizeText(getField(record, ['commodity', 'Commodity']));
        const recordState = normalizeText(getField(record, ['state', 'State']));

        return (
          recordCommodity.includes(commodityNorm) &&
          recordState === stateNorm
        );
      })
      .map((record) => {
        const minPrice = toNumber(getField(record, ['min_price', 'Min_Price']));
        const maxPrice = toNumber(getField(record, ['max_price', 'Max_Price']));
        const modalPrice = toNumber(getField(record, ['modal_price', 'Modal_Price']));
        const arrivalDate = getField(record, ['arrival_date', 'Arrival_Date']);

        return {
          market: getField(record, ['market', 'Market']) || 'Unknown Mandi',
          commodity: getField(record, ['commodity', 'Commodity']) || commodity,
          district: getField(record, ['district', 'District']) || 'Unknown District',
          state: getField(record, ['state', 'State']) || state,
          arrival_date: arrivalDate,
          arrival_ts: toTimestamp(arrivalDate),
          min_price: minPrice,
          max_price: maxPrice,
          modal_price: modalPrice,
          profitScore: modalPrice
        };
      })
      .filter((item) => item.modal_price > 0);

    // Keep only one strongest record per mandi for consistent output across searches.
    const mandiMap = new Map();
    for (const item of filtered) {
      const key = `${normalizeText(item.market)}|${normalizeText(item.district)}|${normalizeText(item.state)}`;
      const existing = mandiMap.get(key);

      if (!existing) {
        mandiMap.set(key, item);
        continue;
      }

      const shouldReplace =
        item.profitScore > existing.profitScore ||
        (item.profitScore === existing.profitScore && item.arrival_ts > existing.arrival_ts) ||
        (item.profitScore === existing.profitScore && item.arrival_ts === existing.arrival_ts && item.max_price > existing.max_price);

      if (shouldReplace) {
        mandiMap.set(key, item);
      }
    }

    const stableSorted = Array.from(mandiMap.values()).sort((a, b) => {
      if (b.profitScore !== a.profitScore) {
        return b.profitScore - a.profitScore;
      }
      if (b.max_price !== a.max_price) {
        return b.max_price - a.max_price;
      }
      if (b.arrival_ts !== a.arrival_ts) {
        return b.arrival_ts - a.arrival_ts;
      }

      const marketOrder = a.market.localeCompare(b.market, 'en', { sensitivity: 'base' });
      if (marketOrder !== 0) {
        return marketOrder;
      }

      return a.district.localeCompare(b.district, 'en', { sensitivity: 'base' });
    });

    const topFive = stableSorted.slice(0, 5).map(({ arrival_ts, ...publicItem }) => publicItem);

    const responseData = {
      success: true,
      commodity,
      state,
      totalFound: stableSorted.length,
      best: topFive[0] || null,
      mandis: topFive
    };

    mandiCache.set(cacheKey, {
      timestamp: Date.now(),
      data: responseData
    });

    return res.json(responseData);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch mandi data.',
      error: error.message
    });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Smart Mandi Finder server running at http://localhost:${PORT}`);
});
