const NOAA_METAR_BASE = "https://aviationweather.gov/api/data/metar";
const NOAA_TAF_BASE = "https://aviationweather.gov/api/data/taf";
const OURAIRPORTS_URL =
  "https://davidmegginson.github.io/ourairports-data/airports.csv";
const RUNWAYS_URL =
  "https://davidmegginson.github.io/ourairports-data/runways.csv";
const DEFAULT_PROXY_TEMPLATES = [
  "https://api.codetabs.com/v1/proxy?quest={url}",
];

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
};

const state = {
  airports: null,
  airportsPromise: null,
  runways: null,
  runwaysPromise: null,
  currentMetar: null,
  currentTaf: null,
  charts: null,
};

initTheme();

dom.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = dom.input.value.trim();
  if (!query) {
    showError("Enter an airport name, IATA code, or ICAO code.");
    return;
  }

  clearError();
  dom.card.classList.add("hidden");
  dom.toolsCard.classList.add("hidden");
  dom.riskCard.classList.add("hidden");
  dom.tafCard.classList.add("hidden");
  setStatus("Resolving airport...");
  dom.button.disabled = true;

  try {
    const resolved = await resolveAirport(query);
    if (!resolved) {
      showError("Airport not found. Try a different name or code.");
      setStatus("");
      return;
    }

    setStatus(
      `Resolved to ${resolved.icao} — ${resolved.displayName || "Unknown"}`
    );

    const raw = await fetchMetar(resolved.icao);
    if (!raw) {
      showError("METAR not found for this airport.");
      setStatus("");
      return;
    }

    const parsed = parseMetar(raw);
    state.currentMetar = parsed;
    renderMetar(parsed, resolved);
    dom.card.classList.remove("hidden");

    dom.toolsCard.classList.remove("hidden");
    const hasRunways = await updateRunwayList(resolved.icao);
    if (hasRunways) {
      updateRunwayCalculator();
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
    dom.riskCard.classList.remove("hidden");
  } catch (error) {
    showError(
      error instanceof Error
        ? error.message
        : "Unable to fetch METAR right now."
    );
  } finally {
    dom.button.disabled = false;
  }
});

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

dom.themeToggle.addEventListener("click", () => {
  const isDark = document.body.dataset.theme === "dark";
  const next = isDark ? "light" : "dark";
  setTheme(next);
  updateChartsTheme();
});

async function resolveAirport(query) {
  const cleaned = query.trim().toUpperCase();
  if (/^[A-Z]{4}$/.test(cleaned)) {
    return {
      icao: cleaned,
      displayName: cleaned,
      airport: null,
    };
  }

  const { iataMap, icaoMap, list } = await loadAirports();

  if (/^[A-Z]{3}$/.test(cleaned)) {
    const airport = iataMap.get(cleaned);
    if (airport) {
      return formatResolved(airport);
    }
  }

  if (/^[A-Z]{4}$/.test(cleaned)) {
    const airport = icaoMap.get(cleaned);
    if (airport) {
      return formatResolved(airport);
    }
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
}

async function updateRunwayList(airportIdent) {
  dom.runwaySelect.innerHTML = '<option value="">Select runway</option>';
  dom.runwaySelect.disabled = true;
  dom.runwayNote.textContent = "Loading runway data...";
  setRunwayOutputs("—", "—", "Head/Tailwind", "Crosswind");

  try {
    const runwayMap = await loadRunways();
    const runways = runwayMap.get(airportIdent) || [];
    if (!runways.length) {
      dom.runwayNote.textContent = "No runway data available for this airport.";
      return false;
    }

    const sorted = [...runways].sort((a, b) => {
      const aNum = runwaySortValue(a.ident, a.heading);
      const bNum = runwaySortValue(b.ident, b.heading);
      return aNum - bNum;
    });

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
    return true;
  } catch (error) {
    dom.runwayNote.textContent = "Unable to load runway data.";
    return false;
  }
}

function updateRunwayCalculator() {
  const wind = state.currentMetar?.wind;
  if (!wind) {
    dom.runwayNote.textContent = "Waiting for METAR wind.";
    setRunwayOutputs("—", "—", "Head/Tailwind", "Crosswind");
    return;
  }

  const selection = dom.runwaySelect.value;
  const selectedOption = dom.runwaySelect.selectedOptions[0];
  if (!selection) {
    dom.runwayNote.textContent = "Select a runway to calculate components.";
    setRunwayOutputs("—", "—", "Head/Tailwind", "Crosswind");
    return;
  }

  const heading = Number(selection);
  if (Number.isNaN(heading)) {
    dom.runwayNote.textContent = "Runway heading unavailable.";
    setRunwayOutputs("—", "—", "Head/Tailwind", "Crosswind");
    return;
  }

  if (wind.direction === "VRB") {
    dom.runwayNote.textContent = "Wind is variable; components are unreliable.";
    setRunwayOutputs("Variable", "Variable", "Head/Tailwind", "Crosswind");
    return;
  }

  const windDir = Number(wind.direction);
  const speedKt = toKnots(wind.speed, wind.unit);
  const gustKt = wind.gust ? toKnots(wind.gust, wind.unit) : null;
  if (Number.isNaN(windDir) || Number.isNaN(speedKt)) {
    dom.runwayNote.textContent = "Wind direction unavailable for components.";
    setRunwayOutputs("—", "—", "Head/Tailwind", "Crosswind");
    return;
  }

  const diff = angleDifference(windDir, heading);
  const diffRad = (diff * Math.PI) / 180;
  const head = speedKt * Math.cos(diffRad);
  const cross = speedKt * Math.sin(diffRad);
  const headLabel = head >= 0 ? "Headwind" : "Tailwind";
  const crossLabel = cross >= 0 ? "Right crosswind" : "Left crosswind";
  const runwayIdent = selectedOption?.dataset.ident || "Runway";

  dom.runwayNote.textContent = `${runwayIdent} (${String(
    Math.round(heading)
  ).padStart(3, "0")}°) • Wind ${windDir}° at ${speedKt.toFixed(0)} kt`;

  dom.headArrow.textContent = head >= 0 ? "↑" : "↓";
  dom.crossArrow.textContent = cross >= 0 ? "→" : "←";

  dom.headLabel.textContent = headLabel;
  dom.crossLabel.textContent = crossLabel;

  dom.headValue.textContent = `${Math.abs(head).toFixed(0)} kt`;
  dom.crossValue.textContent = `${Math.abs(cross).toFixed(0)} kt`;

  if (gustKt) {
    const headGust = gustKt * Math.cos(diffRad);
    const crossGust = gustKt * Math.sin(diffRad);
    dom.headSub.textContent = `Max gust ${Math.abs(headGust).toFixed(0)} kt`;
    dom.crossSub.textContent = `Max gust ${Math.abs(crossGust).toFixed(0)} kt`;
  } else {
    dom.headSub.textContent = `Δ ${Math.round(diff)}° from runway`;
    dom.crossSub.textContent = `Δ ${Math.round(diff)}° from runway`;
  }
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

    const airport = {
      ident,
      name: row[nameIdx] || "",
      municipality: row[municipalityIdx] || "",
      iso_country: row[isoIdx] || "",
      iata: row[iataIdx]?.toUpperCase() || "",
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
