ZoteroCitationCountsAgent = {
  _initialized: false,

  pluginID: null,
  pluginVersion: null,
  rootURI: null,

  l10n: null,
  APIs: [],

  /**
   * Track injected XULelements for removal upon mainWindowUnload.
   */
  _addedElementIDs: [],

  _log(msg) {
    Zotero.debug("ZoteroCitationCountsAgent: " + msg);
  },

  init: function ({ id, version, rootURI }) {
    if (this._initialized) return;

    this.pluginID = id;
    this.pluginVersion = version;
    this.rootURI = rootURI;

    this.l10n = new Localization(["zoterocitationcountsagent.ftl"]);

    /**
     * To add a new API:
     * -----------------
     * (1) Create a urlBuilder method on the ZoteroCitationCountsAgent object. Args: urlencoded *id* and *idtype* ("doi" or "arxiv"). Return: URL for API request.
     *
     * (2) Create a responseCallback method on the ZoteroCitationCountsAgent object. Args: *response* from api call. Return: citation count number.
     *
     * (3) Register the API here, and specify whether it works with doi, arxiv id or both.
     *
     * (4) for now, you also need to register the APIs key and name in "preferences.js" (important that they match the keys and names from below).
     */
    this.APIs = [
      {
        key: "crossref",
        name: "Crossref",
        useDoi: true,
        useArxiv: false,
        methods: {
          urlBuilder: this._crossrefUrl,
          responseCallback: this._crossrefCallback,
        },
      },
      {
        key: "inspire",
        name: "INSPIRE-HEP",
        useDoi: true,
        useArxiv: true,
        methods: {
          urlBuilder: this._inspireUrl,
          responseCallback: this._inspireCallback,
        },
      },
      {
        key: "semanticscholar",
        name: "Semantic Scholar",
        useDoi: true,
        useArxiv: true,
        methods: {
          urlBuilder: this._semanticScholarUrl,
          responseCallback: this._semanticScholarCallback,
        },
      },
      {
        key: "nasaads",
        name: "NASA ADS",
        useDoi: true,
        useArxiv: true,
        methods: {
          urlBuilder: this._nasaadsUrl,
          responseCallback: this._nasaadsCallback,
        },
      },
    ];

    this._initialized = true;
  },

  getCitationCount: function (item) {
    const extraFieldLines = (item.getField("extra") || "")
      .split("\n")
      .filter((line) => /^Citations:|^\d+ citations/i.test(line));

    return extraFieldLines[0]?.match(/^\d+/) || "-";
  },

  getPref: function (pref) {
    return Zotero.Prefs.get("extensions.zoterocitationcountsagent." + pref, true);
  },

  setPref: function (pref, value) {
    return Zotero.Prefs.set("extensions.zoterocitationcountsagent." + pref, value, true);
  },

  icon: function (iconName, hiDPI) {
    return `chrome://zotero/skin/${iconName}${
      hiDPI ? (Zotero.hiDPI ? "@2x" : "") : ""
    }.png`;
  },

  /////////////////////////////////////////////
  //            UI related stuff             //
  ////////////////////////////////////////////

  /**
   * Create XULElement, set it's attributes, inject accordingly to the DOM & save a reference for later removal.
   *
   * @param {Document} document - "Document"-interface to be operated on.
   * @param {String} elementType - XULElement type (e.g. "menu", "popupmenu" etc.)
   * @param {String} elementID - The elements *unique* ID attribute.
   * @param {Object} elementAttributes - An object of key-value pairs that represent the DOM element attributes.
   * @param {String} parentID - The *unique* ID attribute of the element's parent element.
   * @param {Object} eventListeners - An object where keys are event types (e.g., 'command') and values are corresponding event handler functions.
   *
   * @returns {MozXULElement} - A reference to the injected XULElement.
   */
  _injectXULElement: function (
    document,
    elementType,
    elementID,
    elementAttributes,
    parentID,
    eventListeners
  ) {
    const element = document.createXULElement(elementType);
    element.id = elementID;

    Object.entries(elementAttributes || {})
      .filter(([_, value]) => value !== null && value !== undefined)
      .forEach(([key, value]) => element.setAttribute(key, value));

    Object.entries(eventListeners || {}).forEach(([eventType, listener]) => {
      element.addEventListener(eventType, listener);
    });

    document.getElementById(parentID).appendChild(element);
    this._storeAddedElement(element);

    return element;
  },

  _storeAddedElement: function (elem) {
    if (!elem.id) {
      throw new Error("Element must have an id.");
    }

    this._addedElementIDs.push(elem.id);
  },

  /**
   * Create a submenu to Zotero's "Tools"-menu, from which the plugin specific "autoretrieve" preference can be set.
   */
  _createToolsMenu: function (document) {
    const menu = this._injectXULElement(
      document,
      "menu",
      "menu_Tools-citationcounts-menu",
      { "data-l10n-id": "citationcounts-menutools-autoretrieve-title" },
      "menu_ToolsPopup"
    );

    const menupopup = this._injectXULElement(
      document,
      "menupopup",
      "menu_Tools-citationcounts-menu-popup",
      {},
      menu.id,
      {
        popupshowing: () => {
          this.APIs.concat({ key: "none" }).forEach((api) => {
            document
              .getElementById(`menu_Tools-citationcounts-menu-popup-${api.key}`)
              .setAttribute(
                "checked",
                Boolean(this.getPref("autoretrieve") === api.key)
              );
          });
        },
      }
    );

    this.APIs.concat({ key: "none" }).forEach((api) => {
      const label =
        api.key === "none"
          ? { "data-l10n-id": "citationcounts-menutools-autoretrieve-api-none" }
          : {
              "data-l10n-id": "citationcounts-menutools-autoretrieve-api",
              "data-l10n-args": `{"api": "${api.name}"}`,
            };

      this._injectXULElement(
        document,
        "menuitem",
        `menu_Tools-citationcounts-menu-popup-${api.key}`,
        {
          ...label,
          type: "checkbox",
        },
        menupopup.id,
        { command: () => this.setPref("autoretrieve", api.key) }
      );
    });
  },

  /**
   * Create a submenu to Zotero's "Item"-context menu, from which citation counts for selected items can be manually retrieved.
   */
  _createItemMenu: function (document) {
    const menu = this._injectXULElement(
      document,
      "menu",
      "zotero-itemmenu-citationcounts-menu",
      {
        "data-l10n-id": "citationcounts-itemmenu-retrieve-title",
        class: "menu-iconic",
      },
      "zotero-itemmenu"
    );

    const menupopup = this._injectXULElement(
      document,
      "menupopup",
      "zotero-itemmenu-citationcounts-menupopup",
      {},
      menu.id
    );

    this.APIs.forEach((api) => {
      this._injectXULElement(
        document,
        "menuitem",
        `zotero-itemmenu-citationcounts-${api.key}`,
        {
          "data-l10n-id": "citationcounts-itemmenu-retrieve-api",
          "data-l10n-args": `{"api": "${api.name}"}`,
        },
        menupopup.id,
        {
          command: () =>
            this.updateItems(
              Zotero.getActiveZoteroPane().getSelectedItems(),
              api
            ),
        }
      );
    });
  },

  /**
   * Inject plugin specific DOM elements in a DOM window.
   */
  addToWindow: function (window) {
    window.MozXULElement.insertFTLIfNeeded("zoterocitationcountsagent.ftl");

    this._createToolsMenu(window.document);
    this._createItemMenu(window.document);
  },

  /**
   * Inject plugin specific DOM elements into all Zotero windows.
   */
  addToAllWindows: function () {
    const windows = Zotero.getMainWindows();

    for (let window of windows) {
      if (!window.ZoteroPane) continue;
      this.addToWindow(window);
    }
  },

  /**
   * Remove plugin specific DOM elements from a DOM window.
   */
  removeFromWindow: function (window) {
    const document = window.document;

    for (let id of this._addedElementIDs) {
      document.getElementById(id)?.remove();
    }

    document.querySelector('[href="zoterocitationcountsagent.ftl"]').remove();
  },

  /**
   * Remove plugin specific DOM elements from all Zotero windows.
   */
  removeFromAllWindows: function () {
    const windows = Zotero.getMainWindows();

    for (let window of windows) {
      if (!window.ZoteroPane) continue;
      this.removeFromWindow(window);
    }
  },

  //////////////////////////////////////////////////////////
  //      Update citation count operation stuff          //
  /////////////////////////////////////////////////////////

  /**
   * Start citation count retrieval operation
   */
  updateItems: async function (itemsRaw, api) {
    const items = itemsRaw.filter((item) => !item.isFeedItem);
    if (!items.length) return;

    const progressWindow = new Zotero.ProgressWindow();
    progressWindow.changeHeadline(
      await this.l10n.formatValue("citationcounts-progresswindow-headline", {
        api: api.name,
      }),
      this.icon("toolbar-advanced-search")
    );

    const progressWindowItems = [];
    const itemTitles = items.map((item) => item.getField("title"));
    itemTitles.forEach((title) => {
      progressWindowItems.push(
        new progressWindow.ItemProgress(this.icon("spinner-16px"), title)
      );
    });

    progressWindow.show();

    this._updateItem(0, items, api, progressWindow, progressWindowItems);
  },

  /**
   * Updates citation counts recursively for a list of items.
   *
   * @param currentItemIndex - Index of currently updating Item. Zero-based.
   * @param items - List of all Items to be updated in this operation.
   * @param api - API to be used to retrieve *items* citation counts.
   * @param progressWindow - ProgressWindow associated with this operation.
   * @param progressWindowItems - List of references to each Zotero.ItemProgress in *progressWindow*.
   */
  _updateItem: async function (
    currentItemIndex,
    items,
    api,
    progressWindow,
    progressWindowItems
  ) {
    // Check if operation is done
    if (currentItemIndex >= items.length) {
      const headlineFinished = await this.l10n.formatValue(
        "citationcounts-progresswindow-finished-headline",
        { api: api.name }
      );
      progressWindow.changeHeadline(headlineFinished);
      progressWindow.startCloseTimer(5000);
      return;
    }

    const item = items[currentItemIndex];
    const pwItem = progressWindowItems[currentItemIndex];

    try {
      const [count, source] = await this._retrieveCitationCount(
        item,
        api.name,
        api.useDoi,
        api.useArxiv,
        api.methods.urlBuilder,
        api.methods.responseCallback
      );

      this._setCitationCount(item, source, count);

      pwItem.setIcon(this.icon("tick"));
      pwItem.setProgress(100);
    } catch (error) {
      pwItem.setError();
      new progressWindow.ItemProgress(
        this.icon("bullet_yellow"),
        await this.l10n.formatValue(error.message, { api: api.name }),
        pwItem
      );
    }

    this._updateItem(
      currentItemIndex + 1,
      items,
      api,
      progressWindow,
      progressWindowItems
    );
  },

  /**
   * Insert the retrieve citation count into the Items "extra" field.
   * Ref: https://www.zotero.org/support/kb/item_types_and_fields#citing_fields_from_extra
   */
  _setCitationCount: function (item, source, count) {
    const pattern = /^Citations \(${source}\):|^\d+ citations \(${source}\)/i;
    const extraFieldLines = (item.getField("extra") || "")
      .split("\n")
      .filter((line) => !pattern.test(line));

    const today = new Date().toISOString().split("T")[0];
    extraFieldLines.unshift(`${count} citations (${source}) [${today}]`);

    item.setField("extra", extraFieldLines.join("\n"));
    item.saveTx();
  },

  /**
   * Get the value of an items DOI field.
   * @TODO make more robust, e.g. try to extract DOI from url/extra field as well.
   */
  _getDoi: function (item) {
    const doi = item.getField("DOI");
    if (!doi) {
      throw new Error("citationcounts-progresswindow-error-no-doi");
    }

    return encodeURIComponent(doi);
  },

  /**
   * Get the value of an items arXiv field.
   * @TODO make more robust, e.g. try to extract arxiv id from extra field as well.
   */
  _getArxiv: function (item) {
    const itemURL = item.getField("url");
    const arxivMatch =
      /(?:arxiv.org[/]abs[/]|arXiv:)([a-z.-]+[/]\d+|\d+[.]\d+)/i.exec(itemURL);

    if (!arxivMatch) {
      throw new Error("citationcounts-progresswindow-error-no-arxiv");
    }

    return encodeURIComponent(arxivMatch[1]);
  },

  _getItemMetadataForAdsQuery: function (item) {
    const metadata = {
      title: null,
      author: null,
      year: null,
    };

    // Extract Title
    const title = item.getField("title");
    if (title) {
      metadata.title = title;
    }

    // Extract Year
    let year = item.getField("year");
    if (year) {
      metadata.year = String(year);
    } else {
      const date = item.getField("date");
      if (date) {
        const yearMatch = String(date).match(/^(?:c\. )?(\d{4})/); // Matches "YYYY" at the start, handles "c. YYYY"
        if (yearMatch && yearMatch[1]) {
          metadata.year = yearMatch[1];
        }
      }
    }

    // Extract Author's Last Name
    const creators = item.getCreators();
    if (creators && creators.length > 0) {
      const firstCreator = creators[0];
      if (firstCreator.lastName) {
        metadata.author = firstCreator.lastName;
      } else if (firstCreator.name) {
        metadata.author = firstCreator.name; // Fallback to 'name' if 'lastName' is not available
      }
    }

    return metadata;
  },

  /**
   * Send a request to a specified url, handle response with specified callback, and return a validated integer.
   */
  _sendRequest: async function (url, callback) {
    let response;
    // Add Authorization header for NASA ADS
    const headers = {};
    if (url.includes("api.adsabs.harvard.edu")) {
      const apiKey = this.getPref("nasaadsApiKey");
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    try {
      response = await fetch(url, { headers });
    } catch (networkError) {
      // Catch network errors (e.g., DNS resolution failure, server unreachable)
      this._log(`Network error fetching ${url}: ${networkError.message}`);
      throw new Error("citationcounts-progresswindow-error-bad-api-response");
    }

    if (url.includes("api.adsabs.harvard.edu") && (response.status === 401 || response.status === 403)) {
      this._log(`NASA ADS API key error for ${url}: status ${response.status}`);
      throw new Error("citationcounts-progresswindow-error-nasaads-apikey");
    }

    if (!response.ok) {
      this._log(`Bad API response for ${url}: status ${response.status}`);
      throw new Error("citationcounts-progresswindow-error-bad-api-response");
    }

    try {
      const jsonData = await response.json();
      const count = parseInt(await callback(jsonData));
      if (!(Number.isInteger(count) && count >= 0)) {
        // throw generic error that will be converted by the catch block.
        throw new Error("Invalid count"); 
      }
      return count;
    } catch (error) { // Catches errors from response.json(), callback, parseInt, or the explicit throw
      this._log(`Error processing API response for ${url}: ${error.message}`);
      // If it's already our specific NASA ADS key error, rethrow it.
      if (error.message === "citationcounts-progresswindow-error-nasaads-apikey") {
          throw error;
      }
      // Check if the error came from parsing or callback logic (e.g., "Invalid count"), differentiate from bad-api-response
      if (error.message !== "citationcounts-progresswindow-error-bad-api-response") {
          throw new Error("citationcounts-progresswindow-error-no-citation-count");
      }
      // Rethrow "citationcounts-progresswindow-error-bad-api-response" if it somehow propagated here,
      // or any other unexpected error that wasn't specifically handled above.
      throw error; 
    }
  },

  _retrieveCitationCount: async function (
    item,
    apiName,
    useDoi,
    useArxiv,
    urlFunction,
    requestCallback
  ) {
    let doiError = null;
    let arxivError = null;
    let titleError = null;

    // DOI Attempt
    if (useDoi) {
      try {
        const doiField = this._getDoi(item);
        const count = await this._sendRequest(
          urlFunction(doiField, "doi"),
          requestCallback
        );
        this._log(`Successfully fetched citation count via ${apiName}/DOI for item '${item.getField('title') || item.id}'. Count: ${count}`);
        return [count, `${apiName}/DOI`];
      } catch (error) {
        if (error.message === 'citationcounts-progresswindow-error-no-citation-count') {
          this._log(`No citation count found via ${apiName}/DOI for item '${item.getField('title') || item.id}'.`);
        }
        doiError = error;
      }
    }

    // ArXiv Attempt
    if (useArxiv) {
      try {
        const arxivField = this._getArxiv(item);
        const count = await this._sendRequest(
          urlFunction(arxivField, "arxiv"),
          requestCallback
        );
        this._log(`Successfully fetched citation count via ${apiName}/arXiv for item '${item.getField('title') || item.id}'. Count: ${count}`);
        return [count, `${apiName}/arXiv`];
      } catch (error) {
        if (error.message === 'citationcounts-progresswindow-error-no-citation-count') {
          this._log(`No citation count found via ${apiName}/arXiv for item '${item.getField('title') || item.id}'.`);
        }
        arxivError = error;
      }
    }

    // NASA ADS Title Search Attempt
    if (apiName === "NASA ADS") {
      // Proceed if DOI/arXiv attempts didn't return or if their errors are "not found" types.
      // Critical errors from DOI/arXiv attempts will be prioritized in the error handling below.
      const metadata = this._getItemMetadataForAdsQuery(item);
      if (metadata && metadata.title && (metadata.author || metadata.year)) {
        try {
          const count = await this._sendRequest(
            urlFunction(metadata, "title_author_year"),
            requestCallback
          );
          this._log(`Successfully fetched citation count via ${apiName}/Title for item '${item.getField('title') || item.id}'. Count: ${count}`);
          return [count, `${apiName}/Title`];
        } catch (error) {
          if (error.message === 'citationcounts-progresswindow-error-no-citation-count') {
            this._log(`No citation count found via ${apiName}/Title for item '${item.getField('title') || item.id}'.`);
          }
          titleError = error;
        }
      } else {
        // Only set this error if no other more critical error (like API key) has already occurred for title.
        if (!titleError) { 
          titleError = new Error("citationcounts-progresswindow-error-insufficient-metadata-for-title-search");
        }
      }
    }

    // Final Error Handling

    // Prioritize critical errors (API key, bad response, etc.) over "not found" errors.
    if (doiError && doiError.message !== "citationcounts-progresswindow-error-no-doi") {
      this._log(`Failed to retrieve citation count for item '${item.getField('title') || item.id}' after all attempts. Error: ${doiError.message}`);
      throw doiError;
    }
    if (arxivError && arxivError.message !== "citationcounts-progresswindow-error-no-arxiv") {
      this._log(`Failed to retrieve citation count for item '${item.getField('title') || item.id}' after all attempts. Error: ${arxivError.message}`);
      throw arxivError;
    }
    // For titleError, "no-citation-count" is a valid "not found" type error from ADS, so don't treat it as critical here.
    // "insufficient-metadata" is also not critical in the same way as an API key error.
    if (titleError && 
        titleError.message !== "citationcounts-progresswindow-error-no-citation-count" &&
        titleError.message !== "citationcounts-progresswindow-error-insufficient-metadata-for-title-search") {
      this._log(`Failed to retrieve citation count for item '${item.getField('title') || item.id}' after all attempts. Error: ${titleError.message}`);
      throw titleError;
    }
    
    // If we're here, all attempts failed or resulted in "not found" or "insufficient metadata" errors.
    if (apiName === "NASA ADS") {
      // Check if all avenues for NASA ADS are exhausted or resulted in non-critical errors.
      const doiFailedOrNotUsed = !useDoi || (doiError && doiError.message === "citationcounts-progresswindow-error-no-doi");
      const arxivFailedOrNotUsed = !useArxiv || (arxivError && arxivError.message === "citationcounts-progresswindow-error-no-arxiv");
      // titleError here could be "no-citation-count", "insufficient-metadata", or a critical one already thrown.
      // We are interested if a title search was attempted and failed non-critically, or was not possible.
      const titleSearchFailedOrNotPossible = titleError !== null;


      if (doiFailedOrNotUsed && arxivFailedOrNotUsed && titleSearchFailedOrNotPossible) {
         // If titleError is "insufficient-metadata", that's the most specific.
        if (titleError && titleError.message === "citationcounts-progresswindow-error-insufficient-metadata-for-title-search") {
          this._log(`Failed to retrieve citation count for item '${item.getField('title') || item.id}' after all attempts. Error: ${titleError.message}`);
          throw titleError;
        }
        // If title search resulted in "no-citation-count" after DOI/arXiv also yielded nothing of substance
        if (titleError && titleError.message === "citationcounts-progresswindow-error-no-citation-count") {
            const finalError = new Error("citationcounts-progresswindow-error-nasaads-no-results");
            this._log(`Failed to retrieve citation count for item '${item.getField('title') || item.id}' after all attempts. Error: ${finalError.message}`);
            throw finalError;
        }
        // If title search itself had a critical error, it would have been thrown above.
        // If titleError is null here, it means title search was not attempted (e.g. not NASA ADS, or metadata was missing but didn't set titleError - fixed above)
        // or it was successful (which means we wouldn't be in this error handling block).
        // So, if titleError is null but doi/arxiv failed, this implies title search was not relevant or didn't even get to set an error.
        // This case should ideally be covered by "insufficient metadata" or the general "no-doi-or-arxiv" if title wasn't applicable.
        // Given the logic, if titleSearchFailedOrNotPossible is true, titleError is not null.
        const finalErrorNasaNoResults = new Error("citationcounts-progresswindow-error-nasaads-no-results");
        this._log(`Failed to retrieve citation count for item '${item.getField('title') || item.id}' after all attempts. Error: ${finalErrorNasaNoResults.message}`);
        throw finalErrorNasaNoResults;
      }
      if (titleError) { // If title search failed (e.g. no-citation-count, insufficient-metadata)
        this._log(`Failed to retrieve citation count for item '${item.getField('title') || item.id}' after all attempts. Error: ${titleError.message}`);
        throw titleError; 
      }
    }

    // General "Not Found" type errors for any API
    if (useDoi && doiError && useArxiv && arxivError) { // Both attempted, both are "no-id" type
      const finalErrorNoDoiOrArxiv = new Error("citationcounts-progresswindow-error-no-doi-or-arxiv");
      this._log(`Failed to retrieve citation count for item '${item.getField('title') || item.id}' after all attempts. Error: ${finalErrorNoDoiOrArxiv.message}`);
      throw finalErrorNoDoiOrArxiv;
    }
    if (useDoi && doiError) { // Only DOI attempted (or arXiv not attempted/successful) and DOI is "no-id"
      this._log(`Failed to retrieve citation count for item '${item.getField('title') || item.id}' after all attempts. Error: ${doiError.message}`);
      throw doiError;
    }
    if (useArxiv && arxivError) { // Only arXiv attempted (or DOI not attempted/successful) and arXiv is "no-id"
      this._log(`Failed to retrieve citation count for item '${item.getField('title') || item.id}' after all attempts. Error: ${arxivError.message}`);
      throw arxivError;
    }

    // Fallback if no specific error was thrown. This indicates an unhandled case or an API configured with no valid ID types.
    // If an API is configured (e.g. useDoi=true) but no error was set (e.g. _getDoi didn't throw, _sendRequest didn't throw but we still didn't return)
    // this is an internal logic issue.
    if (useDoi || useArxiv || apiName === "NASA ADS") {
      // If any retrieval method was supposed to be active but we reached here without throwing.
      // This might happen if e.g. useDoi is true, but doiError is null (somehow).
      // This path should ideally not be reached if logic is perfect.
      const unknownError = new Error("citationcounts-progresswindow-error-unknown");
      this._log(`Internal error: Reached end of _retrieveCitationCount for ${apiName} without success or specific error. DOI error: ${doiError}, ArXiv error: ${arxivError}, Title error: ${titleError}. Surfacing as: ${unknownError.message}`);
      throw unknownError; // A generic "unknown" or "internal"
    }
    
    // If the API was somehow called with no valid types (e.g. useDoi=false, useArxiv=false, and not NASA ADS)
    // This is an internal configuration error.
    const internalError = new Error("citationcounts-internal-error");
    this._log(`Configuration error: _retrieveCitationCount called for ${apiName} with no valid ID types enabled. Error: ${internalError.message}`);
    throw internalError; // Or a more specific "misconfigured API" error
  },

  /////////////////////////////////////////////
  //            API specific stuff           //
  ////////////////////////////////////////////

  _crossrefUrl: function (id, type) {
    return `https://api.crossref.org/works/${id}/transform/application/vnd.citationstyles.csl+json`;
  },

  _crossrefCallback: function (response) {
    return response["is-referenced-by-count"];
  },

  _inspireUrl: function (id, type) {
    return `https://inspirehep.net/api/${type}/${id}`;
  },

  _inspireCallback: function (response) {
    return response["metadata"]["citation_count"];
  },

  _semanticScholarUrl: function (id, type) {
    const prefix = type === "doi" ? "" : "arXiv:";
    return `https://api.semanticscholar.org/graph/v1/paper/${prefix}${id}?fields=citationCount`;
  },

  // The callback can be async if we want.
  _semanticScholarCallback: async function (response) {
    count = response["citationCount"];

    // throttle Semantic Scholar so we don't reach limit.
    await new Promise((r) => setTimeout(r, 3000));
    return count;
  },

  _nasaadsUrl: function (id, type, query_params) {
    // NASA ADS API key should be sent via HTTP header, not as a URL param
    if (type === "doi" || type === "arxiv") {
      return `https://api.adsabs.harvard.edu/v1/search/query?q=${type}:${id}&fl=citation_count`;
    } else if (type === "title_author_year") {
      let queryString = "";
      if (id && id.title) {
        queryString += `title:"${encodeURIComponent(id.title)}" `;
      }
      if (id && id.author) {
        queryString += `author:"${encodeURIComponent(id.author)}" `;
      }
      if (id && id.year) {
        queryString += `year:${encodeURIComponent(id.year)} `;
      }
      queryString = queryString.trim(); // Remove trailing space
      return `https://api.adsabs.harvard.edu/v1/search/query?q=${queryString}&fl=citation_count`;
    }
    // Fallback or error handling if needed, though the problem description doesn't specify
    return ""; 
  },

  _nasaadsCallback: function (response) {
    if (response.response && response.response.numFound > 1) {
      this._log(`NASA ADS query returned ${response.response.numFound} results. Using the first one.`);
    }

    if (response.response && response.response.docs && response.response.docs.length > 0 && response.response.docs[0].hasOwnProperty('citation_count')) {
      return response.response.docs[0].citation_count;
    } else {
      this._log('NASA ADS response did not contain expected citation_count. Response: ' + JSON.stringify(response));
      return null; // This will be caught by parseInt validation in _sendRequest
    }
  },
};
