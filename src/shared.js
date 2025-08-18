/**
 * Shared utilities and constants for Zotero Citation Counts plugin
 * Eliminates code duplication between main plugin and preferences
 */
ZoteroCitationCounts_Shared = {
  
  /**
   * Configuration constants
   */
  CONSTANTS: {
    PROGRESS_WINDOW_CLOSE_DELAY: 5000,
    API_REQUEST_DELAY: 3000,
    PREFERENCE_ICON: "edit-list-order"
  },

  /**
   * Centralized API registry - single source of truth
   * To add a new API:
   * 1. Add entry here with key, name, and capabilities
   * 2. Implement urlBuilder and responseCallback methods on ZoteroCitationCounts
   */
  API_REGISTRY: [
    {
      key: "crossref",
      name: "Crossref",
      useDoi: true,
      useArxiv: false,
      useTitleSearch: false
    },
    {
      key: "inspire", 
      name: "INSPIRE-HEP",
      useDoi: true,
      useArxiv: true,
      useTitleSearch: false
    },
    {
      key: "semanticscholar",
      name: "Semantic Scholar", 
      useDoi: true,
      useArxiv: true,
      useTitleSearch: true
    },
    {
      key: "nasaads",
      name: "NASA ADS",
      useDoi: true,
      useArxiv: true,
      useTitleSearch: false
    }
  ],

  /**
   * Shared XUL element injection utility
   * Creates XUL elements with attributes and event listeners
   */
  injectXULElement: function (
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

    return element;
  },

  /**
   * Get API configuration by key
   */
  getAPI: function(key) {
    return this.API_REGISTRY.find(api => api.key === key);
  },

  /**
   * Get all API configurations
   */
  getAllAPIs: function() {
    return [...this.API_REGISTRY]; // Return copy to prevent mutation
  }
};