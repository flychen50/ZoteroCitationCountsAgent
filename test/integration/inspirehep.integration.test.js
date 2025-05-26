const chai = require("chai");
const sinon = require("sinon");
const { assert, expect } = chai;
const fs = require('fs');
const path = require('path');

// Load the script content
const zccCode = fs.readFileSync(path.join(__dirname, '../../src/zoterocitationcounts.js'), 'utf-8');

describe("INSPIRE-HEP Integration Tests", () => {
  let Zotero;
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch; // Store original fetch

    // Mock Localization class constructor
    global.Localization = sinon.stub().returns({
      formatValue: sinon.stub().resolvesArg(0) // Mock formatValue to return the key
    });

    // Comprehensive Zotero mock
    global.Zotero = {
      Prefs: {
        get: sinon.stub(),
        set: sinon.stub(),
      },
      debug: sinon.stub(),
      log: sinon.stub(),
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
      HTTP: { request: sinon.stub() },
      File: { exists: sinon.stub(), writeFile: sinon.stub(), getContents: sinon.stub() },
      Utilities: { getVersion: sinon.stub().returns("test-zotero-version") },
      getMainWindow: sinon.stub().returns({
        document: { documentElement: { getAttribute: sinon.stub().returns("en-US") } }
      }),
      Plugins: { Utilities: { log: sinon.stub() } }
    };
    
    global.fetch = sinon.stub(); // Stub global fetch

    // Load ZoteroCitationCounts script
    new Function('Zotero', zccCode)(global.Zotero); 
    
    // Initialize ZoteroCitationCounts
    if (global.ZoteroCitationCounts && typeof global.ZoteroCitationCounts.init === 'function' && !global.ZoteroCitationCounts._initialized) {
      global.ZoteroCitationCounts.init({
        id: 'zotero-citation-counts@example.com',
        version: '1.0.0-test',
        rootURI: 'chrome://zoterocitationcounts/'
      });
    }
    
    // Ensure l10n stub if ZoteroCitationCounts.init creates it
    if (global.ZoteroCitationCounts && global.ZoteroCitationCounts.l10n && 
        (!global.ZoteroCitationCounts.l10n.formatValue || !global.ZoteroCitationCounts.l10n.formatValue.isSinonProxy)) {
      global.ZoteroCitationCounts.l10n.formatValue = sinon.stub().resolvesArg(0);
    } else if (global.ZoteroCitationCounts && !global.ZoteroCitationCounts.l10n) {
      global.ZoteroCitationCounts.l10n = { formatValue: sinon.stub().resolvesArg(0) };
    }
  });

  afterEach(() => {
    sinon.restore();
    global.fetch = originalFetch;
    delete global.Zotero;
    delete global.Localization; // Clean up Localization mock
    if (global.ZoteroCitationCounts) {
      delete global.ZoteroCitationCounts;
    }
  });

  describe("_inspireUrl", () => {
    it("should construct the correct URL for a given DOI", () => {
      const doi = "10.1000/xyz123";
      const expectedUrl = `https://inspirehep.net/api/doi/${doi}`;
      assert.equal(global.ZoteroCitationCounts._inspireUrl(doi, "doi"), expectedUrl);
    });

    it("should construct the correct URL for a given arXiv ID", () => {
      const arxivId = "1234.5678";
      const expectedUrl = `https://inspirehep.net/api/arxiv/${arxivId}`;
      assert.equal(global.ZoteroCitationCounts._inspireUrl(arxivId, "arxiv"), expectedUrl);
    });
  });

  describe("_inspireCallback", () => {
    it("should extract the citation count from a valid API response", () => {
      const response = {
        metadata: {
          citation_count: 77,
        },
      };
      const citationCount = global.ZoteroCitationCounts._inspireCallback(response);
      assert.equal(citationCount, 77);
    });

    it("should return undefined if citation_count is missing", () => {
      const response = {
        metadata: {}, // Missing citation_count
      };
      expect(global.ZoteroCitationCounts._inspireCallback(response)).to.be.undefined;
    });

    it("should throw error if metadata is missing (accessing property of undefined)", () => {
      const response = {}; // Missing metadata
      expect(() => global.ZoteroCitationCounts._inspireCallback(response)).to.throw(TypeError);
    });

    it("should throw error if response is null (accessing property of null)", () => {
      const response = null;
      expect(() => global.ZoteroCitationCounts._inspireCallback(response)).to.throw(TypeError);
    });
  });

  // describe("_retrieveCitationCount (via INSPIRE-HEP)", () => {
  //   // This section is commented out as it needs significant rework 
  //   // to align with the actual _retrieveCitationCount method signature and logic,
  //   // which is already covered by unit tests.
  // });
});
