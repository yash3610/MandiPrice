const searchForm = document.getElementById('searchForm');
const commodityInput = document.getElementById('commodity');
const stateInput = document.getElementById('state');
const sortOption = document.getElementById('sortOption');
const loader = document.getElementById('loader');
const statusEl = document.getElementById('status');
const submitButton = document.getElementById('submitButton');
const resultsSection = document.getElementById('resultsSection');
const topBest = document.getElementById('topBest');
const resultsGrid = document.getElementById('resultsGrid');
const comparisonList = document.getElementById('comparisonList');
const searchAgainButton = document.getElementById('searchAgain');

let cachedResults = [];

function formatPrice(value) {
  return `Rs ${Number(value || 0).toLocaleString('en-IN')}/quintal`;
}

function clearResults() {
  topBest.innerHTML = '';
  resultsGrid.innerHTML = '';
  comparisonList.innerHTML = '';
  resultsSection.classList.add('hidden');
}

function setLoading(loading) {
  loader.classList.toggle('hidden', !loading);
  submitButton.disabled = loading;
}

function showStatus(message = '', isError = true) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#b91c1c' : '#1b7f5a';
}

function sortMandis(list, mode) {
  const sorted = [...list];

  if (mode === 'low-to-high') {
    sorted.sort((a, b) => a.modal_price - b.modal_price);
  } else {
    sorted.sort((a, b) => b.modal_price - a.modal_price);
  }

  return sorted;
}

function renderTopBest(best) {
  topBest.innerHTML = `
    <h3>Top 1 Best Mandi</h3>
    <p>
      <strong>${best.market}</strong>, ${best.district}, ${best.state}<br />
      Best modal price: <strong>${formatPrice(best.modal_price)}</strong>
    </p>
  `;
}

function renderCards(mandis) {
  resultsGrid.innerHTML = '';

  mandis.forEach((mandi, index) => {
    const card = document.createElement('article');
    card.className = `mandi-card ${index === 0 ? 'best' : ''}`;

    card.innerHTML = `
      <h4 class="card-title">${mandi.market}</h4>
      <p class="card-subtitle">${mandi.district}, ${mandi.state}</p>
      <ul class="price-list">
        <li><strong>Min:</strong> ${formatPrice(mandi.min_price)}</li>
        <li><strong>Max:</strong> ${formatPrice(mandi.max_price)}</li>
        <li><strong>Modal:</strong> ${formatPrice(mandi.modal_price)}</li>
      </ul>
    `;

    resultsGrid.appendChild(card);
  });
}

function renderComparison(mandis) {
  comparisonList.innerHTML = '';

  mandis.forEach((mandi, index) => {
    const item = document.createElement('li');
    item.textContent = `${index + 1}. ${mandi.market} (${mandi.district}) - ${formatPrice(mandi.modal_price)}`;
    comparisonList.appendChild(item);
  });
}

function renderResults(mandis) {
  if (!mandis.length) {
    clearResults();
    showStatus('No mandi data found for this crop and state. Try another search.');
    return;
  }

  const best = mandis[0];
  renderTopBest(best);
  renderCards(mandis);
  renderComparison(mandis);

  resultsSection.classList.remove('hidden');
  showStatus('');
}

async function fetchMandis(commodity, state) {
  const params = new URLSearchParams({ commodity, state });
  const response = await fetch(`/api/mandis?${params.toString()}`);
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Unable to fetch mandi records.');
  }

  return data;
}

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const commodity = commodityInput.value.trim();
  const state = stateInput.value.trim() || 'Maharashtra';

  if (!commodity) {
    showStatus('Please enter a crop name.');
    return;
  }

  clearResults();
  setLoading(true);
  showStatus('');

  try {
    const data = await fetchMandis(commodity, state);
    cachedResults = sortMandis(data.mandis, sortOption.value);

    if (!cachedResults.length) {
      showStatus(`No data found for ${commodity} in ${state}.`);
      return;
    }

    renderResults(cachedResults);
    showStatus(`Showing top ${cachedResults.length} mandis for ${commodity} in ${state}.`, false);
  } catch (error) {
    showStatus(error.message || 'Something went wrong while fetching data.');
  } finally {
    setLoading(false);
  }
});

sortOption.addEventListener('change', () => {
  if (!cachedResults.length) {
    return;
  }

  const sorted = sortMandis(cachedResults, sortOption.value);
  cachedResults = sorted;
  renderResults(sorted);
});

searchAgainButton.addEventListener('click', () => {
  clearResults();
  showStatus('Ready for next search.', false);
  commodityInput.focus();
});
