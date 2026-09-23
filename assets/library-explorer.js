(() => {
  const root = document.querySelector('[data-library-explorer]');
  if (!root) return;

  // ---- Referencias DOM ----
  const shelvesEl = root.querySelector('[data-library-shelves]');
  const bookViewEl = root.querySelector('[data-library-book-view]');
  const statusEl = root.querySelector('[data-library-status]');
  const viewButtons = Array.from(root.querySelectorAll('[data-library-view]'));
  const densityButtons = Array.from(root.querySelectorAll('[data-density]'));
  const searchInput = root.querySelector('[data-library-search]');

  const DENSITY_KEY = 'mtr-library-density';

  const state = {
    view: 'autores', // autores | temas | lista
    density: (() => { try { return localStorage.getItem(DENSITY_KEY) || 'standard'; } catch (e) { return 'standard'; } })(),
    query: ''
  };

  // ---- Datos ----
  let indexData = null;     // data/library/explorar.json
  let libraryData = {};     // slug -> data/library/<slug>.json
  let bookPages = {};       // 'aSlug/wSlug' -> data/book-pages/...
  let availabilityData = null; // data/availability/brian-weiss.json
  let directory = {};       // 'lib:branch' -> ficha del directorio
  let authors = [];
  let topics = [];
  let suppressBookClickUntil = 0;

  // ---- Utilidades ----
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const slugTitle = slug => String(slug || '').split('-').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');

  const monogram = title => String(title || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  function smoothScroll(el) {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (el) el.scrollIntoView({block: 'start', behavior: reduce ? 'auto' : 'smooth'});
  }

  function closeImageCredits() {
    document.querySelectorAll('.image-credit[open]').forEach(details => { details.open = false; });
  }

  function formatChecked(value) {
    if (!value) return 'pendiente de la primera actualización diaria';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Atlantic/Canary',
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date) + ' (hora canaria)';
  }

  function availabilityMarkup(available, copies) {
    const a = Number(available || 0);
    const c = Number(copies || 0);
    const pill = a === 0 ? 'none' : a === 1 ? 'one' : 'many';
    return `<span class="availability-pill availability-${pill}" aria-label="${a} disponibles de ${c}">${a}/${c}</span>`;
  }

  const IA_TYPE_LABELS = {
    borrow:  {sub: 'Internet Archive · préstamo digital según disponibilidad',        link: 'Solicitar préstamo digital en Internet Archive'},
    read:    {sub: 'Internet Archive · lectura digital',                              link: 'Leer online en Internet Archive'},
    preview: {sub: 'Internet Archive · vista previa',                                 link: 'Consultar vista previa en Internet Archive'},
    text:    {sub: 'Internet Archive · préstamo o consulta digital según disponibilidad', link: 'Leer online en Internet Archive'}
  };
  const IA_TYPE_DEFAULT = {sub: 'Internet Archive · consulta digital según disponibilidad', link: 'Consultar en Internet Archive'};

  function iaTypeLabel(type) {
    return IA_TYPE_LABELS[String(type || '').toLowerCase()] || IA_TYPE_DEFAULT;
  }

  function extractLang(text, fallback) {
    const t = String(text || '').toLowerCase();
    if (/espa[nñ]ol/.test(t)) return 'es';
    if (/ingl[ée]s/.test(t)) return 'en';
    if (/franc[eé]s/.test(t)) return 'fr';
    if (/alem[aá]n/.test(t)) return 'de';
    if (/portugu[ée]s/.test(t)) return 'pt';
    if (/italiano/.test(t)) return 'it';
    return fallback || 'es';
  }

  // Mapa de municipio por código de red BICA (mismo de book-library.js).
  const NETWORK_MUNICIPALITY = {
    EH03:'El Pinar',EH00:'Frontera',EH01:'Valverde',
    FV03:'Antigua',FV04:'Betancuria',FV01:'La Oliva',FV02:'Puerto del Rosario',FV00:'Puerto del Rosario',FV05:'Pájara',FV07:'Tuineje',FV06:'Tuineje',
    GC19:'Agaete',GC10:'Agüimes',GC20:'Artenara',GC11:'Arucas',GC15:'Firgas',GC17:'Gáldar',GC22:'Gáldar',GC09:'Ingenio',GC41:'La Aldea de San Nicolás',
    GC29:'Las Palmas de Gran Canaria',GC21:'Las Palmas de Gran Canaria',GC00:'Las Palmas de Gran Canaria',GC34:'Las Palmas de Gran Canaria',GC25:'Las Palmas de Gran Canaria',GC24:'Las Palmas de Gran Canaria',GC36:'Las Palmas de Gran Canaria',GC30:'Las Palmas de Gran Canaria',GC26:'Las Palmas de Gran Canaria',GC31:'Las Palmas de Gran Canaria',GC23:'Las Palmas de Gran Canaria',GC33:'Las Palmas de Gran Canaria',GC40:'Las Palmas de Gran Canaria',GC32:'Las Palmas de Gran Canaria',GC37:'Las Palmas de Gran Canaria',GC27:'Las Palmas de Gran Canaria',GC01:'Las Palmas de Gran Canaria',GC28:'Las Palmas de Gran Canaria',
    GC03:'Mogán',GC06:'Moya',GC39:'Moya',GC16:'San Bartolomé de Tirajana',GC07:'Santa Brígida',GC12:'Santa Lucía',GC08:'Santa María de Guía',GC18:'Tejeda',GC38:'Telde',GC04:'Telde',GC14:'Teror',GC13:'Valleseco',GC02:'Valsequillo de Gran Canaria',GC05:'Vega de San Mateo',
    LG00:'San Sebastián de La Gomera',LG01:'Valle Gran Rey',LG02:'Vallehermoso',
    LP07:'Barlovento',LP06:'Breña Alta',LP14:'Breña Baja',LP17:'El Paso',LP01:'El Paso',LP12:'Fuencaliente',LP15:'Garafía',LP02:'Los Llanos de Aridane',LP18:'Los Llanos de Aridane',LP16:'Los Llanos de Aridane',LP13:'Puntagorda',LP05:'Puntallana',LP03:'San Andrés y Sauces',LP00:'Santa Cruz de La Palma',LP11:'Santa Cruz de La Palma',LP10:'Santa Cruz de La Palma',LP09:'Tazacorte',LP08:'Tijarafe',LP04:'Villa de Mazo',
    LZ00:'Arrecife',LZ01:'Arrecife',LZ07:'Haría',LZ03:'San Bartolomé',LZ04:'Teguise',LZ05:'Tinajo',LZ02:'Tías',
    TF15:'Adeje',TF04:'Arafo',TF24:'Arico',TF11:'Arona',TF17:'Buenavista del Norte',TF14:'Candelaria',TF20:'El Rosario',TF23:'El Sauzal',TF31:'El Tanque',TF18:'Fasnia',TF19:'Garachico',TF12:'Granadilla de Abona',TF16:'Guía de Isora',TF26:'Güímar',TF08:'Icod de Los Vinos',TF25:'La Guancha',TF27:'La Matanza de Acentejo',TF10:'La Orotava',TF34:'La Orotava',TF52:'La Orotava',TF33:'La Orotava',TF03:'La Victoria de Acentejo',TF13:'Los Realejos',TF21:'Los Silos',TF07:'Puerto de la Cruz',TF46:'Puerto de la Cruz',TF51:'Puerto de la Cruz',TF36:'San Cristóbal de La Laguna',TF38:'San Cristóbal de La Laguna',TF09:'San Cristóbal de La Laguna',TF54:'San Cristóbal de La Laguna',TF47:'San Cristóbal de La Laguna',TF37:'San Cristóbal de La Laguna',TF35:'San Cristóbal de La Laguna',TF28:'San Juan de La Rambla',TF05:'San Miguel de Abona',TF48:'Santa Cruz de Tenerife',TF42:'Santa Cruz de Tenerife',TF50:'Santa Cruz de Tenerife',TF00:'Santa Cruz de Tenerife',TF39:'Santa Cruz de Tenerife',TF49:'Santa Cruz de Tenerife',TF41:'Santa Cruz de Tenerife',TF01:'Santa Cruz de Tenerife',TF22:'Santa Úrsula',TF29:'Santiago del Teide',TF30:'Tacoronte',TF06:'Tegueste',TF32:'Vilaflor'
  };

  const ISLAND_ORDER = ['TF','GC','LZ','FV','LP','LG','EH'];
  const PLACEHOLDER_ICONS = {
    male: '/assets/icons/freeicons-reda-icono-perfil-masculino-120x123.svg',
    female: '/assets/icons/freeicons-reda-icono-perfil-femenino-120x123.svg'
  };

  // ---- Préstamo físico: port de book-library.js ----
  function contactMarkup(contact) {
    if (!contact) return '<p class="branch-contact-pending">Contacto y horario pendientes de verificar.</p>';
    const rows = [];
    if (contact.status_note) rows.push(`<p class="branch-status-note">${esc(contact.status_note)}</p>`);
    if (contact.address) rows.push(`<div class="branch-contact-item"><span class="branch-contact-label">Dirección</span><span>${esc(contact.address)}</span></div>`);
    if (contact.opening_hours) {
      const hours = Array.isArray(contact.opening_hours) ? contact.opening_hours : [contact.opening_hours];
      rows.push(`<div class="branch-contact-item"><span class="branch-contact-label">Horario</span><span class="branch-opening-hours">${hours.map(line => `<span>${esc(line)}</span>`).join('')}</span></div>`);
    }
    if (contact.phone) rows.push(`<div class="branch-contact-item"><span class="branch-contact-label">Teléfono</span><span>${esc(contact.phone)}</span></div>`);
    if (contact.email) rows.push(`<div class="branch-contact-item"><span class="branch-contact-label">Correo</span><a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a></div>`);
    return rows.length
      ? `<div class="branch-contact">${rows.join('')}</div>`
      : '<p class="branch-contact-pending">Contacto y horario pendientes de verificar.</p>';
  }

  function municipalityFor(libraryId, library) {
    return (library && library.municipality) || NETWORK_MUNICIPALITY[libraryId] || 'Otros centros';
  }

  function libraryDisplay(libraryId, library, branchId, branch) {
    const entry = directory[`${libraryId}:${branchId}`];
    if (entry) return {name: entry.name, meta: entry.municipality || municipalityFor(libraryId, library), directory: entry};
    const municipality = municipalityFor(libraryId, library);
    const branchName = String(branch && branch.name || '').trim();
    const networkName = String(library && library.name || '').trim();
    if (/\b(biblioteca|centro bibliotecario|instituto|universidad|archivo)\b/i.test(branchName)) {
      return {name: branchName, meta: municipality};
    }
    const generic = networkName && /biblioteca pública municipal/i.test(networkName)
      ? `Biblioteca Pública Municipal de ${municipality}`
      : `Biblioteca pública de ${municipality}`;
    return {
      name: generic,
      meta: branchName ? `Sede: ${branchName}` : `Punto BICA ${branchId}`
    };
  }

  function buildBranchRecordMap(workSlug) {
    const map = new Map();
    (availabilityData && availabilityData.records || [])
      .filter(record => record.work_slug === workSlug)
      .forEach(record => {
        const seen = new Set();
        (record.copies || []).forEach(copy => {
          const libraryId = copy.library_id || 'UNKNOWN';
          const branchId = copy.branch_id || 'UNKNOWN';
          const key = `${libraryId}:${branchId}`;
          if (seen.has(key)) return;
          seen.add(key);
          if (!map.has(key)) map.set(key, []);
          map.get(key).push({bica_id: record.bica_id, permalink: record.permalink});
        });
      });
    return map;
  }

  function branchBicaLinks(branchRecordMap, libraryId, branchId) {
    const records = branchRecordMap.get(`${libraryId}:${branchId}`) || [];
    if (!records.length) return '';
    if (records.length === 1) {
      const record = records[0];
      return `<a class="branch-primary-action" href="${esc(record.permalink)}" target="_blank" rel="noopener noreferrer"><span>Consultar en RED BICA</span><small>Disponibilidad y reserva</small></a>`;
    }
    return `<details class="branch-edition-details"><summary>Consultar ${records.length} ediciones en RED BICA</summary><div class="branch-edition-links">${records.map(record => `<a href="${esc(record.permalink)}" target="_blank" rel="noopener noreferrer">Ficha BICA ${esc(record.bica_id)}</a>`).join('')}</div></details>`;
  }

  function renderBranch(branchRecordMap, libraryId, library, branchId, branch) {
    const label = libraryDisplay(libraryId, library, branchId, branch);
    const available = Number(branch.available || 0);
    const copies = Number(branch.copies || 0);
    const stateClass = available > 0 ? 'is-available' : 'is-unavailable';
    const stateLabel = available > 0 ? 'Disponible ahora' : 'Sin disponibilidad inmediata';
    const countLabel = `${available} ${available === 1 ? 'disponible' : 'disponibles'} de ${copies} ${copies === 1 ? 'ejemplar' : 'ejemplares'}`;

    return `<article class="branch-availability ${stateClass}">
      <div class="branch-card-main">
        <div class="branch-library-identity">
          <h4>${esc(label.name)}</h4>
          <p class="branch-availability-copy"><strong>${stateLabel}</strong><span>${esc(countLabel)}</span></p>
        </div>
        ${branchBicaLinks(branchRecordMap, libraryId, branchId)}
      </div>
      ${label.directory
        ? `<details class="branch-directory-details"><summary><span>Dirección, horario y contacto</span></summary><div class="branch-directory-body">${contactMarkup(label.directory)}<p class="branch-official-link"><a href="${esc(label.directory.directory_url)}" target="_blank" rel="noopener noreferrer">Ver ficha oficial</a></p></div></details>`
        : contactMarkup(branch.contact)}
    </article>`;
  }

  function renderAvailabilityInto(workSlug, target) {
    const work = availabilityData && availabilityData.works ? availabilityData.works[workSlug] : null;
    if (!work || !Object.keys(work.islands || {}).length) {
      target.innerHTML = '<p>No hay desglose geográfico disponible para esta obra.</p>';
      return;
    }

    const branchRecordMap = buildBranchRecordMap(workSlug);
    const geography = Object.entries(work.islands || {})
      .filter(([code, island]) => code !== 'UNKNOWN' && Number(island && island.copies || 0) > 0)
      .sort(([a], [b]) => ISLAND_ORDER.indexOf(a) - ISLAND_ORDER.indexOf(b))
      .map(([code, island]) => {
        const municipalities = new Map();
        Object.entries(island.libraries || {}).forEach(([libraryId, library]) => {
          Object.entries(library.branches || {}).forEach(([branchId, branch]) => {
            if (Number(branch && branch.copies || 0) <= 0) return;
            const entry = directory[`${libraryId}:${branchId}`];
            const municipality = (entry && entry.municipality) || municipalityFor(libraryId, library);
            if (!municipalities.has(municipality)) {
              municipalities.set(municipality, {copies: 0, available: 0, branches: []});
            }
            const group = municipalities.get(municipality);
            group.copies += Number(branch.copies || 0);
            group.available += Number(branch.available || 0);
            group.branches.push([libraryId, library, branchId, branch]);
          });
        });
        return {
          code,
          name: island.name || code,
          copies: Number(island.copies || 0),
          available: Number(island.available || 0),
          municipalities: Array.from(municipalities.entries())
            .filter(([, group]) => group.copies > 0)
            .sort(([a], [b]) => a.localeCompare(b, 'es'))
        };
      })
      .filter(island => island.municipalities.length);

    if (!geography.length) {
      target.innerHTML = '<p>No hay bibliotecas con ejemplares registrados para esta obra.</p>';
      return;
    }

    target.innerHTML = `
      <div class="library-location-picker">
        <div class="library-location-controls">
          <label><span>Isla</span>
            <select data-library-island>
              <option value="">Selecciona una isla</option>
              ${geography.map(island => `<option value="${esc(island.code)}">${esc(island.name)}</option>`).join('')}
            </select>
          </label>
          <label><span>Municipio</span>
            <select data-library-municipality disabled>
              <option value="">Selecciona primero una isla</option>
            </select>
          </label>
        </div>
        <p class="library-location-hint" data-library-location-hint>Solo aparecen islas y municipios donde RED BICA registra ejemplares de este libro.</p>
        <div class="library-location-results" data-library-location-results aria-live="polite"></div>
      </div>`;

    const islandSelect = target.querySelector('[data-library-island]');
    const municipalitySelect = target.querySelector('[data-library-municipality]');
    const hint = target.querySelector('[data-library-location-hint]');
    const results = target.querySelector('[data-library-location-results]');

    const showMunicipality = (island, municipality) => {
      const entry = island.municipalities.find(([name]) => name === municipality);
      if (!entry) { results.innerHTML = ''; return; }
      const [, group] = entry;
      const branchCount = group.branches.length;
      hint.innerHTML = `<strong>${esc(municipality)}</strong> · ${branchCount} ${branchCount === 1 ? 'biblioteca' : 'bibliotecas'} · ${group.copies} ${group.copies === 1 ? 'ejemplar' : 'ejemplares'} · ${group.available} disponibles ahora`;
      results.innerHTML = group.branches
        .map(([libraryId, library, branchId, branch]) => renderBranch(branchRecordMap, libraryId, library, branchId, branch))
        .join('');
    };

    const populateMunicipalities = island => {
      municipalitySelect.innerHTML = '<option value="">Selecciona un municipio</option>' +
        island.municipalities.map(([municipality, group]) =>
          `<option value="${esc(municipality)}">${esc(municipality)} · ${group.copies} ${group.copies === 1 ? 'ejemplar' : 'ejemplares'}</option>`
        ).join('');
      municipalitySelect.disabled = false;
      results.innerHTML = '';
      hint.textContent = `${island.name}: ${island.municipalities.length} ${island.municipalities.length === 1 ? 'municipio con ejemplares' : 'municipios con ejemplares'}. Elige uno para ver las bibliotecas.`;

      if (island.municipalities.length === 1) {
        municipalitySelect.value = island.municipalities[0][0];
        showMunicipality(island, island.municipalities[0][0]);
      }
    };

    islandSelect.addEventListener('change', () => {
      const island = geography.find(item => item.code === islandSelect.value);
      if (!island) {
        municipalitySelect.innerHTML = '<option value="">Selecciona primero una isla</option>';
        municipalitySelect.disabled = true;
        results.innerHTML = '';
        hint.textContent = 'Solo aparecen islas y municipios donde RED BICA registra ejemplares de este libro.';
        return;
      }
      populateMunicipalities(island);
    });

    municipalitySelect.addEventListener('change', () => {
      const island = geography.find(item => item.code === islandSelect.value);
      if (!island || !municipalitySelect.value) { results.innerHTML = ''; return; }
      showMunicipality(island, municipalitySelect.value);
    });
  }

  // ---- Carga de datos ----
  function loadJSON(url) {
    return fetch(url, {credentials: 'same-origin', cache: 'no-store'})
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      });
  }

  function matchesQuery(q) {
    const needle = String(q || '').trim().toLowerCase();
    if (!needle) return () => true;
    return value => String(value == null ? '' : value).toLowerCase().includes(needle);
  }

  function workText(w) {
    return [w.title, w.original_title, w.author && w.author.name, ...(w.topics || []).map(t => t.name)].join(' ');
  }

  async function loadData() {
    try {
      indexData = await loadJSON('/data/library/explorar.json');
    } catch (e) {
      statusEl.textContent = 'No se ha podido cargar el índice de la biblioteca.';
      return;
    }

    const withFicha = (indexData.authors || []).filter(a => a.ficha === 'completa');
    await Promise.all(withFicha.map(async a => {
      try {
        libraryData[a.slug] = await loadJSON(`/data/library/${a.slug}.json`);
        const indexed = new Set((a.works || []).map(w => w.slug));
        const works = (libraryData[a.slug].works || []).filter(w => indexed.has(w.slug));
        await Promise.all(works.map(w => loadJSON(`/data/book-pages/${a.slug}/${w.slug}.json`)
          .then(page => { bookPages[`${a.slug}/${w.slug}`] = page; })
          .catch(() => {})));
      } catch (e) {
        libraryData[a.slug] = null;
      }
    }));

    try { availabilityData = await loadJSON('/data/availability/brian-weiss.json'); } catch (e) { availabilityData = null; }
    try {
      directory = (await loadJSON('/data/libraries/canarias.json')).libraries || {};
    } catch (e) { directory = {}; }

    buildModel();
    applyDensity();
    renderControlState();
    if (!openBookFromHash()) renderShelves();
  }

  function buildModel() {
    topics = (indexData.topics || []).map(t => ({slug: t.slug, name: t.name}));

    authors = (indexData.authors || []).map(a => {
      const works = (a.works || []).map(w => {
        const key = `${a.slug}/${w.slug}`;
        const page = bookPages[key] || null;
        const lib = (libraryData[a.slug] && (libraryData[a.slug].works || []).find(x => x.slug === w.slug)) || null;
        const bicaWork = availabilityData && availabilityData.works ? availabilityData.works[w.slug] : null;
        const summary = bicaWork || lib;
        const cover = page && page.cover ? page.cover : (w.cover || null);
        let title = (page && page.title) || (lib && lib.title) || w.title || slugTitle(w.slug);
        const hasEditableLang = Array.isArray((page && page.languages)) ? page.languages.length : false;
        let languages = hasEditableLang
          ? page.languages
          : (lib && lib.languages) || [];
        return {
          key,
          slug: w.slug,
          topics: (w.topics || []).map(t => topics.find(x => x.slug === t)).filter(Boolean),
          title,
          original_title: (page && page.original_title) || w.original_title || null,
          languages,
          lead: (page && page.lead) || w.lead || '',
          about: (page && page.about) || [],
          primary_isbn: (page && page.primary_isbn) || '',
          isbns: (page && page.isbns) || [],
          cover: cover
            ? {src: cover.src, alt: cover.alt || `Portada de ${title}`, credit_source: cover.credit_source, credit_url: cover.credit_url}
            : null,
          archive: (lib && lib.archive) || w.archive || [],
          summary: summary
            ? {
                bica_records: summary.bica_records,
                copies: summary.copies,
                available: summary.available,
                isbn_count: summary.isbn_count
              }
            : null,
          last_checked: (lib && lib.last_checked) || (libraryData[a.slug] && libraryData[a.slug].last_checked) || (availabilityData && availabilityData.last_checked) || null,
          hasDaily: Boolean(bicaWork),
          hasDetailPage: Boolean(page || lib),
          isCatalogued: true,
          hasPhysical: Boolean(summary && Number(summary.copies || 0) > 0),
          availabilityNote: (libraryData[a.slug] && libraryData[a.slug].availability_note) || '',
          author: {slug: a.slug, name: a.name},
          page: page || lib ? `autores/${a.slug}/libros/${w.slug}/` : null
        };
      });
      return Object.assign({}, a, {works});
    });

    // Obra clave primero, luego por título.
    authors.forEach(a => {
      if (!a.works.length) return;
      const sorted = [...a.works].sort((x, y) => x.title.localeCompare(y.title, 'es'));
      const clave = a.obra_clave;
      if (clave) {
        const idx = sorted.findIndex(w => w.title.trim().toLowerCase() === String(clave).trim().toLowerCase());
        if (idx > -1) sorted.unshift(sorted.splice(idx, 1)[0]);
      }
      a.works = sorted;
    });
  }

  function allWorks() {
    const out = [];
    authors.forEach(a => a.works.forEach(w => out.push(w)));
    return out;
  }

  // ---- Controles ----
  function applyDensity() {
    root.classList.remove('density-compact', 'density-standard', 'density-wide');
    root.classList.add(`density-${state.density}`);
  }

  function renderControlState() {
    viewButtons.forEach(b => {
      const active = b.dataset.libraryView === state.view;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    densityButtons.forEach(b => {
      const active = b.dataset.density === state.density;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-pressed', String(active));
    });
  }

  // ---- Estantes ----
  function portraitHTML(a) {
    if (a.portrait) {
      const srcset = a.portrait.srcset ? ` srcset="${esc(a.portrait.srcset)}"` : '';
      return `<span class="library-shelf-portrait"><img src="${esc(a.portrait.src)}"${srcset} alt="${esc(a.portrait.alt || a.name)}" loading="lazy"></span>`;
    }
    const icon = PLACEHOLDER_ICONS[a.placeholder_icon === 'female' ? 'female' : 'male'];
    return `<span class="library-shelf-portrait"><img class="library-shelf-portrait-img-placeholder" src="${esc(icon)}" alt="" loading="lazy"></span>`;
  }

  function shelfHead(a) {
    const head = document.createElement('div');
    head.className = 'library-shelf-head';
    head.innerHTML = `
      <div class="library-shelf-author">
        ${portraitHTML(a)}
        <div class="library-shelf-name">
          <span class="eyebrow">${esc(a.area || '')}</span>
          <h3><a href="${esc(a.page)}">${esc(a.name)}</a></h3>
        </div>
      </div>
      <a class="library-shelf-link" href="${esc(a.page)}">Ver ficha de autor</a>`;
    return head;
  }

  function coverCreditHTML(w) {
    if (!w.cover || !w.cover.credit_source) return '';
    const sourceUrl = w.cover.credit_url || w.cover.src;
    return `<details class="image-credit library-card-credit">
      <summary aria-label="Información y créditos de la portada de ${esc(w.title)}" title="Información y créditos de la imagen"><span aria-hidden="true">i</span></summary>
      <div class="image-credit-panel">
        <p>Portada de una edición de <em>${esc(w.title)}</em>.</p>
        <p><a href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer">Fuente: ${esc(w.cover.credit_source)}</a></p>
      </div>
    </details>`;
  }

  function bookCard(w, opts) {
    const showAuthor = !!(opts && opts.showAuthor);
    const el = document.createElement('article');
    el.className = 'book-card';
    el.dataset.bookCard = w.key;
    if (!w.hasDetailPage) {
      el.classList.add('is-pending');
    }

    const badges = [];
    if (w.archive.length) badges.push('<span class="book-cover-badge badge-online" title="Lectura online"><img src="/assets/icons/lucide-monitor.svg" alt="">Online</span>');
    if (w.hasPhysical) badges.push('<span class="book-cover-badge badge-physical" title="Ejemplares físicos en bibliotecas"><img src="/assets/icons/lucide-book-open.svg" alt="">Físico</span>');

    el.innerHTML = `
      <div class="book-cover-wrap${w.cover ? ' image-with-credit' : ''}">
        ${badges.length ? `<div class="book-cover-badges">${badges.join('')}</div>` : ''}
        ${w.cover
          ? `<img class="book-cover" src="${esc(w.cover.src)}" alt="${esc(w.cover.alt)}" loading="lazy">${coverCreditHTML(w)}`
          : `<div class="book-cover is-placeholder"><span class="book-cover-mono" aria-hidden="true">${esc(monogram(w.title))}</span><span class="book-cover-placeholder-note">Portada pendiente de verificar</span></div>`}
      </div>
      <div class="book-card-copy">
        <h4>${esc(w.title)}</h4>
        ${w.original_title ? `<p class="book-card-original">${esc(w.original_title)}</p>` : ''}
        ${showAuthor ? `<p class="book-card-author">${esc(w.author.name)}</p>` : ''}
        <div class="book-card-meta">
          ${w.hasPhysical ? availabilityMarkup(w.summary.available, w.summary.copies) : ''}
          ${w.archive.length ? '<span class="book-card-ia-label">Lectura online</span>' : ''}
          ${!w.hasDetailPage ? '<span class="book-card-author-link">Ficha inicial</span>' : ''}
        </div>
        ${w.topics.length ? `<div class="book-card-topics">${w.topics.map(t => `<span class="book-card-topic">${esc(t.name)}</span>`).join('')}</div>` : ''}
      </div>
      <button type="button" class="book-card-open-hint" data-book-open aria-label="Abrir ficha de ${esc(w.title)}, de ${esc(w.author.name)}"></button>`;

    el.querySelector('[data-book-open]').addEventListener('click', () => {
      if (Date.now() >= suppressBookClickUntil) openBook(w.key);
    });
    return el;
  }

  function placeholderAuthorCard(a) {
    const el = document.createElement('article');
    el.className = 'book-card is-placeholder';
    el.innerHTML = `
      <div class="book-cover is-placeholder"><span class="book-cover-mono" aria-hidden="true">✎</span><span class="book-cover-placeholder-note">Ficha de autor en preparación</span></div>
      <div class="book-card-copy">
        <h4>${esc(a.name)}</h4>
        <p class="book-card-original"><strong>Obra clave:</strong> ${esc(a.obra_clave || '')}</p>
        <div class="book-card-meta"><a href="${esc(a.page)}">Ver ficha de autor</a></div>
      </div>`;
    return el;
  }

  function shelfRail(works, railOpts) {
    const opts = railOpts || {};
    const rail = document.createElement('div');
    rail.className = 'library-shelf-rail';
    rail.innerHTML = `<div class="library-shelf-row" data-shelf-row tabindex="0" aria-label="Estante desplazable"></div>`;
    const row = rail.querySelector('[data-shelf-row]');
    works.forEach(w => row.appendChild(bookCard(w, {showAuthor: !!opts.showAuthor})));

    const arrow = (dir, label) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `library-shelf-arrow is-${dir}`;
      b.setAttribute('aria-label', label);
      b.textContent = dir === 'prev' ? '‹' : '›';
      return b;
    };
    const prev = arrow('prev', 'Anterior');
    const next = arrow('next', 'Siguiente');
    rail.appendChild(prev);
    rail.appendChild(next);

    const refresh = () => {
      const over = row.scrollWidth > row.clientWidth + 4;
      const max = row.scrollWidth - row.clientWidth;
      rail.classList.toggle('has-overscroll', over);
      prev.disabled = !over || row.scrollLeft <= 12;
      next.disabled = !over || row.scrollLeft >= max - 12;
    };
    refresh();
    prev.addEventListener('click', () => row.scrollBy({left: -row.clientWidth * 0.8, behavior: 'smooth'}));
    next.addEventListener('click', () => row.scrollBy({left: row.clientWidth * 0.8, behavior: 'smooth'}));
    row.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        row.scrollBy({left: (e.key === 'ArrowLeft' ? -1 : 1) * row.clientWidth * 0.6, behavior: 'smooth'});
      }
    });
    row.addEventListener('scroll', () => {
      prev.disabled = row.scrollLeft <= 12;
      next.disabled = row.scrollLeft >= row.scrollWidth - row.clientWidth - 12;
    }, {passive: true});
    row.addEventListener('click', e => {
      if (Date.now() < suppressBookClickUntil) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
    installDragScroll(row);

    return {el: rail, refresh};
  }

  function installDragScroll(row) {
    let pointerId = null;
    let startX = 0;
    let startLeft = 0;
    let moved = false;
    let pendingBookKey = null;

    row.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      if (e.target.closest && e.target.closest('.image-credit')) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startLeft = row.scrollLeft;
      moved = false;
      pendingBookKey = e.target.closest && e.target.closest('[data-book-card]')
        ? e.target.closest('[data-book-card]').dataset.bookCard
        : null;
      row.classList.add('is-dragging');
      row.setPointerCapture(pointerId);
    });
    row.addEventListener('pointermove', e => {
      if (e.pointerId !== pointerId) return;
      const delta = e.clientX - startX;
      if (Math.abs(delta) > 5) moved = true;
      if (moved) row.scrollLeft = startLeft - delta;
    });
    const finish = e => {
      if (e.pointerId !== pointerId) return;
      if (moved) suppressBookClickUntil = Date.now() + 180;
      if (!moved && pendingBookKey) openBook(pendingBookKey);
      row.classList.remove('is-dragging');
      pointerId = null;
      pendingBookKey = null;
    };
    row.addEventListener('pointerup', finish);
    row.addEventListener('pointercancel', finish);
  }

  const railRefreshers = [];

  function emptyResults() {
    shelvesEl.innerHTML = `<div class="library-list-empty">No se han encontrado resultados${state.query ? ` para «${esc(state.query)}»` : ''}.</div>`;
  }

  function authorShelf(a) {
    if (!a.works.length) {
      if (state.query && !matchesQuery(state.query)(a.name + ' ' + a.area + ' ' + a.obra_clave + ' ' + a.descripcion)) return null;
      const section = document.createElement('section');
      section.className = 'library-shelf';
      section.appendChild(shelfHead(a));
      const desc = document.createElement('p');
      desc.className = 'library-shelf-desc';
      desc.textContent = a.descripcion || '';
      section.appendChild(desc);
      const holder = document.createElement('div');
      holder.className = 'library-shelf-row';
      holder.style.overflow = 'visible';
      holder.appendChild(placeholderAuthorCard(a));
      section.appendChild(holder);
      const meta = document.createElement('p');
      meta.className = 'library-shelf-meta';
      meta.textContent = 'Ficha de autor en preparación · obras pendientes de catalogar.';
      section.appendChild(meta);
      return section;
    }

    const hitsAuthor = matchesQuery(state.query)(`${a.name} ${a.area} ${a.obra_clave} ${a.descripcion}`);
    let works = a.works;
    if (state.query && !hitsAuthor) {
      works = a.works.filter(w => matchesQuery(state.query)(workText(w)));
      if (!works.length) return null;
    }

    const section = document.createElement('section');
    section.className = `library-shelf ${a.works.length <= 3 ? 'is-compact-author' : 'is-wide-author'}`;
    section.appendChild(shelfHead(a));
    const desc = document.createElement('p');
    desc.className = 'library-shelf-desc';
    desc.textContent = a.descripcion || '';
    section.appendChild(desc);

    const rail = shelfRail(works);
    railRefreshers.push(rail.refresh);
    section.appendChild(rail.el);

    const meta = document.createElement('p');
    meta.className = 'library-shelf-meta';
    const completas = a.works.filter(w => w.hasDetailPage).length;
    meta.textContent = completas === a.works.length
      ? `${a.works.length} ${a.works.length === 1 ? 'obra' : 'obras'} con ficha completa`
      : `${a.works.length} ${a.works.length === 1 ? 'obra' : 'obras'} con ficha · ${completas} ${completas === 1 ? 'completa' : 'completas'}`;
    section.appendChild(meta);
    return section;
  }

  function topicShelf(t) {
    const qf = state.query ? w => matchesQuery(state.query)(workText(w)) : null;
    const works = allWorks().filter(w => w.topics.some(x => x.slug === t.slug) && (!qf || qf(w)));
    if (!works.length) return null;

    const section = document.createElement('section');
    section.className = 'library-shelf';
    const head = document.createElement('div');
    head.className = 'library-shelf-head';
    head.innerHTML = `
      <div class="library-shelf-name">
        <span class="eyebrow">Tema</span>
        <h3>${esc(t.name)}</h3>
      </div>
      <span class="library-shelf-meta">${works.length} ${works.length === 1 ? 'obra' : 'obras'}</span>`;
    section.appendChild(head);

    const rail = shelfRail(works, {showAuthor: true});
    railRefreshers.push(rail.refresh);
    section.appendChild(rail.el);
    return section;
  }

  function listView() {
    const qf = state.query ? w => matchesQuery(state.query)(workText(w)) : null;
    const all = allWorks().filter(w => !qf || qf(w)).sort((a, b) => a.title.localeCompare(b.title, 'es'));
    if (!all.length) { emptyResults(); return; }
    const grid = document.createElement('div');
    grid.className = 'library-list-grid';
    all.forEach(w => grid.appendChild(bookCard(w, {showAuthor: true})));
    shelvesEl.appendChild(grid);
    statusEl.textContent = `${all.length} ${all.length === 1 ? 'obra' : 'obras'} en el listado${state.query ? ` para «${state.query}»` : ''}`;
  }

  function renderShelves() {
    closeImageCredits();
    document.body.classList.remove('library-book-active');
    root.classList.remove('is-book-open');
    shelvesEl.hidden = false;
    bookViewEl.hidden = true;
    shelvesEl.innerHTML = '';
    statusEl.textContent = '';
    railRefreshers.length = 0;
    shelvesEl.classList.toggle('is-authors-view', state.view === 'autores');

    if (state.view === 'autores') {
      authors.forEach(a => {
        const s = authorShelf(a);
        if (s) shelvesEl.appendChild(s);
      });
    } else if (state.view === 'temas') {
      topics.forEach(t => {
        const s = topicShelf(t);
        if (s) shelvesEl.appendChild(s);
      });
    } else {
      listView();
    }

    if (!shelvesEl.childElementCount) emptyResults();
  }

  // ---- Ficha de libro «abierta» ----
  function findWork(key) {
    const [aSlug, wSlug] = String(key || '').split('/');
    const author = authors.find(a => a.slug === aSlug);
    if (!author) return null;
    return author.works.find(w => w.slug === wSlug) || null;
  }

  function openBook(key) {
    const work = findWork(key);
    if (!work) return;
    history.pushState({libraryBook: key}, '', `#libro=${key}`);
    renderBook(work);
  }

  function renderBook(work) {
    closeImageCredits();
    document.body.classList.add('library-book-active');
    root.classList.add('is-book-open');
    bookViewEl.innerHTML = bookOpenHTML(work);
    bookViewEl.hidden = false;
    shelvesEl.hidden = true;

    const back = bookViewEl.querySelector('[data-book-back]');
    if (back) back.addEventListener('click', () => {
      if (history.state && history.state.libraryBook) {
        history.back();
      } else {
        history.replaceState(null, '', `${location.pathname}${location.search}`);
        renderShelves();
        smoothScroll(root);
      }
    });

    const zoom = bookViewEl.querySelector('[data-book-cover-zoom]');
    if (zoom) zoom.addEventListener('click', () => openZoom(work));

    if (work.hasDaily) {
      renderAvailabilityInto(work.slug, bookViewEl.querySelector('[data-island-status]'));
    }

    bookViewEl.querySelectorAll('[data-book-topic]').forEach(button => {
      button.addEventListener('click', () => {
        state.view = 'temas';
        state.query = button.dataset.bookTopic || '';
        if (searchInput) searchInput.value = state.query;
        history.replaceState(null, '', `${location.pathname}${location.search}`);
        renderControlState();
        renderShelves();
        smoothScroll(root);
      });
    });

    bookViewEl.querySelectorAll('[data-book-open]').forEach(button => {
      button.addEventListener('click', () => {
        const card = button.closest('[data-book-card]');
        if (card) openBook(card.dataset.bookCard);
      });
    });

    const rail = bookViewEl.querySelector('[data-other-rail]');
    if (rail) {
      const over = rail.scrollWidth > rail.clientWidth + 4;
      rail.classList.toggle('has-overscroll', over);
    }

    smoothScroll(bookViewEl);
  }

  function openBookFromHash() {
    const m = /^#libro=(.+)$/.exec(location.hash || '');
    if (!m) return false;
    const work = findWork(decodeURIComponent(m[1]));
    if (!work) return false;
    renderBook(work);
    return true;
  }

  function bookOpenHTML(w) {
    const lang = w.languages && w.languages.length ? w.languages[0] : 'es';
    const author = authors.find(a => a.slug === w.author.slug) || null;
    const tags = [
      ...w.topics.map(t => `<button type="button" class="book-open-topic" data-book-topic="${esc(t.name)}">${esc(t.name)}</button>`),
      `<span class="book-open-topic">${esc(lang.toUpperCase())}</span>`
    ].join('');
    const summaries = w.summary;
    const updated = formatChecked(w.last_checked);

    const archiveItems = w.archive.length
      ? w.archive.map((item, i) => {
          const label = item.title && /edici[oó]n/i.test(item.title) ? item.title : `Ejemplar ${i + 1}`;
          const itemLang = extractLang(item.title, lang);
          const t = iaTypeLabel(item.type);
          return `<li><strong>${esc(label)} · ${esc(itemLang)}</strong><br><span class="catalog-sub">${esc(t.sub)}</span><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(t.link)}</a></li>`;
        }).join('')
      : '<li>No hemos verificado todavía un recurso gratuito de lectura online para esta obra.</li>';

    const buy = buyLinks(w);

    const others = w.author && authors.find(a => a.slug === w.author.slug);
    const othersWorks = others ? others.works.filter(x => x.slug !== w.slug) : [];

    return `
      <div class="book-open-bar">
        <a class="book-open-library-link" href="/biblioteca-de-terapia-regresiva/">Biblioteca</a>
        <span class="book-open-path">Biblioteca · ${esc(w.author.name)} · ${esc(w.title)}</span>
      </div>
      <article class="book-open">
        <div class="book-open-hero">
          <div class="book-open-cover-col">
            <button type="button" class="book-open-back" data-book-back aria-label="Volver al estante de ${esc(w.author.name)}">← Volver al estante de ${esc(w.author.name)}</button>
            ${w.cover
              ? `<figure class="book-cover-feature image-with-credit">
                  <button type="button" class="book-open-cover-zoom" data-book-cover-zoom aria-label="Ampliar portada de ${esc(w.title)}">
                    <img src="${esc(w.cover.src)}" alt="${esc(w.cover.alt)}" loading="eager" fetchpriority="high">
                  </button>
                  <details class="image-credit"><summary aria-label="Información y créditos de la imagen" title="Información y créditos de la imagen"><span aria-hidden="true">i</span></summary>
                    <div class="image-credit-panel">
                      <p>Portada de una edición de <em>${esc(w.title)}</em>.</p>
                      <p>${w.cover.credit_source ? `<a href="${esc(w.cover.credit_url || '#')}" target="_blank" rel="noopener noreferrer">Fuente: ${esc(w.cover.credit_source)}</a>` : 'Fuente pendiente de documentación.'}</p>
                    </div>
                  </details>
                </figure>`
              : `<div class="book-cover is-placeholder" style="width:min(210px,100%);aspect-ratio:2/3"><span class="book-cover-mono" aria-hidden="true">${esc(monogram(w.title))}</span><span class="book-cover-placeholder-note">Portada pendiente de verificar</span></div>`}
            ${w.hasDetailPage
              ? `<a class="book-open-full-link" href="${esc(w.page)}">Abrir la ficha editorial completa →</a>`
              : '<span class="book-open-full-link is-muted">Edición y portada pendientes de documentar</span>'}
          </div>
          <div class="book-open-copy">
            <div class="eyebrow">Libro de ${esc(w.author.name)}</div>
            <h1>${esc(w.title)}</h1>
            ${w.original_title ? `<p class="book-original-title"><strong>Título original:</strong> <em>${esc(w.original_title)}</em>.</p>` : ''}
            <div class="book-open-tags" aria-label="Temas e idioma">${tags}</div>
            ${w.lead
              ? `<p class="lead">${esc(w.lead)}</p>`
              : `<p class="lead">Ficha inicial de <em>${esc(w.title)}</em>, una obra seleccionada en el estante de ${esc(w.author.name)}.</p>`}
            <div class="book-primary-actions">
              ${w.archive.length ? '<a href="#book-leer-online">Leer online</a>' : ''}
              <a href="#book-bibliotecas">Solicitar en préstamo</a>
            </div>
            <details class="book-edition-details">
              <summary>Datos de esta obra</summary>
              <div class="book-edition-details-body">
                <div class="book-language"><strong>Idioma:</strong> <span class="tag">${esc(lang.toUpperCase())}</span></div>
                ${w.isbns.length
                  ? `<p><strong>Ediciones e ISBN localizados</strong></p><ul class="book-editions-inline" aria-label="ISBN localizados">${w.isbns.map(isbn => `<li><strong>${esc(isbn)}</strong></li>`).join('')}</ul>`
                  : '<p class="book-notice">Los datos de edición e ISBN están pendientes de verificar.</p>'}
              </div>
            </details>
            ${author ? `<details class="book-open-flap" open>
              <summary>Solapa · sobre ${esc(author.name)}</summary>
              <div class="book-open-flap-inner">
                ${author.portrait
                  ? `<img src="${esc(author.portrait.src)}" alt="" loading="lazy">`
                  : `<span class="book-open-flap-monogram" aria-hidden="true">${esc(monogram(author.name))}</span>`}
                <div><strong>${esc(author.name)}</strong><p>${esc(author.descripcion || '')}</p><a href="${esc(author.page)}">Explorar su biblioteca →</a></div>
              </div>
            </details>` : ''}
          </div>
        </div>

        ${w.about.length ? `<section class="book-open-section">
          <h2>Sobre ${esc(w.title)}</h2>
          <div class="book-story">${w.about.map(p => `<p>${esc(p)}</p>`).join('')}</div>
        </section>` : `<section class="book-open-section"><h2>Sobre esta obra</h2><p class="book-notice">La reseña editorial está pendiente de documentación. La ficha se mantiene disponible para conservar la navegación completa de la biblioteca.</p></section>`}

        <section class="book-open-section">
          <h2>Disponibilidad de ${esc(w.title)} en las bibliotecas de Canarias</h2>
          ${summaries
            ? `<div class="book-availability-summary">
                <div><strong>${summaries.bica_records ?? '—'}</strong><span>registros en las bibliotecas de Canarias</span></div>
                <div><strong>${summaries.copies ?? '—'}</strong><span>ejemplares localizados</span></div>
                <div><strong>${summaries.available ?? '—'}</strong><span>disponibles</span></div>
                <div><strong>${summaries.isbn_count ?? '—'}</strong><span>ISBN localizados</span></div>
              </div>
              <p class="book-notice">La disponibilidad se actualiza una vez al día. Última comprobación: <strong>${esc(updated)}</strong>.</p>`
            : `<p class="book-notice">La disponibilidad de esta obra todavía no se ha verificado en RED BICA.</p>`}
        </section>

        <section class="book-open-section" id="book-leer-online">
          <h2>Leer o consultar ${esc(w.title)} online</h2>
          <p>Internet Archive funciona como una biblioteca digital. El préstamo o la consulta dependen de la disponibilidad del ejemplar.</p>
          <ul class="book-resource-list archive-copy-grid">${archiveItems}</ul>
        </section>

        <section class="book-open-section" id="book-bibliotecas">
          <h2>Préstamo de ${esc(w.title)} en Canarias</h2>
          <p>RED BICA aporta el catálogo y la disponibilidad. Los nombres públicos y la información de cada biblioteca se enriquecen con el Directorio de Bibliotecas de Canarias.</p>
          ${w.hasDaily
            ? `<div class="book-islands" data-island-status><p>Cargando disponibilidad…</p></div>`
            : `<p class="book-notice">${esc(w.availabilityNote || 'El desglose diario por biblioteca se incorporará en una próxima actualización.')}</p>`}
        </section>

        <section class="book-open-section">
          <h2>Si prefieres comprar ${esc(w.title)} de ${esc(w.author.name)}</h2>
          <p>Consulta ejemplares nuevos en librerías españolas o alternativas de segunda mano.</p>
          <div class="book-buy-options">${buy}</div>
        </section>

        ${othersWorks.length ? `<section class="book-open-section">
          <h2>Otros libros de ${esc(w.author.name)}</h2>
          <div class="library-shelf-rail"><div class="library-shelf-row" data-other-rail>
            ${othersWorks.map(x => bookCard(x).outerHTML).join('')}
          </div></div>
        </section>` : ''}
      </article>`;
  }

  function buyLinks(w) {
    const ttl = `https://www.todostuslibros.com/busquedas?titulo=${encodeURIComponent(w.title)}&autor=${encodeURIComponent(w.author.name)}`;
    const iber = `https://www.iberlibro.com/servlet/SearchResults?an=${encodeURIComponent(w.author.name.toLowerCase())}&tn=${encodeURIComponent(w.title)}`;
    const osdad = 'https://osdad.org/listado-de-libros-de-segunda-mano/';
    return `
      <a class="ttl-buy-card" href="${ttl}" target="_blank" rel="noopener noreferrer">
        <span class="ttl-buy-copy"><strong>Comprar nuevo en TodosTusLibros.com</strong><span>Consulta ediciones y librerías de España donde conseguirlo.</span></span>
      </a>
      <a class="book-buy-link service-buy-link" href="${iber}" target="_blank" rel="noopener noreferrer">
        <span class="service-card-copy"><strong>Buscar de segunda mano en IberLibro</strong><span>Ejemplares usados ofrecidos por librerías y vendedores.</span></span>
      </a>
      <a class="book-buy-link service-buy-link" href="${osdad}" target="_blank" rel="noopener noreferrer">
        <span class="service-card-copy"><strong>Consultar libros de segunda mano en OSDAD</strong><span>Inventario solidario publicado en Gran Canaria.</span></span>
      </a>`;
  }

  // ---- Zoom de portada ----
  function openZoom(work) {
    if (!work || !work.cover) return;
    const overlay = document.createElement('div');
    overlay.className = 'library-zoom-overlay';
    overlay.dataset.libraryZoom = '';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', `Portada ampliada de ${work.title}`);
    overlay.innerHTML = `
      <div class="library-zoom-frame">
        <img src="${esc(work.cover.src)}" alt="${esc(work.cover.alt)}">
        ${work.cover.credit_source
          ? `<p class="library-zoom-credit">Portada de una edición de <em>${esc(work.title)}</em>. Fuente: <a href="${esc(work.cover.credit_url || '#')}" target="_blank" rel="noopener noreferrer">${esc(work.cover.credit_source)}</a>.</p>`
          : `<p class="library-zoom-credit">Portada de una edición de <em>${esc(work.title)}</em>.</p>`}
      </div>`;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'library-zoom-close';
    close.setAttribute('aria-label', 'Cerrar portada ampliada');
    close.textContent = '×';
    overlay.appendChild(close);

    const dismiss = () => { overlay.remove(); };
    close.addEventListener('click', dismiss);
    overlay.addEventListener('click', e => { if (e.target === overlay) dismiss(); });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape' && document.body.contains(overlay)) {
        dismiss();
        document.removeEventListener('keydown', onKey);
      }
    });

    document.body.appendChild(overlay);
    close.focus();
  }

  // ---- Eventos ----
  viewButtons.forEach(button => {
    button.addEventListener('click', () => {
      state.view = button.dataset.libraryView;
      renderControlState();
      renderShelves();
    });
  });

  densityButtons.forEach(button => {
    button.addEventListener('click', () => {
      state.density = button.dataset.density;
      applyDensity();
      renderControlState();
      try { localStorage.setItem(DENSITY_KEY, state.density); } catch (e) {}
      requestAnimationFrame(() => railRefreshers.forEach(refresh => refresh()));
    });
  });

  if (searchInput) {
    let timer = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.query = searchInput.value.trim();
        renderShelves();
      }, 160);
    });
  }

  window.addEventListener('hashchange', () => {
    if (!/^#libro=/.test(location.hash || '')) {
      if (!bookViewEl.hidden) {
        bookViewEl.hidden = true;
        shelvesEl.hidden = false;
        renderShelves();
      }
      return;
    }
    if (!openBookFromHash()) renderShelves();
  });

  window.addEventListener('popstate', () => {
    if (!openBookFromHash()) renderShelves();
  });

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      // Los rails del estante pequeño lo rellenan sin romper el layout.
      document.querySelectorAll('.library-shelf-rail, [data-other-rail]').forEach(el => {
        const row = el.querySelector && el.querySelector('.library-shelf-row');
        if (row) el.classList.toggle('has-overscroll', row.scrollWidth > row.clientWidth + 4);
      });
    }).observe(root);
  }

  document.addEventListener('click', e => {
    const anchor = e.target.closest && e.target.closest('a[href^="#book-"]');
    if (anchor) {
      const targetId = anchor.getAttribute('href').slice(1);
      const target = bookViewEl.querySelector(`#${targetId}`);
      if (target) {
        e.preventDefault();
        smoothScroll(target);
      }
    }
  });

  // ---- Arranque ----
  applyDensity();
  renderControlState();
  statusEl.textContent = 'Cargando la biblioteca…';
  loadData();
})();
