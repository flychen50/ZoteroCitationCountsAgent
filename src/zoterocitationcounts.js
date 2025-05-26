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
          responseCallback: this._semanticScholarCallback.bind(this),
        },
      },
      {
        key: "nasaads",
        name: "NASA ADS",
        useDoi: true,
        useArxiv: true,
        useTitleSearch: false,
        methods: {
          urlBuilder: this._nasaadsUrl,
          responseCallback: this._nasaadsCallback.bind(this),
        },
      },
    ];

    this._initialized = true;
  },

  getCitationCount: function (item) {
    const extraFieldLines = (item.getField("extra") || "")
      .split("\n")
      .filter((line) => /^Citations:|^\d+ citations/i.test(line));
    if (extraFieldLines.length > 0) {
      const match = extraFieldLines[0].match(/\d+/);
      if (match) return match[0];
    }
    return "-";
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
    this._log(`Entering updateItems for API: ${api ? api.name : 'Unknown'}. Number of raw items: ${itemsRaw ? itemsRaw.length : 0}. API Object Name: ${api ? api.name : 'N/A'}`);
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
    this._log(`[Debug] _setCitationCount: Entered for item '${item.getField('title') || item.id}', source: '${source}', count: ${count}`);
    console.log('DEBUG _setCitationCount called:', { id: item.id, source, count, item });
    const pattern = /^Citations \(${source}\):|^\d+ citations \(${source}\)/i;
    const extraFieldLinesInitial = (item.getField("extra") || "")
      .split("\n")
      .filter((line) => !pattern.test(line));
    this._log(`[Debug] _setCitationCount: Initial extraFieldLines (after filter): ${JSON.stringify(extraFieldLinesInitial)}`);

    const today = new Date().toISOString().split("T")[0];
    const lineToUnshift = `${count} citations (${source}) [${today}]`;
    this._log(`[Debug] _setCitationCount: Line to unshift: '${lineToUnshift}'`);
    
    // Create a new array for modification to avoid issues with logging the same reference if unshift modifies in place and logging is async.
    const extraFieldLines = [...extraFieldLinesInitial];
    extraFieldLines.unshift(lineToUnshift);
    this._log(`[Debug] _setCitationCount: extraFieldLines after unshift: ${JSON.stringify(extraFieldLines)}`);

    const finalExtraString = extraFieldLines.join('\n');
    this._log(`[Debug] _setCitationCount: Final string for setField: '${finalExtraString}'`);

    console.log('DEBUG setField about to be called:', { id: item.id, finalExtraString });
    item.setField("extra", finalExtraString);
    item.saveTx();
    this._log(`[Debug] _setCitationCount: Exited for item '${item.getField('title') || item.id}'`);
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
      this._log(`Network error fetching ${url}: ${networkError.message}. Throwing 'citationcounts-progresswindow-error-network-issue'.`);
      throw new Error("citationcounts-progresswindow-error-network-issue");
    }

    if (!response.ok) {
      const status = response.status;
      this._log(`Received non-ok HTTP status ${status} for ${url}.`);

      if (url.includes("api.adsabs.harvard.edu") && (status === 401 || status === 403)) {
        this._log(`NASA ADS API key error for ${url}: status ${status}. Throwing 'citationcounts-progresswindow-error-nasaads-apikey'.`);
        throw new Error("citationcounts-progresswindow-error-nasaads-apikey");
      } else if (status === 400) {
        this._log(`Bad request for ${url}: status ${status}. Throwing 'citationcounts-progresswindow-error-api-bad-request'.`);
        throw new Error("citationcounts-progresswindow-error-api-bad-request");
      } else if (status === 404) {
        this._log(`Resource not found for ${url}: status ${status}. Throwing 'citationcounts-progresswindow-error-api-not-found'.`);
        throw new Error("citationcounts-progresswindow-error-api-not-found");
      } else if (status === 429) {
        this._log(`Rate limit exceeded for ${url}: status ${status}. Throwing 'citationcounts-progresswindow-error-api-rate-limit'.`);
        throw new Error("citationcounts-progresswindow-error-api-rate-limit");
      } else if (status >= 500 && status < 600) {
        this._log(`Server error for ${url}: status ${status}. Throwing 'citationcounts-progresswindow-error-api-server-error'.`);
        throw new Error("citationcounts-progresswindow-error-api-server-error");
      } else if (status === 401 || status === 403) {
        // Generic auth error for non-NASA ADS APIs.
        // Consider creating a more specific key if this becomes common for other APIs with keys.
        this._log(`Authentication/Authorization error for ${url}: status ${status}. Throwing 'citationcounts-progresswindow-error-bad-api-response' as fallback.`);
        throw new Error("citationcounts-progresswindow-error-bad-api-response");
      } else {
        // Default for other non-ok statuses
        this._log(`Unhandled non-ok HTTP status ${status} for ${url}. Throwing 'citationcounts-progresswindow-error-bad-api-response'.`);
        throw new Error("citationcounts-progresswindow-error-bad-api-response");
      }
    }

    try {
      const jsonData = await response.json();
      const count = parseInt(await callback(jsonData)); // callback might be async
      if (!(Number.isInteger(count) && count >= 0)) {
        this._log(`Invalid count received from callback for ${url}. Count: ${count}. Throwing 'citationcounts-progresswindow-error-no-citation-count'.`);
        throw new Error("Invalid count"); // This will be caught and converted below
      }
      return count;
    } catch (error) { // Catches errors from response.json(), callback, parseInt, or the explicit "Invalid count" throw
      this._log(`Error processing API response or invalid count for ${url}: ${error.message}.`);
      // If it's already a specific error we want to propagate (like NASA API key), rethrow it.
      // This check is important if the callback itself could throw a pre-formatted error.
      const specificErrorMessages = [
        "citationcounts-progresswindow-error-nasaads-apikey",
        "citationcounts-progresswindow-error-api-bad-request",
        "citationcounts-progresswindow-error-api-not-found",
        "citationcounts-progresswindow-error-api-rate-limit",
        "citationcounts-progresswindow-error-api-server-error",
        "citationcounts-progresswindow-error-network-issue", // Should have been caught earlier, but good for safety
        "citationcounts-progresswindow-error-bad-api-response" // If callback explicitly throws this
      ];
      if (specificErrorMessages.includes(error.message)) {
        this._log(`Re-throwing specific error: ${error.message}`);
        throw error;
      }
      // Otherwise, assume it's an issue with parsing, callback logic, or invalid count, leading to "no citation count".
      this._log(`Defaulting to 'citationcounts-progresswindow-error-no-citation-count' for error: ${error.message}`);
      throw new Error("citationcounts-progresswindow-error-no-citation-count");
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
    this._log(`[Debug] Final Error Handling for item '${item.getField('title') || item.id}', API '${apiName}'. DOI error: ${doiError ? doiError.message : 'null'}, ArXiv error: ${arxivError ? arxivError.message : 'null'}, Title error: ${titleError ? titleError.message : 'null'}`);

    const highPriorityErrors = [
      "citationcounts-progresswindow-error-network-issue",
      "citationcounts-progresswindow-error-api-server-error",
      "citationcounts-progresswindow-error-nasaads-apikey", // Specific to NASA ADS, very high
      "citationcounts-progresswindow-error-api-rate-limit",
      "citationcounts-progresswindow-error-api-bad-request",
      "citationcounts-progresswindow-error-bad-api-response", // Generic non-OK HTTP response
      "citationcounts-progresswindow-error-api-not-found" // True 404 from API
    ];

    const encounteredHighPriority = [];
    if (doiError && highPriorityErrors.includes(doiError.message)) {
      encounteredHighPriority.push(doiError);
    }
    if (arxivError && highPriorityErrors.includes(arxivError.message)) {
      encounteredHighPriority.push(arxivError);
    }
    if (titleError && highPriorityErrors.includes(titleError.message)) {
      encounteredHighPriority.push(titleError);
    }

    if (encounteredHighPriority.length > 0) {
      // Sort by the predefined priority list. Lower index means higher priority.
      encounteredHighPriority.sort((a, b) => highPriorityErrors.indexOf(a.message) - highPriorityErrors.indexOf(b.message));
      const highestPriorityError = encounteredHighPriority[0];
      this._log(`[Debug] High-priority error detected: ${highestPriorityError.message}. Throwing this error.`);
      throw highestPriorityError;
    }

    // If no high-priority errors, proceed with low-priority error logic.
    this._log("[Debug] No high-priority errors detected. Proceeding with low-priority error logic.");

    const doiAttempted = useDoi;
    const arxivAttempted = useArxiv;
    const titleSearchAttempted = useTitleSearch;

    // Helper to check if an error is a "not found on item" or "no citations" type for a specific method
    const isLookupFailure = (err, methodSpecificNoIdError) => {
      if (!err) return false;
      return err.message === methodSpecificNoIdError || err.message === "citationcounts-progresswindow-error-no-citation-count";
    };
    
    const doiLookupFailed = isLookupFailure(doiError, "citationcounts-progresswindow-error-no-doi");
    const arxivLookupFailed = isLookupFailure(arxivError, "citationcounts-progresswindow-error-no-arxiv");
    const titleLookupFailed = titleError && (
        titleError.message === "citationcounts-progresswindow-error-insufficient-metadata-for-title-search" ||
        titleError.message === "citationcounts-progresswindow-error-no-citation-count"
    );

    // Case 1: All attempted methods failed with "lookup failures" (no ID, no citations, insufficient metadata)
    let allAttemptedMethodsFailedLookup = true;
    if (doiAttempted && !doiLookupFailed) allAttemptedMethodsFailedLookup = false;
    if (arxivAttempted && !arxivLookupFailed) allAttemptedMethodsFailedLookup = false;
    if (titleSearchAttempted && !titleLookupFailed) allAttemptedMethodsFailedLookup = false;

    if (allAttemptedMethodsFailedLookup && (doiAttempted || arxivAttempted || titleSearchAttempted)) {
      this._log(`[Debug] All attempted methods for ${apiName} resulted in lookup failures.`);
      // Special handling for NASA ADS "no results"
      if (apiName === "NASA ADS" && (doiAttempted || arxivAttempted || titleSearchAttempted) ) {
          // If title search specifically failed due to insufficient metadata, and it was an option, it's the most specific.
          if (titleSearchAttempted && titleError && titleError.message === "citationcounts-progresswindow-error-insufficient-metadata-for-title-search") {
              this._log(`[Debug] NASA ADS: Insufficient metadata for title search. Throwing '${titleError.message}'.`);
              throw titleError;
          }
          const nasaNoResultsError = new Error("citationcounts-progresswindow-error-nasaads-no-results");
          this._log(`[Debug] NASA ADS: All methods failed to find results. Throwing '${nasaNoResultsError.message}'.`);
          throw nasaNoResultsError;
      }

      // For other APIs, if title search was attempted and failed due to insufficient metadata
      if (titleSearchAttempted && titleError && titleError.message === "citationcounts-progresswindow-error-insufficient-metadata-for-title-search") {
        this._log(`[Debug] ${apiName}: Insufficient metadata for title search. Throwing '${titleError.message}'.`);
        throw titleError;
      }
      
      // Generic "no results from any attempt" for other APIs
      const noResultsAllAttemptsError = new Error("citationcounts-progresswindow-error-no-results-all-attempts");
      this._log(`[Debug] ${apiName}: No results from any attempted method. Throwing '${noResultsAllAttemptsError.message}'.`);
      throw noResultsAllAttemptsError;
    }

    // Case 2: Specific "no ID" or "insufficient metadata" errors if they were the primary reason for failure
    // This section handles cases where not all methods might have been "lookup failures", or only some methods were attempted.

    // If title search was the only method or primary remaining method and failed due to insufficient metadata
    if (titleSearchAttempted && titleError && titleError.message === "citationcounts-progresswindow-error-insufficient-metadata-for-title-search") {
        if ((!doiAttempted || doiLookupFailed) && (!arxivAttempted || arxivLookupFailed)) {
            this._log(`[Debug] ${apiName}: Title search failed due to insufficient metadata; other methods also failed lookup or not attempted. Throwing '${titleError.message}'.`);
            throw titleError;
        }
    }
    
    // If title search yielded "no citation count" and other methods also failed lookup or were not applicable.
    if (titleSearchAttempted && titleError && titleError.message === "citationcounts-progresswindow-error-no-citation-count") {
        if ((!doiAttempted || doiLookupFailed) && (!arxivAttempted || arxivLookupFailed)) {
             this._log(`[Debug] ${apiName}: No citation count from title search; other methods also failed lookup or not attempted. Throwing '${titleError.message}'.`);
            throw titleError; // This is "no-citation-count" from title search
        }
    }

    // Fallback to DOI/ArXiv specific "no id" errors if they were the reason and title search wasn't conclusive or attempted
    if (doiAttempted && doiError && doiError.message === "citationcounts-progresswindow-error-no-doi") {
        if ((!arxivAttempted || arxivLookupFailed) && (!titleSearchAttempted || titleLookupFailed)) {
            this._log(`[Debug] ${apiName}: DOI not found on item. Throwing '${doiError.message}'.`);
            throw doiError;
        }
    }
    if (arxivAttempted && arxivError && arxivError.message === "citationcounts-progresswindow-error-no-arxiv") {
         if ((!doiAttempted || doiLookupFailed) && (!titleSearchAttempted || titleLookupFailed)) {
            this._log(`[Debug] ${apiName}: ArXiv ID not found on item. Throwing '${arxivError.message}'.`);
            throw arxivError;
        }
    }
    
    // If both DOI and ArXiv were attempted and failed with "no id" or "no citations"
    // and title search was either not attempted or also failed lookup.
    if (doiAttempted && doiLookupFailed && arxivAttempted && arxivLookupFailed) {
        if (!titleSearchAttempted || titleLookupFailed) {
            // If title search was also a lookup failure or not attempted, and both DOI/ArXiv are lookup failures.
            // "no-doi-or-arxiv" might be too specific if title was also tried.
            // The "allAttemptedMethodsFailedLookup" above should catch this for "no-results-all-attempts".
            // However, if only DOI and ArXiv were attempted:
            if (!titleSearchAttempted) {
                 const noDoiOrArxivError = new Error("citationcounts-progresswindow-error-no-doi-or-arxiv");
                 this._log(`[Debug] ${apiName}: Both DOI and ArXiv lookups failed (no ID or no citations). Throwing '${noDoiOrArxivError.message}'.`);
                 throw noDoiOrArxivError;
            }
        }
    }
    
    // If any of the attempts resulted in a "no-citation-count" and wasn't superseded by a more specific error.
    // This is a bit of a catch-all for "found the item, but it has 0 citations" or "callback couldn't parse".
    if (doiError && doiError.message === "citationcounts-progresswindow-error-no-citation-count") {
        this._log(`[Debug] ${apiName}: DOI lookup resulted in 'no-citation-count'. Throwing this as final error.`);
        throw doiError;
    }
    if (arxivError && arxivError.message === "citationcounts-progresswindow-error-no-citation-count") {
        this._log(`[Debug] ${apiName}: ArXiv lookup resulted in 'no-citation-count'. Throwing this as final error.`);
        throw arxivError;
    }
    if (titleError && titleError.message === "citationcounts-progresswindow-error-no-citation-count") {
        this._log(`[Debug] ${apiName}: Title lookup resulted in 'no-citation-count'. Throwing this as final error.`);
        throw titleError;
    }


    // Fallback for unhandled cases or configuration issues.
    let attemptedMethods = [];
    if (useDoi) attemptedMethods.push("DOI");
    if (useArxiv) attemptedMethods.push("ArXiv");
    if (useTitleSearch) attemptedMethods.push("Title");

    if (attemptedMethods.length === 0) {
      const internalError = new Error("citationcounts-internal-error-no-retrieval-methods");
      this._log(`[Debug] Configuration error for ${apiName}: No retrieval methods enabled. Throwing '${internalError.message}'.`);
      throw internalError;
    }

    // If we've reached here, it means methods were attempted, no high-priority errors occurred,
    // and the specific low-priority logic above didn't pinpoint a more precise error.
    // This could happen if, for example, only DOI was attempted, and it failed with 'no-doi', but the conditions
    // for throwing 'no-doi' specifically weren't met because other methods were configured but didn't run or didn't error.
    // This acts as a final fallback.
    const unknownError = new Error("citationcounts-progresswindow-error-unknown");
    this._log(`[Debug] Unhandled error state for ${apiName} for item '${item.getField('title') || item.id}'. Attempted: ${attemptedMethods.join(', ')}. Errors: DOI(${doiError ? doiError.message : 'null'}), ArXiv(${arxivError ? arxivError.message : 'null'}), Title(${titleError ? titleError.message : 'null'}). Throwing '${unknownError.message}'.`);
    throw unknownError;
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
