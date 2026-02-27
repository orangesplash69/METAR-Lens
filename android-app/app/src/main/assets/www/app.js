const NOAA_METAR_BASE = "https://aviationweather.gov/api/data/metar";
const NOAA_TAF_BASE = "https://aviationweather.gov/api/data/taf";
const OURAIRPORTS_URL =
  "https://davidmegginson.github.io/ourairports-data/airports.csv";
const RUNWAYS_URL =
  "https://davidmegginson.github.io/ourairports-data/runways.csv";
const DEFAULT_PROXY_TEMPLATES = [
  "https://api.codetabs.com/v1/proxy?quest={url}",
];
const FAVORITES_STORAGE_KEY = "metar-favorites-v1";
const FAVORITES_MAX_ITEMS = 20;
const SHARE_TTL_SECONDS = {
  "10s": 10,
  "1h": 60 * 60,
  "6h": 6 * 60 * 60,
  "24h": 24 * 60 * 60,
  "7d": 7 * 24 * 60 * 60,
};
const SHORT_LINK_DOMAIN = (document.querySelector('meta[name="metarlens:short-link-domain"]')?.content || '').trim();

const dom = {
  form: document.getElementById("metarForm"),
  input: document.getElementById("airportInput"),
  button: document.getElementById("fetchBtn"),
  status: document.getElementById("resolveStatus"),
  hint: document.getElementById("iataHint"),
  card: document.getElementById("metarCard"),
  errorCard: document.getElementById("errorCard"),
  errorMessage: document.getElementById("errorMessage"),
  stationName: document.getElementById("stationName"),
  stationMeta: document.getElementById("stationMeta"),
  updatedTime: document.getElementById("updatedTime"),
  windValue: document.getElementById("windValue"),
  windSub: document.getElementById("windSub"),
  visValue: document.getElementById("visValue"),
  visSub: document.getElementById("visSub"),
  cloudValue: document.getElementById("cloudValue"),
  cloudSub: document.getElementById("cloudSub"),
  tempValue: document.getElementById("tempValue"),
  tempSub: document.getElementById("tempSub"),
  dewValue: document.getElementById("dewValue"),
  dewSub: document.getElementById("dewSub"),
  pressValue: document.getElementById("pressValue"),
  pressSub: document.getElementById("pressSub"),
  flightValue: document.getElementById("flightValue"),
  flightSub: document.getElementById("flightSub"),
  rawMetar: document.getElementById("rawMetar"),
  themeToggle: document.getElementById("themeToggle"),
  toolsCard: document.getElementById("toolsCard"),
  riskCard: document.getElementById("riskCard"),
  tafCard: document.getElementById("tafCard"),
  runwaySelect: document.getElementById("runwaySelect"),
  runwayNote: document.getElementById("runwayNote"),
  headArrow: document.getElementById("headArrow"),
  headLabel: document.getElementById("headLabel"),
  headValue: document.getElementById("headValue"),
  headSub: document.getElementById("headSub"),
  crossArrow: document.getElementById("crossArrow"),
  crossLabel: document.getElementById("crossLabel"),
  crossValue: document.getElementById("crossValue"),
  crossSub: document.getElementById("crossSub"),
  turbNow: document.getElementById("turbNow"),
  turbForecast: document.getElementById("turbForecast"),
  iceNow: document.getElementById("iceNow"),
  iceForecast: document.getElementById("iceForecast"),
  riskNote: document.getElementById("riskNote"),
  tafStatus: document.getElementById("tafStatus"),
  rawTaf: document.getElementById("rawTaf"),
  windSpeedChart: document.getElementById("windSpeedChart"),
  windDirChart: document.getElementById("windDirChart"),
  visibilityChart: document.getElementById("visibilityChart"),
  ceilingChart: document.getElementById("ceilingChart"),
  runwayAnalysisCard: document.getElementById("runwayAnalysisCard"),
  runwayAnalysisMeta: document.getElementById("runwayAnalysisMeta"),
  runwayList: document.getElementById("runwayList"),
  warningCard: document.getElementById("warningCard"),
  warningList: document.getElementById("warningList"),
  atisCard: document.getElementById("atisCard"),
  atisOutput: document.getElementById("atisOutput"),
  runwayPerformanceList: document.getElementById("runwayPerformanceList"),
  favoriteBtn: document.getElementById("favoriteBtn"),
  shareBtn: document.getElementById("shareBtn"),
  shareStatus: document.getElementById("shareStatus"),
  favoritesList: document.getElementById("favoritesList"),
  favoritesEmpty: document.getElementById("favoritesEmpty"),
  shareCard: document.getElementById("shareCard"),
  shareLinkInput: document.getElementById("shareLinkInput"),
  copyTextBtn: document.getElementById("copyTextBtn"),
  shareLinkBtn: document.getElementById("shareLinkBtn"),
  sharePanelStatus: document.getElementById("sharePanelStatus"),
  sharedBriefingNote: document.getElementById("sharedBriefingNote"),
};

const state = {
  airports: null,
  airportsPromise: null,
  runways: null,
  runwaysPromise: null,
  currentMetar: null,
  currentTaf: null,
  charts: null,
  currentRunways: [],
  selectedRunwayComponents: null,
  currentResolved: null,
  bestRunway: null,
  favorites: [],
  shareStatusTimer: null,
  sharePanelTimer: null,
  currentWarnings: [],
  currentShareLink: "",
  sharedSnapshot: null,
};

initTheme();
initFavorites();
void initSharedBriefingFromUrl();

dom.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = dom.input.value.trim();
  if (!query) {
    showError("Enter an airport name, IATA code, or ICAO code.");
    return;
  }

  await loadAirportWeather(query);
});

async function loadAirportWeather(query, options = {}) {
  clearError();
  setShareStatus("");
  setSharePanelStatus("");
  state.currentMetar = null;
  state.currentTaf = null;
  state.currentResolved = null;
  state.bestRunway = null;
  state.selectedRunwayComponents = null;
  state.currentRunways = [];
  state.currentWarnings = [];
  state.currentShareLink = "";
  state.sharedSnapshot = null;
  if (!options.keepShareToken) {
    clearShareTokenFromUrl();
  }
  updateFavoriteButtonState();
  renderFavorites();

  if (dom.shareLinkInput) {
    dom.shareLinkInput.value = "";
  }
  dom.card.classList.add("hidden");
  dom.atisCard.classList.add("hidden");
  dom.shareCard.classList.add("hidden");
  dom.toolsCard.classList.add("hidden");
  dom.runwayAnalysisCard.classList.add("hidden");
  dom.warningCard.classList.add("hidden");
  dom.riskCard.classList.add("hidden");
  dom.tafCard.classList.add("hidden");
  if (dom.sharedBriefingNote) {
    dom.sharedBriefingNote.classList.add("hidden");
  }
  setStatus("Resolving airport...");
  dom.button.disabled = true;

  try {
    const resolved = await resolveAirport(query);
    if (!resolved) {
      showError("Airport not found. Try a different name or code.");
      setStatus("");
      updateFavoriteButtonState();
      return false;
    }

    state.currentResolved = resolved;

    setStatus(
      `Resolved to ${resolved.icao} — ${resolved.displayName || "Unknown"}`
    );

    const raw = await fetchMetar(resolved.icao);
    if (!raw) {
      showError("METAR not found for this airport.");
      setStatus("");
      updateFavoriteButtonState();
      return false;
    }

    const parsed = parseMetar(raw);
    state.currentMetar = parsed;
    renderMetar(parsed, resolved);
    dom.card.classList.remove("hidden");
    dom.atisCard.classList.remove("hidden");
    dom.shareCard.classList.remove("hidden");

    dom.toolsCard.classList.remove("hidden");
    dom.runwayAnalysisCard.classList.remove("hidden");
    dom.warningCard.classList.remove("hidden");
    const hasRunways = await updateRunwayList(resolved.icao);
    if (hasRunways) {
      updateRunwayCalculator();
    } else {
      state.selectedRunwayComponents = null;
      updateRunwayAnalysis();
      updateRunwayPerformanceHints();
      updateAtisOutput();
      updateSmartWarnings();
    }

    try {
      const tafRaw = await fetchTaf(resolved.icao);
      if (tafRaw) {
        const taf = parseTaf(tafRaw);
        state.currentTaf = taf;
        renderTaf(taf);
      } else {
        state.currentTaf = null;
        dom.tafStatus.textContent = "TAF not available for this airport.";
        dom.rawTaf.textContent = "";
        updateChartsWithEmpty();
      }
    } catch (tafError) {
      state.currentTaf = null;
      dom.tafStatus.textContent = "Unable to load TAF data right now.";
      dom.rawTaf.textContent = "";
      updateChartsWithEmpty();
    }
    dom.tafCard.classList.remove("hidden");

    updateRiskLayers();
    updateSmartWarnings();
    dom.riskCard.classList.remove("hidden");
    refreshSharePanel();
    updateFavoriteButtonState();
    renderFavorites();
    return true;
  } catch (error) {
    showError(
      error instanceof Error
        ? error.message
        : "Unable to fetch METAR right now."
    );
    return false;
  } finally {
    dom.button.disabled = false;
  }
}

const handleIataHint = debounce(async () => {
  const query = dom.input.value.trim().toUpperCase();
  dom.hint.textContent = "";
  if (!/^[A-Z]{3}$/.test(query)) {
    return;
  }

  try {
    const { iataMap } = await loadAirports();
    const airport = iataMap.get(query);
    if (airport) {
      dom.hint.textContent = `Detected ICAO: ${airport.ident}`;
    } else {
      dom.hint.textContent = "IATA not found in airport database.";
    }
  } catch {
    dom.hint.textContent = "";
  }
}, 400);

dom.input.addEventListener("input", handleIataHint);
dom.runwaySelect.addEventListener("change", updateRunwayCalculator);
if (dom.favoriteBtn) {
  dom.favoriteBtn.addEventListener("click", handleFavoriteToggle);
}
if (dom.shareBtn) {
  dom.shareBtn.addEventListener("click", () => handleShareAsLink({
    fromHeader: true,
  }));
}
if (dom.copyTextBtn) {
  dom.copyTextBtn.addEventListener("click", handleCopyAsText);
}
if (dom.shareLinkBtn) {
  dom.shareLinkBtn.addEventListener("click", () => handleShareAsLink());
}
if (dom.favoritesList) {
  dom.favoritesList.addEventListener("click", handleFavoritesClick);
}

dom.themeToggle.addEventListener("click", () => {
  const isDark = document.body.dataset.theme === "dark";
  const next = isDark ? "light" : "dark";
  setTheme(next);
  updateChartsTheme();
});

async function resolveAirport(query) {
  const cleaned = query.trim().toUpperCase();
  const isIata = /^[A-Z]{3}$/.test(cleaned);
  const isIcao = /^[A-Z]{4}$/.test(cleaned);

  const { iataMap, icaoMap, list } = await loadAirports();

  if (isIata) {
    const airport = iataMap.get(cleaned);
    if (airport) {
      return formatResolved(airport);
    }
  }

  if (isIcao) {
    const airport = icaoMap.get(cleaned);
    if (airport) {
      return formatResolved(airport);
    }

    // Fallback for valid ICAO not present in lookup CSV.
    return {
      icao: cleaned,
      displayName: cleaned,
      airport: null,
    };
  }

  const byName = findByName(query, list);
  if (byName) {
    return formatResolved(byName);
  }

  return null;
}

function formatResolved(airport) {
  const nameParts = [airport.name, airport.municipality].filter(Boolean);
  return {
    icao: airport.ident,
    displayName: nameParts.join(" — "),
    airport,
  };
}

async function fetchMetar(icao) {
  const url = `${NOAA_METAR_BASE}?ids=${encodeURIComponent(icao)}&format=raw`;
  const text = await fetchTextWithFallback(url, {
    cache: "no-store",
    errorMessage: "Unable to reach the METAR service.",
  });
  if (!text) {
    return null;
  }
  return text.split(/\r?\n/).find(Boolean) || text;
}

async function fetchTaf(icao) {
  const url = `${NOAA_TAF_BASE}?ids=${encodeURIComponent(icao)}&format=raw`;
  const text = await fetchTextWithFallback(url, {
    cache: "no-store",
    errorMessage: "Unable to reach the TAF service.",
  });
  if (!text) {
    return null;
  }
  return text.split(/\r?\n/).find(Boolean) || text;
}

function getProxyTemplates() {
  const configured = globalThis.METAR_PROXY_TEMPLATE;
  const fromConfig = Array.isArray(configured)
    ? configured
    : typeof configured === "string"
    ? [configured]
    : [];

  return [...fromConfig, ...DEFAULT_PROXY_TEMPLATES].filter(
    (template) => typeof template === "string" && template.includes("{url}")
  );
}

function buildProxyUrl(template, targetUrl) {
  return template.replaceAll("{url}", encodeURIComponent(targetUrl));
}

async function fetchTextWithFallback(
  url,
  { cache = "default", errorMessage = "Request failed." } = {}
) {
  const attempts = [url, ...getProxyTemplates().map((t) => buildProxyUrl(t, url))];
  let lastError = null;

  for (const attemptUrl of attempts) {
    try {
      const response = await fetch(attemptUrl, { cache });
      if (response.status === 204) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return (await response.text()).trim();
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error && lastError.message) {
    throw new Error(`${errorMessage} Last error: ${lastError.message}`);
  }
  throw new Error(errorMessage);
}

function parseMetar(raw) {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  const tokens = cleaned.split(" ");
  const result = {
    raw: cleaned,
    station: tokens[0] || "",
    timeGroup: null,
    wind: null,
    visibility: null,
    clouds: [],
    temp: null,
    dew: null,
    pressure: null,
    ceilingFt: null,
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    const timeMatch = token.match(/^(\d{2})(\d{2})(\d{2})Z$/);
    if (timeMatch) {
      result.timeGroup = {
        day: Number(timeMatch[1]),
        hour: Number(timeMatch[2]),
        minute: Number(timeMatch[3]),
      };
      continue;
    }

    const windMatch = token.match(/^(VRB|\d{3})(\d{2,3})(G\d{2,3})?(KT|MPS)$/);
    if (windMatch) {
      const speed = Number(windMatch[2]);
      const gust = windMatch[3] ? Number(windMatch[3].slice(1)) : null;
      result.wind = {
        direction: windMatch[1],
        speed,
        gust,
        unit: windMatch[4],
      };
      continue;
    }

    if (token === "CAVOK") {
      result.visibility = {
        miles: 6.2,
        meters: 10000,
        qualifier: "P",
        raw: token,
      };
      result.clouds.push({ code: "CAVOK", heightFt: null, modifier: null });
      continue;
    }

    if (token.endsWith("SM")) {
      const vis = parseVisibilitySM(tokens, i);
      if (vis) {
        result.visibility = vis;
      }
      continue;
    }

    if (/^\d{4}$/.test(token)) {
      const meters = Number(token);
      if (!Number.isNaN(meters)) {
        result.visibility = {
          miles: metersToMiles(meters),
          meters,
          qualifier: null,
          raw: token,
        };
      }
      continue;
    }

    const cloudMatch = token.match(/^(FEW|SCT|BKN|OVC|VV)(\d{3})([A-Z]{2,3})?$/);
    if (cloudMatch) {
      const heightFt = Number(cloudMatch[2]) * 100;
      result.clouds.push({
        code: cloudMatch[1],
        heightFt,
        modifier: cloudMatch[3] || null,
      });
      if (["BKN", "OVC", "VV"].includes(cloudMatch[1])) {
        if (!result.ceilingFt || heightFt < result.ceilingFt) {
          result.ceilingFt = heightFt;
        }
      }
      continue;
    }

    if (["NSC", "NCD", "SKC", "CLR"].includes(token)) {
      result.clouds.push({ code: token, heightFt: null, modifier: null });
      continue;
    }

    const tempMatch = token.match(/^(M?\d{2})\/(M?\d{2})$/);
    if (tempMatch) {
      result.temp = parseSignedNumber(tempMatch[1]);
      result.dew = parseSignedNumber(tempMatch[2]);
      continue;
    }

    const altMatch = token.match(/^A(\d{4})$/);
    if (altMatch) {
      const inHg = Number(altMatch[1]) / 100;
      result.pressure = {
        inHg,
        hPa: inHg * 33.8639,
      };
      continue;
    }

    const qnhMatch = token.match(/^Q(\d{4})$/);
    if (qnhMatch) {
      const hPa = Number(qnhMatch[1]);
      result.pressure = {
        inHg: hPa / 33.8639,
        hPa,
      };
    }
  }

  return result;
}

function parseTaf(raw) {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  const tokens = cleaned.split(" ");
  const stationIdx = findStationIndex(tokens);
  const issueIdx = findIssueIndex(tokens, stationIdx);
  const validityIdx = findValidityIndex(tokens, issueIdx);

  const station = stationIdx >= 0 ? tokens[stationIdx] : "";
  const issueToken = issueIdx >= 0 ? tokens[issueIdx] : null;
  const issueGroup = issueToken ? parseIssueToken(issueToken) : null;
  const reference = issueGroup
    ? resolveTafDate(issueGroup.day, issueGroup.hour, issueGroup.minute, new Date())
    : new Date();

  const validityToken = validityIdx >= 0 ? tokens[validityIdx] : null;
  const validity = validityToken
    ? parseValidityToken(validityToken, reference)
    : { start: reference, end: new Date(reference.getTime() + 24 * 3600 * 1000) };

  const tokensAfter = validityIdx >= 0 ? tokens.slice(validityIdx + 1) : [];
  const blocks = parseTafBlocks(tokensAfter, validity, reference);
  const temps = parseTafTemps(tokens);

  return {
    raw: cleaned,
    station,
    issueDate: reference,
    validStart: validity.start,
    validEnd: validity.end,
    blocks,
    temps,
  };
}

function findStationIndex(tokens) {
  for (let i = 0; i < Math.min(tokens.length, 4); i += 1) {
    if (tokens[i] === "TAF" || tokens[i] === "AMD" || tokens[i] === "COR") {
      continue;
    }
    if (/^[A-Z]{4}$/.test(tokens[i])) {
      return i;
    }
  }
  return -1;
}

function findIssueIndex(tokens, stationIdx) {
  if (stationIdx < 0) {
    return -1;
  }
  for (let i = stationIdx + 1; i < tokens.length; i += 1) {
    if (/^\d{6}Z$/.test(tokens[i])) {
      return i;
    }
  }
  return -1;
}

function findValidityIndex(tokens, issueIdx) {
  if (issueIdx < 0) {
    return -1;
  }
  for (let i = issueIdx + 1; i < tokens.length; i += 1) {
    if (/^\d{4}\/\d{4}$/.test(tokens[i])) {
      return i;
    }
  }
  return -1;
}

function parseIssueToken(token) {
  const match = token.match(/^(\d{2})(\d{2})(\d{2})Z$/);
  if (!match) {
    return null;
  }
  return {
    day: Number(match[1]),
    hour: Number(match[2]),
    minute: Number(match[3]),
  };
}

function parseValidityToken(token, reference) {
  const match = token.match(/^(\d{2})(\d{2})\/(\d{2})(\d{2})$/);
  if (!match) {
    return { start: reference, end: new Date(reference.getTime() + 24 * 3600 * 1000) };
  }
  const start = resolveTafDate(Number(match[1]), Number(match[2]), 0, reference);
  let end = resolveTafDate(Number(match[3]), Number(match[4]), 0, reference);
  if (end <= start) {
    end = new Date(end.getTime() + 24 * 3600 * 1000);
  }
  return { start, end };
}

function parseTafBlocks(tokens, validity, reference) {
  const blocks = [];
  let current = {
    type: "BASE",
    start: validity.start,
    end: validity.end,
    tokens: [],
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (isTafChangeToken(token)) {
      if (current.tokens.length) {
        blocks.push(enrichTafBlock(current));
      }
      if (token.startsWith("FM")) {
        const start = parseFmToken(token, reference) || validity.start;
        current = {
          type: "FM",
          start,
          end: validity.end,
          tokens: [],
        };
        continue;
      }

      const type = token;
      let period = null;
      const nextToken = tokens[i + 1];
      if (nextToken && /^\d{4}\/\d{4}$/.test(nextToken)) {
        period = parseValidityToken(nextToken, reference);
        i += 1;
      }
      current = {
        type,
        start: period?.start || validity.start,
        end: period?.end || validity.end,
        tokens: [],
      };
      continue;
    }
    current.tokens.push(token);
  }

  if (current.tokens.length) {
    blocks.push(enrichTafBlock(current));
  }

  for (let i = 0; i < blocks.length - 1; i += 1) {
    if (!blocks[i].end || blocks[i].type === "BASE" || blocks[i].type === "FM") {
      blocks[i].end = blocks[i + 1].start;
    }
  }
  const last = blocks[blocks.length - 1];
  if (last && !last.end) {
    last.end = validity.end;
  }

  return blocks;
}

function isTafChangeToken(token) {
  return (
    token.startsWith("FM") ||
    token === "TEMPO" ||
    token === "BECMG" ||
    token.startsWith("PROB")
  );
}

function parseFmToken(token, reference) {
  const match = token.match(/^FM(\d{2})(\d{2})(\d{2})$/);
  if (!match) {
    return null;
  }
  return resolveTafDate(Number(match[1]), Number(match[2]), Number(match[3]), reference);
}

function enrichTafBlock(block) {
  const conditions = parseTafConditions(block.tokens);
  return {
    ...block,
    ...conditions,
  };
}

function parseTafConditions(tokens) {
  const result = {
    wind: null,
    visibility: null,
    clouds: [],
    ceilingFt: null,
    hasClouds: false,
    hasPrecip: false,
    hasWindShear: false,
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    const windMatch = token.match(/^(VRB|\d{3})(\d{2,3})(G\d{2,3})?(KT|MPS)$/);
    if (windMatch) {
      const speed = Number(windMatch[2]);
      const gust = windMatch[3] ? Number(windMatch[3].slice(1)) : null;
      result.wind = {
        direction: windMatch[1],
        speed,
        gust,
        unit: windMatch[4],
      };
      continue;
    }

    if (token === "CAVOK") {
      result.visibility = {
        miles: 6.2,
        meters: 10000,
        qualifier: "P",
        raw: token,
      };
      result.clouds.push({ code: "CAVOK", heightFt: null, modifier: null });
      continue;
    }

    if (token.endsWith("SM")) {
      const vis = parseVisibilitySM(tokens, i);
      if (vis) {
        result.visibility = vis;
      }
      continue;
    }

    if (/^\d{4}$/.test(token)) {
      const meters = Number(token);
      if (!Number.isNaN(meters)) {
        result.visibility = {
          miles: metersToMiles(meters),
          meters,
          qualifier: null,
          raw: token,
        };
      }
      continue;
    }

    const cloudMatch = token.match(/^(FEW|SCT|BKN|OVC|VV)(\d{3})([A-Z]{2,3})?$/);
    if (cloudMatch) {
      const heightFt = Number(cloudMatch[2]) * 100;
      result.clouds.push({
        code: cloudMatch[1],
        heightFt,
        modifier: cloudMatch[3] || null,
      });
      result.hasClouds = true;
      if (["BKN", "OVC", "VV"].includes(cloudMatch[1])) {
        if (!result.ceilingFt || heightFt < result.ceilingFt) {
          result.ceilingFt = heightFt;
        }
      }
      continue;
    }

    if (["NSC", "NCD", "SKC", "CLR"].includes(token)) {
      continue;
    }

    if (token.startsWith("WS")) {
      result.hasWindShear = true;
    }

    if (/[+-]?(TS|RA|SN|DZ|PL|GR|GS|SH|FZ)/.test(token)) {
      result.hasPrecip = true;
    }
  }

  return result;
}

function parseTafTemps(tokens) {
  let max = null;
  let min = null;
  for (const token of tokens) {
    const maxMatch = token.match(/^TX(M?\d{2})\//);
    if (maxMatch) {
      max = parseSignedNumber(maxMatch[1]);
    }
    const minMatch = token.match(/^TN(M?\d{2})\//);
    if (minMatch) {
      min = parseSignedNumber(minMatch[1]);
    }
  }
  return { max, min };
}

function resolveTafDate(day, hour, minute, reference) {
  const year = reference.getUTCFullYear();
  let month = reference.getUTCMonth();
  const refDay = reference.getUTCDate();
  if (day < refDay - 7) {
    month += 1;
  } else if (day > refDay + 20) {
    month -= 1;
  }
  return new Date(Date.UTC(year, month, day, hour, minute));
}

function parseVisibilitySM(tokens, index) {
  const token = tokens[index];
  if (!token.endsWith("SM")) {
    return null;
  }

  let valueToken = token.replace("SM", "");
  let qualifier = null;
  if (valueToken.startsWith("P") || valueToken.startsWith("M")) {
    qualifier = valueToken[0];
    valueToken = valueToken.slice(1);
  }

  let miles = null;
  if (valueToken.includes("/")) {
    miles = parseFraction(valueToken);
    if (index > 0 && /^\d+$/.test(tokens[index - 1])) {
      miles += Number(tokens[index - 1]);
    }
  } else if (/^\d+$/.test(valueToken)) {
    miles = Number(valueToken);
  }

  if (miles === null || Number.isNaN(miles)) {
    return null;
  }

  return {
    miles,
    meters: milesToMeters(miles),
    qualifier,
    raw: token,
  };
}

function parseSignedNumber(token) {
  if (!token) {
    return null;
  }
  return token.startsWith("M")
    ? -Number(token.slice(1))
    : Number(token);
}

function renderMetar(metar, resolved) {
  const airport = resolved.airport;
  const stationName = airport?.name || resolved.icao;
  const locationParts = [];
  if (airport?.municipality) {
    locationParts.push(airport.municipality);
  }
  if (airport?.iso_country) {
    locationParts.push(airport.iso_country);
  }

  dom.stationName.textContent = stationName;
  dom.stationMeta.textContent = [resolved.icao, ...locationParts].join(" • ");
  dom.updatedTime.textContent = formatObsTime(metar.timeGroup);

  const windText = formatWind(metar.wind);
  dom.windValue.textContent = windText.primary;
  dom.windSub.textContent = windText.secondary;

  const visText = formatVisibility(metar.visibility);
  dom.visValue.textContent = visText.primary;
  dom.visSub.textContent = visText.secondary;

  const cloudText = formatClouds(metar.clouds);
  dom.cloudValue.textContent = cloudText.primary;
  dom.cloudSub.textContent = cloudText.secondary;

  const tempText = formatTemperature(metar.temp);
  dom.tempValue.textContent = tempText.primary;
  dom.tempSub.textContent = tempText.secondary;

  const dewText = formatTemperature(metar.dew);
  dom.dewValue.textContent = dewText.primary;
  dom.dewSub.textContent = dewText.secondary;

  const pressText = formatPressure(metar.pressure);
  dom.pressValue.textContent = pressText.primary;
  dom.pressSub.textContent = pressText.secondary;

  const flight = computeFlightCategory(metar.ceilingFt, metar.visibility);
  dom.flightValue.textContent = flight.category;
  dom.flightSub.textContent = flight.detail;
  setFlightClass(flight.category);

  dom.rawMetar.textContent = metar.raw;

  if (window.Chart) {
    ensureCharts();
  }
  updateWindCompass(metar);
  updateCloudLayers(metar);
  updateFavoriteButtonState();
  updateRunwayPerformanceHints();
  updateAtisOutput();
}

async function updateRunwayList(airportIdent) {
  dom.runwaySelect.innerHTML = '<option value="">Select runway</option>';
  dom.runwaySelect.disabled = true;
  dom.runwayNote.textContent = "Loading runway data...";
  setRunwayOutputs("—", "—", "Head/Tailwind", "Crosswind");
  state.currentRunways = [];
  state.selectedRunwayComponents = null;
  updateRunwayPerformanceHints();
  updateAtisOutput();

  try {
    const runwayMap = await loadRunways();
    const runways = runwayMap.get(airportIdent) || [];
    if (!runways.length) {
      dom.runwayNote.textContent = "No runway data available for this airport.";
      updateRunwayAnalysis();
      updateRunwayPerformanceHints();
      updateAtisOutput();
      return false;
    }

    const sorted = [...runways].sort((a, b) => {
      const aNum = runwaySortValue(a.ident, a.heading);
      const bNum = runwaySortValue(b.ident, b.heading);
      return aNum - bNum;
    });

    state.currentRunways = sorted;

    for (const runway of sorted) {
      const option = document.createElement("option");
      option.value = runway.heading.toFixed(0);
      option.dataset.ident = runway.ident;
      option.dataset.heading = runway.heading.toFixed(0);
      option.textContent = `Runway ${runway.ident} (${String(
        Math.round(runway.heading)
      ).padStart(3, "0")}°)`;
      dom.runwaySelect.appendChild(option);
    }

    dom.runwaySelect.disabled = false;
    dom.runwaySelect.selectedIndex = 1;
    dom.runwayNote.textContent = "Select a runway to calculate components.";
    updateRunwayAnalysis();
    updateRunwayPerformanceHints();
    updateAtisOutput();
    return true;
  } catch (error) {
    dom.runwayNote.textContent = "Unable to load runway data.";
    updateRunwayAnalysis();
    updateRunwayPerformanceHints();
    updateAtisOutput();
    return false;
  }
}

function updateRunwayCalculator() {
  const wind = state.currentMetar?.wind;
  if (!wind) {
    state.selectedRunwayComponents = null;
    dom.runwayNote.textContent = "Waiting for METAR wind.";
    setRunwayOutputs("—", "—", "Head/Tailwind", "Crosswind");
    updateRunwayAnalysis();
    updateRunwayPerformanceHints();
    updateAtisOutput();
    updateSmartWarnings();
    return;
  }

  const selection = dom.runwaySelect.value;
  const selectedOption = dom.runwaySelect.selectedOptions[0];
  if (!selection) {
    state.selectedRunwayComponents = null;
    dom.runwayNote.textContent = "Select a runway to calculate components.";
    setRunwayOutputs("—", "—", "Head/Tailwind", "Crosswind");
    updateRunwayAnalysis();
    updateRunwayPerformanceHints();
    updateAtisOutput();
    updateSmartWarnings();
    return;
  }

  const heading = Number(selection);
  if (Number.isNaN(heading)) {
    state.selectedRunwayComponents = null;
    dom.runwayNote.textContent = "Runway heading unavailable.";
    setRunwayOutputs("—", "—", "Head/Tailwind", "Crosswind");
    updateRunwayAnalysis();
    updateRunwayPerformanceHints();
    updateAtisOutput();
    updateSmartWarnings();
    return;
  }

  const runwayIdent = selectedOption?.dataset.ident || "Runway";
  const components = calculateRunwayWindComponents(wind, heading);
  state.selectedRunwayComponents = {
    ...components,
    heading,
    ident: runwayIdent,
  };

  if (!components.valid) {
    dom.runwayNote.textContent = "Wind is variable; components are unreliable.";
    setRunwayOutputs("Variable", "Variable", "Head/Tailwind", "Crosswind");
    updateRunwayAnalysis();
    updateRunwayPerformanceHints();
    updateAtisOutput();
    updateSmartWarnings();
    return;
  }

  dom.runwayNote.textContent = `${runwayIdent} (${String(
    Math.round(heading)
  ).padStart(3, "0")}°) • Wind ${components.windDirection.toFixed(0)}° at ${components.speed.toFixed(0)} kt`;

  dom.headArrow.textContent = components.headwind >= 0.01 ? "↑" : "↓";
  dom.crossArrow.textContent = components.crosswindSign >= 0 ? "→" : "←";

  dom.headLabel.textContent = components.headwind >= 0.01 ? "Headwind" : "Tailwind";
  dom.crossLabel.textContent = components.crosswindSign >= 0 ? "Right crosswind" : "Left crosswind";

  dom.headValue.textContent = `${formatComponentValue(Math.max(components.headwind, components.tailwind))} kt`;
  dom.crossValue.textContent = `${formatComponentValue(components.crosswind)} kt`;

  if (components.gust != null) {
    dom.headSub.textContent = `Max gust ${formatComponentValue(Math.max(components.gustHeadwind, components.gustTailwind))} kt`;
    dom.crossSub.textContent = `Max gust ${formatComponentValue(components.gustCrosswind)} kt`;
  } else {
    dom.headSub.textContent = `Δ ${Math.round(components.angleDelta)}° from runway`;
    dom.crossSub.textContent = `Δ ${Math.round(components.angleDelta)}° from runway`;
  }

  updateRunwayAnalysis();
  updateRunwayPerformanceHints();
  updateAtisOutput();
  updateSmartWarnings();
}

function updateRunwayPerformanceHints() {
  if (!dom.runwayPerformanceList) {
    return;
  }

  const hints = generateRunwayPerformanceHints();
  renderRunwayPerformanceHints(hints);
}

function generateRunwayPerformanceHints() {
  const metar = state.currentMetar;
  if (!metar) {
    return [{ level: "info", message: "Load METAR to generate runway performance hints." }];
  }

  const hints = [];
  const raw = ` ${metar.raw || ""} `;
  const hasRain = /(?:^|\s)[+-]?(RA|DZ|SHRA|TSRA|VCSH)(?:\s|=|$)/.test(raw);
  const hasSnow = /(?:^|\s)[+-]?(SN|SG|PL|IC)(?:\s|=|$)/.test(raw);
  const hasFreezing = /(?:^|\s)[+-]?FZ(RA|DZ|FG)(?:\s|=|$)/.test(raw);

  if (hasSnow || hasFreezing) {
    hints.push({
      level: "warning",
      message: "Snow or freezing precipitation detected. Reduced braking expected and landing distance may increase.",
    });
  } else if (hasRain) {
    hints.push({
      level: "caution",
      message: "Rain/wet conditions likely. Reduced braking expected.",
    });
  }

  if (metar.temp != null) {
    if (metar.temp >= 35) {
      hints.push({
        level: "warning",
        message: `High temperature ${metar.temp}°C. Expect longer takeoff and landing distance.`,
      });
    } else if (metar.temp >= 30) {
      hints.push({
        level: "caution",
        message: `Warm temperature ${metar.temp}°C may slightly increase runway distance required.`,
      });
    }
  }

  const qnh = metar.pressure?.hPa;
  if (qnh != null) {
    if (qnh <= 995) {
      hints.push({
        level: "warning",
        message: `Low pressure QNH ${qnh.toFixed(0)} hPa. Verify altimeter and performance corrections.`,
      });
    } else if (qnh <= 1005) {
      hints.push({
        level: "caution",
        message: `Lower pressure QNH ${qnh.toFixed(0)} hPa may increase density altitude.`,
      });
    }
  }

  const elevationFt = state.currentResolved?.airport?.elevationFt;
  const pressureInHg = metar.pressure?.inHg;
  if (Number.isFinite(elevationFt) && metar.temp != null && pressureInHg != null) {
    const pressureAltitude = elevationFt + (29.92 - pressureInHg) * 1000;
    const isaTemp = 15 - 2 * (elevationFt / 1000);
    const densityAltitude = pressureAltitude + 120 * (metar.temp - isaTemp);

    if (densityAltitude >= 6000) {
      hints.push({
        level: "warning",
        message: `High density altitude ${Math.round(densityAltitude).toLocaleString()} ft. Expect reduced climb and longer runway required.`,
      });
    } else if (densityAltitude >= 3000) {
      hints.push({
        level: "caution",
        message: `Density altitude around ${Math.round(densityAltitude).toLocaleString()} ft. Review runway performance margins.`,
      });
    }
  }

  const selected = state.selectedRunwayComponents;
  if (selected?.valid) {
    const crosswind = Math.max(selected.crosswind, selected.gustCrosswind || 0);
    const tailwind = Math.max(selected.tailwind, selected.gustTailwind || 0);

    if (crosswind >= 20) {
      hints.push({
        level: "warning",
        message: `Selected runway ${selected.ident} crosswind is strong (${formatComponentValue(crosswind)} kt).`,
      });
    } else if (crosswind >= 12) {
      hints.push({
        level: "caution",
        message: `Selected runway ${selected.ident} crosswind is elevated (${formatComponentValue(crosswind)} kt).`,
      });
    }

    if (tailwind >= 8) {
      hints.push({
        level: "warning",
        message: `Tailwind on runway ${selected.ident} is ${formatComponentValue(tailwind)} kt. Long landing distance required.`,
      });
    } else if (tailwind >= 4) {
      hints.push({
        level: "caution",
        message: `Tailwind on runway ${selected.ident} may increase stopping distance.`,
      });
    }

    if ((hasRain || hasSnow || hasFreezing) && (tailwind >= 3 || crosswind >= 10)) {
      hints.push({
        level: "warning",
        message: `Wet/contaminated runway combined with adverse wind on ${selected.ident}. Use conservative margins.`,
      });
    }
  } else if (state.currentRunways.length > 0) {
    hints.push({
      level: "info",
      message: "Select a runway for runway-specific tailwind and crosswind performance hints.",
    });
  }

  if (!hints.length) {
    hints.push({
      level: "info",
      message: "No significant runway performance penalties identified from the current METAR.",
    });
  }

  hints.sort((a, b) => warningSeverityRank(b.level) - warningSeverityRank(a.level));
  return hints;
}

function renderRunwayPerformanceHints(hints) {
  if (!dom.runwayPerformanceList) {
    return;
  }

  dom.runwayPerformanceList.innerHTML = "";

  for (const hint of hints) {
    const item = document.createElement("article");
    item.className = `performance-hint performance-${hint.level}`;

    const level = document.createElement("span");
    level.className = "performance-level";
    level.textContent = hint.level;

    const message = document.createElement("p");
    message.className = "warning-text";
    message.textContent = hint.message;

    item.appendChild(level);
    item.appendChild(message);
    dom.runwayPerformanceList.appendChild(item);
  }
}

function updateAtisOutput() {
  if (!dom.atisOutput || !dom.atisCard) {
    return;
  }

  if (!state.currentMetar) {
    dom.atisCard.classList.add("hidden");
    dom.atisOutput.textContent = "Waiting for METAR data.";
    return;
  }

  dom.atisCard.classList.remove("hidden");
  dom.atisOutput.textContent = buildAtisOutput();
}

function buildAtisOutput() {
  const metar = state.currentMetar;
  if (!metar) {
    return "No METAR data available.";
  }

  const airportName = state.currentResolved?.airport?.name || state.currentResolved?.icao || metar.station;
  const runwaySentence = atisRunwaySentence();
  const windSentence = atisWindSentence(metar.wind);
  const visibilitySentence = atisVisibilitySentence(metar.visibility);
  const cloudSentence = atisCloudSentence(metar.clouds);
  const temp = metar.temp != null ? `${metar.temp} degrees Celsius` : "temperature unavailable";
  const dew = metar.dew != null ? `${metar.dew} degrees Celsius` : "dew point unavailable";
  const qnh = metar.pressure?.hPa != null
    ? `QNH ${Math.round(metar.pressure.hPa)} hectopascals`
    : "QNH unavailable";

  return `ATIS-style advisory for ${airportName}. ${runwaySentence} ${windSentence}, ${visibilitySentence}, ${cloudSentence}. Temperature ${temp}, dew point ${dew}, ${qnh}.`;
}

function atisRunwaySentence() {
  const selected = state.selectedRunwayComponents;
  if (selected?.ident) {
    return `Selected runway ${selected.ident}`;
  }

  let best = state.bestRunway;
  if (!best) {
    const evaluation = buildRunwayEvaluation();
    if (evaluation.bestIndex >= 0) {
      const row = evaluation.rows[evaluation.bestIndex];
      best = {
        ident: row.runway.ident,
        heading: row.runway.heading,
        components: row.components,
        condition: row.condition,
      };
      state.bestRunway = best;
    }
  }

  if (best?.ident) {
    return `Recommended runway ${best.ident}`;
  }
  return "Runway recommendation unavailable";
}

function atisWindSentence(wind) {
  if (!wind) {
    return "Wind unavailable";
  }
  const speedKt = Math.round(toKnots(wind.speed, wind.unit));
  if (wind.direction === "VRB") {
    if (wind.gust != null) {
      const gustKt = Math.round(toKnots(wind.gust, wind.unit));
      return `wind variable at ${speedKt} knots, gusting ${gustKt}`;
    }
    return `wind variable at ${speedKt} knots`;
  }

  const direction = String(Number(wind.direction)).padStart(3, "0");
  if (wind.gust != null) {
    const gustKt = Math.round(toKnots(wind.gust, wind.unit));
    return `wind ${direction} degrees at ${speedKt} knots, gusting ${gustKt}`;
  }
  return `wind ${direction} degrees at ${speedKt} knots`;
}

function atisVisibilitySentence(visibility) {
  if (!visibility) {
    return "visibility unavailable";
  }
  if (visibility.raw === "CAVOK") {
    return "visibility 10 kilometers or more";
  }

  if (visibility.meters != null) {
    const km = visibility.meters >= 10000
      ? "10"
      : (visibility.meters / 1000).toFixed(1);
    return `visibility ${km} kilometers`;
  }

  if (visibility.miles != null) {
    return `visibility ${visibility.miles.toFixed(1)} statute miles`;
  }

  return "visibility unavailable";
}

function atisCloudSentence(clouds) {
  if (!Array.isArray(clouds) || clouds.length === 0) {
    return "sky clear";
  }

  if (clouds.some((layer) => ["CLR", "SKC", "NSC", "NCD"].includes(layer.code))) {
    return "sky clear";
  }
  if (clouds.some((layer) => layer.code === "CAVOK")) {
    return "clouds and visibility OK";
  }

  const codeMap = {
    FEW: "few clouds",
    SCT: "scattered clouds",
    BKN: "broken clouds",
    OVC: "overcast",
    VV: "vertical visibility",
  };

  const parts = clouds
    .filter((layer) => codeMap[layer.code])
    .map((layer) => {
      if (layer.heightFt) {
        return `${codeMap[layer.code]} at ${layer.heightFt.toLocaleString()} feet`;
      }
      return codeMap[layer.code];
    });

  if (!parts.length) {
    return "cloud data unavailable";
  }
  return parts.join(", ");
}

function setRunwayOutputs(headValue, crossValue, headLabel, crossLabel) {
  dom.headArrow.textContent = "↑";
  dom.crossArrow.textContent = "→";
  dom.headValue.textContent = headValue;
  dom.crossValue.textContent = crossValue;
  dom.headLabel.textContent = headLabel;
  dom.crossLabel.textContent = crossLabel;
  dom.headSub.textContent = "--";
  dom.crossSub.textContent = "--";
}

function calculateRunwayWindComponents(wind, heading) {
  if (!wind || wind.direction === "VRB") {
    return {
      valid: false,
      angleDelta: null,
      windDirection: null,
      speed: toKnots(wind?.speed || 0, wind?.unit),
      gust: wind?.gust != null ? toKnots(wind.gust, wind.unit) : null,
      headwind: 0,
      tailwind: 0,
      crosswind: 0,
      crosswindSign: 1,
      gustHeadwind: 0,
      gustTailwind: 0,
      gustCrosswind: 0,
    };
  }

  const windDirection = Number(wind.direction);
  const speed = toKnots(wind.speed, wind.unit);
  const gust = wind.gust != null ? toKnots(wind.gust, wind.unit) : null;
  if (Number.isNaN(windDirection) || Number.isNaN(speed)) {
    return {
      valid: false,
      angleDelta: null,
      windDirection: null,
      speed: 0,
      gust: null,
      headwind: 0,
      tailwind: 0,
      crosswind: 0,
      crosswindSign: 1,
      gustHeadwind: 0,
      gustTailwind: 0,
      gustCrosswind: 0,
    };
  }

  const angleDelta = angleDifference(windDirection, heading);
  const rad = (angleDelta * Math.PI) / 180;
  const head = speed * Math.cos(rad);
  const cross = speed * Math.sin(rad);

  const gustHead = gust != null ? gust * Math.cos(rad) : 0;
  const gustCross = gust != null ? gust * Math.sin(rad) : 0;

  return {
    valid: true,
    angleDelta,
    windDirection,
    speed,
    gust,
    headwind: Math.max(head, 0),
    tailwind: Math.max(-head, 0),
    crosswind: Math.abs(cross),
    crosswindSign: cross >= 0 ? 1 : -1,
    gustHeadwind: Math.max(gustHead, 0),
    gustTailwind: Math.max(-gustHead, 0),
    gustCrosswind: Math.abs(gustCross),
  };
}

function formatComponentValue(value) {
  return Number.isFinite(value) ? Math.abs(value).toFixed(0) : "0";
}

function classifyRunwayCondition(components) {
  if (!components?.valid) {
    return {
      level: "marginal",
      label: "Marginal",
      score: 999,
    };
  }

  const effectiveCrosswind = Math.max(components.crosswind, components.gustCrosswind || 0);
  const effectiveTailwind = Math.max(components.tailwind, components.gustTailwind || 0);

  let score = effectiveCrosswind + effectiveTailwind * 3;
  let level = "good";
  let label = "Good";

  if (effectiveTailwind >= 10 || effectiveCrosswind >= 25) {
    level = "unsafe";
    label = "Unsafe";
    score += 100;
  } else if (effectiveTailwind >= 5 || effectiveCrosswind >= 15) {
    level = "marginal";
    label = "Marginal";
    score += 30;
  }

  return { level, label, score };
}

function buildRunwayEvaluation() {
  const runways = state.currentRunways || [];
  const wind = state.currentMetar?.wind;
  if (!runways.length || !wind) {
    return { rows: [], bestIndex: -1 };
  }

  const rows = runways.map((runway) => {
    const components = calculateRunwayWindComponents(wind, runway.heading);
    const condition = classifyRunwayCondition(components);
    return {
      runway,
      components,
      condition,
    };
  });

  let bestIndex = -1;
  let bestScore = Number.POSITIVE_INFINITY;
  rows.forEach((row, index) => {
    if (row.condition.score < bestScore) {
      bestScore = row.condition.score;
      bestIndex = index;
    }
  });

  return { rows, bestIndex };
}

function updateRunwayAnalysis() {
  if (!dom.runwayList) {
    return;
  }

  const { rows, bestIndex } = buildRunwayEvaluation();
  dom.runwayList.innerHTML = "";

  if (!rows.length) {
    state.bestRunway = state.sharedSnapshot?.bestRunway || null;
    if (dom.runwayAnalysisMeta) {
      dom.runwayAnalysisMeta.textContent = "Runway analysis is unavailable for this airport.";
    }
    const empty = document.createElement("p");
    empty.className = "runway-components";
    empty.textContent = "No runway wind analysis available.";
    dom.runwayList.appendChild(empty);
    return;
  }

  const selectedIdent = dom.runwaySelect.selectedOptions[0]?.dataset.ident || "";

  rows.forEach((row, index) => {
    const item = document.createElement("article");
    item.className = `runway-row runway-rate-${row.condition.level}`;
    if (index === bestIndex) {
      item.classList.add("runway-best");
    }

    const ident = document.createElement("p");
    ident.className = "runway-ident";
    ident.textContent = `RWY ${row.runway.ident} (${String(Math.round(row.runway.heading)).padStart(3, "0")}°)`;

    const components = document.createElement("p");
    components.className = "runway-components";
    if (!row.components.valid) {
      components.textContent = "Head/Tail: variable • Crosswind: variable";
    } else {
      const headOrTail = row.components.headwind >= 0.01
        ? `Head ${formatComponentValue(row.components.headwind)} kt`
        : `Tail ${formatComponentValue(row.components.tailwind)} kt`;
      components.textContent = `${headOrTail} • Cross ${formatComponentValue(row.components.crosswind)} kt`;
    }

    const scoreWrap = document.createElement("div");
    scoreWrap.className = "runway-score";

    const badge = document.createElement("span");
    badge.className = `runway-rate runway-rate-${row.condition.level}`;
    badge.textContent = row.condition.label;
    scoreWrap.appendChild(badge);

    if (index === bestIndex) {
      const best = document.createElement("span");
      best.className = "runway-best-label";
      best.textContent = "Best";
      scoreWrap.appendChild(best);
    } else if (selectedIdent && selectedIdent === row.runway.ident) {
      const selected = document.createElement("span");
      selected.className = "runway-best-label";
      selected.textContent = "Selected";
      scoreWrap.appendChild(selected);
    }

    item.appendChild(ident);
    item.appendChild(components);
    item.appendChild(scoreWrap);
    dom.runwayList.appendChild(item);
  });

  const best = rows[bestIndex] || null;
  state.bestRunway = best
    ? {
      ident: best.runway.ident,
      heading: best.runway.heading,
      components: best.components,
      condition: best.condition,
    }
    : null;

  if (dom.runwayAnalysisMeta && best) {
    dom.runwayAnalysisMeta.textContent = `Best runway: ${best.runway.ident} (${String(
      Math.round(best.runway.heading)
    ).padStart(3, "0")}°) based on current wind.`;
  }
}

function warningSeverityRank(level) {
  const map = { info: 1, caution: 2, warning: 3, critical: 4 };
  return map[level] || 0;
}

function makeWarning(level, icon, message) {
  return { level, icon, message };
}

function generateSmartWarnings() {
  const warnings = [];
  const metar = state.currentMetar;
  if (!metar) {
    return warnings;
  }

  const visibilitySm = metar.visibility?.miles;
  if (visibilitySm != null) {
    if (visibilitySm < 1) {
      warnings.push(makeWarning("critical", "VIS", "Very low visibility for approach and landing."));
    } else if (visibilitySm < 3) {
      warnings.push(makeWarning("warning", "VIS", "Visibility is below common VFR approach comfort levels."));
    } else if (visibilitySm < 5) {
      warnings.push(makeWarning("caution", "VIS", "Visibility is reduced; verify approach minima."));
    }
  }

  const ceiling = metar.ceilingFt;
  if (ceiling != null) {
    if (ceiling < 500) {
      warnings.push(makeWarning("critical", "CLD", "Ceiling below 500 ft indicates very poor approach conditions."));
    } else if (ceiling < 1000) {
      warnings.push(makeWarning("warning", "CLD", "Low cloud ceiling near IFR thresholds."));
    } else if (ceiling < 2000) {
      warnings.push(makeWarning("caution", "CLD", "Cloud ceiling is lowered; monitor trend."));
    }
  }

  const selected = state.selectedRunwayComponents;
  if (selected?.valid) {
    const cross = Math.max(selected.crosswind, selected.gustCrosswind || 0);
    const tail = Math.max(selected.tailwind, selected.gustTailwind || 0);

    if (cross >= 25) {
      warnings.push(makeWarning("critical", "WND", `Strong crosswind on runway ${selected.ident}: ${formatComponentValue(cross)} kt.`));
    } else if (cross >= 18) {
      warnings.push(makeWarning("warning", "WND", `Crosswind on runway ${selected.ident} is elevated: ${formatComponentValue(cross)} kt.`));
    } else if (cross >= 12) {
      warnings.push(makeWarning("caution", "WND", `Crosswind on runway ${selected.ident}: ${formatComponentValue(cross)} kt.`));
    }

    if (tail >= 10) {
      warnings.push(makeWarning("critical", "WND", `Tailwind exceeds safe margins on runway ${selected.ident}: ${formatComponentValue(tail)} kt.`));
    } else if (tail >= 5) {
      warnings.push(makeWarning("warning", "WND", `Tailwind may be limiting on runway ${selected.ident}: ${formatComponentValue(tail)} kt.`));
    } else if (tail >= 2) {
      warnings.push(makeWarning("caution", "WND", `Light tailwind present on runway ${selected.ident}.`));
    }
  } else if (state.currentRunways.length > 0) {
    warnings.push(makeWarning("info", "WND", "Select a runway to evaluate runway-specific crosswind and tailwind warnings."));
  }

  if (metar.wind?.gust != null) {
    const gustSpread = toKnots(metar.wind.gust, metar.wind.unit) - toKnots(metar.wind.speed, metar.wind.unit);
    if (gustSpread >= 12) {
      warnings.push(makeWarning("warning", "WND", `Gust spread is large (${formatComponentValue(gustSpread)} kt), winds may be unstable.`));
    } else if (gustSpread >= 6) {
      warnings.push(makeWarning("caution", "WND", `Moderate gust spread (${formatComponentValue(gustSpread)} kt).`));
    }
  }

  const icing = assessIcing(metar);
  if (icing.level === "High") {
    warnings.push(makeWarning("warning", "ICE", "Possible icing conditions in current weather profile."));
  } else if (icing.level === "Moderate") {
    warnings.push(makeWarning("caution", "ICE", "Potential icing conditions; verify temperatures and moisture."));
  }

  const turbulence = assessTurbulence(metar);
  if (turbulence.level === "High") {
    warnings.push(makeWarning("warning", "TURB", "Possible turbulence due to wind, gusts, and cloud structure."));
  } else if (turbulence.level === "Moderate") {
    warnings.push(makeWarning("caution", "TURB", "Moderate turbulence risk from current wind profile."));
  }

  if (state.currentTaf?.blocks?.length) {
    const forecast = summarizeTafHazards(state.currentTaf);
    if (forecast.minVisibility != null && forecast.minVisibility < 3) {
      warnings.push(makeWarning("caution", "VIS", `TAF indicates visibility may drop to ${forecast.minVisibility.toFixed(1)} sm.`));
    }
    if (forecast.minCeiling != null && forecast.minCeiling < 1000) {
      warnings.push(makeWarning("warning", "CLD", `TAF indicates low ceiling down to ${Math.round(forecast.minCeiling)} ft.`));
    }
    if (forecast.maxWind != null && forecast.maxWind >= 25) {
      warnings.push(makeWarning("caution", "WND", `TAF shows stronger winds up to ${Math.round(forecast.maxWind)} kt.`));
    }
    if (forecast.hasWindShear) {
      warnings.push(makeWarning("warning", "WND", "TAF contains low-level wind shear indications."));
    }
    if (forecast.hasPrecip && forecast.coldMoistureLikely) {
      warnings.push(makeWarning("caution", "ICE", "TAF moisture with low temperatures suggests icing potential."));
    }
  }

  warnings.sort((a, b) => warningSeverityRank(b.level) - warningSeverityRank(a.level));
  return warnings;
}

function summarizeTafHazards(taf) {
  const summary = {
    minVisibility: null,
    minCeiling: null,
    maxWind: null,
    hasWindShear: false,
    hasPrecip: false,
    coldMoistureLikely: false,
  };

  for (const block of taf.blocks || []) {
    if (block.visibility?.miles != null) {
      summary.minVisibility = summary.minVisibility == null
        ? block.visibility.miles
        : Math.min(summary.minVisibility, block.visibility.miles);
    }

    if (block.ceilingFt != null) {
      summary.minCeiling = summary.minCeiling == null
        ? block.ceilingFt
        : Math.min(summary.minCeiling, block.ceilingFt);
    }

    if (block.wind) {
      const speed = toKnots(block.wind.speed, block.wind.unit);
      const gust = block.wind.gust != null ? toKnots(block.wind.gust, block.wind.unit) : speed;
      const maxBlockWind = Math.max(speed, gust);
      summary.maxWind = summary.maxWind == null
        ? maxBlockWind
        : Math.max(summary.maxWind, maxBlockWind);
    }

    summary.hasWindShear = summary.hasWindShear || !!block.hasWindShear;
    summary.hasPrecip = summary.hasPrecip || !!block.hasPrecip;
  }

  const lowTemp = taf.temps?.min ?? state.currentMetar?.temp ?? null;
  summary.coldMoistureLikely = summary.hasPrecip && lowTemp != null && lowTemp <= 3 && lowTemp >= -15;
  return summary;
}

function warningIconSymbol(code) {
  const map = {
    WND: "↯",
    VIS: "◎",
    CLD: "☁",
    ICE: "❄",
    TURB: "≈",
    INFO: "i",
  };
  return map[code] || "!";
}

function renderWarnings(warnings) {
  if (!dom.warningList) {
    return;
  }

  dom.warningList.innerHTML = "";

  const items = warnings.length
    ? warnings
    : [makeWarning("info", "INFO", "No significant operational warnings detected from the latest data.")];

  for (const warning of items) {
    const item = document.createElement("article");
    item.className = `warning-item warning-${warning.level}`;

    const icon = document.createElement("span");
    icon.className = "warning-icon";
    icon.textContent = warningIconSymbol(warning.icon);
    icon.title = warning.icon;

    const text = document.createElement("p");
    text.className = "warning-text";
    text.textContent = warning.message;

    const level = document.createElement("span");
    level.className = "warning-level";
    level.textContent = warning.level;

    item.appendChild(icon);
    item.appendChild(text);
    item.appendChild(level);
    dom.warningList.appendChild(item);
  }
}

function updateSmartWarnings() {
  if (!dom.warningCard || !dom.warningList) {
    return;
  }

  if (!state.currentMetar) {
    dom.warningCard.classList.add("hidden");
    state.currentWarnings = [];
    refreshSharePanel();
    return;
  }

  dom.warningCard.classList.remove("hidden");
  const warnings = generateSmartWarnings();
  state.currentWarnings = warnings;
  renderWarnings(warnings);
  refreshSharePanel();
}

function angleDifference(windDir, runwayHeading) {
  let diff = (windDir - runwayHeading + 360) % 360;
  if (diff > 180) {
    diff -= 360;
  }
  return diff;
}

function toKnots(value, unit) {
  if (unit === "MPS") {
    return value * 1.94384;
  }
  return value;
}

function renderTaf(taf) {
  const validStart = formatLocalTime(taf.validStart);
  const validEnd = formatLocalTime(taf.validEnd);
  dom.tafStatus.textContent = `Valid ${validStart} → ${validEnd}`;
  dom.rawTaf.textContent = taf.raw;

  if (!taf.blocks.length) {
    dom.tafStatus.textContent = "TAF parsed but no forecast blocks found.";
    updateChartsWithEmpty();
    return;
  }

  const series = buildTafSeries(taf.blocks, taf.validStart, taf.validEnd);
  updateCharts(series);
  updateSmartWarnings();
}

function buildTafSeries(blocks, validStart, validEnd) {
  const times = new Set();
  for (const block of blocks) {
    if (block.start) {
      times.add(block.start.getTime());
    }
    if (block.end) {
      times.add(block.end.getTime());
    }
  }
  times.add(validStart.getTime());
  times.add(validEnd.getTime());

  const timeline = Array.from(times)
    .sort((a, b) => a - b)
    .map((t) => new Date(t));

  const labels = timeline.map((time) => formatLocalTimeShort(time));
  const windSpeed = [];
  const windDir = [];
  const visibility = [];
  const ceiling = [];

  for (const time of timeline) {
    const block = findActiveBlock(blocks, time);
    const wind = block?.wind;
    windSpeed.push(wind ? toKnots(wind.speed, wind.unit) : null);
    windDir.push(wind && wind.direction !== "VRB" ? Number(wind.direction) : null);
    visibility.push(block?.visibility?.miles ?? null);
    ceiling.push(block?.ceilingFt ?? null);
  }

  return { labels, windSpeed, windDir, visibility, ceiling };
}

function findActiveBlock(blocks, time) {
  let active = null;
  for (const block of blocks) {
    if (!block.start || !block.end) {
      continue;
    }
    if (time >= block.start && time < block.end) {
      active = block;
    }
  }
  return active || blocks[blocks.length - 1] || null;
}

function updateCharts(series) {
  if (!window.Chart) {
    dom.tafStatus.textContent = "Chart library failed to load.";
    return;
  }

  ensureCharts();
  state.charts.windSpeed.data.labels = series.labels;
  state.charts.windSpeed.data.datasets[0].data = series.windSpeed;

  state.charts.visibility.data.labels = series.labels;
  state.charts.visibility.data.datasets[0].data = series.visibility;

  state.charts.windSpeed.update();
  state.charts.visibility.update();
}

function updateChartsWithEmpty() {
  if (!state.charts) {
    return;
  }
  const empty = { labels: [], windSpeed: [], visibility: [] };
  updateCharts(empty);
}

function updateWindCompass(metar) {
  if (!state.charts?.windCompass) {
    return;
  }

  const chart = state.charts.windCompass;
  const labels = chart.data.labels || [
    "N",
    "NE",
    "E",
    "SE",
    "S",
    "SW",
    "W",
    "NW",
  ];
  const speedData = Array(labels.length).fill(0);
  const gustData = Array(labels.length).fill(0);
  let max = 0;

  if (!metar?.wind) {
    chart.data.datasets[0].data = speedData;
    chart.data.datasets[1].data = gustData;
    chart.options.scales.r.suggestedMax = 10;
    chart.update();
    return;
  }

  const wind = metar.wind;
  if (wind.direction === "VRB") {
    const speed = toKnots(wind.speed, wind.unit);
    const gust = wind.gust ? toKnots(wind.gust, wind.unit) : 0;
    max = Math.max(speed, gust);
    speedData.fill(speed);
    if (gust) {
      gustData.fill(gust);
    }
  } else {
    const dir = Number(wind.direction);
    const speed = toKnots(wind.speed, wind.unit);
    const gust = wind.gust ? toKnots(wind.gust, wind.unit) : 0;
    const index = directionToIndex(dir);
    speedData[index] = speed;
    gustData[index] = gust;
    max = Math.max(speed, gust);
  }

  chart.data.labels = labels;
  chart.data.datasets[0].data = speedData;
  chart.data.datasets[1].data = gustData;
  chart.options.scales.r.suggestedMax = Math.max(10, Math.ceil(max / 5) * 5);
  chart.update();
}

function directionToIndex(direction) {
  if (Number.isNaN(direction)) {
    return 0;
  }
  const normalized = ((direction % 360) + 360) % 360;
  return Math.round(normalized / 45) % 8;
}

function updateCloudLayers(metar) {
  if (!state.charts?.cloudLayers) {
    return;
  }
  const chart = state.charts.cloudLayers;
  const cloudColors = getCloudColors();
  const layers = (metar?.clouds || []).filter(
    (layer) => layer.heightFt && ["FEW", "SCT", "BKN", "OVC", "VV"].includes(layer.code)
  );

  if (layers.length === 0) {
    chart.data.datasets = [
      {
        label: "Clear",
        data: [[0, 100]],
        backgroundColor: cloudColors.CLR,
        borderColor: cloudColors.CLR,
        borderWidth: 1,
        grouped: false,
      },
    ];
    chart.data.labels = ["Clouds"];
    chart.options.scales.y.suggestedMax = 500;
    chart.update();
    return;
  }

  const thicknessMap = {
    FEW: 200,
    SCT: 300,
    BKN: 500,
    OVC: 600,
    VV: 800,
  };

  const datasets = layers
    .sort((a, b) => a.heightFt - b.heightFt)
    .map((layer) => {
      const base = layer.heightFt;
      const top = base + (thicknessMap[layer.code] || 300);
      const label = `${layer.code} ${String(base / 100).padStart(3, "0")} (${base} ft)`;
      return {
        label,
        data: [[base, top]],
        backgroundColor: cloudColors[layer.code] || cloudColors.CLR,
        borderColor: cloudColors[layer.code] || cloudColors.CLR,
        borderWidth: 1,
        grouped: false,
        barPercentage: 0.6,
        categoryPercentage: 0.6,
      };
    });

  const maxHeight = Math.max(...layers.map((layer) => layer.heightFt)) + 1000;
  chart.data.labels = ["Clouds"];
  chart.data.datasets = datasets;
  chart.options.scales.y.suggestedMax = Math.ceil(maxHeight / 500) * 500;
  chart.update();
}

function ensureCharts() {
  if (state.charts) {
    updateChartsTheme();
    return;
  }

  const colors = getChartColors();
  state.charts = {
    windSpeed: createLineChart(dom.windSpeedChart, "kt", "accent"),
    windCompass: createWindCompassChart(dom.windDirChart),
    visibility: createLineChart(dom.visibilityChart, "sm", "accent"),
    cloudLayers: createCloudLayerChart(dom.ceilingChart),
  };
}

function createLineChart(canvas, unit, accentKey) {
  const colors = getChartColors();
  const stroke = colors[accentKey] || colors.accent;
  const chart = new Chart(canvas, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          data: [],
          borderColor: stroke,
          backgroundColor: "rgba(37, 99, 235, 0.15)",
          pointRadius: 2,
          pointHoverRadius: 4,
          tension: 0.3,
          stepped: true,
          spanGaps: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 16 / 9,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `${context.parsed.y ?? "—"} ${unit}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: colors.text },
          grid: { color: colors.grid },
        },
        y: {
          ticks: { color: colors.text },
          grid: { color: colors.grid },
        },
      },
    },
  });
  chart.config._accentKey = accentKey;
  return chart;
}

function createWindCompassChart(canvas) {
  const colors = getChartColors();
  const accentFill = withAlpha(colors.accent, 0.18);
  const chart = new Chart(canvas, {
    type: "radar",
    data: {
      labels: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
      datasets: [
        {
          label: "Wind",
          data: Array(8).fill(0),
          borderColor: colors.accent,
          backgroundColor: accentFill,
          borderWidth: 2,
          pointRadius: (ctx) => (ctx.raw > 0 ? 4 : 0),
          pointHoverRadius: 6,
          fill: false,
        },
        {
          label: "Gust",
          data: Array(8).fill(0),
          borderColor: colors.accentStrong,
          borderWidth: 2,
          borderDash: [6, 6],
          pointRadius: (ctx) => (ctx.raw > 0 ? 3 : 0),
          pointHoverRadius: 5,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: colors.text,
          },
        },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label}: ${context.parsed.r ?? 0} kt`,
          },
        },
      },
      scales: {
        r: {
          beginAtZero: true,
          grid: { color: colors.grid },
          angleLines: { color: colors.grid },
          pointLabels: { color: colors.text, font: { size: 12 } },
          ticks: { color: colors.text },
        },
      },
    },
  });
  chart.config._accentKey = "accent";
  chart.config._secondaryAccentKey = "accentStrong";
  return chart;
}

function createCloudLayerChart(canvas) {
  const colors = getChartColors();
  const cloudColors = getCloudColors();
  const chart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: ["Clouds"],
      datasets: [],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 4 / 5,
      plugins: {
        legend: {
          display: true,
          labels: { color: colors.text },
        },
        tooltip: {
          callbacks: {
            label: (context) => context.dataset.label || "Cloud layer",
          },
        },
      },
      scales: {
        x: {
          stacked: false,
          ticks: { color: colors.text },
          grid: { color: "transparent" },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: colors.text,
            callback: (value) => `${value} ft`,
          },
          grid: { color: colors.grid },
        },
      },
    },
  });
  chart.config._cloudColors = cloudColors;
  return chart;
}

function updateChartsTheme() {
  if (!state.charts) {
    return;
  }
  const colors = getChartColors();
  for (const chart of Object.values(state.charts)) {
    if (chart.options.scales?.x) {
      chart.options.scales.x.ticks.color = colors.text;
      chart.options.scales.x.grid.color = chart.options.scales.x.grid?.color === "transparent"
        ? "transparent"
        : colors.grid;
    }
    if (chart.options.scales?.y) {
      chart.options.scales.y.ticks.color = colors.text;
      chart.options.scales.y.grid.color = colors.grid;
    }
    if (chart.options.scales?.r) {
      chart.options.scales.r.ticks.color = colors.text;
      chart.options.scales.r.grid.color = colors.grid;
      chart.options.scales.r.angleLines.color = colors.grid;
      chart.options.scales.r.pointLabels.color = colors.text;
    }
    if (chart.options.plugins?.legend?.labels) {
      chart.options.plugins.legend.labels.color = colors.text;
    }
    if (chart.config._accentKey) {
      const accentKey = chart.config._accentKey || "accent";
      const stroke = colors[accentKey] || colors.accent;
      if (chart.data.datasets[0]) {
        chart.data.datasets[0].borderColor = stroke;
        if (chart.config.type === "radar") {
          chart.data.datasets[0].backgroundColor = withAlpha(stroke, 0.18);
        }
      }
    }
    if (chart.config._secondaryAccentKey && chart.data.datasets[1]) {
      const stroke = colors[chart.config._secondaryAccentKey] || colors.accentStrong;
      chart.data.datasets[1].borderColor = stroke;
    }
    chart.update("none");
  }
}

function getChartColors() {
  const styles = getComputedStyle(document.body);
  return {
    text: styles.getPropertyValue("--text").trim() || "#1f2329",
    grid: styles.getPropertyValue("--border").trim() || "rgba(28, 38, 49, 0.12)",
    accent: styles.getPropertyValue("--accent").trim() || "#2563eb",
    accentStrong: styles.getPropertyValue("--accent-strong").trim() || "#0f2e6f",
  };
}

function getCloudColors() {
  const styles = getComputedStyle(document.body);
  return {
    FEW: styles.getPropertyValue("--cloud-few").trim() || "#7dd3fc",
    SCT: styles.getPropertyValue("--cloud-sct").trim() || "#38bdf8",
    BKN: styles.getPropertyValue("--cloud-bkn").trim() || "#0ea5e9",
    OVC: styles.getPropertyValue("--cloud-ovc").trim() || "#2563eb",
    VV: styles.getPropertyValue("--cloud-vv").trim() || "#0f2e6f",
    CLR: styles.getPropertyValue("--muted").trim() || "#5a6570",
  };
}

function withAlpha(color, alpha) {
  if (color.startsWith("#")) {
    const hex = color.replace("#", "");
    const full = hex.length === 3
      ? hex.split("").map((c) => c + c).join("")
      : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (color.startsWith("rgb")) {
    const values = color.match(/\d+(\.\d+)?/g)?.map(Number) || [0, 0, 0];
    const [r, g, b] = values;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

function formatLocalTime(date) {
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLocalTimeShort(date) {
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function updateRiskLayers() {
  if (!state.currentMetar) {
    setRiskBadge(dom.turbNow, "Unknown");
    setRiskBadge(dom.turbForecast, "Unknown");
    setRiskBadge(dom.iceNow, "Unknown");
    setRiskBadge(dom.iceForecast, "Unknown");
    return;
  }

  const turbNow = assessTurbulence(state.currentMetar);
  const iceNow = assessIcing(state.currentMetar);
  const turbForecast = state.currentTaf
    ? assessTurbulenceForecast(state.currentTaf.blocks)
    : turbNow;
  const iceForecast = state.currentTaf
    ? assessIcingForecast(state.currentTaf, state.currentMetar.temp)
    : iceNow;

  setRiskBadge(dom.turbNow, turbNow.level);
  setRiskBadge(dom.turbForecast, turbForecast.level);
  setRiskBadge(dom.iceNow, iceNow.level);
  setRiskBadge(dom.iceForecast, iceForecast.level);

  dom.riskNote.textContent = `Turbulence factors: wind, gusts, shear, cloud cover. Icing factors: temp ${iceNow.tempNote}.`;
}

function setRiskBadge(element, level) {
  element.classList.remove("risk-mod", "risk-high", "risk-unknown");
  element.textContent = level;
  if (level === "Moderate") {
    element.classList.add("risk-mod");
  } else if (level === "High") {
    element.classList.add("risk-high");
  } else if (level === "Unknown") {
    element.classList.add("risk-unknown");
  }
}

function assessTurbulence(metar) {
  let score = 0;
  const wind = metar.wind;
  if (wind) {
    const speed = toKnots(wind.speed, wind.unit);
    if (speed >= 20) score += 1;
    if (speed >= 30) score += 1;
    if (wind.gust) {
      const gust = toKnots(wind.gust, wind.unit);
      if (gust >= 25) score += 1;
      if (gust >= 35) score += 1;
    }
  }
  if (/WS\d{3}\/\d{2,3}KT/.test(metar.raw)) {
    score += 2;
  }
  if (metar.clouds.some((layer) => ["BKN", "OVC"].includes(layer.code))) {
    score += 1;
  }
  return scoreToLevel(score);
}

function assessTurbulenceForecast(blocks) {
  if (!blocks || blocks.length === 0) {
    return { level: "Unknown" };
  }
  let maxScore = 0;
  for (const block of blocks) {
    let score = 0;
    const wind = block.wind;
    if (wind) {
      const speed = toKnots(wind.speed, wind.unit);
      if (speed >= 20) score += 1;
      if (speed >= 30) score += 1;
      if (wind.gust) {
        const gust = toKnots(wind.gust, wind.unit);
        if (gust >= 25) score += 1;
        if (gust >= 35) score += 1;
      }
    }
    if (block.hasWindShear) {
      score += 2;
    }
    if (block.clouds.some((layer) => ["BKN", "OVC"].includes(layer.code))) {
      score += 1;
    }
    if (score > maxScore) {
      maxScore = score;
    }
  }
  return scoreToLevel(maxScore);
}

function assessIcing(metar) {
  let score = 0;
  const temp = metar.temp;
  const tempInRange = temp != null && temp >= -15 && temp <= 3;
  if (tempInRange) {
    score += 1;
  }
  const cloudsPresent = metar.clouds.some((layer) =>
    ["FEW", "SCT", "BKN", "OVC", "VV"].includes(layer.code)
  );
  const precipPresent = /[+-]?(RA|SN|DZ|PL|GR|GS|SH|FZ)/.test(metar.raw);
  if (tempInRange && cloudsPresent) {
    score += 1;
  }
  if (tempInRange && precipPresent) {
    score += 1;
  }
  return {
    ...scoreToLevel(score),
    tempNote: temp != null ? `${temp}°C` : "unknown",
  };
}

function assessIcingForecast(taf, fallbackTemp) {
  if (!taf.blocks || taf.blocks.length === 0) {
    return { level: "Unknown" };
  }
  const minTemp = taf.temps?.min ?? fallbackTemp ?? null;
  const maxTemp = taf.temps?.max ?? fallbackTemp ?? null;
  const tempInRange = rangeIntersects(minTemp, maxTemp, -15, 3);
  let maxScore = 0;

  for (const block of taf.blocks) {
    let score = 0;
    if (tempInRange) {
      score += 1;
    }
    if (tempInRange && (block.hasClouds || block.clouds.length)) {
      score += 1;
    }
    if (tempInRange && block.hasPrecip) {
      score += 1;
    }
    if (score > maxScore) {
      maxScore = score;
    }
  }

  return scoreToLevel(maxScore);
}

function rangeIntersects(min, max, low, high) {
  if (min == null && max == null) {
    return false;
  }
  const actualMin = min ?? max;
  const actualMax = max ?? min;
  return actualMin <= high && actualMax >= low;
}

function scoreToLevel(score) {
  if (score >= 4) {
    return { level: "High" };
  }
  if (score >= 2) {
    return { level: "Moderate" };
  }
  return { level: "Low" };
}

function formatWind(wind) {
  if (!wind) {
    return { primary: "Unknown", secondary: "No wind data" };
  }

  const unitLabel = wind.unit === "MPS" ? "m/s" : "kt";

  if (wind.speed === 0) {
    return { primary: "Calm", secondary: `0 ${unitLabel}` };
  }

  const dir =
    wind.direction === "VRB" ? "Variable" : `${wind.direction}°`;
  const gust = wind.gust ? ` gust ${wind.gust}` : "";
  return {
    primary: `${wind.speed} ${unitLabel}`,
    secondary: `${dir}${gust} ${unitLabel}`,
  };
}

function formatVisibility(visibility) {
  if (!visibility) {
    return { primary: "Unknown", secondary: "No visibility data" };
  }

  if (visibility.raw === "CAVOK") {
    return { primary: "CAVOK", secondary: ">= 10 km" };
  }

  const prefix = visibility.qualifier === "P" ? "≥ " : visibility.qualifier === "M" ? "< " : "";
  const miles = visibility.miles?.toFixed(1);
  const km = visibility.meters ? (visibility.meters / 1000).toFixed(1) : null;
  return {
    primary: miles ? `${prefix}${miles} sm` : visibility.raw,
    secondary: km ? `${km} km` : "—",
  };
}

function formatClouds(clouds) {
  if (!clouds || clouds.length === 0) {
    return { primary: "Clear", secondary: "No significant clouds" };
  }

  if (clouds.some((layer) => layer.code === "CAVOK")) {
    return { primary: "CAVOK", secondary: "Clear below 5000 ft" };
  }

  const primary = clouds
    .map((layer) =>
      layer.heightFt
        ? `${layer.code} ${String(layer.heightFt / 100).padStart(3, "0")}`
        : layer.code
    )
    .join(" • ");

  const ceiling = clouds
    .filter((layer) => ["BKN", "OVC", "VV"].includes(layer.code))
    .map((layer) => layer.heightFt)
    .filter(Boolean)
    .sort((a, b) => a - b)[0];

  return {
    primary,
    secondary: ceiling ? `Ceiling ${ceiling.toLocaleString()} ft` : "No ceiling",
  };
}

function formatTemperature(valueC) {
  if (valueC === null || Number.isNaN(valueC)) {
    return { primary: "Unknown", secondary: "—" };
  }
  const valueF = valueC * 1.8 + 32;
  return {
    primary: `${valueC}°C`,
    secondary: `${valueF.toFixed(1)}°F`,
  };
}

function formatPressure(pressure) {
  if (!pressure) {
    return { primary: "Unknown", secondary: "—" };
  }
  return {
    primary: `${pressure.inHg.toFixed(2)} inHg`,
    secondary: `${pressure.hPa.toFixed(0)} hPa`,
  };
}

function computeFlightCategory(ceilingFt, visibility) {
  if (visibility?.miles == null && !ceilingFt) {
    return { category: "Unknown", detail: "Insufficient data" };
  }

  const vis = visibility?.miles ?? Infinity;
  const ceiling = ceilingFt ?? Infinity;

  if (ceiling < 500 || vis < 1) {
    return { category: "LIFR", detail: `Ceiling ${ceilText(ceilingFt)} / Vis ${vis.toFixed(1)} sm` };
  }
  if (ceiling < 1000 || vis < 3) {
    return { category: "IFR", detail: `Ceiling ${ceilText(ceilingFt)} / Vis ${vis.toFixed(1)} sm` };
  }
  if (ceiling < 3000 || vis < 5) {
    return { category: "MVFR", detail: `Ceiling ${ceilText(ceilingFt)} / Vis ${vis.toFixed(1)} sm` };
  }
  return { category: "VFR", detail: `Ceiling ${ceilText(ceilingFt)} / Vis ${vis.toFixed(1)} sm` };
}

function ceilText(ceilingFt) {
  if (!ceilingFt) {
    return "None";
  }
  return `${ceilingFt.toLocaleString()} ft`;
}

function setFlightClass(category) {
  dom.flightValue.classList.remove("flight-vfr", "flight-mvfr", "flight-ifr", "flight-lifr");
  const map = {
    VFR: "flight-vfr",
    MVFR: "flight-mvfr",
    IFR: "flight-ifr",
    LIFR: "flight-lifr",
  };
  const cls = map[category];
  if (cls) {
    dom.flightValue.classList.add(cls);
  }
}

function formatObsTime(timeGroup) {
  if (!timeGroup) {
    return "Unknown";
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  let date = new Date(Date.UTC(year, month, timeGroup.day, timeGroup.hour, timeGroup.minute));
  if (date.getTime() - now.getTime() > 86400000) {
    date = new Date(Date.UTC(year, month - 1, timeGroup.day, timeGroup.hour, timeGroup.minute));
  }

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")} ${String(date.getUTCHours()).padStart(2, "0")}:${String(
    date.getUTCMinutes()
  ).padStart(2, "0")} UTC`;
}

async function loadAirports() {
  if (state.airports) {
    return state.airports;
  }

  if (!state.airportsPromise) {
    setStatus("Loading airport database...");
    state.airportsPromise = fetchTextWithFallback(OURAIRPORTS_URL, {
      cache: "force-cache",
      errorMessage: "Airport database not reachable.",
    })
      .then((text) => parseAirports(text));
  }

  try {
    state.airports = await state.airportsPromise;
    return state.airports;
  } catch (error) {
    state.airportsPromise = null;
    throw error;
  } finally {
    setStatus("");
  }
}

async function loadRunways() {
  if (state.runways) {
    return state.runways;
  }

  if (!state.runwaysPromise) {
    state.runwaysPromise = fetchTextWithFallback(RUNWAYS_URL, {
      cache: "force-cache",
      errorMessage: "Runway database not reachable.",
    })
      .then((text) => parseRunways(text));
  }

  try {
    state.runways = await state.runwaysPromise;
    return state.runways;
  } catch (error) {
    state.runwaysPromise = null;
    throw error;
  }
}

function parseRunways(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const index = (name) => header.indexOf(name);

  const airportIdx = index("airport_ident");
  const leIdentIdx = index("le_ident");
  const heIdentIdx = index("he_ident");
  const leHeadingIdx = index("le_heading_degT");
  const heHeadingIdx = index("he_heading_degT");

  const map = new Map();

  const addEnd = (airportIdent, ident, headingStr) => {
    if (!airportIdent || !ident) {
      return;
    }
    let heading = Number(headingStr);
    if (Number.isNaN(heading)) {
      heading = deriveHeadingFromIdent(ident);
    }
    if (heading == null || Number.isNaN(heading)) {
      return;
    }
    let normalized = ((heading % 360) + 360) % 360;
    if (normalized === 0) {
      normalized = 360;
    }
    const entry = {
      airportIdent,
      ident,
      heading: normalized,
    };
    if (!map.has(airportIdent)) {
      map.set(airportIdent, []);
    }
    map.get(airportIdent).push(entry);
  };

  for (let i = 1; i < lines.length; i += 1) {
    const row = parseCsvLine(lines[i]);
    const airportIdent = row[airportIdx]?.toUpperCase();
    addEnd(airportIdent, row[leIdentIdx], row[leHeadingIdx]);
    addEnd(airportIdent, row[heIdentIdx], row[heHeadingIdx]);
  }

  return map;
}

function deriveHeadingFromIdent(ident) {
  const match = ident.match(/^(\d{1,2})/);
  if (!match) {
    return null;
  }
  const runwayNum = Number(match[1]);
  if (Number.isNaN(runwayNum) || runwayNum < 1 || runwayNum > 36) {
    return null;
  }
  const heading = runwayNum * 10;
  return heading === 0 ? 360 : heading;
}

function runwaySortValue(ident, heading) {
  const match = ident.match(/^(\d{1,2})/);
  if (!match) {
    return heading;
  }
  const base = Number(match[1]);
  let suffix = 0.5;
  if (ident.includes("L")) {
    suffix = 0.1;
  } else if (ident.includes("C")) {
    suffix = 0.2;
  } else if (ident.includes("R")) {
    suffix = 0.3;
  }
  return base + suffix;
}

function parseAirports(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const index = (name) => header.indexOf(name);

  const identIdx = index("ident");
  const nameIdx = index("name");
  const municipalityIdx = index("municipality");
  const isoIdx = index("iso_country");
  const iataIdx = index("iata_code");
  const elevationIdx = index("elevation_ft");
  const typeIdx = index("type");

  const list = [];
  const iataMap = new Map();
  const icaoMap = new Map();

  for (let i = 1; i < lines.length; i += 1) {
    const row = parseCsvLine(lines[i]);
    const ident = row[identIdx]?.toUpperCase();
    if (!ident || !/^[A-Z]{4}$/.test(ident)) {
      continue;
    }
    const type = row[typeIdx];
    if (!type || !type.includes("airport")) {
      continue;
    }

    const elevationCell = row[elevationIdx];
    const elevationRaw = Number(elevationCell);
    const airport = {
      ident,
      name: row[nameIdx] || "",
      municipality: row[municipalityIdx] || "",
      iso_country: row[isoIdx] || "",
      iata: row[iataIdx]?.toUpperCase() || "",
      elevationFt: elevationCell === "" || Number.isNaN(elevationRaw) ? null : elevationRaw,
      type,
    };
    airport.nameNorm = normalize(airport.name);
    airport.cityNorm = normalize(airport.municipality);
    list.push(airport);
    icaoMap.set(ident, airport);
    if (airport.iata) {
      iataMap.set(airport.iata, airport);
    }
  }

  return { list, iataMap, icaoMap };
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function normalize(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findByName(query, list) {
  const q = normalize(query);
  if (!q) {
    return null;
  }

  let best = null;
  let bestScore = -Infinity;
  for (const airport of list) {
    let score = 0;
    if (airport.nameNorm === q) {
      score += 120;
    } else if (airport.nameNorm.includes(q)) {
      score += 70;
    }
    if (airport.cityNorm && airport.cityNorm.includes(q)) {
      score += 50;
    }
    if (airport.type === "large_airport") {
      score += 8;
    } else if (airport.type === "medium_airport") {
      score += 5;
    } else {
      score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = airport;
    }
  }

  return bestScore > 0 ? best : null;
}

function setStatus(message) {
  dom.status.textContent = message;
}

function showError(message) {
  dom.errorMessage.textContent = message;
  dom.errorCard.classList.remove("hidden");
}

function clearError() {
  dom.errorCard.classList.add("hidden");
  dom.errorMessage.textContent = "";
}

function milesToMeters(miles) {
  return miles * 1609.34;
}

function metersToMiles(meters) {
  return meters / 1609.34;
}

function parseFraction(value) {
  const [num, den] = value.split("/").map(Number);
  if (!den) {
    return NaN;
  }
  return num / den;
}

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => fn(...args), delay);
  };
}

function initFavorites() {
  state.favorites = loadFavoritesFromStorage();
  renderFavorites();
  updateFavoriteButtonState();
}

function loadFavoritesFromStorage() {
  const fromLocal = parseFavoritesPayload(localStorage.getItem(FAVORITES_STORAGE_KEY));
  const fromAndroid = readAndroidFavorites();
  const source = fromAndroid.length ? fromAndroid : fromLocal;
  const sanitized = sanitizeFavorites(source);
  if (!fromAndroid.length && sanitized.length !== fromLocal.length) {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(sanitized));
  }
  if (fromAndroid.length) {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(sanitized));
  }
  return sanitized;
}

function saveFavoritesToStorage() {
  const payload = JSON.stringify(state.favorites);
  localStorage.setItem(FAVORITES_STORAGE_KEY, payload);
  writeAndroidFavorites(payload);
}

function parseFavoritesPayload(payload) {
  if (!payload) {
    return [];
  }
  try {
    const parsed = JSON.parse(payload);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function sanitizeFavorites(list) {
  const unique = new Map();
  for (const item of Array.isArray(list) ? list : []) {
    const entry = sanitizeFavoriteEntry(item);
    if (!entry) {
      continue;
    }
    unique.set(entry.icao, entry);
  }
  return Array.from(unique.values()).slice(0, FAVORITES_MAX_ITEMS);
}

function sanitizeFavoriteEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const icao = String(entry.icao || entry.ident || "").toUpperCase().trim();
  if (!/^[A-Z]{4}$/.test(icao)) {
    return null;
  }
  const name = String(entry.name || entry.displayName || icao).trim() || icao;
  const municipality = String(entry.municipality || "").trim();
  const country = String(entry.country || entry.iso_country || "").trim();
  const iata = String(entry.iata || "").toUpperCase().trim();
  return {
    icao,
    name,
    municipality,
    country,
    iata,
  };
}

function readAndroidFavorites() {
  const providers = [
    globalThis.AndroidStorage,
    globalThis.METARLensAndroid,
    globalThis.Android,
  ];

  for (const provider of providers) {
    if (!provider) {
      continue;
    }
    const reader = provider.getFavorites || provider.readFavorites;
    if (typeof reader !== "function") {
      continue;
    }
    try {
      const value = reader.call(provider);
      if (Array.isArray(value)) {
        return sanitizeFavorites(value);
      }
      if (typeof value === "string") {
        return sanitizeFavorites(parseFavoritesPayload(value));
      }
    } catch {
      // Ignore bridge read failures and continue local-only.
    }
  }

  return [];
}

function writeAndroidFavorites(payload) {
  const providers = [
    globalThis.AndroidStorage,
    globalThis.METARLensAndroid,
    globalThis.Android,
  ];

  for (const provider of providers) {
    if (!provider) {
      continue;
    }
    const writer = provider.setFavorites || provider.saveFavorites;
    if (typeof writer !== "function") {
      continue;
    }
    try {
      writer.call(provider, payload);
    } catch {
      // Ignore bridge write failures and keep local storage as source of truth.
    }
  }

  if (globalThis.ReactNativeWebView?.postMessage) {
    try {
      globalThis.ReactNativeWebView.postMessage(
        JSON.stringify({ type: "metar-favorites", payload })
      );
    } catch {
      // Ignore optional bridge errors.
    }
  }
}

function renderFavorites() {
  if (!dom.favoritesList || !dom.favoritesEmpty) {
    return;
  }

  dom.favoritesList.innerHTML = "";

  if (!state.favorites.length) {
    dom.favoritesEmpty.classList.remove("hidden");
    return;
  }

  dom.favoritesEmpty.classList.add("hidden");
  const activeIcao = state.currentResolved?.icao || "";

  for (const favorite of state.favorites) {
    const item = document.createElement("div");
    item.className = "favorite-item";

    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.className = "favorite-load";
    if (favorite.icao === activeIcao) {
      loadBtn.classList.add("active");
    }
    loadBtn.dataset.icao = favorite.icao;

    const codeLabel = favorite.iata
      ? `${favorite.iata} / ${favorite.icao}`
      : favorite.icao;
    loadBtn.textContent = `${favorite.name} (${codeLabel})`;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "favorite-remove";
    removeBtn.dataset.icao = favorite.icao;
    removeBtn.setAttribute("aria-label", `Remove ${favorite.icao} from favorites`);
    removeBtn.textContent = "×";

    item.appendChild(loadBtn);
    item.appendChild(removeBtn);
    dom.favoritesList.appendChild(item);
  }
}

function buildFavoriteFromResolved(resolved) {
  const airport = resolved?.airport;
  return sanitizeFavoriteEntry({
    icao: resolved?.icao,
    name: airport?.name || resolved?.displayName || resolved?.icao,
    municipality: airport?.municipality || "",
    country: airport?.iso_country || "",
    iata: airport?.iata || "",
  });
}

function isFavorite(icao) {
  return state.favorites.some((item) => item.icao === icao);
}

function updateFavoriteButtonState() {
  if (!dom.favoriteBtn) {
    return;
  }

  const icao = state.currentResolved?.icao;
  if (!icao) {
    dom.favoriteBtn.disabled = true;
    dom.favoriteBtn.classList.remove("active");
    dom.favoriteBtn.textContent = "☆ Save Favorite";
    return;
  }

  dom.favoriteBtn.disabled = false;
  const active = isFavorite(icao);
  dom.favoriteBtn.classList.toggle("active", active);
  dom.favoriteBtn.textContent = active ? "★ Favorite Saved" : "☆ Save Favorite";
}

async function handleFavoriteToggle() {
  const icao = state.currentResolved?.icao;
  if (!icao) {
    return;
  }

  if (isFavorite(icao)) {
    state.favorites = state.favorites.filter((item) => item.icao !== icao);
    setShareStatus(`Removed ${icao} from favorites.`);
  } else {
    const entry = buildFavoriteFromResolved(state.currentResolved);
    if (entry) {
      state.favorites = [entry, ...state.favorites.filter((item) => item.icao !== entry.icao)]
        .slice(0, FAVORITES_MAX_ITEMS);
      setShareStatus(`Saved ${icao} to favorites.`);
    }
  }

  saveFavoritesToStorage();
  renderFavorites();
  updateFavoriteButtonState();
}

async function handleFavoritesClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const loadButton = target.closest(".favorite-load");
  if (loadButton instanceof HTMLButtonElement) {
    const icao = loadButton.dataset.icao;
    if (!icao) {
      return;
    }
    dom.input.value = icao;
    await loadAirportWeather(icao);
    return;
  }

  const removeButton = target.closest(".favorite-remove");
  if (removeButton instanceof HTMLButtonElement) {
    const icao = removeButton.dataset.icao;
    if (!icao) {
      return;
    }
    state.favorites = state.favorites.filter((item) => item.icao !== icao);
    saveFavoritesToStorage();
    renderFavorites();
    updateFavoriteButtonState();
    setShareStatus(`Removed ${icao} from favorites.`);
  }
}

function setShareStatus(message, timeoutMs = 2600) {
  if (!dom.shareStatus) {
    return;
  }

  dom.shareStatus.textContent = message;

  if (state.shareStatusTimer) {
    clearTimeout(state.shareStatusTimer);
    state.shareStatusTimer = null;
  }

  if (message && timeoutMs > 0) {
    state.shareStatusTimer = setTimeout(() => {
      if (dom.shareStatus.textContent === message) {
        dom.shareStatus.textContent = "";
      }
    }, timeoutMs);
  }
}

function setSharePanelStatus(message, timeoutMs = 2600) {
  if (!dom.sharePanelStatus) {
    return;
  }

  dom.sharePanelStatus.textContent = message;

  if (state.sharePanelTimer) {
    clearTimeout(state.sharePanelTimer);
    state.sharePanelTimer = null;
  }

  if (message && timeoutMs > 0) {
    state.sharePanelTimer = setTimeout(() => {
      if (dom.sharePanelStatus.textContent === message) {
        dom.sharePanelStatus.textContent = "";
      }
    }, timeoutMs);
  }
}

function getActiveWarnings() {
  if (state.currentWarnings?.length) {
    return state.currentWarnings;
  }
  if (!state.currentMetar) {
    return [];
  }
  return generateSmartWarnings();
}

function bestRunwaySummaryLine() {
  const best = state.bestRunway || state.sharedSnapshot?.bestRunway || null;
  if (!best) {
    return "Best Runway: Unavailable";
  }

  const heading = String(Math.round(best.heading || 0)).padStart(3, "0");
  const components = best.components;
  if (!components?.valid) {
    return `Best Runway: ${best.ident} (${heading}°), wind variable`;
  }

  const headOrTail = components.headwind >= 0.01
    ? `headwind ${formatComponentValue(components.headwind)} kt`
    : `tailwind ${formatComponentValue(components.tailwind)} kt`;
  return `Best Runway: ${best.ident} (${heading}°), ${headOrTail}, crosswind ${formatComponentValue(
    components.crosswind
  )} kt`;
}

function buildShareWeatherText() {
  const resolved = state.currentResolved;
  const metar = state.currentMetar;
  const taf = state.currentTaf;
  const warnings = getActiveWarnings();

  const warningLines = warnings.length
    ? warnings.map((warning) => `- [${warning.level.toUpperCase()}] ${warning.message}`)
    : ["- [INFO] No significant operational warnings detected."];

  const lines = [
    "METAR Lens Weather Share",
    `Airport: ${resolved?.icao || "Unknown"}${resolved?.displayName ? ` (${resolved.displayName})` : ""}`,
    `Observed: ${formatObsTime(metar?.timeGroup || null)}`,
    `METAR: ${metar?.raw || "N/A"}`,
    `TAF: ${taf?.raw || "N/A"}`,
    bestRunwaySummaryLine(),
    "Warnings:",
    ...warningLines,
  ];

  return lines.join("\n");
}

function normalizeWarningLevel(level) {
  const value = String(level || "").toLowerCase();
  if (["critical", "c", "4"].includes(value)) {
    return "critical";
  }
  if (["warning", "w", "3"].includes(value)) {
    return "warning";
  }
  if (["caution", "y", "2"].includes(value)) {
    return "caution";
  }
  return "info";
}

function parseSharedWarnings(list) {
  if (!Array.isArray(list)) {
    return [];
  }

  return list
     .slice(0, 8)
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const message = String(item.m || item.message || "").trim();
      if (!message) {
        return null;
      }
      return {
        level: normalizeWarningLevel(item.l || item.level),
        icon: String(item.i || item.icon || "INFO").toUpperCase().slice(0, 6),
        message: message.slice(0, 220),
      };
    })
    .filter(Boolean);
}

function parseSharedBestRunway(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const ident = String(value.i || value.ident || "").toUpperCase().trim();
  if (!ident) {
    return null;
  }

  const heading = Number(value.h ?? value.heading);
  const headwind = Number(value.hw ?? 0);
  const tailwind = Number(value.tw ?? 0);
  const crosswind = Number(value.cw ?? 0);

  return {
    ident,
    heading: Number.isFinite(heading) ? heading : deriveHeadingFromIdent(ident) || 0,
    components: {
      valid: true,
      headwind: Number.isFinite(headwind) ? Math.max(headwind, 0) : 0,
      tailwind: Number.isFinite(tailwind) ? Math.max(tailwind, 0) : 0,
      crosswind: Number.isFinite(crosswind) ? Math.max(crosswind, 0) : 0,
    },
    condition: {
      level: normalizeWarningLevel(value.c || value.condition || "info"),
      label: "Shared",
      score: 0,
    },
  };
}

function sanitizeSharedPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const hasVerboseFields = Object.prototype.hasOwnProperty.call(payload, "metar")
    || Object.prototype.hasOwnProperty.call(payload, "airport");

  if (hasVerboseFields) {
    const airport = payload.airport && typeof payload.airport === "object"
      ? payload.airport
      : {};

    const metar = String(payload.metar || "").trim();
    if (!metar || metar.length > 4000) {
      return null;
    }

    const bestRunway = payload.bestRunway && typeof payload.bestRunway === "object"
      ? {
        i: String(payload.bestRunway.ident || "").toUpperCase().trim(),
        h: Number(payload.bestRunway.heading || 0),
        hw: Number(payload.bestRunway.headwind || 0),
        tw: Number(payload.bestRunway.tailwind || 0),
        cw: Number(payload.bestRunway.crosswind || 0),
        c: String(payload.bestRunway.condition || "info").toLowerCase(),
      }
      : null;

    const warnings = Array.isArray(payload.warnings)
      ? payload.warnings.map((warning) => ({
        l: normalizeWarningLevel(warning?.level),
        i: String(warning?.icon || "INFO").toUpperCase(),
        m: String(warning?.message || "").trim(),
      }))
      : [];

    return {
      id: String(payload.id || "").trim(),
      v: 1,
      a: {
        i: String(airport.icao || "").toUpperCase().trim(),
        n: String(airport.name || "").trim(),
        m: String(airport.municipality || "").trim(),
        c: String(airport.country || "").trim(),
        t: String(airport.iata || "").toUpperCase().trim(),
      },
      m: metar,
      t: String(payload.taf || "").trim().slice(0, 16000),
      b: bestRunway?.i ? bestRunway : null,
      sr: String(payload.selectedRunway || "").toUpperCase().trim().slice(0, 6),
      w: warnings,
      o: String(payload.observed || "").trim(),
      exp: String(payload.expiresAt || payload.exp || "").trim(),
      ttl: SHARE_TTL_SECONDS[String(payload.ttl || "24h").toLowerCase()]
        ? String(payload.ttl || "24h").toLowerCase()
        : "24h",
    };
  }

  const metar = String(payload.m || "").trim();
  if (!metar || metar.length > 4000) {
    return null;
  }

  const airport = payload.a && typeof payload.a === "object"
    ? {
      i: String(payload.a.i || "").toUpperCase().trim(),
      n: String(payload.a.n || "").trim(),
      m: String(payload.a.m || "").trim(),
      c: String(payload.a.c || "").trim(),
      t: String(payload.a.t || "").toUpperCase().trim(),
    }
    : { i: "", n: "", m: "", c: "", t: "" };

  return {
    id: String(payload.id || "").trim(),
    v: Number(payload.v || 1),
    a: airport,
    m: metar,
    t: String(payload.t || "").trim().slice(0, 16000),
    b: payload.b || null,
    sr: String(payload.sr || "").toUpperCase().trim().slice(0, 6),
    w: Array.isArray(payload.w) ? payload.w : [],
    o: String(payload.o || "").trim(),
    exp: String(payload.exp || "").trim(),
    ttl: SHARE_TTL_SECONDS[String(payload.ttl || "24h").toLowerCase()]
      ? String(payload.ttl || "24h").toLowerCase()
      : "24h",
  };
}

function buildSharePayload() {
  if (!state.currentMetar) {
    return null;
  }

  const airport = state.currentResolved?.airport;
  const warnings = getActiveWarnings()
    .slice(0, 6)
    .map((warning) => ({
      l: warning.level,
      i: warning.icon,
      m: warning.message.slice(0, 120),
    }));

  const best = state.bestRunway || state.sharedSnapshot?.bestRunway || null;

  return {
    v: 2,
    u: generateShareNonce(),
    a: {
      i: state.currentResolved?.icao || state.currentMetar.station || "",
      n: airport?.name || state.currentResolved?.displayName || "",
      t: airport?.iata || "",
    },
    m: String(state.currentMetar.raw || "").trim().slice(0, 4000),
    t: String(state.currentTaf?.raw || "").trim().replace(/\s+/g, " ").slice(0, 2000),
    b: best
      ? {
        i: best.ident,
        h: Math.round(best.heading || 0),
        hw: Math.round(best.components?.headwind || 0),
        tw: Math.round(best.components?.tailwind || 0),
        cw: Math.round(best.components?.crosswind || 0),
        c: best.condition?.level || "info",
      }
      : null,
    sr: state.selectedRunwayComponents?.ident || "",
    w: warnings,
    o: formatObsTime(state.currentMetar.timeGroup),
  };
}

function generateShareNonce() {
  try {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
}

function encodeSharePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  try {
    const json = JSON.stringify(payload);
    const bytes = typeof TextEncoder !== "undefined"
      ? new TextEncoder().encode(json)
      : Uint8Array.from(json, (char) => char.charCodeAt(0));

    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }

    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  } catch {
    return "";
  }
}

function decodeSharePayload(token) {
  if (!token) {
    return null;
  }

  try {
    const padded = token
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(token.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const json = typeof TextDecoder !== "undefined"
      ? new TextDecoder().decode(bytes)
      : String.fromCharCode(...bytes);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function getAppBasePath() {
  const parts = window.location.pathname
    .split("/")
    .filter(Boolean);

  if (!parts.length) {
    return "";
  }

  if (parts[parts.length - 1].toLowerCase() === "index.html") {
    parts.pop();
  }

  return parts.length ? `/${parts.join("/")}` : "";
}

function getShareBaseUrl() {
  if (SHORT_LINK_DOMAIN) {
    return SHORT_LINK_DOMAIN.replace(/\/+$/, "");
  }

  const basePath = getAppBasePath();
  return `${window.location.origin}${basePath}`.replace(/\/+$/, "");
}

function buildShareableLink(token) {
  const safeToken = String(token || "").trim();
  if (!safeToken) {
    return "";
  }

  const url = new URL(getShareBaseUrl());
  url.search = "";
  url.hash = "";
  url.searchParams.set("s", safeToken);
  return url.toString();
}

async function requestShortLinkCreation() {
  const payload = buildSharePayload();
  if (!payload) {
    throw new Error("Load METAR before creating a share link.");
  }

  const token = encodeSharePayload(payload);
  if (!token) {
    throw new Error("Unable to encode share payload.");
  }

  const link = buildShareableLink(token);
  if (!link) {
    throw new Error("Unable to build share link.");
  }

  state.currentShareLink = link;

  if (dom.shareLinkInput) {
    dom.shareLinkInput.value = link;
  }

  return { token, link };
}

function clearShareTokenFromUrl() {
  if (!window.history?.replaceState) {
    return;
  }

  const url = new URL(window.location.href);
  let changed = false;

  if (url.searchParams.has("s") || url.searchParams.has("ap")) {
    url.searchParams.delete("s");
    url.searchParams.delete("ap");
    changed = true;
  }

  if (!changed) {
    return;
  }

  const search = url.searchParams.toString();
  const next = `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
  window.history.replaceState({}, "", next);
}

function setMetaContent(selector, value) {
  if (!value) {
    return;
  }
  const element = document.querySelector(selector);
  if (element) {
    element.setAttribute("content", value);
  }
}

function updateDynamicShareMeta(payload, shareLink = "") {
  const icao = payload.a?.i || state.currentResolved?.icao || "Airport";
  const flight = state.currentMetar
    ? computeFlightCategory(state.currentMetar.ceilingFt, state.currentMetar.visibility).category
    : "WX";
  const best = bestRunwaySummaryLine().replace(/^Best Runway:\s*/, "");
  const title = `METAR Lens ${icao} - ${flight}`;
  const description = `Shared aviation weather for ${icao}. ${best}`;
  const canonicalUrl = shareLink || `${window.location.origin}${window.location.pathname}`;

  document.title = title;
  setMetaContent('meta[name="description"]', description);
  setMetaContent('meta[property="og:title"]', title);
  setMetaContent('meta[property="og:description"]', description);
  setMetaContent('meta[property="og:url"]', canonicalUrl);
  setMetaContent('meta[name="twitter:title"]', title);
  setMetaContent('meta[name="twitter:description"]', description);
}


function refreshSharePanel() {
  if (!dom.shareCard || !dom.shareLinkInput) {
    return;
  }

  if (!state.currentMetar) {
    dom.shareCard.classList.add("hidden");
    dom.shareLinkInput.value = "";
    state.currentShareLink = "";
    return;
  }

  dom.shareCard.classList.remove("hidden");
  if (dom.sharedBriefingNote) {
    dom.sharedBriefingNote.classList.toggle("hidden", !state.sharedSnapshot);
  }

  if (state.currentShareLink) {
    dom.shareLinkInput.value = state.currentShareLink;
  } else {
    dom.shareLinkInput.value = "";
  }

  if (dom.sharePanelStatus && !dom.sharePanelStatus.textContent) {
    dom.sharePanelStatus.textContent = "Tap Share as Link to generate a client-side weather link.";
  }

  const payload = buildSharePayload();
  if (payload) {
    updateDynamicShareMeta(payload, state.currentShareLink);
  }
}


function buildSocialShareText() {
  if (!state.currentMetar) {
    return "METAR Lens weather briefing";
  }

  const icao = state.currentResolved?.icao || state.currentMetar.station || "Airport";
  const flight = computeFlightCategory(state.currentMetar.ceilingFt, state.currentMetar.visibility).category;
  const best = bestRunwaySummaryLine().replace(/^Best Runway:\s*/, "");
  return `METAR Lens ${icao} - ${flight} - ${best}`;
}

function tryAndroidSystemShare(text) {
  const providers = [globalThis.METARLensAndroid, globalThis.Android];
  for (const provider of providers) {
    if (!provider) {
      continue;
    }
    const shareFn = provider.shareWeather || provider.shareText;
    if (typeof shareFn !== "function") {
      continue;
    }
    try {
      shareFn.call(provider, text);
      return true;
    } catch {
      // Ignore bridge share errors.
    }
  }
  return false;
}

async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback below
  }

  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "absolute";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

async function handleCopyAsText() {
  if (!state.currentMetar) {
    setShareStatus("Load METAR before sharing.");
    setSharePanelStatus("Load METAR before sharing.");
    return;
  }

  const copied = await copyTextToClipboard(buildShareWeatherText());
  if (copied) {
    setShareStatus("Weather brief copied as text.");
    setSharePanelStatus("Copied full weather briefing as plain text.");
  } else {
    setShareStatus("Text copy failed.");
    setSharePanelStatus("Unable to copy text on this device.");
  }
}

async function handleShareAsLink({ fromHeader = false } = {}) {
  if (!state.currentMetar) {
    setShareStatus("Load METAR before sharing.");
    setSharePanelStatus("Load METAR before sharing.");
    return;
  }

  if (fromHeader && dom.shareCard) {
    dom.shareCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  try {
    setSharePanelStatus("Generating share link...");
    await requestShortLinkCreation();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create share link.";
    setShareStatus("Share-link generation failed.");
    setSharePanelStatus(message);
    return;
  }

  const link = state.currentShareLink;
  if (dom.shareLinkInput) {
    dom.shareLinkInput.value = link;
  }

  const token = new URL(link).searchParams.get("s");
  const sharedPayload = decodeSharePayload(token);
  if (sharedPayload) {
    updateDynamicShareMeta(sharedPayload, link);
  }

  const shareText = buildSocialShareText();
  const icao = state.currentResolved?.icao || "Airport";

  if (navigator.share) {
    try {
      await navigator.share({
        title: `METAR Lens ${icao}`,
        text: shareText,
        url: link,
      });
      setShareStatus("Shared weather link successfully.");
      setSharePanelStatus("Shared weather link via system share menu.");
      return;
    } catch (error) {
      if (error && error.name === "AbortError") {
        setShareStatus("Share canceled.", 1500);
        setSharePanelStatus("Share canceled.", 1500);
        return;
      }
    }
  }

  const androidShared = tryAndroidSystemShare(`${shareText}
${link}`);
  if (androidShared) {
    setShareStatus("Shared through Android.");
    setSharePanelStatus("Shared weather link through Android.");
    return;
  }

  const copied = await copyTextToClipboard(link);
  if (copied) {
    setShareStatus("Share link copied.");
    setSharePanelStatus("System share unavailable, copied share link instead.");
  } else {
    setShareStatus("Share failed.");
    setSharePanelStatus("Unable to share or copy the share link.");
  }
}

function selectRunwayByIdent(ident) {
  if (!ident || !dom.runwaySelect) {
    return false;
  }

  const target = ident.toUpperCase();
  for (let i = 0; i < dom.runwaySelect.options.length; i += 1) {
    const option = dom.runwaySelect.options[i];
    if ((option.dataset.ident || "").toUpperCase() === target) {
      dom.runwaySelect.selectedIndex = i;
      return true;
    }
  }
  return false;
}

function buildResolvedFromSharePayload(payload) {
  const airport = payload.a || {};
  const icao = (airport.i || state.currentMetar?.station || "").toUpperCase();
  const fallbackName = airport.n || icao;
  const municipality = airport.m || "";

  return {
    icao,
    displayName: [fallbackName, municipality].filter(Boolean).join(" — "),
    airport: {
      ident: icao,
      name: fallbackName,
      municipality,
      iso_country: airport.c || "",
      iata: airport.t || "",
      elevationFt: null,
    },
  };
}

async function loadSharedBriefingPayload(payload) {
  const sanitized = sanitizeSharedPayload(payload);
  if (!sanitized) {
    return false;
  }

  clearError();
  setShareStatus("");
  setSharePanelStatus("");
  state.currentMetar = parseMetar(sanitized.m);
  state.currentTaf = sanitized.t ? parseTaf(sanitized.t) : null;
  state.currentResolved = buildResolvedFromSharePayload(sanitized);
  state.currentRunways = [];
  state.selectedRunwayComponents = null;
  state.bestRunway = parseSharedBestRunway(sanitized.b);
  state.currentWarnings = parseSharedWarnings(sanitized.w);
  const currentToken = encodeSharePayload(sanitized);
  state.currentShareLink = currentToken ? buildShareableLink(currentToken) : "";
  state.sharedSnapshot = {
    payload: sanitized,
    bestRunway: state.bestRunway,
  };

  dom.input.value = state.currentResolved.icao || "";

  renderMetar(state.currentMetar, state.currentResolved);
  dom.card.classList.remove("hidden");
  dom.atisCard.classList.remove("hidden");
  dom.shareCard.classList.remove("hidden");
  dom.toolsCard.classList.remove("hidden");
  dom.runwayAnalysisCard.classList.remove("hidden");
  dom.warningCard.classList.remove("hidden");
  dom.riskCard.classList.remove("hidden");
  dom.tafCard.classList.remove("hidden");

  if (dom.sharedBriefingNote) {
    dom.sharedBriefingNote.classList.remove("hidden");
  }

  if (state.currentTaf) {
    renderTaf(state.currentTaf);
  } else {
    dom.tafStatus.textContent = "Shared snapshot did not include TAF data.";
    dom.rawTaf.textContent = "";
    updateChartsWithEmpty();
  }

  if (state.currentWarnings.length) {
    renderWarnings(state.currentWarnings);
  }

  const icao = state.currentResolved?.icao;
  if (icao) {
    const hasRunways = await updateRunwayList(icao);
    if (hasRunways) {
      const selected = sanitized.sr || sanitized.b?.i || "";
      if (selected) {
        selectRunwayByIdent(selected);
      }
      updateRunwayCalculator();
    } else {
      updateRunwayAnalysis();
      updateRunwayPerformanceHints();
      updateAtisOutput();
    }
  }

  updateRiskLayers();
  updateSmartWarnings();
  refreshSharePanel();
  updateFavoriteButtonState();
  renderFavorites();

  const station = state.currentResolved?.icao || state.currentMetar.station || "airport";
  setStatus(`Loaded shared weather snapshot for ${station}.`);
  setSharePanelStatus("This briefing was restored from a shared link.", 4500);
  return true;
}

async function initSharedBriefingFromUrl() {
  const token = new URL(window.location.href).searchParams.get("s");
  if (!token) {
    return;
  }

  const decoded = decodeSharePayload(token);
  if (!decoded) {
    setStatus("Shared link is invalid.");
    showError("Unable to decode shared weather link.");
    return;
  }

  const loaded = await loadSharedBriefingPayload(decoded);
  if (!loaded) {
    showError("Unable to open this shared weather link.");
  }
}


function initTheme() {
  const saved = localStorage.getItem("metar-theme");
  if (saved === "dark" || saved === "light") {
    setTheme(saved);
  } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    setTheme("dark");
  } else {
    setTheme("light");
  }
}

function setTheme(theme) {
  document.body.dataset.theme = theme;
  dom.themeToggle.setAttribute("aria-pressed", theme === "dark");
  localStorage.setItem("metar-theme", theme);
  updateChartsTheme();
  if (state.currentMetar) {
    updateWindCompass(state.currentMetar);
    updateCloudLayers(state.currentMetar);
  }
}
