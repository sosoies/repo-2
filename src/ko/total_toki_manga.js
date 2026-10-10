const mangayomiSources = [{
  name: "TOTAL 토끼 만화",
  lang: "ko",
  baseUrl: "https://dc-toki-mangayomi-manga.pages.dev",
  apiUrl: "",
  iconUrl: "https://dc-toki-mangayomi-manga.pages.dev/icon/ko.total-toki-manga.png",
  typeSource: "single",
  itemType: 0,
  isNsfw: true,
  hasCloudflare: true,
  version: "0.1.15",
  dateFormat: "yyyy-MM-dd",
  dateFormatLocale: "ko_KR",
  pkgPath: "manga/src/ko/total_toki_manga.js"
}];

function dcResolveListCardManifest(data, scope, tab) {
  const source = data && typeof data === "object" ? data : {};
  const currentScope = String(scope || "default").trim().toLowerCase();
  const currentTab = String(tab || "all").trim().toLowerCase();
  const groupByScope = {
    xtoon: "manga", toon11: "manga", goodtoon: "manga", blacktoon: "manga", wolf_manga: "manga", wolf_webtoon: "manga",
    ani24: "media", anilife: "media", dc_iptv: "media", dc_live: "media", samsung_tv_plus: "media", linkkf_anime: "media", tvroom: "media",
    toki31_novel: "novel"
  };
  const currentGroup = groupByScope[currentScope] || "";
  const values = function(value) {
    if (Array.isArray(value)) return value.map(function(item) { return String(item || "").trim().toLowerCase(); }).filter(Boolean);
    const one = String(value || "").trim().toLowerCase();
    return one ? [one] : [];
  };
  let selected = null, selectedIndex = -1, selectedScore = -Infinity;
  const rules = Array.isArray(source.rules) ? source.rules : [];
  for (let index = 0; index < rules.length; index++) {
    const rule = rules[index];
    if (!rule || typeof rule !== "object" || rule.enabled === false) continue;
    const match = rule.match && typeof rule.match === "object" ? rule.match : {};
    const targets = values(rule.targets || rule.extensions || rule.scopes || match.targets || match.extensions || match.scopes);
    const groups = values(rule.groups || match.groups);
    const tabs = values(rule.tabs || rule.tab || match.tabs || match.tab);
    let targetScore = 0;
    if (targets.length) {
      if (targets.indexOf(currentScope + ":" + currentTab) >= 0) targetScore = 600;
      else if (targets.indexOf(currentScope) >= 0) targetScore = 500;
      else continue;
    } else if (groups.length) {
      if (!currentGroup || groups.indexOf(currentGroup) < 0) continue;
      targetScore = 300;
    }
    let tabScore = 0;
    if (tabs.length && tabs.indexOf("*") < 0 && tabs.indexOf("all") < 0 && tabs.indexOf("both") < 0) {
      if (tabs.indexOf(currentTab) < 0) continue;
      tabScore = 50;
    }
    const priority = Number(rule.priority) || 0;
    const score = priority * 10000 + targetScore + tabScore;
    if (score > selectedScore) { selected = rule; selectedIndex = index; selectedScore = score; }
  }
  const selectedCards = selected && Array.isArray(selected.cards) && selected.cards.length ? selected.cards : source.cards;
  const rootRotation = source.rotation && typeof source.rotation === "object" ? source.rotation : {};
  const ruleRotation = selected && selected.rotation && typeof selected.rotation === "object" ? selected.rotation : {};
  const revisionParts = [source.revision];
  if (selected) revisionParts.push(selected.revision, selected.id || ("rule-" + selectedIndex));
  return {
    cards: Array.isArray(selectedCards) ? selectedCards : [],
    name: String(selected && (selected.name || selected.title) || source.name || source.title || "").trim(),
    revision: revisionParts.map(function(value) { return String(value || "").trim(); }).filter(Boolean).join(":"),
    rotation: Object.assign({}, rootRotation, ruleRotation)
  };
}

async function dcOfficialListCardSystem(scope, tab, defaultName) {
  if (defaultName === undefined) { defaultName = tab; tab = "all"; }
  const assetBaseUrl = "https://dc-toki-mangayomi-novel.pages.dev";
  const manifestUrl = assetBaseUrl + "/assets/official-random-cards.json";
  let data = null;
  try {
    const response = await new Client({ persistentConnection: false, noProxy: true, timeout: 8, connectTimeout: 5 }).get(
      manifestUrl + "?card_manifest=" + Date.now(),
      { Accept: "application/json, text/plain, */*", Referer: assetBaseUrl + "/", "Cache-Control": "no-cache" }
    );
    if (response && response.statusCode >= 200 && response.statusCode < 300) data = JSON.parse(String(response.body || ""));
  } catch (_) {}
  const config = dcResolveListCardManifest(data, scope, tab);
  const revision = config.revision;
  let cards = config.cards.map(function(value) {
    const rawUrl = typeof value === "string" ? value : value && (value.imageUrl || value.image || value.url);
    let imageUrl = String(rawUrl || "").trim();
    if (imageUrl.startsWith("/")) imageUrl = assetBaseUrl + imageUrl;
    if (imageUrl.toLowerCase().indexOf("https://") !== 0) return null;
    if (revision) imageUrl += (imageUrl.indexOf("?") >= 0 ? "&" : "?") + "revision=" + encodeURIComponent(revision);
    return { name: String(typeof value === "object" && value && (value.name || value.title) || config.name || defaultName || "오늘의 한 장").trim(), imageUrl: imageUrl };
  }).filter(Boolean);
  if (!cards.length) {
    cards = Array.from({ length: 20 }, function(_, offset) {
      return { name: defaultName || "오늘의 한 장", imageUrl: assetBaseUrl + "/card/shared-random/card-" + String(offset + 1).padStart(2, "0") + ".jpg" };
    });
  }
  const rotation = config.rotation;
  const holdMinutes = String(rotation.mode || "").toLowerCase() === "interval" ? Math.max(1, Number(rotation.intervalMinutes) || 60) : 0;
  const preferences = new SharedPreferences();
  const safeScope = String(scope || "default").replace(/[^a-z0-9_-]/gi, "_");
  const safeTab = String(tab || "all").replace(/[^a-z0-9_-]/gi, "_");
  const key = "dc_list_card_system_last_" + safeScope + "_" + safeTab;
  const timeKey = key + "_time";
  const revisionKey = key + "_revision";
  let previous = 0, previousAt = 0, previousRevision = "";
  try {
    previous = Number(preferences.getString(key, "0"));
    previousAt = Number(preferences.getString(timeKey, "0"));
    previousRevision = String(preferences.getString(revisionKey, "") || "");
  } catch (_) {}
  let index = previous;
  const keepPrevious = holdMinutes > 0 && previous >= 1 && previous <= cards.length && previousAt > 0 && Date.now() - previousAt < holdMinutes * 60 * 1000 && previousRevision === revision;
  if (!keepPrevious) {
    index = Math.floor(Math.random() * cards.length) + 1;
    const avoidImmediateRepeat = rotation.avoidImmediateRepeat !== false;
    if (avoidImmediateRepeat && cards.length > 1 && index === previous) index = index % cards.length + 1;
    try {
      preferences.setString(key, String(index));
      preferences.setString(timeKey, String(Date.now()));
      preferences.setString(revisionKey, revision);
    } catch (_) {}
  }
  return cards[Math.max(1, Math.min(cards.length, index || 1)) - 1];
}

async function dcOfficialEventCard() {
  const manifestUrl = "https://dc-toki-mangayomi-media.pages.dev/assets/official-event-card.json";
  try {
    const response = await new Client({ persistentConnection: false, noProxy: true, timeout: 8, connectTimeout: 5 }).get(
      manifestUrl + "?event_manifest=" + Date.now(),
      { Accept: "application/json, text/plain, */*", Referer: "https://dc-toki-mangayomi-media.pages.dev/" }
    );
    if (!response || response.statusCode < 200 || response.statusCode >= 300) return null;
    const data = JSON.parse(String(response.body || ""));
    if (!data || data.enabled !== true) return null;
    const now = Date.now();
    const startsAt = data.startsAt ? Date.parse(String(data.startsAt)) : null;
    const endsAt = data.endsAt ? Date.parse(String(data.endsAt)) : null;
    if (Number.isFinite(startsAt) && now < startsAt) return null;
    if (Number.isFinite(endsAt) && now >= endsAt) return null;
    let imageUrl = String(data.imageUrl || data.image || "").trim();
    if (imageUrl.toLowerCase().indexOf("https://") !== 0) return null;
    const revision = String(data.revision || "").trim();
    if (revision) imageUrl += (imageUrl.indexOf("?") >= 0 ? "&" : "?") + "revision=" + encodeURIComponent(revision);
    return { name: String(data.name || data.title || "특별 이벤트").trim(), imageUrl: imageUrl };
  } catch (_) { return null; }
}

const dcTotalWorkMemory = {};
const dcTotalMappingShardMemory = {};

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.signalUrl = "https://wankyo83.github.io/tokki-traffic-light/domains.json";
    this.assetBaseUrl = "https://dc-toki-mangayomi-total-toki-manga-test.pages.dev";
    this.mappingUrl = this.assetBaseUrl + "/assets/total-manga-map.json";
    this.mappingShardBaseUrl = this.assetBaseUrl + "/assets/total-manga-map-shards";
    this.providers = {
      newtoki: { name: "Newtoki", fallbackBaseUrl: "https://newtoki1.org", pattern: /^https:\/\/(?:www\.)?newtoki\d+\.(?:org|com)\/?$/i },
      toki: { name: "Toki", fallbackBaseUrl: "https://toki31.com", pattern: /^https:\/\/(?:www\.)?toki\d+\.com\/?$/i },
      sbxh: { name: "SBXH", fallbackBaseUrl: "https://sbxh9.com", pattern: /^https:\/\/(?:www\.)?sbxh\d+\.com\/?$/i }
    };
    this.providerPreference = "total_toki_manga_provider_v1";
    this.autoProviderPreference = "total_toki_manga_auto_provider_enabled_v1";
    this.autoSelectedProviderPreference = "total_toki_manga_auto_selected_provider_v1";
    this.localHealthPreference = "total_toki_manga_local_health_v1";
    this.fallbackBaseUrl = this.providers.toki.fallbackBaseUrl;
    this.userAgent = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
    this.imageAccept = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";
    this.weekdayCardBaseUrl = "https://dc-toki-mangayomi-manga.pages.dev/card/weekday-";
    this.popularRulePreference = "total_toki_manga_popular_rule_v1";
    this.latestRulePreference = "total_toki_manga_latest_rule_v1";
    this.pageSize = 24;
    this.requestSequence = 0;
    this.registryMemory = null;
    this.registryMemoryAt = 0;
    this.registryPromise = null;
    this.baseMemory = {};
    this.signalMemory = null;
    this.signalMemoryAt = 0;
    this.signalPromise = null;
    this.chapterRouteMemory = {};
    this.genres = ["전체", "순정", "판타지", "러브코미디", "드라마", "17", "학원", "라노벨", "개그", "액션", "백합", "일상", "SF", "이세계", "스릴러", "애니화", "전생", "스포츠", "TS", "소년", "먹방", "붕탁", "게임", "호러", "시대", "로맨스", "추리", "음악", "무협", "BL"];
    this.sections = [["업데이트", "updates"], ["만화", "ongoing"], ["완결", "completed"]];
    this.orders = [["최신순", "new"], ["신작순", "fresh"], ["북마크순", "hot"], ["조회순", "views"], ["평점순", "rating"], ["화수순", "episodes"]];
  }

  _text(value) { return value === null || value === undefined ? "" : String(value); }
  _trimSlash(value) { return this._text(value).trim().replace(/\/+$/, ""); }
  _origin(value) { const match = this._text(value).match(/^(https?:\/\/[^/]+)/i); return match ? match[1] : ""; }
  _relativePath(value) { let raw = this._text(value).trim(); if (/^https?:\/\//i.test(raw)) raw = raw.replace(/^https?:\/\/[^/]+/i, ""); if (!raw.startsWith("/")) raw = "/" + raw; return raw; }
  _canonicalPath(value) { return this._relativePath(value).split("#")[0].split("?")[0].replace(/\/+$/, ""); }
  _preference(key, fallback) { try { const value = new SharedPreferences().get(key); return value === null || value === undefined ? fallback : value; } catch (_) { return fallback; } }
  _preferenceString(key, fallback) { try { const value = new SharedPreferences().getString(key, fallback); return value === null || value === undefined ? fallback : this._text(value); } catch (_) { return fallback; } }
  _boolPreference(key, fallback) { const value = this._preference(key, fallback); if (value === true || value === false) return value; const normalized = this._text(value).trim().toLowerCase(); if (["true", "1", "yes", "on"].indexOf(normalized) >= 0) return true; if (["false", "0", "no", "off"].indexOf(normalized) >= 0) return false; return fallback === true; }
  _manualProvider() { const value = this._text(this._preference(this.providerPreference, "newtoki")).trim().toLowerCase(); return this._raceProviderKeys().indexOf(value) >= 0 ? value : "newtoki"; }
  _autoProviderEnabled() { return this._boolPreference(this.autoProviderPreference, true); }
  _selectedProvider() { if (!this._autoProviderEnabled()) return this._manualProvider(); const automatic = this._text(this._preferenceString(this.autoSelectedProviderPreference, "")).trim().toLowerCase(); return this._raceProviderKeys().indexOf(automatic) >= 0 ? automatic : this._manualProvider(); }
  _providerName(provider) { return this.providers[provider] ? this.providers[provider].name : provider; }
  _connectionLabel(provider) { return (this._autoProviderEnabled() ? "자동 연결: " : "수동 연결: ") + this._providerName(provider || this._selectedProvider()); }
  _tokiPausedNotice() { return "토끼는 Cloudflare 인증 실패로 인해 잠시 중단\n개발자 피드백 및 해결 중"; }
  _isAllowedBaseUrl(value, provider) { const config = this.providers[provider || this._selectedProvider()]; return !!config && config.pattern.test(this._text(value).trim()); }
  _readLocalHealth() { try { const raw = this._preferenceString(this.localHealthPreference, ""); const value = raw ? JSON.parse(raw) : {}; return value && typeof value === "object" ? value : {}; } catch (_) { return {}; } }
  _writeLocalHealth(value) { try { new SharedPreferences().setString(this.localHealthPreference, JSON.stringify(value || {})); } catch (_) {} }
  _localRecord(provider) { const health = this._readLocalHealth(); return health[provider] && typeof health[provider] === "object" ? health[provider] : {}; }
  _recordLocalResult(provider, kind, ok, elapsedMs, error, missing) {
    if (!this.providers[provider] || ["list", "viewer"].indexOf(kind) < 0) return;
    const health = this._readLocalHealth();
    const current = health[provider] && typeof health[provider] === "object" ? health[provider] : {};
    const now = Date.now();
    current[kind] = { ok: ok === true, missing: missing === true, elapsedMs: Math.max(0, Number(elapsedMs) || 0), checkedAt: new Date(now).toISOString(), error: this._text(error && (error.message || error)).slice(0, 240) };
    current[kind + "BlockedUntil"] = ok === true || missing === true ? 0 : now + 30 * 60 * 1000;
    health[provider] = current;
    this._writeLocalHealth(health);
  }
  _localBlockedUntil(provider) { const record = this._localRecord(provider); return Math.max(Number(record.listBlockedUntil || 0), Number(record.viewerBlockedUntil || 0)); }

  async _signalDomains() {
    if (this.signalMemory && Date.now() - this.signalMemoryAt < 10 * 60 * 1000) return this.signalMemory;
    if (this.signalPromise) return await this.signalPromise;
    const self = this;
    this.signalPromise = (async function() {
      const response = await new Client({ persistentConnection: false, noProxy: true, timeout: 8, connectTimeout: 5 }).get(self.signalUrl, { "User-Agent": self.userAgent, "Accept": "application/json", "Cache-Control": "no-cache" });
      if (!response || response.statusCode < 200 || response.statusCode >= 300) throw new Error("중앙신호등 주소를 받지 못했습니다.");
      const data = JSON.parse(self._text(response.body));
      if (!data || !data.domains || typeof data.domains !== "object") throw new Error("중앙신호등 주소 형식이 올바르지 않습니다.");
      self.signalMemory = data.domains;
      self.signalMemoryAt = Date.now();
      return self.signalMemory;
    })();
    try { return await this.signalPromise; }
    finally { this.signalPromise = null; }
  }

  async _resolveBaseUrl(requestedProvider) {
    const provider = this.providers[requestedProvider] ? requestedProvider : this._selectedProvider();
    const config = this.providers[provider];
    const manual = this._text(this._preference("total_toki_manga_" + provider + "_domain_url", "")).trim();
    if (this._isAllowedBaseUrl(manual, provider)) return this._trimSlash(manual);
    const cached = this.baseMemory[provider];
    if (cached && Date.now() - cached.at < 10 * 60 * 1000 && this._isAllowedBaseUrl(cached.base, provider)) return cached.base;
    try {
      const domains = await this._signalDomains();
      const candidate = domains && domains[provider] ? domains[provider].baseUrl : "";
      if (this._isAllowedBaseUrl(candidate, provider)) {
        const base = this._trimSlash(candidate);
        this.baseMemory[provider] = { base: base, at: Date.now() };
        return base;
      }
    } catch (_) {}
    this.baseMemory[provider] = { base: config.fallbackBaseUrl, at: Date.now() };
    return config.fallbackBaseUrl;
  }

  _requestHeaders(url, extraHeaders) {
    const headers = { "User-Agent": this.userAgent, "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8", "Referer": (this._origin(url) || this.fallbackBaseUrl) + "/" };
    if (extraHeaders) Object.assign(headers, extraHeaders);
    return headers;
  }

  _failureCode(response, cause) {
    const status = response && response.statusCode ? Number(response.statusCode) : 0;
    if (status) return "HTTP" + status;
    const text = this._text(cause && (cause.message || cause));
    if (/10054|ECONNRESET|connection reset/i.test(text)) return "RESET";
    if (/timed?\s*out|timeout/i.test(text)) return "TIMEOUT";
    if (/certificate|handshake|TLS|SSL/i.test(text)) return "TLS";
    return "NETWORK";
  }

  async _pause(milliseconds) { if (typeof setTimeout === "function") await new Promise(function(resolve) { setTimeout(resolve, milliseconds); }); }

  async _requestText(method, url, extraHeaders, body, stage) {
    const headers = this._requestHeaders(url, extraHeaders);
    const transports = [{ name: "RHTTP", options: { persistentConnection: false, noProxy: true, timeout: 25, connectTimeout: 10 } }, { name: "DART", options: { useDartHttpClient: true, persistentConnection: false } }];
    const diagnostics = [];
    for (const transport of transports) {
      try {
        const client = new Client(transport.options);
        const response = method === "POST" ? await client.post(url, headers, body) : await client.get(url, headers);
        if (response.statusCode >= 200 && response.statusCode < 300) return response.body;
        diagnostics.push(transport.name + "=" + this._failureCode(response, null));
        if ([401, 403, 429].indexOf(Number(response.statusCode)) >= 0) break;
      } catch (error) {
        diagnostics.push(transport.name + "=" + this._failureCode(null, error));
        if (transport.name === "RHTTP") await this._pause(180);
      }
    }
    throw new Error("toki 만화 " + (stage || "요청") + " 연결에 실패했습니다. 진단: " + diagnostics.join(","));
  }

  async _getText(url, extraHeaders, stage) { return await this._requestText("GET", url, extraHeaders, undefined, stage); }
  async _getTextFast(url, extraHeaders, stage) { let response; try { response = await new Client({ persistentConnection: false, noProxy: true, timeout: 8, connectTimeout: 4 }).get(url, this._requestHeaders(url, extraHeaders)); } catch (error) { throw new Error("toki 만화 " + stage + " 연결 실패: " + this._failureCode(null, error)); } if (!response || response.statusCode < 200 || response.statusCode >= 300) throw new Error("toki 만화 " + stage + " 연결 실패: " + this._failureCode(response, null)); return this._text(response.body); }
  async _getJson(url, stage) { const body = await this._getText(url, { "Accept": "application/json" }, stage); try { return JSON.parse(body); } catch (_) { throw new Error("toki 만화 " + stage + " 응답 형식이 올바르지 않습니다."); } }
  async _getJsonFast(url, stage) { const body = await this._getTextFast(url, { "Accept": "application/json" }, stage); try { return JSON.parse(body); } catch (_) { throw new Error("toki 만화 " + stage + " 응답 형식이 올바르지 않습니다."); } }
  _withQuery(base, path, pairs) { const query = []; for (const pair of pairs) if (pair && pair.length > 1 && this._text(pair[1]) !== "") query.push(encodeURIComponent(pair[0]) + "=" + encodeURIComponent(this._text(pair[1]))); return this._trimSlash(base) + path + (q
