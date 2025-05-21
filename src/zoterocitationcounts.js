ZoteroCitationCounts = {
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
    Zotero.debug("Zotero Citation Counts: " + msg);
  },

  init: function ({ id, version, rootURI }) {
    if (this._initialized) return;

    this.pluginID = id;
    this.pluginVersion = version;
    this.rootURI = rootURI;

    this.l10n = new Localization(["citation-counts.ftl"]);

    /**
     * To add a new API:
     * -----------------
     * (1) Create a urlBuilder method on the ZoteroCitationCounts object. Args: urlencoded *id* and *idtype* ("doi" or "arxiv"). Return: URL for API request.
     *
     * (2) Create a responseCallback method on the ZoteroCitationCounts object. Args: *response* from api call. Return: citation count number.
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
        useTitleSearch: true,
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
    return Zotero.Prefs.get("extensions.citationcounts." + pref, true);
  },

  setPref: function (pref, value) {
    return Zotero.Prefs.set("extensions.citationcounts." + pref, value, true);
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
    window.MozXULElement.insertFTLIfNeeded("citation-counts.ftl");

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

    document.querySelector('[href="citation-counts.ftl"]').remove();
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
    this._log(`Entering updateItems for API: ${api ? api.name : 'Unknown'}. Number of raw items: ${itemsRaw ? itemsRaw.length : 0}`);
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
    api, // This is an object from the APIs array
    progressWindow,
    progressWindowItems
  ) {
    // Check if operation is done
    if (currentItemIndex >= items.length) {
      const headlineFinished = await this.l10n.formatValue(
        "citationcounts-progresswindow-finished-headline",
        { api: api.name } // api.name is correct here
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
        api.name, // Pass the API name
        api.useDoi, // Pass DOI preference
        api.useArxiv, // Pass ArXiv preference
        api.methods.urlBuilder,
        api.methods.responseCallback,
        api.useTitleSearch // Pass title search preference
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
    requestCallback,
    useTitleSearch // New parameter based on API config
  ) {
    this._log(`[Debug] _retrieveCitationCount: Item '${item.getField('title') || item.id}' for API '${apiName}'. useDoi: ${useDoi}, useArxiv: ${useArxiv}, useTitleSearch: ${useTitleSearch}`);
    let doiError = null;
    let arxivError = null;
    let titleError = null;

    // DOI Attempt
    if (useDoi) {
      this._log("[Debug] Attempting DOI lookup.");
      try {
        const doiField = this._getDoi(item);
        this._log(`[Debug] DOI field obtained: '${doiField}'`);
        const count = await this._sendRequest(
          urlFunction(doiField, "doi"),
          requestCallback
        );
        this._log(`Successfully fetched citation count via ${apiName}/DOI for item '${item.getField('title') || item.id}'. Count: ${count}`);
        return [count, `${apiName}/DOI`];
      } catch (error) {
        this._log(`[Debug] DOI lookup error: ${error.message}`);
        if (error.message === 'citationcounts-progresswindow-error-no-citation-count') {
          this._log(`No citation count found via ${apiName}/DOI for item '${item.getField('title') || item.id}'.`);
        }
        doiError = error;
      }
    }

    // ArXiv Attempt
    if (useArxiv) {
      this._log("[Debug] Attempting ArXiv lookup.");
      try {
        const arxivField = this._getArxiv(item);
        this._log(`[Debug] ArXiv field obtained: '${arxivField}'`);
        const count = await this._sendRequest(
          urlFunction(arxivField, "arxiv"),
          requestCallback
        );
        this._log(`Successfully fetched citation count via ${apiName}/arXiv for item '${item.getField('title') || item.id}'. Count: ${count}`);
        return [count, `${apiName}/arXiv`];
      } catch (error) {
        this._log(`[Debug] ArXiv lookup error: ${error.message}`);
        if (error.message === 'citationcounts-progresswindow-error-no-citation-count') {
          this._log(`No citation count found via ${apiName}/arXiv for item '${item.getField('title') || item.id}'.`);
        }
        arxivError = error;
      }
    }

    // Generic Title Search Attempt (e.g., for NASA ADS, Semantic Scholar if enabled)
    if (useTitleSearch) {
      this._log("[Debug] Attempting Title search.");
      const metadata = this._getItemMetadataForAdsQuery(item); // Using existing function
      this._log(`[Debug] Metadata for title search: ${JSON.stringify(metadata)}`);
      const isMetadataSufficient = metadata && metadata.title && (metadata.author || metadata.year);
      this._log(`[Debug] Metadata sufficient for title search: ${isMetadataSufficient}`);

      if (isMetadataSufficient) {
        try {
          const count = await this._sendRequest(
            urlFunction(metadata, "title_author_year"), // urlFunction will build the correct URL
            requestCallback
          );
          this._log(`Successfully fetched citation count via ${apiName}/Title for item '${item.getField('title') || item.id}'. Count: ${count}`);
          return [count, `${apiName}/Title`];
        } catch (error) {
          this._log(`[Debug] Title search lookup error: ${error.message}`);
          if (error.message === 'citationcounts-progresswindow-error-no-citation-count') {
            this._log(`No citation count found via ${apiName}/Title for item '${item.getField('title') || item.id}'.`);
          }
          // Prioritize more critical errors (like API key issues from _sendRequest) 
          // over "no-citation-count" or "insufficient-metadata".
          if (!titleError || 
              (titleError.message === 'citationcounts-progresswindow-error-no-citation-count' && error.message !== 'citationcounts-progresswindow-error-no-citation-count') ||
              (titleError.message === 'citationcounts-progresswindow-error-insufficient-metadata-for-title-search' && error.message !== 'citationcounts-progresswindow-error-insufficient-metadata-for-title-search')) {
            titleError = error;
          }
        }
      } else {
        // Set insufficient metadata error only if no more critical error (e.g. API key from a previous title attempt) has been set.
        if (!titleError) { 
          this._log(`Insufficient metadata for title search for item '${item.getField('title') || item.id}' using ${apiName}.`);
          titleError = new Error("citationcounts-progresswindow-error-insufficient-metadata-for-title-search");
        }
      }
    }

    // Final Error Handling

    // Prioritize critical errors (API key, bad response, etc.) over "not found" or "insufficient metadata" errors.
    // A critical error from DOI attempt takes precedence.
    if (doiError && 
        doiError.message !== "citationcounts-progresswindow-error-no-doi" && 
        doiError.message !== "citationcounts-progresswindow-error-no-citation-count") {
        this._log(`[Debug] Final error to be thrown: ${doiError.message}`);
        this._log(`Critical DOI error for ${apiName} for item '${item.getField('title') || item.id}': ${doiError.message}`);
        throw doiError;
    }
    // A critical error from ArXiv attempt takes next precedence.
    if (arxivError && 
        arxivError.message !== "citationcounts-progresswindow-error-no-arxiv" && 
        arxivError.message !== "citationcounts-progresswindow-error-no-citation-count") {
        this._log(`[Debug] Final error to be thrown: ${arxivError.message}`);
        this._log(`Critical ArXiv error for ${apiName} for item '${item.getField('title') || item.id}': ${arxivError.message}`);
        throw arxivError;
    }
    // A critical error from Title attempt takes next precedence.
    // (Includes API key errors, bad API responses, etc. from _sendRequest)
    if (titleError && 
        titleError.message !== "citationcounts-progresswindow-error-no-citation-count" &&
        titleError.message !== "citationcounts-progresswindow-error-insufficient-metadata-for-title-search") {
        this._log(`[Debug] Final error to be thrown: ${titleError.message}`);
        this._log(`Critical Title Search error for ${apiName} for item '${item.getField('title') || item.id}': ${titleError.message}`);
        throw titleError;
    }
    
    // If we are here, all recorded errors are of "not found", "no id", or "insufficient metadata" type.
    // Now, determine the most appropriate "not found" or "cannot attempt" error to throw based on what was attempted.

    const doiAttempted = useDoi;
    const arxivAttempted = useArxiv;
    const titleSearchAttempted = useTitleSearch;

    const doiFailedNonCritically = doiError && (doiError.message === "citationcounts-progresswindow-error-no-doi" || doiError.message === "citationcounts-progresswindow-error-no-citation-count");
    const arxivFailedNonCritically = arxivError && (arxivError.message === "citationcounts-progresswindow-error-no-arxiv" || arxivError.message === "citationcounts-progresswindow-error-no-citation-count");
    const titleFailedNonCritically = titleError && (titleError.message === "citationcounts-progresswindow-error-no-citation-count" || titleError.message === "citationcounts-progresswindow-error-insufficient-metadata-for-title-search");

    // Case 1: All attempted methods failed non-critically.
    let allApplicableMethodsFailedNonCritically = true;
    if (doiAttempted && !doiFailedNonCritically) allApplicableMethodsFailedNonCritically = false;
    if (arxivAttempted && !arxivFailedNonCritically) allApplicableMethodsFailedNonCritically = false;
    if (titleSearchAttempted && !titleFailedNonCritically) allApplicableMethodsFailedNonCritically = false;
    
    if (allApplicableMethodsFailedNonCritically && (doiAttempted || arxivAttempted || titleSearchAttempted)) {
      // Special handling for NASA ADS "no results"
      if (apiName === "NASA ADS" && titleSearchAttempted) { // NASA ADS uses title search as part of its core strategy
        // If title search itself was due to insufficient metadata, that's the most specific error.
        if (titleError && titleError.message === "citationcounts-progresswindow-error-insufficient-metadata-for-title-search") {
            this._log(`[Debug] Final error to be thrown: ${titleError.message}`);
            this._log(`NASA ADS: All attempts failed for item '${item.getField('title') || item.id}'. Final error: ${titleError.message}`);
            throw titleError;
        }
        const finalNasaError = new Error("citationcounts-progresswindow-error-nasaads-no-results");
        this._log(`[Debug] Final error to be thrown: ${finalNasaError.message}`);
        this._log(`NASA ADS: No results from any method for item '${item.getField('title') || item.id}'. Error: ${finalNasaError.message}`);
        throw finalNasaError;
      }

      // For other APIs (like Semantic Scholar now) or if NASA ADS didn't use title search for some reason
      if (titleSearchAttempted && titleError && titleError.message === "citationcounts-progresswindow-error-insufficient-metadata-for-title-search") {
        // If title search couldn't be performed due to metadata, and DOI/ArXiv also failed non-critically
        this._log(`[Debug] Final error to be thrown: ${titleError.message}`);
        this._log(`All attempts for ${apiName} failed for item '${item.getField('title') || item.id}'. Final error: ${titleError.message}`);
        throw titleError; // "insufficient-metadata..."
      }
      
      // Generic "no results from any attempt"
      const finalErrorAllAttempts = new Error("citationcounts-progresswindow-error-no-results-all-attempts");
      this._log(`[Debug] Final error to be thrown: ${finalErrorAllAttempts.message}`);
      this._log(`${apiName}: No citation count found after all attempts (DOI, ArXiv, Title if applicable) for item '${item.getField('title') || item.id}'. Error: ${finalErrorAllAttempts.message}`);
      throw finalErrorAllAttempts;
    }

    // Case 2: Some attempts failed non-critically, others were not applicable or didn't set an error (should not happen if logic is correct).
    // Prioritize the "most specific" non-critical error.
    // If title search failed due to insufficient metadata, and it was the "last resort" or only resort.
    if (titleSearchAttempted && titleError && titleError.message === "citationcounts-progresswindow-error-insufficient-metadata-for-title-search") {
        if ((!doiAttempted || doiFailedNonCritically) && (!arxivAttempted || arxivFailedNonCritically)) {
            this._log(`[Debug] Final error to be thrown: ${titleError.message}`);
            this._log(`${apiName}: Title search failed due to insufficient metadata for item '${item.getField('title') || item.id}', other methods also failed or not applicable. Error: ${titleError.message}`);
            throw titleError;
        }
    }
    
    // If title search yielded "no citation count" and other methods also failed non-critically or were not applicable.
    if (titleSearchAttempted && titleError && titleError.message === "citationcounts-progresswindow-error-no-citation-count") {
        if ((!doiAttempted || doiFailedNonCritically) && (!arxivAttempted || arxivFailedNonCritically)) {
            this._log(`[Debug] Final error to be thrown: ${titleError.message}`);
            this._log(`${apiName}: No citation count from title search for item '${item.getField('title') || item.id}', other methods also failed or not applicable. Error: ${titleError.message}`);
            throw titleError; // This is "no-citation-count"
        }
    }

    // Fallback to DOI/ArXiv specific "not found" errors if title search was not attempted or did not set an error.
    if (doiAttempted && doiFailedNonCritically && arxivAttempted && arxivFailedNonCritically) {
      const finalErrorNoDoiOrArxiv = new Error("citationcounts-progresswindow-error-no-doi-or-arxiv");
      this._log(`[Debug] Final error to be thrown: ${finalErrorNoDoiOrArxiv.message}`);
      this._log(`${apiName}: Both DOI and ArXiv lookups failed for item '${item.getField('title') || item.id}'. Error: ${finalErrorNoDoiOrArxiv.message}`);
      throw finalErrorNoDoiOrArxiv;
    }
    if (doiAttempted && doiFailedNonCritically) {
      this._log(`[Debug] Final error to be thrown: ${doiError.message}`);
      this._log(`${apiName}: DOI lookup failed for item '${item.getField('title') || item.id}'. Error: ${doiError.message}`);
      throw doiError; // "no-doi" or "no-citation-count" from DOI
    }
    if (arxivAttempted && arxivFailedNonCritically) {
      this._log(`[Debug] Final error to be thrown: ${arxivError.message}`);
      this._log(`${apiName}: ArXiv lookup failed for item '${item.getField('title') || item.id}'. Error: ${arxivError.message}`);
      throw arxivError; // "no-arxiv" or "no-citation-count" from ArXiv
    }

    // Fallback for unhandled cases or configuration issues.
    let attemptedMethods = [];
    if (doiAttempted) attemptedMethods.push("DOI");
    if (arxivAttempted) attemptedMethods.push("ArXiv");
    if (titleSearchAttempted) attemptedMethods.push("Title");

    if (attemptedMethods.length > 0) {
      // This means at least one method was configured, but we didn't return success and didn't throw a specific error above.
      // This might indicate an error in the logic (e.g., a method was attempted, didn't succeed, but its error variable was not set).
      const unknownError = new Error("citationcounts-progresswindow-error-unknown");
      this._log(`[Debug] Final error to be thrown: ${unknownError.message}`);
      this._log(`Internal error: Reached end of _retrieveCitationCount for ${apiName} for item '${item.getField('title') || item.id}' with methods (${attemptedMethods.join(', ')}) enabled but no success or specific error. DOI error: ${doiError}, ArXiv error: ${arxivError}, Title error: ${titleError}. Surfacing as: ${unknownError.message}`);
      throw unknownError;
    } else {
      // This means the API was called with no retrieval methods enabled (e.g. useDoi=false, useArxiv=false, useTitleSearch=false).
      const internalError = new Error("citationcounts-internal-error-no-retrieval-methods");
      this._log(`[Debug] Final error to be thrown: ${internalError.message}`);
      this._log(`Configuration error: _retrieveCitationCount called for ${apiName} for item '${item.getField('title') || item.id}' with no valid ID types (DOI, ArXiv, TitleSearch) enabled. Error: ${internalError.message}`);
      throw internalError;
    }
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
    if (type === "title_author_year") {
      let queryString = "";
      if (id && id.title) {
        queryString += `title:${encodeURIComponent(id.title)}`;
      }
      if (id && id.author) {
        queryString += `${queryString ? "+" : ""}author:${encodeURIComponent(
          id.author
        )}`;
      }
      if (id && id.year) {
        queryString += `${queryString ? "+" : ""}year:${encodeURIComponent(
          id.year
        )}`;
      }
      return `https://api.semanticscholar.org/graph/v1/paper/search?query=${queryString}&fields=citationCount,externalIds`;
    } else {
      // Existing logic for DOI/ArXiv
      if (type === "doi") {
        return `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(id)}?fields=citationCount`;
      } else { // arxiv
        return `https://api.semanticscholar.org/graph/v1/paper/arXiv:${encodeURIComponent(id)}?fields=citationCount`;
      }
    }
  },

  // The callback can be async if we want.
  _semanticScholarCallback: async function (response) {
    let count;

    // throttle Semantic Scholar so we don't reach limit.
    // This needs to be done before any return, regardless of path.
    await new Promise((r) => setTimeout(r, 3000));

    if (response.data) {
      // Handle search results
      if (response.data.length > 1) {
        this._log(
          `Semantic Scholar query returned ${response.data.length} results. Using the first one.`
        );
      }
      if (response.data.length > 0 && response.data[0].citationCount !== null && response.data[0].citationCount !== undefined) {
        count = response.data[0].citationCount;
        // Optionally, one could also extract and use response.data[0].externalIds here if needed later.
      } else {
        this._log(
          "Semantic Scholar search response did not contain expected citationCount in the first result or no results found. Response: " +
            JSON.stringify(response)
        );
        return null; // Will be caught by parseInt validation in _sendRequest
      }
    } else if (response.citationCount !== null && response.citationCount !== undefined) {
      // Handle direct DOI/ArXiv lookup
      count = response.citationCount;
    } else {
      this._log(
        "Semantic Scholar response did not contain expected citationCount. Response: " +
          JSON.stringify(response)
      );
      return null; // Will be caught by parseInt validation in _sendRequest
    }

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
