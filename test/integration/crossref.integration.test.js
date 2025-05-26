const chai = require("chai");
const sinon = require("sinon");
const { assert, expect } = chai; // Added expect
const fs = require('fs');
const path = require('path');

// Load the script content
const zccCode = fs.readFileSync(path.join(__dirname, '../../src/zoterocitationcounts.js'), 'utf-8');

describe("Crossref Integration Tests", () => {
  let Zotero;
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch; // Store original fetch

    // Comprehensive Zotero mock
    global.Localization = sinon.stub().returns({ // Mock Localization class
      formatValue: sinon.stub().resolvesArg(0)
    });
    global.Zotero = {
      Prefs: {
        get: sinon.stub(),
        set: sinon.stub(),
      },
      debug: sinon.stub(),
      log: sinon.stub(), // Just in case, though primary _log uses Zotero.debug
      ProgressWindow: sinon.stub().returns({
        show: sinon.stub(),
        changeHeadline: sinon.stub(),
        ItemProgress: sinon.stub().returns({
          setError: sinon.stub(),
          setIcon: sinon.stub(),
          setImage: sinon.stub(),
          setProgress: sinon.stub(),
        }),
        startCloseTimer: sinon.stub(),
      }),
      HTTP: { // Mock for older Zotero versions if any code path uses it
        request: sinon.stub(),
      },
      File: { // Mock for Zotero.File if used
        exists: sinon.stub(),
        writeFile: sinon.stub(),
        getContents: sinon.stub(),
      },
      Utilities: { // Mock for Zotero.Utilities
        getVersion: sinon.stub().returns("test-zotero-version"),
        // Add other utilities if used by the script
      },
      getMainWindow: sinon.stub().returns({ // For l10n or other UI interactions
        document: {
          documentElement: {
            getAttribute: sinon.stub().returns("en-US") // For Localization
          }
        }
      }),
      // Ensure plugins utilities are stubbed if the script tries to use them via Zotero.Plugins.Utilities.log
      Plugins: {
        Utilities: {
          log: sinon.stub()
        }
      }
    };
    
    global.fetch = sinon.stub(); // Stub global fetch, used by _sendRequest

    // Load ZoteroCitationCounts script into global context
    // This makes ZoteroCitationCounts available on the global scope
    new Function('Zotero', zccCode)(global.Zotero); 
    
    // Initialize ZoteroCitationCounts if it has an init method
    // This is crucial for setting up APIs, l10n, etc.
    if (global.ZoteroCitationCounts && typeof global.ZoteroCitationCounts.init === 'function' && !global.ZoteroCitationCounts._initialized) {
      global.ZoteroCitationCounts.init({
        id: 'zotero-citation-counts@example.com',
        version: '1.0.0-test',
        rootURI: 'chrome://zoterocitationcounts/'
      });
    }
    
    // Ensure l10n is stubbed after init (if init creates it)
    if (global.ZoteroCitationCounts && global.ZoteroCitationCounts.l10n && 
        (!global.ZoteroCitationCounts.l10n.formatValue || !global.ZoteroCitationCounts.l10n.formatValue.isSinonProxy)) {
      global.ZoteroCitationCounts.l10n.formatValue = sinon.stub().resolvesArg(0); // Resolves with the first arg (key)
    } else if (global.ZoteroCitationCounts && !global.ZoteroCitationCounts.l10n) {
      // If l10n is not set up by init but might be accessed
      global.ZoteroCitationCounts.l10n = { formatValue: sinon.stub().resolvesArg(0) };
    }
  });

  afterEach(() => {
    sinon.restore();
    global.fetch = originalFetch; // Restore original fetch
    delete global.Zotero; // Clean up Zotero mock
    // ZoteroCitationCounts is attached to global by the script, so remove it.
    if (global.ZoteroCitationCounts) {
      delete global.ZoteroCitationCounts;
    }
  });

  describe("_crossrefUrl", () => {
    it("should construct the correct URL for a given DOI", () => {
      const doi = "10.1000/xyz123"; // _crossrefUrl takes the DOI string directly
      const expectedUrl = `https://api.crossref.org/works/${doi}/transform/application/vnd.citationstyles.csl+json`;
      // Access via global.ZoteroCitationCounts
      assert.equal(global.ZoteroCitationCounts._crossrefUrl(doi, "doi"), expectedUrl);
    });
  });

  describe("_crossrefCallback", () => {
    it("should extract the citation count from a valid API response", () => {
      const response = { // This is the JSON response object
        "is-referenced-by-count": 42,
      };
      // Access via global.ZoteroCitationCounts
      const citationCount = global.ZoteroCitationCounts._crossrefCallback(response);
      assert.equal(citationCount, 42);
    });

    it("should return undefined if the citation count is not found in the API response", () => {
      const response = {
        // "is-referenced-by-count" is missing
      };
      // Test the direct output of the callback
      expect(global.ZoteroCitationCounts._crossrefCallback(response)).to.be.undefined;
    });

    it("should return undefined if the response is an empty object", () => {
      const response = {};
      expect(global.ZoteroCitationCounts._crossrefCallback(response)).to.be.undefined;
    });

    it("should throw an error if the response itself is null", () => {
      // The callback will try to access 'is-referenced-by-count' on null, causing a TypeError.
      expect(() => global.ZoteroCitationCounts._crossrefCallback(null)).to.throw(TypeError);
    });
  });

  // describe("_retrieveCitationCount (via Crossref)", () => {
  //   // This section is commented out as it needs significant rework 
  //   // to align with the actual _retrieveCitationCount method signature and logic,
  //   // which is already covered by unit tests.
  // });
});
