const mangayomiSources = [{
  name: "11toon \uB9CC\uD654",
  lang: "ko",
  baseUrl: "https://11toon.com",
  apiUrl: "",
  iconUrl: "http://127.0.0.1:18779/icon/ko.toon11.png",
  typeSource: "single",
  itemType: 0,
  isNsfw: true,
  hasCloudflare: false,
  version: "0.1.12",
  dateFormat: "yyyy.MM.dd",
  dateFormatLocale: "ko_KR",
  pkgPath: "manga/src/ko/toon11.js"
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
    const parseTime = function(value) {
      if (!value) return null;
      const time = Date.parse(String(value));
      return Number.isFinite(time) ? time : null;
    };
    const now = Date.now(), startsAt = parseTime(data.startsAt), endsAt = parseTime(data.endsAt);
    if (startsAt !== null && now < startsAt) return null;
    if (endsAt !== null && now >= endsAt) return null;
    const imageUrl = String(data.imageUrl || data.image || "").trim();
    if (!/^https:\/\//i.test(imageUrl)) return null;
    const revision = String(data.revision || "").trim();
    return {
      name: String(data.name || data.title || "특별 이벤트").trim(),
      imageUrl: imageUrl + (revision ? (imageUrl.indexOf("?") >= 0 ? "&" : "?") + "revision=" + encodeURIComponent(revision) : "")
    };
  } catch (_) {
    return null;
  }
}

function dcApplySiteOrderEpisodeNumbers(detail) {
  if (!detail || typeof detail !== "object") return detail;
  const items = Array.isArray(detail.episodes) ? detail.episodes : (Array.isArray(detail.chapters) ? detail.chapters : []);
  if (!items.length) return detail;
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (!item || typeof item !== "object") continue;
    const originalName = String(item.name == null ? "" : item.name).trim() || "재생";
    item.name = String(items.length - index) + "화 .  " + originalName;
  }
  detail.episodes = items;
  detail.chapters = items;
  return detail;
}

class DefaultExtension extends MProvider {
  constructor() {
    super();
    const originalGetDetail = DefaultExtension.prototype.getDetail.bind(this);
    this.getDetail = async (url) => dcApplySiteOrderEpisodeNumbers(await originalGetDetail(url));
    this.signalUrl = "https://wankyo83.github.io/tokki-traffic-light/domains.json";
    this.fallbackBaseUrl = "https://11toon.com";
    this.userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
    this.imageAccept = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";
    this.popularCardUrl = "https://dc-toki-mangayomi-manga.pages.dev/card/toon11-daily-100.gif";
    this.latestCardUrl = "https://dc-toki-mangayomi-manga.pages.dev/card/toon11-hot-new.gif";
    this.popularRulePreference = "toon11_popular_rule_v1";
    this.latestRulePreference = "toon11_latest_rule_v1";
    this.chapterPageCacheRevision = "0112";
    this.latestGenres = ["", "SF", "무협", "TS", "개그", "드라마", "러브코미디", "먹방", "백합", "붕탁", "스릴러", "스포츠", "시대", "액션", "순정", "일상 치유", "추리", "판타지", "학원", "호러", "BL", "17", "이세계", "전생", "라노벨", "애니화", "TL", "공포", "하렘", "요리"];
    this.rankedGenres = ["", "BL", "러브코미디", "17", "판타지", "순정", "드라마", "학원", "게임", "SF", "스릴러", "먹방", "TS", "스포츠", "이세계", "추리", "일상", "라노벨", "백합", "시대", "애니화", "전생", "붕탁", "무협", "호러", "공포"];
    this.zipTypes = ["", "todayhit", "isover"];
    this.pageStates = {};
    this.requestSequence = 0;
  }

  _text(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  _trimSlash(value) {
    return this._text(value).trim().replace(/\/+$/, "");
  }

  _preference(key, fallback) {
    try {
      const value = new SharedPreferences().get(key);
      return value === null || value === undefined ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  _preferenceString(key, fallback) {
    try {
      const value = new SharedPreferences().getString(key, fallback);
      return value === null || value === undefined ? fallback : this._text(value);
    } catch (_) {
      return fallback;
    }
  }

  _driveDirect(url, image) {
    const source = this._text(url).trim();
    const match = source.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    return match ? "https://drive.google.com/uc?export=" + (image ? "view" : "download") + "&id=" + match[1] : source;
  }

  async _customCardUrl(slug) {
    const source = this._text(this._preference("toon11_custom_card_json_url", "")).trim();
    if (!source) return "";
    const preferences = new SharedPreferences();
    const cacheKey = "toon11_custom_card_cache", sourceKey = cacheKey + "_source", timeKey = cacheKey + "_time";
    let data = null, cached = "";
    if (this._preferenceString(sourceKey, "") === source) cached = this._preferenceString(cacheKey, "");
    const cachedAt = Number(this._preferenceString(timeKey, "0"));
    if (cached && cachedAt > 0 && Date.now() - cachedAt < 5 * 60 * 1000) { try { data = JSON.parse(cached); } catch (_) {} }
    if (!data) {
      try {
        const direct = this._driveDirect(source, false), join = direct.indexOf("?") >= 0 ? "&" : "?", requestUrl = direct + join + "card_json=" + Date.now();
        let body = "";
        for (const options of [{ persistentConnection: false, noProxy: true, timeout: 15, connectTimeout: 8 }, { useDartHttpClient: true, persistentConnection: false }]) { try { const response = await new Client(options).get(requestUrl, { "Accept": "application/json", "Cache-Control": "no-cache" }); if (response.statusCode >= 200 && response.statusCode < 300) { body = response.body; break; } } catch (_) {} }
        if (!body) throw new Error("커스텀 목록 카드 JSON을 불러오지 못했습니다.");
        data = JSON.parse(body); preferences.setString(cacheKey, JSON.stringify(data)); preferences.setString(sourceKey, source); preferences.setString(timeKey, String(Date.now()));
      } catch (_) { if (cached) { try { data = JSON.parse(cached); } catch (_) {} } }
    }
    if (!data || typeof data !== "object") return "";
    const cards = data.cards && typeof data.cards === "object" ? data.cards : {};
    let image = this._text(cards[slug] || data.default || data.card).trim();
    if (!image) return "";
    image = this._driveDirect(image, true);
    if (data.revision !== undefined && this._text(data.revision).trim()) image += (image.indexOf("?") >= 0 ? "&" : "?") + "revision=" + encodeURIComponent(this._text(data.revision));
    return image;
  }

  _koreaWeekdaySlug() {
    return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDay()];
  }

  _defaultPopularRule() {
    return { listType: 3, latestGenre: "", rankedGenre: "", zipType: "" };
  }

  _defaultLatestRule() {
    return { listType: 4, latestGenre: "", rankedGenre: "", zipType: "" };
  }

  _normalizeRule(rule, fallback) {
    const base = fallback || this._defaultLatestRule();
    const source = rule || {};
    const listType = Number(source.listType);
    if (!Number.isInteger(listType) || listType < 0 || listType > 4) {
      return this._normalizeRule(base, this._defaultLatestRule());
    }
    const normalized = { listType: listType, latestGenre: "", rankedGenre: "", zipType: "" };
    if (listType === 0) {
      const genre = this._text(source.latestGenre);
      normalized.latestGenre = this.latestGenres.indexOf(genre) >= 0 ? genre : "";
    } else if (listType === 1 || listType === 2) {
      const genre = this._text(source.rankedGenre);
      normalized.rankedGenre = this.rankedGenres.indexOf(genre) >= 0 ? genre : "";
    } else if (listType === 4) {
      const zipType = this._text(source.zipType);
      normalized.zipType = this.zipTypes.indexOf(zipType) >= 0 ? zipType : "";
    }
    return normalized;
  }

  _encodeRule(rule) {
    const normalized = this._normalizeRule(rule, this._defaultLatestRule());
    return [normalized.listType, normalized.latestGenre, normalized.rankedGenre, normalized.zipType].join("|");
  }

  _decodeRule(value, fallback) {
    const parts = this._text(value).split("|");
    if (parts.length !== 4 || !/^\d+$/.test(parts[0])) return this._normalizeRule(fallback, this._defaultLatestRule());
    return this._normalizeRule({
      listType: Number(parts[0]),
      latestGenre: parts[1],
      rankedGenre: parts[2],
      zipType: parts[3]
    }, fallback);
  }

  _savedRule(key, fallback) {
    return this._decodeRule(this._preferenceString(key, ""), fallback);
  }

  _ruleEquals(first, second) {
    return this._encodeRule(first) === this._encodeRule(second);
  }

  _ruleSummary(rule) {
    const normalized = this._normalizeRule(rule, this._defaultLatestRule());
    const genreName = function(value) { return value ? (value === "일상 치유" ? "일상+치유" : value) : "전체"; };
    if (normalized.listType === 0) return "최신만화 / " + genreName(normalized.latestGenre);
    if (normalized.listType === 1) return "인기만화 / " + genreName(normalized.rankedGenre);
    if (normalized.listType === 2) return "완결만화 / " + genreName(normalized.rankedGenre);
    if (normalized.listType === 3) return "매일 추천 100";
    const zipNames = { "": "핫신작", "todayhit": "매일 TOP 35", "isover": "완결" };
    return "요청 Zip / " + zipNames[normalized.zipType];
  }

  _applyTabRuleAction(page, filters, rule) {
    if (Number(page) !== 1) return;
    const action = Number(this._filterValue(filters, "tabRuleAction", "0"));
    const preferences = new SharedPreferences();
    if (action === 1) preferences.setString(this.popularRulePreference, this._encodeRule(rule));
    else if (action === 2) preferences.setString(this.latestRulePreference, this._encodeRule(rule));
    else if (action === 3) preferences.setString(this.popularRulePreference, "");
    else if (action === 4) preferences.setString(this.latestRulePreference, "");
    else if (action === 5) {
      preferences.setString(this.popularRulePreference, "");
      preferences.setString(this.latestRulePreference, "");
    }
  }

  _isAllowedBaseUrl(value) {
    return /^https:\/\/(?:www\.)?11toon\d*\.com\/?$/i.test(this._text(value).trim());
  }

  async _resolveBaseUrl() {
    const manual = this._text(this._preference("toon11_domain_url", "")).trim();
    if (this._isAllowedBaseUrl(manual)) return this._trimSlash(manual);
    try {
      const response = await new Client({ useDartHttpClient: true, persistentConnection: false }).get(this.signalUrl, {
        "User-Agent": this.userAgent,
        "Accept": "application/json",
        "Cache-Control": "no-cache"
      });
      if (response.statusCode >= 200 && response.statusCode < 300) {
        const data = JSON.parse(response.body);
        const candidate = data && data.domains && data.domains["11toon"]
          ? data.domains["11toon"].baseUrl
          : "";
        if (this._isAllowedBaseUrl(candidate)) return this._trimSlash(candidate);
      }
    } catch (_) {}
    const configured = this.source && this.source.baseUrl ? this.source.baseUrl : "";
    return this._isAllowedBaseUrl(configured) ? this._trimSlash(configured) : this.fallbackBaseUrl;
  }

  _origin(value) {
    const match = this._text(value).match(/^(https?:\/\/[^/]+)/i);
    return match ? match[1] : "";
  }

  _relativePath(value) {
    let raw = this._text(value).trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) raw = raw.replace(/^https?:\/\/[^/]+/i, "");
    if (!raw.startsWith("/")) raw = "/" + raw;
    return raw;
  }

  _absoluteUrl(base, value) {
    const raw = this._text(value).trim();
    if (!raw) return "";
    if (raw.startsWith("//")) return "https:" + raw;
    if (/^https?:\/\//i.test(raw)) {
      if (/^https?:\/\/(?:www\.)?11toon\d*\.com/i.test(raw)) return base + this._relativePath(raw);
      return raw;
    }
    return base + this._relativePath(raw);
  }

  _withQuery(base, path, pairs) {
    const query = [];
    for (const pair of pairs) {
      if (!pair || pair.length < 2 || this._text(pair[1]) === "") continue;
      query.push(encodeURIComponent(pair[0]) + "=" + encodeURIComponent(this._text(pair[1])));
    }
    return base + path + (query.length ? "?" + query.join("&") : "");
  }

  _queryParam(value, name) {
    const match = this._text(value).match(new RegExp("[?&]" + name + "=([^&#'\\\"]*)", "i"));
    if (!match) return "";
    try { return decodeURIComponent(match[1].replace(/\+/g, " ")); } catch (_) { return match[1]; }
  }

  _safeUrl(value) {
    return this._text(value).replace(/([?&](?:stx)=)[^&#]*/gi, "$1***");
  }

  _failureCode(response, cause) {
    const status = response && response.statusCode ? Number(response.statusCode) : 0;
    if (status) return "HTTP" + status;
    const text = this._text(cause && (cause.message || cause));
    if (/10054|ECONNRESET|ConnectionReset|connection reset/i.test(text)) return "RESET";
    if (/timed?\s*out|timeout/i.test(text)) return "TIMEOUT";
    if (/certificate|handshake|TLS|SSL/i.test(text)) return "TLS";
    return "NETWORK";
  }

  _isChallenge(body) {
    const text = this._text(body);
    return /cdn-cgi\/challenge-platform|cf-c
