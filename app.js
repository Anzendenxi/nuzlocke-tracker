(function () {
  "use strict";

  const STORAGE_KEY = "nuzlocke-tracker-v1";
  const PLACEHOLDER_SPRITE = "assets/sprites/placeholder.svg";
  const SPRITE_DIR = "assets/sprites/";
  const ITEM_ASSETS_DIR = "assets/items/";

  const NATURE_STAT_SHORT_ES = {
    hp: "PS",
    atk: "Ata",
    def: "Def",
    spa: "A. Esp.",
    spd: "D. Esp.",
    spe: "Vel",
  };

  /** Spanish names (in-game style) — values stay English keys in save data. */
  const NATURE_NAMES_ES = {
    hardy: "Fuerte",
    lonely: "Huraña",
    brave: "Audaz",
    adamant: "Firme",
    naughty: "Pícara",
    bold: "Osada",
    docile: "Dócil",
    relaxed: "Plácida",
    impish: "Agitada",
    lax: "Floja",
    timid: "Miedosa",
    hasty: "Activa",
    serious: "Seria",
    jolly: "Alegre",
    naive: "Ingenua",
    modest: "Modesta",
    mild: "Afable",
    quiet: "Mansa",
    bashful: "Tímida",
    rash: "Alocada",
    calm: "Serena",
    gentle: "Amable",
    sassy: "Grosera",
    careful: "Cauta",
    quirky: "Única",
  };

  const STAT_LABELS_CARD_ES = [
    ["hp", "PS"],
    ["atk", "Ata"],
    ["def", "Def"],
    ["spa", "A.Esp."],
    ["spd", "D.Esp."],
    ["spe", "Vel"],
  ];

  const STAT_LABELS_DETAIL_ES = [
    ["hp", "PS"],
    ["atk", "Ataque"],
    ["def", "Defensa"],
    ["spa", "At. Esp."],
    ["spd", "Def. Esp."],
    ["spe", "Velocidad"],
  ];

  const ALL_TYPES = [
    "normal",
    "fire",
    "water",
    "electric",
    "grass",
    "ice",
    "fighting",
    "poison",
    "ground",
    "flying",
    "psychic",
    "bug",
    "rock",
    "ghost",
    "dragon",
    "dark",
    "steel",
    "fairy",
  ];

  /** Display labels for type filter (values remain English slugs in data). */
  const TYPE_LABELS_ES = {
    normal: "Normal",
    fire: "Fuego",
    water: "Agua",
    electric: "Eléctrico",
    grass: "Planta",
    ice: "Hielo",
    fighting: "Lucha",
    poison: "Veneno",
    ground: "Tierra",
    flying: "Volador",
    psychic: "Psíquico",
    bug: "Bicho",
    rock: "Roca",
    ghost: "Fantasma",
    dragon: "Dragón",
    dark: "Siniestro",
    steel: "Acero",
    fairy: "Hada",
  };

  /** Damage category for moves; status moves do not use the type chart for STAB/super-effective damage. */
  const MOVE_CATEGORY_LABELS = {
    physical: "Physical",
    special: "Special",
    status: "Status",
  };

  const NATURES = JSON.parse(
    document.getElementById("embed-natures").textContent
  );
  const TYPE_CHART = JSON.parse(
    document.getElementById("embed-type-chart").textContent
  );

  /** "defend" = fixed defender, list attack types. "attack" = fixed move type, list defending typings. */
  let matchupMode = "defend";

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function defaultState() {
    const pid = uuid();
    return {
      players: [{ id: pid, name: "Player 1" }],
      pokemon: [],
      teams: { [pid]: [null, null, null, null, null, null] },
      activePlayerId: pid,
      itemCatalog: [],
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const data = JSON.parse(raw);
      if (!data.players?.length) return defaultState();
      data.players.forEach((p) => {
        if (!data.teams[p.id]) {
          data.teams[p.id] = [null, null, null, null, null, null];
        }
        while (data.teams[p.id].length < 6) data.teams[p.id].push(null);
        data.teams[p.id] = data.teams[p.id].slice(0, 6);
      });
      if (!data.activePlayerId || !data.players.find((p) => p.id === data.activePlayerId)) {
        data.activePlayerId = data.players[0].id;
      }
      if (!Array.isArray(data.itemCatalog)) data.itemCatalog = [];
      let statusPersist = false;
      data.pokemon.forEach((mon) => {
        const prevStatus = mon.status;
        mon.status = normalizeMonStatus(mon.status);
        if (prevStatus !== mon.status) statusPersist = true;
        if (!mon.types || !mon.types.length) mon.types = ["normal"];
        if (!mon.moves || !Array.isArray(mon.moves)) {
          mon.moves = [
            { name: "", type: "", category: "physical" },
            { name: "", type: "", category: "physical" },
            { name: "", type: "", category: "physical" },
            { name: "", type: "", category: "physical" },
          ];
        }
        while (mon.moves.length < 4) {
          mon.moves.push({ name: "", type: "", category: "physical" });
        }
        mon.moves = mon.moves.slice(0, 4);
        if (!mon.stats) mon.stats = {};
        ["hp", "atk", "def", "spa", "spd", "spe"].forEach((k) => {
          if (mon.stats[k] == null) mon.stats[k] = "";
        });
      });
      if (statusPersist) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (_) {
          /* ignore quota errors */
        }
      }
      return data;
    } catch {
      return defaultState();
    }
  }

  let state = loadState();

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function normalizeMoveCategory(cat) {
    const c = String(cat || "").toLowerCase();
    if (c === "special" || c === "status") return c;
    return "physical";
  }

  /** False for status moves — they are not super effective by type (no damage multiplier). */
  function moveUsesTypeChartForDamage(m) {
    return normalizeMoveCategory(m?.category) !== "status";
  }

  function moveCategoryTooltip(cat) {
    const c = normalizeMoveCategory(cat);
    const lab = MOVE_CATEGORY_LABELS[c];
    if (c === "status") {
      return `${lab} (not counted toward super-effective coverage)`;
    }
    return lab;
  }

  /** Legacy saves used "alive"; stored value is now "party". */
  function normalizeMonStatus(s) {
    if (s === "alive") return "party";
    if (s === "party" || s === "boxed" || s === "dead") return s;
    return "party";
  }

  function multiplier(attackType, defendType) {
    const row = TYPE_CHART[attackType];
    if (!row || defendType == null) return 1;
    const m = row[defendType];
    return m == null ? 1 : m;
  }

  function defenseMultiplier(attackType, pokemonTypes) {
    const types = (pokemonTypes || []).filter(Boolean);
    if (!types.length) return 1;
    return types.reduce((acc, t) => acc * multiplier(attackType, t), 1);
  }

  /** Maps combined defensive multiplier to filter tier id (string). */
  function matchupBucketKey(mult) {
    if (mult === 0 || mult < 1e-9) return "0";
    const r = Math.round(mult * 1000) / 1000;
    if (Math.abs(r - 4) < 0.01) return "4";
    if (Math.abs(r - 2) < 0.01) return "2";
    if (Math.abs(r - 1) < 0.01) return "1";
    if (Math.abs(r - 0.5) < 0.01) return "0.5";
    if (Math.abs(r - 0.25) < 0.01) return "0.25";
    return "1";
  }

  function formatMatchupMult(mult) {
    if (mult === 0 || mult < 1e-9) return "×0";
    const r = Math.round(mult * 1000) / 1000;
    if (Math.abs(r - 4) < 0.01) return "×4";
    if (Math.abs(r - 2) < 0.01) return "×2";
    if (Math.abs(r - 1) < 0.01) return "×1";
    if (Math.abs(r - 0.5) < 0.01) return "×0.5";
    if (Math.abs(r - 0.25) < 0.01) return "×0.25";
    return `×${r}`;
  }

  function tierCellClass(key) {
    if (key === "0.5") return "05";
    if (key === "0.25") return "025";
    return key;
  }

  function typingLabel(types) {
    return types
      .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
      .join(" / ");
  }

  function typeNameEn(slug) {
    if (!slug) return "";
    return String(slug).charAt(0).toUpperCase() + String(slug).slice(1);
  }

  function fillMatchupSelects() {
    const opts = ALL_TYPES.map(
      (t) =>
        `<option value="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</option>`
    ).join("");
    const m1 = $("#mm-type1");
    const m2 = $("#mm-type2");
    const atkEl = $("#mm-attack-type");
    if (!m1 || !m2) return;
    m1.innerHTML = opts;
    m2.innerHTML =
      `<option value="">— None (mono-type) —</option>` + opts;
    m1.value = "normal";
    m2.value = "";
    if (atkEl && atkEl.tagName === "INPUT") {
      atkEl.value = "normal";
    }
  }

  function syncMmModeUi() {
    const defend = matchupMode === "defend";
    const dc = $("#mm-defend-controls");
    const ac = $("#mm-attack-controls");
    const hd = $("#mm-hint-defend");
    const ha = $("#mm-hint-attack");
    if (dc) dc.hidden = !defend;
    if (ac) ac.hidden = defend;
    if (hd) hd.hidden = !defend;
    if (ha) ha.hidden = defend;
    $$(".mm-mode-btn").forEach((b) => {
      const on = b.dataset.mmMode === matchupMode;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function renderMatchupTable() {
    const results = $("#mm-results");
    const summary = $("#mm-summary");
    if (!results || !summary) return;

    const visible = new Set(
      $$(".mm-tier:checked").map((cb) => cb.dataset.tier)
    );

    const ORDER = ["4", "2", "1", "0.5", "0.25", "0"];

    const tierTitles = {
      "4": "×4 — doubly super effective",
      "2": "×2 — super effective",
      "1": "×1 — neutral",
      "0.5": "×0.5 — not very effective",
      "0.25": "×0.25 — doubly resisted",
      "0": "×0 — no effect (immune)",
    };

    const multTagClass = {
      "4": "mult-4",
      "2": "mult-2",
      "1": "mult-1",
      "0.5": "mult-05",
      "0.25": "mult-025",
      "0": "mult-0",
    };

    const buckets = {
      "4": [],
      "2": [],
      "1": [],
      "0.5": [],
      "0.25": [],
      "0": [],
    };

    if (matchupMode === "defend") {
      const m1 = $("#mm-type1");
      const m2 = $("#mm-type2");
      if (!m1 || !m2) return;

      let t1 = m1.value;
      let t2 = (m2.value || "").trim();
      if (t2 === t1) t2 = "";
      const defendTypes = t2 ? [t1, t2] : [t1];

      const labels = defendTypes.map(
        (t) => t.charAt(0).toUpperCase() + t.slice(1)
      );
      summary.innerHTML = `You defend: <span class="type-icons">${typeIconsHtml(defendTypes)}</span> <strong>${labels.join(" / ")}</strong> — damage from each <em>incoming</em> move type`;

      for (const atk of ALL_TYPES) {
        const m = defenseMultiplier(atk, defendTypes);
        const key = matchupBucketKey(m);
        buckets[key].push({ sortKey: atk, m, renderDefend: true, atk });
      }
      ORDER.forEach((k) => {
        buckets[k].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
      });
    } else {
      const atkEl = $("#mm-attack-type");
      if (!atkEl) return;
      const atk = atkEl.value || "normal";
      const atkName = atk.charAt(0).toUpperCase() + atk.slice(1);
      summary.innerHTML = `You attack with: ${typeIconImg(atk)} <strong>${atkName}</strong> — vs each <em>single</em> defending type`;

      for (const defT of ALL_TYPES) {
        const m = defenseMultiplier(atk, [defT]);
        const key = matchupBucketKey(m);
        const label = typingLabel([defT]);
        buckets[key].push({
          sortKey: defT,
          m,
          renderDefend: false,
          types: [defT],
          label,
        });
      }
      ORDER.forEach((k) => {
        buckets[k].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
      });
    }

    let html = "";
    for (const tier of ORDER) {
      if (!visible.has(tier)) continue;
      const items = buckets[tier];
      if (!items.length) continue;
      const tc = tierCellClass(tier);
      html += `<div class="mm-tier-block"><h3><span class="mult-tag ${multTagClass[tier]}">${tierTitles[tier]}</span></h3><div class="mm-tier-grid">`;
      for (const item of items) {
        if (item.renderDefend) {
          const name =
            item.atk.charAt(0).toUpperCase() + item.atk.slice(1);
          html += `<div class="mm-cell tier-${tc}" title="Incoming move type: ${escapeAttr(name)}">${typeIconImg(item.atk)}<span class="mm-atk-name">${escapeAttr(name)}</span><span class="mm-mult">${formatMatchupMult(item.m)}</span></div>`;
        } else {
          html += `<div class="mm-cell mm-defender-cell tier-${tc}" title="Defending typing: ${escapeAttr(item.label)}"><span class="type-icons">${typeIconsHtml(item.types)}</span><span class="mm-atk-name">${escapeAttr(item.label)}</span><span class="mm-mult">${formatMatchupMult(item.m)}</span></div>`;
        }
      }
      html += `</div></div>`;
    }

    results.innerHTML =
      html ||
      `<p class="empty-state">No multiplier groups visible — turn on at least one filter above.</p>`;
  }

  /** Type icons: PNG only, one file per slug under assets/types/. */
  function typeIconImg(typeSlug, opts) {
    opts = opts || {};
    if (!typeSlug || !ALL_TYPES.includes(typeSlug)) return "";
    const label =
      TYPE_LABELS_ES[typeSlug] ||
      typeSlug.charAt(0).toUpperCase() + typeSlug.slice(1);
    const w = opts.width !== undefined ? opts.width : 28;
    const h = opts.height !== undefined ? opts.height : 28;
    const cls = opts.className !== undefined ? opts.className : "type-icon";
    const src = `assets/types/${typeSlug}.png`;
    return `<img class="${escapeAttr(cls)}" src="${escapeAttr(src)}" width="${w}" height="${h}" alt="${escapeAttr(label)}" title="${escapeAttr(label)}" loading="lazy" />`;
  }

  function typeIconsHtml(types) {
    return (types || [])
      .filter(Boolean)
      .map((t) => typeIconImg(t))
      .join("");
  }

  function updateMvTypeThumbWrap(wrapEl, typeSlug) {
    if (!wrapEl) return;
    wrapEl.classList.remove("mv-type-thumb-empty");
    if (!typeSlug || !ALL_TYPES.includes(typeSlug)) {
      wrapEl.classList.add("mv-type-thumb-empty");
      wrapEl.innerHTML = '<span class="mv-type-thumb-ph"></span>';
      wrapEl.removeAttribute("title");
      return;
    }
    wrapEl.innerHTML = typeIconImg(typeSlug, { width: 22, height: 22 });
    wrapEl.title = TYPE_LABELS_ES[typeSlug] || typeSlug;
  }

  function moveTypeStripInnerHtml(includeNoneOption) {
    const parts = [];
    if (includeNoneOption) {
      parts.push(
        `<button type="button" class="mv-type-pick mv-type-none" data-type="" title="No type" aria-label="No type">—</button>`
      );
    }
    parts.push(
      ALL_TYPES.map((t) => {
        const lab = TYPE_LABELS_ES[t] || t;
        return `<button type="button" class="mv-type-pick" data-type="${escapeAttr(t)}" title="${escapeAttr(lab)}" aria-label="${escapeAttr(lab)}">${typeIconImg(t, { width: 20, height: 20, className: "type-icon" })}</button>`;
      }).join("")
    );
    return parts.join("");
  }

  function wireMoveRowUis() {
    if (!pfMoves) return;
    $$(".move-row", pfMoves).forEach((row) => {
      const hidden = $(".mv-type", row);
      const thumbSlot = $(".mv-type-thumb-slot", row);
      if (!hidden || !thumbSlot) return;
      const syncThumbAndPicks = () => {
        updateMvTypeThumbWrap(thumbSlot, hidden.value);
        $$(".mv-type-pick", row).forEach((b) =>
          b.classList.toggle(
            "selected",
            (b.dataset.type || "") === (hidden.value || "")
          )
        );
      };
      $$(".mv-type-pick", row).forEach((btn) => {
        btn.addEventListener("click", () => {
          hidden.value = btn.dataset.type || "";
          syncThumbAndPicks();
        });
      });
      syncThumbAndPicks();

      const catHidden = $(".mv-category", row);
      if (catHidden) {
        const syncCats = () => {
          const v = normalizeMoveCategory(catHidden.value);
          catHidden.value = v;
          $$(".mv-cat-pick", row).forEach((b) => {
            const on = (b.dataset.category || "") === v;
            b.classList.toggle("selected", on);
            b.setAttribute("aria-pressed", on ? "true" : "false");
          });
        };
        $$(".mv-cat-pick", row).forEach((btn) => {
          btn.addEventListener("click", () => {
            catHidden.value = normalizeMoveCategory(btn.dataset.category);
            syncCats();
          });
        });
        syncCats();
      }
    });
  }

  function wireMmAttackTypePicker() {
    const strip = $("#mm-attack-strip");
    const input = $("#mm-attack-type");
    const thumb = $("#mm-attack-thumb");
    if (!strip || !input || !thumb) return;
    strip.innerHTML = moveTypeStripInnerHtml(false);
    const sync = () => {
      updateMvTypeThumbWrap(thumb, input.value);
      $$(".mv-type-pick", strip).forEach((b) =>
        b.classList.toggle("selected", b.dataset.type === input.value)
      );
    };
    $$(".mv-type-pick", strip).forEach((btn) => {
      btn.addEventListener("click", () => {
        input.value = btn.dataset.type || "normal";
        sync();
        renderMatchupTable();
      });
    });
    sync();
  }

  function getSpriteManifest() {
    const m = typeof window !== "undefined" && window.__SPRITE_MANIFEST;
    return Array.isArray(m) ? m : [];
  }

  function normalizeSpeciesToSpriteKey(species) {
    return String(species || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  /** Best-effort match to game export filenames (e.g. CHARIZARD.png). */
  function guessSpritePathFromSpecies(species) {
    const raw = String(species || "").trim();
    if (!raw) return "";
    const files = getSpriteManifest();
    if (!files.length) return "";

    const keys = new Set();
    keys.add(normalizeSpeciesToSpriteKey(raw));
    const lower = raw.toLowerCase().replace(/[.'’]/g, "");
    keys.add(
      lower
        .replace(/\s+/g, "")
        .replace(/[^a-z0-9]/g, "")
        .toUpperCase()
    );
    keys.add(
      lower
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-/g, "")
        .toUpperCase()
    );
    keys.delete("");

    for (const key of keys) {
      if (!key) continue;
      const matches = files.filter((f) => {
        const b = f.replace(/\.png$/i, "");
        return b === key || b.startsWith(key + "_");
      });
      if (!matches.length) continue;
      matches.sort((a, b) => {
        const ba = a.replace(/\.png$/i, "");
        const bb = b.replace(/\.png$/i, "");
        if (ba === key && bb !== key) return -1;
        if (bb === key && ba !== key) return 1;
        return a.localeCompare(b);
      });
      return SPRITE_DIR + matches[0];
    }
    return "";
  }

  function spriteSrc(mon) {
    const fromSpecies = guessSpritePathFromSpecies(mon.species);
    if (fromSpecies) return fromSpecies;
    const legacy = (mon.spriteUrl || "").trim();
    if (legacy) return legacy;
    return PLACEHOLDER_SPRITE;
  }

  function normalizeItemSearchKey(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function heldItemNameToAssetSlug(name) {
    const s = String(name || "").trim().toLowerCase();
    if (!s) return "";
    const ascii = s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return ascii
      .replace(/[''´`]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function getItemManifestFiles() {
    const m = typeof window !== "undefined" && window.__ITEM_MANIFEST;
    return Array.isArray(m) ? m : [];
  }

  /** Lowercase alphanum only — matches PokeAPI-style slugs to ALLCAPS filenames (e.g. choicescarf ↔ CHOICESCARF). */
  function itemStemCompactKey(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  let _itemCompactToExact = null;
  function getItemStemResolution() {
    if (_itemCompactToExact) return _itemCompactToExact;
    const m = new Map();
    for (const f of getItemManifestFiles()) {
      if (!/\.png$/i.test(f)) continue;
      const base = f.replace(/\.png$/i, "").trim();
      if (!base) continue;
      const ck = itemStemCompactKey(base);
      if (ck && !m.has(ck)) m.set(ck, base);
    }
    _itemCompactToExact = m;
    return m;
  }

  function getItemManifestCanonicalStems() {
    return [...new Set(getItemStemResolution().values())];
  }

  let _itemLocaleIndexes = null;
  function getItemLocaleIndexes() {
    if (_itemLocaleIndexes) return _itemLocaleIndexes;
    const esByEn =
      (typeof window !== "undefined" && window.__ITEM_NAMES_ES) || {};
    const enByEsNorm = new Map();
    for (const [enStem, esLabel] of Object.entries(esByEn)) {
      if (!enStem || esLabel == null) continue;
      const nk = normalizeItemSearchKey(String(esLabel));
      if (nk) enByEsNorm.set(nk, enStem);
    }
    _itemLocaleIndexes = { esByEn, enByEsNorm };
    return _itemLocaleIndexes;
  }

  function prettyItemStemLabel(stem) {
    const s = String(stem);
    if (s.includes("-")) {
      return s
        .split(/-/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    }
    const lower = s.toLowerCase();
    return lower ? lower.charAt(0).toUpperCase() + lower.slice(1) : "";
  }

  function esLabelForManifestStem(exactStem) {
    const { esByEn } = getItemLocaleIndexes();
    const ex = String(exactStem || "");
    const lower = ex.toLowerCase();
    if (esByEn[lower]) return esByEn[lower];
    if (esByEn[ex]) return esByEn[ex];
    const comp = itemStemCompactKey(ex);
    for (const [k, v] of Object.entries(esByEn)) {
      if (itemStemCompactKey(k) === comp) return v;
    }
    return "";
  }

  /** Resolves to real PNG base name (e.g. LEFTOVERS) for assets/items/{stem}.png */
  function resolveItemAssetStem(input) {
    const raw = String(input || "").trim();
    if (!raw) return "";
    const c2e = getItemStemResolution();
    const { enByEsNorm } = getItemLocaleIndexes();
    const n = normalizeItemSearchKey(raw);
    const slug = heldItemNameToAssetSlug(raw);

    const tryLookup = (cand) => {
      const c = itemStemCompactKey(cand);
      return c && c2e.has(c) ? c2e.get(c) : "";
    };

    if (c2e.size > 0) {
      const hit = tryLookup(slug) || tryLookup(raw);
      if (hit) return hit;
    }

    const fromEs = enByEsNorm.get(n);
    if (fromEs) {
      const hit = tryLookup(fromEs);
      if (hit) return hit;
    }

    if (c2e.size === 0) {
      const guess = tryLookup(slug);
      if (guess) return guess;
      return slug || "";
    }

    return "";
  }

  function canonicalItemMatchKey(input) {
    const raw = String(input || "").trim();
    if (!raw) return "";
    const resolved = resolveItemAssetStem(raw);
    if (resolved) return itemStemCompactKey(resolved);
    const n = normalizeItemSearchKey(raw);
    const fromEs = getItemLocaleIndexes().enByEsNorm.get(n);
    if (fromEs) return itemStemCompactKey(fromEs);
    return itemStemCompactKey(heldItemNameToAssetSlug(raw));
  }

  function itemCatalogSpriteUrl(name) {
    const stem = resolveItemAssetStem(name);
    if (!stem) return PLACEHOLDER_SPRITE;
    return ITEM_ASSETS_DIR + encodeURIComponent(stem) + ".png";
  }

  function itemDisplayNameForUi(stored) {
    const raw = String(stored || "").trim();
    if (!raw) return "";
    const exact = resolveItemAssetStem(raw);
    if (exact) {
      const lab = esLabelForManifestStem(exact);
      if (lab) return lab;
      return prettyItemStemLabel(exact) || raw;
    }
    const n = normalizeItemSearchKey(raw);
    const fromEsKey = getItemLocaleIndexes().enByEsNorm.get(n);
    if (fromEsKey) {
      const lab = esLabelForManifestStem(fromEsKey);
      if (lab) return lab;
    }
    return raw;
  }

  /**
   * One row per item: solo español con el nombre en inglés entre paréntesis (p. ej. Restos (Leftovers)).
   * Sin filas solo en inglés; el manifiesto solo aporta ítems que tengan entrada en __ITEM_NAMES_ES.
   */
  function buildItemNameDatalistInnerHtml() {
    const seenStem = new Set();
    const rows = [];

    const pushStemRowEs = (exactStem) => {
      const stem = String(exactStem || "").trim();
      if (!stem) return;
      const es = esLabelForManifestStem(stem);
      if (!es) return;
      const ck = itemStemCompactKey(stem);
      if (seenStem.has(ck)) return;
      seenStem.add(ck);
      const pretty = prettyItemStemLabel(stem);
      rows.push({
        value: es,
        label: `${es} (${pretty})`,
      });
    };

    const sortedCat = [...(state.itemCatalog || [])].sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), undefined, {
        sensitivity: "base",
      })
    );
    for (const it of sortedCat) {
      const raw = String(it.name || "").trim();
      if (!raw) continue;
      const exact = resolveItemAssetStem(raw);
      if (exact) {
        if (esLabelForManifestStem(exact)) {
          pushStemRowEs(exact);
        } else {
          const nk = normalizeItemSearchKey(raw);
          const key = `cat:${nk}`;
          if (seenStem.has(key)) continue;
          seenStem.add(key);
          const pretty = prettyItemStemLabel(exact);
          rows.push({
            value: raw,
            label: `${raw} (${pretty})`,
          });
        }
      } else {
        const nk = normalizeItemSearchKey(raw);
        const key = `custom:${nk}`;
        if (seenStem.has(key)) continue;
        seenStem.add(key);
        rows.push({ value: raw, label: raw });
      }
    }

    const { esByEn } = getItemLocaleIndexes();
    let stems = getItemManifestCanonicalStems().sort((a, b) =>
      a.localeCompare(b)
    );
    if (!stems.length) {
      stems = Object.keys(esByEn).sort((a, b) => a.localeCompare(b));
    }
    for (const stem of stems) pushStemRowEs(stem);

    rows.sort((a, b) =>
      a.label.localeCompare(b.label, "es", { sensitivity: "base" })
    );
    return rows
      .map(
        (r) =>
          `<option value="${escapeAttr(r.value)}">${escapeHtml(r.label)}</option>`
      )
      .join("");
  }

  function bindItemCatalogThumbFallback(img) {
    if (!img) return;
    img.onerror = () => {
      img.onerror = null;
      img.src = PLACEHOLDER_SPRITE;
    };
  }

  function natureDisplayNameEs(natureKey) {
    if (natureKey && NATURE_NAMES_ES[natureKey]) return NATURE_NAMES_ES[natureKey];
    if (natureKey) return natureKey.charAt(0).toUpperCase() + natureKey.slice(1);
    return NATURE_NAMES_ES.hardy;
  }

  function natureShortSummary(natureKey) {
    const n = NATURES[natureKey];
    if (!n || !n.plus || !n.minus) return "Neutro";
    const up = NATURE_STAT_SHORT_ES[n.plus] || n.plus;
    const dn = NATURE_STAT_SHORT_ES[n.minus] || n.minus;
    return `${up}↑ ${dn}↓`;
  }

  function statDetailLabelEs(statKey) {
    const row = STAT_LABELS_DETAIL_ES.find(([k]) => k === statKey);
    return row ? row[1] : statKey;
  }

  /** Plain Spanish sentence for nature effect (for team slots, parentheses). */
  function natureEffectDescriptionEs(natureKey) {
    const n = NATURES[natureKey];
    if (!n || !n.plus || !n.minus) return "sin cambios en las estadísticas";
    return `Aumenta ${statDetailLabelEs(n.plus)}, disminuye ${statDetailLabelEs(n.minus)}`;
  }

  function statNumeric(mon, key) {
    const v = mon.stats?.[key];
    if (v === "" || v == null) return -1;
    const n = Number(v);
    return Number.isFinite(n) ? n : -1;
  }

  function applySortAndTypeFilter(items, sortKey, typeFilter) {
    let out = [...items];
    if (typeFilter) {
      out = out.filter((p) => (p.types || []).includes(typeFilter));
    }
    if (sortKey) {
      out.sort((a, b) => statNumeric(b, sortKey) - statNumeric(a, sortKey));
    }
    return out;
  }

  function getPokemonTypesDb() {
    const d = typeof window !== "undefined" && window.__POKEMON_TYPES;
    return d && d.byName && typeof d.byName === "object" ? d : null;
  }

  /** Match species input to PokeAPI slug keys in data/pokemon-types.js */
  function lookupDexTypes(species) {
    const db = getPokemonTypesDb();
    if (!db) return null;
    const raw = String(species || "").trim().toLowerCase();
    if (!raw) return null;
    const noPunct = raw.replace(/[.'’]/g, "");
    const candidates = [
      raw.replace(/\s+/g, "-"),
      raw.replace(/\s+/g, ""),
      noPunct.replace(/\s+/g, "-"),
      noPunct.replace(/\s+/g, ""),
    ];
    for (const k of candidates) {
      if (!k) continue;
      const arr = db.byName[k];
      if (arr && arr.length) return arr;
    }
    return null;
  }

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  const playerSelect = $("#player-select");
  const rosterSearch = $("#roster-search");
  const filterBoxed = $("#filter-boxed");
  const rosterSortStat = $("#roster-sort-stat");
  const rosterFilterType = $("#roster-filter-type");
  const deadSortStat = $("#dead-sort-stat");
  const deadFilterType = $("#dead-filter-type");
  const rosterList = $("#roster-list");
  const deadList = $("#dead-list");
  const teamSlots = $("#team-slots");
  const teamWeakTable = $("#team-weak-table");
  const teamOffenseTable = $("#team-offense-table");
  const itemsCatalogList = $("#items-catalog-list");
  const itemsCatalogEditId = $("#items-catalog-edit-id");
  const itemsCatalogName = $("#items-catalog-name");
  const itemsCatalogDesc = $("#items-catalog-desc");
  const itemsCatalogSave = $("#items-catalog-save");
  const itemsCatalogCancelEdit = $("#items-catalog-cancel-edit");
  const itemsCatalogSearch = $("#items-catalog-search");
  const itemsCatalogNoBerries = $("#items-catalog-no-berries");
  const itemsCatalogNoMegas = $("#items-catalog-no-megas");
  const pfItem = $("#pf-item");
  const pfItemList = $("#pf-item-list");
  const pfItemCatalogHint = $("#pf-item-catalog-hint");
  const pfItemCatalogActions = $("#pf-item-catalog-actions");
  const pfItemAddCatalog = $("#pf-item-add-catalog");
  const pfItemEditCatalog = $("#pf-item-edit-catalog");
  const pfItemPreviewImg = $("#pf-item-preview-img");
  const welcomeModalRoot = $("#welcome-modal-root");
  const welcomePlayerName = $("#welcome-player-name");
  const welcomeOkBtn = $("#welcome-ok");
  const modalRoot = $("#modal-root");
  const pickModal = $("#pick-modal");
  const pickList = $("#pick-list");
  const pokemonForm = $("#pokemon-form");
  const pfId = $("#pf-id");
  const pfPlayer = $("#pf-player");
  const pfStatus = $("#pf-status");
  const pfSpecies = $("#pf-species");
  const pfNickname = $("#pf-nickname");
  const pfType1 = $("#pf-type1");
  const pfType2 = $("#pf-type2");
  const pfLevel = $("#pf-level");
  const pfAbility = $("#pf-ability");
  const pfNature = $("#pf-nature");
  const pfNatureEffect = $("#pf-nature-effect");
  const pfHp = $("#pf-hp");
  const pfAtk = $("#pf-atk");
  const pfDef = $("#pf-def");
  const pfSpa = $("#pf-spa");
  const pfSpd = $("#pf-spd");
  const pfSpe = $("#pf-spe");
  const pfMoves = $("#pf-moves");
  const pfLearnable = $("#pf-learnable");
  const pfDelete = $("#pf-delete");
  const modalTitle = $("#modal-title");

  let pickingSlotIndex = null;
  let speciesDexDebounce = null;

  function ensureSpeciesLeadingCapital() {
    if (!pfSpecies) return;
    const t = pfSpecies.value.trim();
    if (!t) {
      pfSpecies.value = "";
      return;
    }
    const lead = t.charAt(0);
    if (/^[a-z]$/.test(lead)) {
      pfSpecies.value = lead.toUpperCase() + t.slice(1);
    } else {
      pfSpecies.value = t;
    }
  }

  function applyTypesFromDexIfMatch() {
    if (!pfSpecies || !pfType1 || !pfType2) return;
    const types = lookupDexTypes(pfSpecies.value);
    if (!types || !types.length) return;
    const t1 = types[0];
    const t2 = types[1] || "";
    if (!ALL_TYPES.includes(t1)) return;
    pfType1.value = t1;
    pfType2.value = t2 && ALL_TYPES.includes(t2) ? t2 : "";
  }

  function syncSpeciesFieldFromDex() {
    ensureSpeciesLeadingCapital();
    applyTypesFromDexIfMatch();
  }

  function fillTypeSelects() {
    const opts = ALL_TYPES.map(
      (t) =>
        `<option value="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</option>`
    ).join("");
    pfType1.innerHTML = opts;
    pfType2.innerHTML = `<option value="">— None —</option>` + opts;
  }

  function fillNatureSelect() {
    pfNature.innerHTML = Object.keys(NATURES)
      .map((key) => {
        const tip = escapeAttr(natureShortSummary(key));
        const lab = escapeHtml(natureDisplayNameEs(key));
        return `<option value="${key}" title="${tip}">${lab}</option>`;
      })
      .join("");
  }

  function updateNatureEffect() {
    const key = pfNature.value;
    const n = NATURES[key];
    const short = natureShortSummary(key);
    if (pfNatureEffect) {
      pfNatureEffect.textContent =
        n && n.plus && n.minus
          ? short
          : `${short} — sin cambios de stats`;
      pfNatureEffect.title = short;
    }
    if (pfNature) pfNature.title = short;
  }

  function renderMoveRows(moves) {
    const m = moves && moves.length ? moves : [{ name: "", type: "", category: "physical" }];
    while (m.length < 4) m.push({ name: "", type: "", category: "physical" });
    const strip = moveTypeStripInnerHtml(true);
    pfMoves.innerHTML = [0, 1, 2, 3]
      .map((i) => {
        const mv = m[i] || { name: "", type: "", category: "physical" };
        const tv =
          mv.type && ALL_TYPES.includes(mv.type) ? mv.type : "";
        const cat = normalizeMoveCategory(mv.category);
        const catButtons = ["physical", "special", "status"]
          .map((ck) => {
            const lab = MOVE_CATEGORY_LABELS[ck];
            const sel = cat === ck ? " selected" : "";
            return `<button type="button" class="mv-cat-pick${sel}" data-category="${escapeAttr(ck)}" title="${escapeAttr(lab)}" aria-pressed="${cat === ck ? "true" : "false"}" aria-label="${escapeAttr(lab)}">${escapeHtml(lab)}</button>`;
          })
          .join("");
        return `<div class="move-row" data-move-i="${i}">
        <div class="move-name-block">
          <label>Movimiento ${i + 1}<input type="text" class="mv-name" value="${escapeAttr(mv.name)}" placeholder="Nombre del movimiento" /></label>
          <div class="move-category-block">
            <span class="mv-cat-label">Category</span>
            <div class="mv-cat-strip" role="group" aria-label="Move ${i + 1} category">${catButtons}</div>
            <input type="hidden" class="mv-category" value="${escapeAttr(cat)}" />
          </div>
        </div>
        <div class="move-type-block">
          <div class="move-type-head">
            <span class="mv-type-label">Type</span>
            <span class="mv-type-thumb-wrap mv-type-thumb-slot mv-type-thumb-empty"><span class="mv-type-thumb-ph"></span></span>
            <input type="hidden" class="mv-type" value="${escapeAttr(tv)}" />
          </div>
          <div class="mv-type-strip" role="group" aria-label="Move ${i + 1} type">${strip}</div>
        </div>
      </div>`;
      })
      .join("");
    wireMoveRowUis();
  }

  function escapeAttr(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function prettySpeciesSlugLabel(slug) {
    return String(slug)
      .split(/[-_]/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  /** Datalist from sprite filenames + Pokédex slugs (types DB). */
  function fillSpeciesDatalist() {
    const dl = $("#pf-species-list");
    if (!dl) return;
    const seen = new Set();
    const slugs = [];
    const pushSlug = (raw) => {
      const s = String(raw || "").trim().toLowerCase();
      if (!s || seen.has(s)) return;
      seen.add(s);
      slugs.push(s);
    };

    for (const f of getSpriteManifest()) {
      if (!/\.png$/i.test(f)) continue;
      const base = f.replace(/\.png$/i, "");
      if (/^\d+$/.test(base) || base.startsWith("_")) continue;
      pushSlug(base);
    }

    const db = getPokemonTypesDb();
    if (db && db.byName) {
      for (const k of Object.keys(db.byName)) pushSlug(k);
    }

    slugs.sort((a, b) => a.localeCompare(b));
    dl.innerHTML = slugs
      .map((slug) => {
        const lab = prettySpeciesSlugLabel(slug);
        return `<option value="${escapeAttr(slug)}">${escapeHtml(lab)}</option>`;
      })
      .join("");
  }

  function findItemCatalogByHeldName(name) {
    const q = String(name || "").trim();
    if (!q) return null;
    const qCanon = canonicalItemMatchKey(q);
    const qNorm = normalizeItemSearchKey(q);
    return state.itemCatalog.find((it) => {
      const n = String(it.name || "").trim();
      if (!n) return false;
      if (normalizeItemSearchKey(n) === qNorm) return true;
      const itCanon = canonicalItemMatchKey(n);
      return Boolean(qCanon && itCanon && qCanon === itCanon);
    });
  }

  function fillItemCatalogDatalist() {
    const html = buildItemNameDatalistInnerHtml();
    if (pfItemList) pfItemList.innerHTML = html;
    const itemsNameDl = $("#items-catalog-name-list");
    if (itemsNameDl) itemsNameDl.innerHTML = html;
  }

  function syncPfItemPreview() {
    if (!pfItemPreviewImg || !pfItem) return;
    const n = pfItem.value.trim();
    pfItemPreviewImg.src = itemCatalogSpriteUrl(n);
    bindItemCatalogThumbFallback(pfItemPreviewImg);
  }

  function syncItemCatalogHint() {
    if (pfItemCatalogHint && pfItem) {
      const entry = findItemCatalogByHeldName(pfItem.value);
      const desc = entry && String(entry.description || "").trim();
      if (desc) {
        pfItemCatalogHint.textContent = desc;
        pfItemCatalogHint.hidden = false;
      } else {
        pfItemCatalogHint.textContent = "";
        pfItemCatalogHint.hidden = true;
      }
    }
    syncPfItemCatalogActions();
    syncPfItemPreview();
  }

  function syncPfItemCatalogActions() {
    if (!pfItemCatalogActions || !pfItemAddCatalog || !pfItemEditCatalog || !pfItem) {
      return;
    }
    const v = pfItem.value.trim();
    if (!v) {
      pfItemCatalogActions.hidden = true;
      pfItemAddCatalog.hidden = true;
      pfItemEditCatalog.hidden = true;
      pfItemEditCatalog.removeAttribute("data-catalog-id");
      return;
    }
    const entry = findItemCatalogByHeldName(v);
    pfItemCatalogActions.hidden = false;
    if (entry) {
      pfItemAddCatalog.hidden = true;
      pfItemEditCatalog.hidden = false;
      pfItemEditCatalog.dataset.catalogId = entry.id;
    } else {
      pfItemAddCatalog.hidden = false;
      pfItemEditCatalog.hidden = true;
      pfItemEditCatalog.removeAttribute("data-catalog-id");
    }
  }

  function resetItemsCatalogForm() {
    if (itemsCatalogEditId) itemsCatalogEditId.value = "";
    if (itemsCatalogName) itemsCatalogName.value = "";
    if (itemsCatalogDesc) itemsCatalogDesc.value = "";
    if (itemsCatalogCancelEdit) itemsCatalogCancelEdit.hidden = true;
    const ft = $("#items-catalog-form-title");
    if (ft) ft.textContent = "Add item";
    if (itemsCatalogSave) itemsCatalogSave.textContent = "Save item";
  }

  function catalogItemStemUpperForFilter(it) {
    const raw = String(it.name || "").trim();
    if (!raw) return "";
    const ex = resolveItemAssetStem(raw);
    if (ex) return String(ex).toUpperCase();
    return heldItemNameToAssetSlug(raw).replace(/-/g, "").toUpperCase();
  }

  function catalogItemIsBerry(it) {
    const s = catalogItemStemUpperForFilter(it);
    if (s.endsWith("BERRY")) return true;
    const blob = normalizeItemSearchKey(
      `${it.name || ""} ${it.description || ""}`
    );
    return /\bbaya\b/.test(blob);
  }

  function catalogItemIsMegastone(it) {
    const s = catalogItemStemUpperForFilter(it);
    if (!s || s.endsWith("BERRY")) return false;
    if (/(ITEX|ITEY|ITEZ)$/i.test(s)) return true;
    if (s.endsWith("ITE") && s.length > 4) return true;
    return false;
  }

  function catalogItemMatchesItemsSearch(it, query) {
    const rawQ = String(query || "").trim();
    if (!rawQ) return true;
    const nameUi = itemDisplayNameForUi(it.name || "");
    const hay = normalizeItemSearchKey(`${it.name || ""} ${nameUi}`);
    const parts = normalizeItemSearchKey(rawQ)
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return true;
    return parts.every((p) => hay.includes(p));
  }

  function beginEditCatalogItem(id, options) {
    const it = state.itemCatalog.find((x) => x.id === id);
    if (!it) return;
    if (itemsCatalogEditId) itemsCatalogEditId.value = id;
    if (itemsCatalogName) itemsCatalogName.value = it.name || "";
    if (itemsCatalogDesc) itemsCatalogDesc.value = it.description || "";
    if (itemsCatalogCancelEdit) itemsCatalogCancelEdit.hidden = false;
    const ft = $("#items-catalog-form-title");
    if (ft) ft.textContent = "Edit item";
    if (itemsCatalogSave) itemsCatalogSave.textContent = "Update item";
    if (!options?.skipFocus) {
      itemsCatalogName?.focus();
    }
  }

  function renderItemCatalogPanel() {
    if (!itemsCatalogList) return;
    const base = [...(state.itemCatalog || [])].sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), undefined, {
        sensitivity: "base",
      })
    );
    if (!base.length) {
      itemsCatalogList.innerHTML = `<p class="empty-state">No hay objetos aún. Añade nombres y descripciones arriba; aparecerán como sugerencias al equipar un objeto.</p>`;
      return;
    }
    const q = itemsCatalogSearch?.value?.trim() || "";
    const noBerries = Boolean(itemsCatalogNoBerries?.checked);
    const noMegas = Boolean(itemsCatalogNoMegas?.checked);
    let items = base.filter((it) => {
      if (noBerries && catalogItemIsBerry(it)) return false;
      if (noMegas && catalogItemIsMegastone(it)) return false;
      return true;
    });
    items = items.filter((it) => catalogItemMatchesItemsSearch(it, q));
    if (!items.length) {
      itemsCatalogList.innerHTML = `<p class="empty-state">Ningún objeto coincide con la búsqueda o los filtros activos.</p>`;
      return;
    }
    itemsCatalogList.innerHTML = items
      .map((it) => {
        const desc = String(it.description || "").trim();
        const descHtml = desc
          ? escapeHtml(desc)
          : `<span class="muted">No description</span>`;
        const thumbSrc = escapeAttr(itemCatalogSpriteUrl(it.name));
        return `<article class="item-catalog-card" data-item-id="${escapeAttr(it.id)}">
          <div class="item-catalog-card-top">
            <div class="item-catalog-thumb-wrap">
              <img class="item-catalog-thumb" src="${thumbSrc}" alt="" width="48" height="48" loading="lazy" />
            </div>
            <div class="item-catalog-card-body">
              <h3 class="item-catalog-name">${escapeHtml((it.name || "").trim() ? itemDisplayNameForUi(it.name) : "—")}</h3>
              <p class="item-catalog-desc">${descHtml}</p>
            </div>
          </div>
          <div class="item-catalog-card-actions">
            <button type="button" class="btn secondary btn-xs item-catalog-edit">Edit</button>
            <button type="button" class="btn danger btn-xs item-catalog-delete">Delete</button>
          </div>
        </article>`;
      })
      .join("");

    $$(".item-catalog-thumb", itemsCatalogList).forEach((img) =>
      bindItemCatalogThumbFallback(img)
    );

    $$(".item-catalog-edit", itemsCatalogList).forEach((btn) => {
      const card = btn.closest("[data-item-id]");
      btn.addEventListener("click", () =>
        beginEditCatalogItem(card?.dataset.itemId || "")
      );
    });
    $$(".item-catalog-delete", itemsCatalogList).forEach((btn) => {
      const card = btn.closest("[data-item-id]");
      btn.addEventListener("click", () => {
        const id = card?.dataset.itemId || "";
        const it = state.itemCatalog.find((x) => x.id === id);
        if (!it || !confirm(`Delete item "${it.name}" from the catalog?`)) return;
        state.itemCatalog = state.itemCatalog.filter((x) => x.id !== id);
        if (itemsCatalogEditId?.value === id) resetItemsCatalogForm();
        saveState();
        fillItemCatalogDatalist();
        syncItemCatalogHint();
        renderItemCatalogPanel();
      });
    });
  }

  function formatStatVal(v) {
    if (v === "" || v == null) return "—";
    return String(v);
  }

  function cardStatsLineHtml(mon) {
    const st = mon.stats || {};
    const bits = STAT_LABELS_CARD_ES.map(
      ([k, lab]) =>
        `<span class="card-stat" title="${escapeAttr(lab)}"><span class="card-stat-k">${escapeHtml(lab)}</span> <span class="card-stat-v">${escapeHtml(formatStatVal(st[k]))}</span></span>`
    );
    return `<div class="card-stats">${bits.join("")}</div>`;
  }

  function teamSlotStatsHtml(mon) {
    const st = mon.stats || {};
    return `<div class="slot-stats">${STAT_LABELS_CARD_ES.map(
      ([k, lab]) =>
        `<span class="slot-stat"><abbr title="${escapeAttr(lab)}">${escapeHtml(lab)}</abbr> ${escapeHtml(formatStatVal(st[k]))}</span>`
    ).join("")}</div>`;
  }

  function teamSlotMovesItemNatureHtml(mon) {
    const nk = mon.nature && mon.nature in NATURES ? mon.nature : "hardy";
    const natureName = natureDisplayNameEs(nk);
    const natureFx = natureEffectDescriptionEs(nk);
    const itemRaw = (mon.heldItem || "").trim();
    const item = itemRaw || "—";
    const itemLabel = itemRaw ? itemDisplayNameForUi(itemRaw) : "—";
    const itemLine =
      itemRaw
        ? `<p class="slot-line slot-line-item"><span class="slot-k">Objeto</span> <span class="slot-item-with-thumb"><span class="slot-item-thumb-wrap"><img class="slot-item-thumb" src="${escapeAttr(itemCatalogSpriteUrl(itemRaw))}" alt="" width="22" height="22" loading="lazy" /></span><span class="slot-v">${escapeHtml(itemLabel)}</span></span></p>`
        : `<p class="slot-line"><span class="slot-k">Objeto</span> <span class="slot-v">${escapeHtml(item)}</span></p>`;
    const moves = (mon.moves && mon.moves.length ? [...mon.moves] : []).slice(0, 4);
    while (moves.length < 4) moves.push({ name: "", type: "", category: "physical" });
    const moveRows = moves
      .map((m, i) => {
        const name = (m.name || "").trim();
        const typeSlug = m.type && ALL_TYPES.includes(m.type) ? m.type : "";
        const icon = typeSlug
          ? `<span class="slot-move-type">${typeIconImg(typeSlug)}</span>`
          : "";
        const nameBit = name
          ? escapeHtml(name)
          : `<span class="slot-move-empty">—</span>`;
        const cat = normalizeMoveCategory(m.category);
        const catLab = MOVE_CATEGORY_LABELS[cat];
        const hasMoveContent = Boolean(name || typeSlug);
        const catTag = hasMoveContent
          ? `<span class="slot-move-cat slot-move-cat--${cat}" title="${escapeAttr(moveCategoryTooltip(cat))}">${escapeHtml(catLab)}</span>`
          : "";
        return `<div class="slot-move"><span class="slot-move-num">${i + 1}.</span>${icon}<span class="slot-move-name">${nameBit}</span>${catTag}</div>`;
      })
      .join("");
    return `<div class="slot-item-nat">
      ${itemLine}
      <p class="slot-line slot-nature-line"><span class="slot-k">Naturaleza</span> <span class="slot-v">${escapeHtml(natureName)} <span class="slot-nature-fx">(${escapeHtml(natureFx)})</span></span></p>
    </div>
    <div class="slot-moves" aria-label="Moves (with Physical, Special, or Status)">${moveRows}</div>`;
  }

  function pickRowStatsHtml(mon) {
    const st = mon.stats || {};
    return `<div class="pick-stats">${STAT_LABELS_CARD_ES.map(
      ([k, lab]) =>
        `<span>${escapeHtml(lab)} ${escapeHtml(formatStatVal(st[k]))}</span>`
    ).join(" · ")}</div>`;
  }

  function syncPfStatusToggleUi() {
    if (!pfStatus || !pokemonForm) return;
    const v = normalizeMonStatus(pfStatus.value);
    pfStatus.value = v;
    $$(".pf-status-btn", pokemonForm).forEach((btn) => {
      const on = (btn.dataset.status || "") === v;
      btn.classList.toggle("selected", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function wirePfStatusToggle() {
    if (!pokemonForm || !pfStatus) return;
    $$(".pf-status-btn", pokemonForm).forEach((btn) => {
      btn.addEventListener("click", () => {
        pfStatus.value = normalizeMonStatus(btn.dataset.status);
        syncPfStatusToggleUi();
      });
    });
  }

  function readMovesFromForm() {
    return $$(".move-row", pfMoves).map((row) => ({
      name: $(".mv-name", row).value.trim(),
      type: $(".mv-type", row).value || "",
      category: normalizeMoveCategory($(".mv-category", row)?.value),
    }));
  }

  function syncPlayerSelect() {
    playerSelect.innerHTML = state.players
      .map(
        (p) =>
          `<option value="${p.id}" ${p.id === state.activePlayerId ? "selected" : ""}>${escapeAttr(p.name)}</option>`
      )
      .join("");
    pfPlayer.innerHTML = state.players
      .map((p) => `<option value="${p.id}">${escapeAttr(p.name)}</option>`)
      .join("");
  }

  function getActivePlayer() {
    return state.players.find((p) => p.id === state.activePlayerId);
  }

  function pokemonById(id) {
    return state.pokemon.find((p) => p.id === id);
  }

  function livingIdsForPlayer(playerId) {
    return state.pokemon
      .filter((p) => p.playerId === playerId && p.status !== "dead")
      .map((p) => p.id);
  }

  function filterRosterQuery(mon, q) {
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      (mon.nickname || "").toLowerCase().includes(s) ||
      (mon.species || "").toLowerCase().includes(s)
    );
  }

  function fillSortStatSelects() {
    const opts = [
      ["", "Default order"],
      ["hp", "HP (highest first)"],
      ["atk", "Attack (highest first)"],
      ["def", "Defense (highest first)"],
      ["spa", "Sp. Atk (highest first)"],
      ["spd", "Sp. Def (highest first)"],
      ["spe", "Speed (highest first)"],
    ]
      .map(
        ([v, lab]) =>
          `<option value="${escapeAttr(v)}">${escapeHtml(lab)}</option>`
      )
      .join("");
    if (rosterSortStat) rosterSortStat.innerHTML = opts;
    if (deadSortStat) deadSortStat.innerHTML = opts;
  }

  function fillTypeFilterSelects() {
    const opts =
      `<option value="">Any type</option>` +
      ALL_TYPES.map(
        (t) =>
          `<option value="${t}">${escapeHtml(t.charAt(0).toUpperCase() + t.slice(1))}</option>`
      ).join("");
    if (rosterFilterType) rosterFilterType.innerHTML = opts;
    if (deadFilterType) deadFilterType.innerHTML = opts;
  }

  function renderRoster() {
    const q = rosterSearch.value.trim();
    const showBoxed = filterBoxed.checked;
    const pid = state.activePlayerId;
    const sortKey = rosterSortStat ? rosterSortStat.value : "";
    const typeFilter = rosterFilterType ? rosterFilterType.value : "";
    const baseItems = state.pokemon.filter((p) => {
      if (p.playerId !== pid) return false;
      if (p.status === "dead") return false;
      if (p.status === "boxed" && !showBoxed) return false;
      return filterRosterQuery(p, q);
    });
    const items = applySortAndTypeFilter(baseItems, sortKey, typeFilter);
    if (!items.length) {
      rosterList.innerHTML = `<p class="empty-state">${
        baseItems.length
          ? "No Pokémon match the type filter. Try “Any type”."
          : "No Pokémon here. Add one or adjust search / boxed filter."
      }</p>`;
      return;
    }
    rosterList.innerHTML = items
      .map((mon) => cardHtml(mon, false))
      .join("");
    $$("button.poke-card", rosterList).forEach((btn) => {
      btn.addEventListener("click", () => openEditModal(btn.dataset.id));
    });
  }

  function renderDead() {
    const pid = state.activePlayerId;
    const sortKey = deadSortStat ? deadSortStat.value : "";
    const typeFilter = deadFilterType ? deadFilterType.value : "";
    const baseItems = state.pokemon.filter(
      (p) => p.playerId === pid && p.status === "dead"
    );
    const items = applySortAndTypeFilter(baseItems, sortKey, typeFilter);
    if (!items.length) {
      deadList.innerHTML = `<p class="empty-state">${
        baseItems.length
          ? "No fallen Pokémon match the type filter. Try “Any type”."
          : "No fallen Pokémon yet."
      }</p>`;
      return;
    }
    deadList.innerHTML = items.map((mon) => cardHtml(mon, true)).join("");
    $$("button.poke-card", deadList).forEach((btn) => {
      btn.addEventListener("click", () => openEditModal(btn.dataset.id));
    });
  }

  function cardHtml(mon, isDead) {
    const statusLabel =
      mon.status === "boxed"
        ? `<span class="status-pill boxed">Boxed</span>`
        : mon.status === "dead"
          ? `<span class="status-pill dead">Dead</span>`
          : `<span class="status-pill">Party</span>`;
    const nk = mon.nature && mon.nature in NATURES ? mon.nature : "hardy";
    const natureTip = escapeAttr(natureShortSummary(nk));
    const natureLab = natureDisplayNameEs(nk);
    return `<button type="button" class="poke-card ${isDead ? "dead" : ""}" data-id="${mon.id}">
      <img class="sprite" src="${escapeAttr(spriteSrc(mon))}" alt="" width="72" height="72" />
      <div class="poke-card-col">
        <p class="title">${escapeAttr(mon.nickname || "—")} ${statusLabel}</p>
        <p class="species">${escapeAttr(mon.species || "")} · Lv. ${mon.level ?? "?"}</p>
        <div class="type-icons">${typeIconsHtml(mon.types)}</div>
        <p class="meta">${escapeAttr(mon.ability || "—")} · ${escapeAttr((mon.heldItem || "").trim() ? itemDisplayNameForUi(mon.heldItem) : "sin objeto")}</p>
        <p class="meta nature-line"><span class="nature-tag" title="${natureTip}">${escapeHtml(natureLab)}</span></p>
        ${cardStatsLineHtml(mon)}
      </div>
    </button>`;
  }

  function renderTeam() {
    const pid = state.activePlayerId;
    const slots = state.teams[pid] || [null, null, null, null, null, null];
    teamSlots.innerHTML = slots
      .map((id, i) => {
        if (!id) {
          return `<div class="team-slot" data-slot="${i}" tabindex="0" role="button" aria-label="Add Pokémon to slot ${i + 1}">
            <span class="slot-empty">Slot ${i + 1}<br />Tap to add</span>
          </div>`;
        }
        const mon = pokemonById(id);
        if (!mon) {
          return `<div class="team-slot" data-slot="${i}" tabindex="0" role="button" aria-label="Slot ${i + 1} — missing Pokémon, tap to assign">
            <span class="slot-empty">Missing</span>
          </div>`;
        }
        const nick = (mon.nickname || mon.species || "Pokémon").trim() || "Pokémon";
        const ariaRegion = `Slot ${i + 1}: ${nick}. Press Enter to edit. Use Swap to choose a different Pokémon.`;
        return `<div class="team-slot filled" data-slot="${i}" data-pokemon-id="${escapeAttr(mon.id)}" tabindex="0" role="region" aria-label="${escapeAttr(ariaRegion)}">
          <div class="team-slot-head">
            <button type="button" class="team-slot-swap" data-slot-swap="${i}" aria-label="Swap Pokémon in slot ${i + 1}">Swap</button>
          </div>
          <img class="slot-sprite" src="${escapeAttr(spriteSrc(mon))}" alt="" />
          <span class="slot-name">${escapeAttr(mon.nickname)}</span>
          ${teamSlotMovesItemNatureHtml(mon)}
          ${teamSlotStatsHtml(mon)}
        </div>`;
      })
      .join("");
    $$(".slot-item-thumb", teamSlots).forEach((img) =>
      bindItemCatalogThumbFallback(img)
    );
    renderTeamAnalysis();
  }

  function handleTeamSlotActivate(e) {
    const swapBtn = e.target.closest(".team-slot-swap");
    const slot = e.target.closest(".team-slot");
    if (!slot || !teamSlots.contains(slot)) return;
    const i = Number(slot.dataset.slot);
    if (swapBtn) {
      e.stopPropagation();
      openPickModal(i);
      return;
    }
    const pokeId = slot.dataset.pokemonId;
    if (pokeId) {
      openEditModal(pokeId);
      return;
    }
    openPickModal(i);
  }

  function teamMembersFromSlots() {
    const pid = state.activePlayerId;
    const slots = state.teams[pid] || [];
    return slots.map((id) => (id ? pokemonById(id) : null)).filter(Boolean);
  }

  function renderTeamAnalysis() {
    const team = teamMembersFromSlots();
    if (!team.length) {
      teamWeakTable.innerHTML = `<span class="cov-item muted">Add Pokémon to team slots.</span>`;
      teamOffenseTable.innerHTML = `<span class="cov-item muted">Add Pokémon to the team, then set <strong>Physical</strong> or <strong>Special</strong> move types for SE coverage.</span>`;
      return;
    }

    function monDisplayName(mon) {
      const n = (mon.nickname || "").trim();
      if (n) return n;
      const s = (mon.species || "").trim();
      if (s) return s;
      return "—";
    }

    function moveDisplayLabel(m) {
      const catLab = MOVE_CATEGORY_LABELS[normalizeMoveCategory(m.category)];
      const suffix = ` (${catLab})`;
      const n = (m.name || "").trim();
      if (n) return n + suffix;
      if (m.type && ALL_TYPES.includes(m.type)) return typeNameEn(m.type) + suffix;
      return "Move" + suffix;
    }

    const quadLines = [];
    const immuneLines = [];
    const weakRows = [];

    for (const atk of ALL_TYPES) {
      const weakMons = [];
      const quadMons = [];
      const immuneMons = [];
      for (const p of team) {
        const m = defenseMultiplier(atk, p.types);
        const k = matchupBucketKey(m);
        if (m >= 2) weakMons.push(p);
        if (k === "4") quadMons.push(p);
        if (k === "0") immuneMons.push(p);
      }
      if (quadMons.length) quadLines.push({ atk, mons: quadMons });
      if (immuneMons.length) immuneLines.push({ atk, mons: immuneMons });
      if (weakMons.length) weakRows.push({ atk, count: weakMons.length, mons: weakMons });
    }

    quadLines.sort((a, b) => a.atk.localeCompare(b.atk));
    immuneLines.sort((a, b) => a.atk.localeCompare(b.atk));
    weakRows.sort((a, b) => b.count - a.count);

    let weakHtml = "";

    if (quadLines.length) {
      weakHtml += `<div class="team-def-alert">`;
      weakHtml += `<p class="team-def-quad-title">×4 weaknesses:</p>`;
      weakHtml += `<ul class="team-def-quad-list">`;
      for (const { atk, mons } of quadLines) {
        const names = mons.map(monDisplayName).map(escapeHtml).join(", ");
        weakHtml += `<li>${typeIconImg(atk)} <strong>${escapeHtml(typeNameEn(atk))}</strong> — ${names}</li>`;
      }
      weakHtml += `</ul></div>`;
    }

    if (immuneLines.length) {
      weakHtml += `<div class="team-def-immune-block">`;
      weakHtml += `<p class="team-def-immune-title">Defensive immunities (×0 damage from this move type):</p>`;
      weakHtml += `<ul class="team-def-immune-list">`;
      for (const { atk, mons } of immuneLines) {
        const names = mons.map(monDisplayName).map(escapeHtml).join(", ");
        weakHtml += `<li>${typeIconImg(atk)} <strong>${escapeHtml(typeNameEn(atk))}</strong> — ${names}</li>`;
      }
      weakHtml += `</ul></div>`;
    }

    weakHtml += `<div class="coverage-table team-weak-grid">`;
    if (weakRows.length) {
      for (const { atk, count, mons } of weakRows) {
        const names = mons.map(monDisplayName).join(", ");
        const tip = `Weak to ${typeNameEn(atk)}: ${names}`;
        weakHtml += `<span class="cov-item weak cov-item-tip" title="${escapeAttr(tip)}">${typeIconImg(atk)} <span class="n">${count}</span> Weak</span>`;
      }
    } else {
      weakHtml += `<span class="cov-item muted">No ×2+ defensive weaknesses in current team.</span>`;
    }
    weakHtml += `</div>`;
    teamWeakTable.innerHTML = weakHtml;

    const hasDamagingTypedMove = team.some((p) =>
      (p.moves || []).some(
        (m) =>
          m.type &&
          ALL_TYPES.includes(m.type) &&
          moveUsesTypeChartForDamage(m)
      )
    );

    if (!hasDamagingTypedMove) {
      teamOffenseTable.innerHTML = `<span class="cov-item muted">Set a <strong>Physical</strong> or <strong>Special</strong> move with a type for SE coverage. <strong>Status</strong> moves do not count.</span>`;
      return;
    }

    const covered = [];
    const notCovered = [];
    for (const defType of ALL_TYPES) {
      let se = false;
      outer: for (const p of team) {
        for (const m of p.moves || []) {
          if (!m.type || !ALL_TYPES.includes(m.type)) continue;
          if (!moveUsesTypeChartForDamage(m)) continue;
          if (multiplier(m.type, defType) >= 2) {
            se = true;
            break outer;
          }
        }
      }
      if (se) covered.push(defType);
      else notCovered.push(defType);
    }

    const covHtml = covered
      .map((t) => {
        const contributors = [];
        for (const p of team) {
          const seMoves = (p.moves || []).filter(
            (m) =>
              m.type &&
              ALL_TYPES.includes(m.type) &&
              moveUsesTypeChartForDamage(m) &&
              multiplier(m.type, t) >= 2
          );
          if (seMoves.length) {
            const bits = seMoves.map(moveDisplayLabel).join(", ");
            contributors.push(`${monDisplayName(p)} (${bits})`);
          }
        }
        const tip = contributors.join(" · ");
        return `<span class="cov-item cov-item-tip" title="${escapeAttr(tip)}">${typeIconImg(t)} <span class="cov-se-tag">SE</span></span>`;
      })
      .join("");

    const missHtml = notCovered.length
      ? `<span class="cov-item muted cov-na-label">No SE:</span>` +
        notCovered
          .map(
            (t) =>
              `<span class="cov-item muted cov-item-tip" title="${escapeAttr(`No Physical or Special move on this team hits ${typeNameEn(t)} for ×2 or more (Status moves do not count).`)}">${typeIconImg(t)}</span>`
          )
          .join("")
      : "";
    teamOffenseTable.innerHTML = covHtml + missHtml;
  }

  function openPickModal(slotIndex) {
    pickingSlotIndex = slotIndex;
    const pid = state.activePlayerId;
    const slots = state.teams[pid] || [];
    const used = new Set(slots.filter((id, i) => id && i !== slotIndex));
    const candidates = state.pokemon.filter(
      (p) =>
        p.playerId === pid &&
        p.status !== "dead" &&
        (!used.has(p.id) || p.id === slots[slotIndex])
    );
    const clearBtn = `<button type="button" class="pick-row clear-slot" data-clear-slot style="border-style:dashed">
      <span class="pn">Empty this slot</span><span class="ps">Remove Pokémon from slot ${slotIndex + 1}</span>
    </button>`;

    if (!candidates.length) {
      pickList.innerHTML =
        clearBtn +
        `<p class="empty-state">No eligible Pokémon. Mark some as party/boxed or remove duplicates from other slots.</p>`;
      $(".clear-slot", pickList)?.addEventListener("click", clearCurrentSlot);
    } else {
      pickList.innerHTML =
        clearBtn +
        candidates
        .map(
          (p) =>
            `<button type="button" class="pick-row" data-pick-id="${p.id}">
            <img class="sprite-tiny" src="${escapeAttr(spriteSrc(p))}" alt="" width="40" height="40" />
            <div class="pick-row-main"><div class="pn">${escapeAttr(p.nickname)}</div><div class="ps">${escapeAttr(p.species)} Lv.${p.level}</div>${pickRowStatsHtml(p)}</div>
            <div class="type-icons">${typeIconsHtml(p.types)}</div>
          </button>`
        )
        .join("");
      $(".clear-slot", pickList)?.addEventListener("click", clearCurrentSlot);
      $$(".pick-row[data-pick-id]", pickList).forEach((row) => {
        row.addEventListener("click", () => {
          const id = row.dataset.pickId;
          state.teams[pid][slotIndex] = id;
          saveState();
          pickModal.hidden = true;
          pickingSlotIndex = null;
          renderTeam();
        });
      });
    }
    pickModal.hidden = false;
  }

  function clearCurrentSlot() {
    const pid = state.activePlayerId;
    if (pickingSlotIndex == null) return;
    state.teams[pid][pickingSlotIndex] = null;
    saveState();
    pickModal.hidden = true;
    pickingSlotIndex = null;
    renderTeam();
  }

  function openNewModal() {
    pfId.value = "";
    pfPlayer.value = state.activePlayerId;
    pfStatus.value = "party";
    pfSpecies.value = "";
    pfNickname.value = "";
    pfType1.value = "normal";
    pfType2.value = "";
    pfLevel.value = 5;
    pfAbility.value = "";
    pfItem.value = "";
    pfNature.value = "hardy";
    pfHp.value = "";
    pfAtk.value = "";
    pfDef.value = "";
    pfSpa.value = "";
    pfSpd.value = "";
    pfSpe.value = "";
    pfLearnable.value = "";
    renderMoveRows([]);
    updateNatureEffect();
    syncPfStatusToggleUi();
    fillItemCatalogDatalist();
    syncItemCatalogHint();
    pfDelete.hidden = true;
    modalTitle.textContent = "Add Pokémon";
    modalRoot.hidden = false;
  }

  function openEditModal(id) {
    const mon = pokemonById(id);
    if (!mon) return;
    pfId.value = mon.id;
    pfPlayer.value = mon.playerId;
    pfStatus.value = normalizeMonStatus(mon.status);
    pfSpecies.value = mon.species || "";
    pfNickname.value = mon.nickname || "";
    pfType1.value = mon.types[0] || "normal";
    pfType2.value = mon.types[1] || "";
    pfLevel.value = mon.level ?? "";
    pfAbility.value = mon.ability || "";
    pfItem.value = mon.heldItem || "";
    pfNature.value = mon.nature in NATURES ? mon.nature : "hardy";
    pfHp.value = mon.stats.hp ?? "";
    pfAtk.value = mon.stats.atk ?? "";
    pfDef.value = mon.stats.def ?? "";
    pfSpa.value = mon.stats.spa ?? "";
    pfSpd.value = mon.stats.spd ?? "";
    pfSpe.value = mon.stats.spe ?? "";
    pfLearnable.value = mon.learnableNotes || "";
    renderMoveRows(mon.moves);
    updateNatureEffect();
    syncPfStatusToggleUi();
    fillItemCatalogDatalist();
    syncItemCatalogHint();
    pfDelete.hidden = false;
    modalTitle.textContent = "Edit Pokémon";
    modalRoot.hidden = false;
  }

  function closeModal() {
    modalRoot.hidden = true;
  }

  function readMonFromForm(id) {
    syncSpeciesFieldFromDex();
    const types = [pfType1.value, pfType2.value].filter(Boolean);
    const species = pfSpecies.value.trim();
    return {
      id,
      playerId: pfPlayer.value,
      status: normalizeMonStatus(pfStatus.value),
      species,
      nickname: pfNickname.value.trim(),
      types: types.length ? types : ["normal"],
      level: Number(pfLevel.value) || 1,
      ability: pfAbility.value.trim(),
      heldItem: pfItem.value.trim(),
      nature: pfNature.value,
      spriteUrl: guessSpritePathFromSpecies(species) || "",
      stats: {
        hp: pfHp.value === "" ? "" : Number(pfHp.value),
        atk: pfAtk.value === "" ? "" : Number(pfAtk.value),
        def: pfDef.value === "" ? "" : Number(pfDef.value),
        spa: pfSpa.value === "" ? "" : Number(pfSpa.value),
        spd: pfSpd.value === "" ? "" : Number(pfSpd.value),
        spe: pfSpe.value === "" ? "" : Number(pfSpe.value),
      },
      moves: readMovesFromForm(),
      learnableNotes: pfLearnable.value.trim(),
    };
  }

  pokemonForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const existingId = pfId.value;
    const id = existingId || uuid();
    const mon = readMonFromForm(id);
    if (existingId) {
      const idx = state.pokemon.findIndex((p) => p.id === existingId);
      if (idx >= 0) state.pokemon[idx] = mon;
    } else {
      state.pokemon.push(mon);
    }
    if (mon.status === "dead") {
      const pid = mon.playerId;
      const slots = state.teams[pid];
      for (let i = 0; i < 6; i++) {
        if (slots[i] === mon.id) slots[i] = null;
      }
    }
    saveState();
    closeModal();
    renderRoster();
    renderDead();
    renderTeam();
  });

  pfDelete.addEventListener("click", () => {
    const id = pfId.value;
    if (!id || !confirm("Remove this Pokémon from the save?")) return;
    state.pokemon = state.pokemon.filter((p) => p.id !== id);
    state.players.forEach((p) => {
      state.teams[p.id] = state.teams[p.id].map((x) => (x === id ? null : x));
    });
    saveState();
    closeModal();
    renderRoster();
    renderDead();
    renderTeam();
  });

  pfNature.addEventListener("change", updateNatureEffect);

  if (pfItem) {
    pfItem.addEventListener("input", syncItemCatalogHint);
    pfItem.addEventListener("change", syncItemCatalogHint);
  }

  if (pfItemAddCatalog) {
    pfItemAddCatalog.addEventListener("click", () => {
      const name = pfItem?.value.trim() || "";
      if (!name) return;
      if (findItemCatalogByHeldName(name)) {
        syncItemCatalogHint();
        return;
      }
      state.itemCatalog.push({
        id: uuid(),
        name,
        description: "",
      });
      saveState();
      fillItemCatalogDatalist();
      syncItemCatalogHint();
      renderItemCatalogPanel();
    });
  }

  if (pfItemEditCatalog) {
    pfItemEditCatalog.addEventListener("click", () => {
      const id = pfItemEditCatalog.dataset.catalogId;
      if (!id) return;
      showMainPanel("items");
      beginEditCatalogItem(id, { skipFocus: true });
      queueMicrotask(() => {
        $("#items-catalog-editor")?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      });
    });
  }

  if (itemsCatalogSave) {
    itemsCatalogSave.addEventListener("click", () => {
      const name = itemsCatalogName?.value.trim() || "";
      if (!name) {
        alert("Item name is required.");
        itemsCatalogName?.focus();
        return;
      }
      const desc = itemsCatalogDesc?.value.trim() || "";
      const editId = itemsCatalogEditId?.value || "";
      if (editId) {
        const it = state.itemCatalog.find((x) => x.id === editId);
        if (it) {
          it.name = name;
          it.description = desc;
        }
      } else {
        state.itemCatalog.push({
          id: uuid(),
          name,
          description: desc,
        });
      }
      saveState();
      resetItemsCatalogForm();
      fillItemCatalogDatalist();
      syncItemCatalogHint();
      renderItemCatalogPanel();
    });
  }
  if (itemsCatalogCancelEdit) {
    itemsCatalogCancelEdit.addEventListener("click", resetItemsCatalogForm);
  }
  if (itemsCatalogSearch) {
    itemsCatalogSearch.addEventListener("input", () => renderItemCatalogPanel());
  }
  if (itemsCatalogNoBerries) {
    itemsCatalogNoBerries.addEventListener("change", () => renderItemCatalogPanel());
  }
  if (itemsCatalogNoMegas) {
    itemsCatalogNoMegas.addEventListener("change", () => renderItemCatalogPanel());
  }

  if (pfSpecies) {
    pfSpecies.addEventListener("change", () => syncSpeciesFieldFromDex());
    pfSpecies.addEventListener("blur", () => syncSpeciesFieldFromDex());
    pfSpecies.addEventListener("input", () => {
      if (speciesDexDebounce) clearTimeout(speciesDexDebounce);
      speciesDexDebounce = setTimeout(() => {
        speciesDexDebounce = null;
        syncSpeciesFieldFromDex();
      }, 200);
    });
  }

  $$("[data-close-modal]", modalRoot).forEach((el) => {
    el.addEventListener("click", closeModal);
  });

  $$("[data-close-pick]", pickModal).forEach((el) => {
    el.addEventListener("click", () => {
      pickModal.hidden = true;
      pickingSlotIndex = null;
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (modalRoot && !modalRoot.hidden) {
      closeModal();
      e.preventDefault();
    }
  });

  $("#btn-add-pokemon").addEventListener("click", openNewModal);

  $("#btn-add-player").addEventListener("click", () => {
    const name = prompt("Player name?", `Player ${state.players.length + 1}`);
    if (!name || !name.trim()) return;
    const pid = uuid();
    state.players.push({ id: pid, name: name.trim() });
    state.teams[pid] = [null, null, null, null, null, null];
    state.activePlayerId = pid;
    saveState();
    syncPlayerSelect();
    renderRoster();
    renderDead();
    renderTeam();
  });

  $("#btn-rename-player").addEventListener("click", () => {
    const p = getActivePlayer();
    if (!p) return;
    const name = prompt("New name for this player?", p.name);
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed) {
      alert("Name cannot be empty.");
      return;
    }
    p.name = trimmed;
    saveState();
    syncPlayerSelect();
    playerSelect.value = state.activePlayerId;
  });

  playerSelect.addEventListener("change", () => {
    state.activePlayerId = playerSelect.value;
    saveState();
    closeModal();
    renderRoster();
    renderDead();
    renderTeam();
  });

  rosterSearch.addEventListener("input", renderRoster);
  filterBoxed.addEventListener("change", renderRoster);
  if (rosterSortStat) rosterSortStat.addEventListener("change", renderRoster);
  if (rosterFilterType) rosterFilterType.addEventListener("change", renderRoster);
  if (deadSortStat) deadSortStat.addEventListener("change", renderDead);
  if (deadFilterType) deadFilterType.addEventListener("change", renderDead);

  function showMainPanel(name) {
    $$(".tab").forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    $$(".panel").forEach((p) => {
      const on = p.dataset.panel === name;
      p.classList.toggle("active", on);
      p.hidden = !on;
    });
    if (name === "team") renderTeam();
    if (name === "items") {
      fillItemCatalogDatalist();
      renderItemCatalogPanel();
    }
    if (name === "matchups") {
      syncMmModeUi();
      renderMatchupTable();
    }
  }

  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => showMainPanel(tab.dataset.tab));
  });

  function syncRulesShopMode(mode) {
    const rulesPane = $("#rs-pane-rules");
    const shopPane = $("#rs-pane-shop");
    if (!rulesPane || !shopPane) return;
    const isRules = mode === "rules";
    rulesPane.hidden = !isRules;
    shopPane.hidden = isRules;
    $$(".rs-mode-btn").forEach((b) => {
      const on = b.dataset.rsMode === mode;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  $$(".rs-mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => syncRulesShopMode(btn.dataset.rsMode));
  });

  const mmType1 = $("#mm-type1");
  const mmType2 = $("#mm-type2");
  if (mmType1 && mmType2) {
    mmType1.addEventListener("change", () => {
      if (mmType2.value && mmType2.value === mmType1.value) mmType2.value = "";
      renderMatchupTable();
    });
    mmType2.addEventListener("change", () => {
      if (mmType2.value && mmType2.value === mmType1.value) mmType2.value = "";
      renderMatchupTable();
    });
    $$(".mm-tier").forEach((cb) =>
      cb.addEventListener("change", renderMatchupTable)
    );
  }
  $$(".mm-mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      matchupMode = btn.dataset.mmMode;
      syncMmModeUi();
      renderMatchupTable();
    });
  });
  $("#btn-export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "nuzlocke-save.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $("#import-file").addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.players || !Array.isArray(data.pokemon)) {
          alert("Invalid save file.");
          return;
        }
        state = data;
        if (!state.teams) state.teams = {};
        state.players.forEach((p) => {
          if (!state.teams[p.id]) {
            state.teams[p.id] = [null, null, null, null, null, null];
          }
        });
        (state.pokemon || []).forEach((mon) => {
          mon.status = normalizeMonStatus(mon.status);
        });
        if (!Array.isArray(state.itemCatalog)) state.itemCatalog = [];
        saveState();
        closeModal();
        syncPlayerSelect();
        playerSelect.value = state.activePlayerId;
        renderRoster();
        renderDead();
        renderTeam();
        fillItemCatalogDatalist();
        renderItemCatalogPanel();
        syncItemCatalogHint();
      } catch {
        alert("Could not read JSON.");
      }
      e.target.value = "";
    };
    reader.readAsText(f);
  });

  function longPressClear(slotIndex) {
    const pid = state.activePlayerId;
    if (confirm(`Clear slot ${slotIndex + 1}?`)) {
      state.teams[pid][slotIndex] = null;
      saveState();
      renderTeam();
    }
  }

  teamSlots.addEventListener("click", handleTeamSlotActivate);
  teamSlots.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const slot = e.target.closest(".team-slot");
    if (!slot || !teamSlots.contains(slot)) return;
    if (e.target.closest(".team-slot-swap")) return;
    e.preventDefault();
    handleTeamSlotActivate(e);
  });

  teamSlots.addEventListener("contextmenu", (e) => {
    if (e.target.closest(".team-slot-swap")) {
      e.preventDefault();
      return;
    }
    const slot = e.target.closest(".team-slot");
    if (!slot) return;
    e.preventDefault();
    longPressClear(Number(slot.dataset.slot));
  });

  function submitWelcomeName() {
    if (!welcomePlayerName || !welcomeModalRoot) return;
    const name = welcomePlayerName.value.trim();
    if (!name) {
      welcomePlayerName.classList.add("input-invalid");
      welcomePlayerName.focus();
      setTimeout(() => welcomePlayerName.classList.remove("input-invalid"), 800);
      return;
    }
    if (state.players?.[0]) state.players[0].name = name;
    saveState();
    welcomePlayerName.classList.remove("input-invalid");
    document.body.classList.remove("welcome-blocking");
    welcomeModalRoot.hidden = true;
    syncPlayerSelect();
    renderRoster();
    renderDead();
    renderTeam();
  }

  if (welcomeOkBtn && welcomePlayerName) {
    welcomeOkBtn.addEventListener("click", submitWelcomeName);
    welcomePlayerName.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitWelcomeName();
      }
    });
  }

  fillTypeSelects();
  fillMatchupSelects();
  wireMmAttackTypePicker();
  syncMmModeUi();
  fillNatureSelect();
  updateNatureEffect();
  wirePfStatusToggle();
  syncPfStatusToggleUi();
  fillSpeciesDatalist();
  fillItemCatalogDatalist();
  fillSortStatSelects();
  fillTypeFilterSelects();
  syncPlayerSelect();
  renderRoster();
  renderDead();
  renderTeam();
  renderMatchupTable();

  if (localStorage.getItem(STORAGE_KEY) === null) {
    document.body.classList.add("welcome-blocking");
    if (welcomeModalRoot) welcomeModalRoot.hidden = false;
    if (welcomePlayerName) {
      welcomePlayerName.value = "";
      queueMicrotask(() => welcomePlayerName.focus());
    }
  }
})();
