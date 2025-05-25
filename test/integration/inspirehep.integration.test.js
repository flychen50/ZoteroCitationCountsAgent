const chai = require("chai");
const sinon = require("sinon");
const { assert } = chai;

describe("INSPIRE-HEP Integration Tests", () => {
  let Zotero;

  beforeEach(() => {
    Zotero = {
      Prefs: {
        get: sinon.stub(),
      },
      debug: sinon.stub(),
      HTTP: {
        request: sinon.stub(),
      },
      ItemTypes: { // Assuming ItemTypes is used by _getIdentifierType
        getFields: sinon.stub().returns([]), // Default to no specific fields
        getID: sinon.stub(),
      },
      URI: { // For _getIdentifierType if it uses Zotero.URI
        getDOI: sinon.stub(),
        getarXiv: sinon.stub(),
      }
    };
    // Mock ZoteroItemCitationCounts methods that are not part of INSPIRE-HEP integration or are tested elsewhere
    sinon.stub(ZoteroItemCitationCounts, "updateCitationCount");
    // Mock _getIdentifierType to control whether DOI or arXiv is returned
    // This will be customized in specific test blocks (describe blocks for DOI or arXiv)
    sinon.stub(ZoteroItemCitationCounts, "_getIdentifierType");
  });

  afterEach(() => {
    sinon.restore(); // This will restore all stubs created by sinon.stub()
    ZoteroItemCitationCounts.updateCitationCount.restore();
    ZoteroItemCitationCounts._getIdentifierType.restore();
  });

  describe("_inspireUrl", () => {
    it("should construct the correct URL for a given DOI", () => {
      const item = { DOI: "10.1000/xyz123" };
      // Assuming _getIdentifierType correctly identifies it as DOI for this test path
      ZoteroItemCitationCounts._getIdentifierType.returns("DOI");
      sinon.stub(ZoteroItemCitationCounts, "_getDOI").returns(item.DOI);
      const expectedUrl = "https://inspirehep.net/api/doi/10.1000/xyz123";
      assert.equal(ZoteroItemCitationCounts._inspireUrl(item), expectedUrl);
      ZoteroItemCitationCounts._getDOI.restore();
    });

    it("should construct the correct URL for a given arXiv ID", () => {
      const item = { arXiv: "1234.5678" };
      // Assuming _getIdentifierType correctly identifies it as arXiv for this test path
      ZoteroItemCitationCounts._getIdentifierType.returns("arXiv");
      sinon.stub(ZoteroItemCitationCounts, "_getArXivID").returns(item.arXiv);
      const expectedUrl = "https://inspirehep.net/api/arxiv/1234.5678";
      assert.equal(ZoteroItemCitationCounts._inspireUrl(item), expectedUrl);
      ZoteroItemCitationCounts._getArXivID.restore();
    });

    it("should return undefined if no identifier is found (or type is unknown)", () => {
      const item = {}; // No DOI or arXiv
      ZoteroItemCitationCounts._getIdentifierType.returns(null); // No known identifier type
      assert.isUndefined(ZoteroItemCitationCounts._inspireUrl(item));
    });
  });

  describe("_inspireCallback", () => {
    it("should extract the citation count from a valid API response", () => {
      const response = {
        metadata: {
          citation_count: 77,
        },
      };
      const item = { itemID: 1, DOI: "10.1000/xyz123" }; // item is for context, not directly used by callback for extraction
      const citationCount = ZoteroItemCitationCounts._inspireCallback(response, item);
      assert.equal(citationCount, 77);
    });

    it("should return null if the citation count is not found in the API response (metadata.citation_count is missing)", () => {
      const response = {
        metadata: {}, // Missing citation_count
      };
      const item = { itemID: 2 };
      const citationCount = ZoteroItemCitationCounts._inspireCallback(response, item);
      assert.isNull(citationCount);
    });

    it("should return null if the response data does not have metadata", () => {
      const response = {}; // Missing metadata
      const item = { itemID: 3 };
      const citationCount = ZoteroItemCitationCounts._inspireCallback(response, item);
      assert.isNull(citationCount);
    });

    it("should return null if the response itself is null", () => {
      const response = null;
      const item = { itemID: 4 };
      const citationCount = ZoteroItemCitationCounts._inspireCallback(response, item);
      assert.isNull(citationCount);
    });
  });

  describe("_retrieveCitationCount (via INSPIRE-HEP)", () => {
    describe("DOI lookups", () => {
      beforeEach(() => {
        ZoteroItemCitationCounts._getIdentifierType.returns("DOI");
        sinon.stub(ZoteroItemCitationCounts, "_getDOI").callsFake(item => item.DOI);
      });
      afterEach(() => {
        ZoteroItemCitationCounts._getDOI.restore();
      });
      it("should retrieve and update the citation count for a valid DOI", async () => {
        const item = { itemID: 101, DOI: "10.valid/doi" };
        const mockApiResponse = { metadata: { citation_count: 88 } };
        Zotero.HTTP.request.resolves({ text: JSON.stringify(mockApiResponse) });

        await ZoteroItemCitationCounts._retrieveCitationCount(item, ZoteroItemCitationCounts._inspireUrl, ZoteroItemCitationCounts._inspireCallback);

        assert.isTrue(Zotero.HTTP.request.calledOnceWith("GET", "https://inspirehep.net/api/doi/10.valid/doi"));
        assert.isTrue(ZoteroItemCitationCounts.updateCitationCount.calledOnceWith(item, 88));
      });

      it("should handle invalid DOIs (e.g., missing DOI for a DOI-type lookup)", async () => {
        const item = { itemID: 102, DOI: null }; // DOI is null
        // _getDOI (stubbed in beforeEach) will return null
        
        await ZoteroItemCitationCounts._retrieveCitationCount(item, ZoteroItemCitationCounts._inspireUrl, ZoteroItemCitationCounts._inspireCallback);

        assert.isFalse(Zotero.HTTP.request.called);
        assert.isFalse(ZoteroItemCitationCounts.updateCitationCount.called);
        assert.isTrue(Zotero.debug.calledWith(sinon.match(/No identifier found for item 102 using INSPIRE/)));
      });

      it("should handle API errors for DOI lookups", async () => {
        const item = { itemID: 103, DOI: "10.error/doi" };
        Zotero.HTTP.request.rejects(new Error("Network error for DOI"));

        await ZoteroItemCitationCounts._retrieveCitationCount(item, ZoteroItemCitationCounts._inspireUrl, ZoteroItemCitationCounts._inspireCallback);

        assert.isTrue(Zotero.HTTP.request.calledOnceWith("GET", "https://inspirehep.net/api/doi/10.error/doi"));
        assert.isFalse(ZoteroItemCitationCounts.updateCitationCount.called);
        assert.isTrue(Zotero.debug.calledWith(sinon.match(/Error retrieving citation count for DOI 10.error\/doi for item 103 from INSPIRE/)));
      });

      it("should handle cases where the citation count is not found for DOI", async () => {
        const item = { itemID: 104, DOI: "10.nocount/doi" };
        const mockApiResponse = { metadata: {} }; // No citation_count
        Zotero.HTTP.request.resolves({ text: JSON.stringify(mockApiResponse) });

        await ZoteroItemCitationCounts._retrieveCitationCount(item, ZoteroItemCitationCounts._inspireUrl, ZoteroItemCitationCounts._inspireCallback);

        assert.isTrue(Zotero.HTTP.request.calledOnceWith("GET", "https://inspirehep.net/api/doi/10.nocount/doi"));
        assert.isFalse(ZoteroItemCitationCounts.updateCitationCount.called);
        assert.isTrue(Zotero.debug.calledWith(sinon.match(/No citation count found for item ID 104 from INSPIRE/)));
      });
    });

    describe("arXiv ID lookups", () => {
       beforeEach(() => {
        ZoteroItemCitationCounts._getIdentifierType.returns("arXiv");
        sinon.stub(ZoteroItemCitationCounts, "_getArXivID").callsFake(item => item.arXiv);
      });
      afterEach(() => {
        ZoteroItemCitationCounts._getArXivID.restore();
      });
      it("should retrieve and update the citation count for a valid arXiv ID", async () => {
        const item = { itemID: 201, arXiv: "1234.5678" };
        const mockApiResponse = { metadata: { citation_count: 99 } };
        Zotero.HTTP.request.resolves({ text: JSON.stringify(mockApiResponse) });

        await ZoteroItemCitationCounts._retrieveCitationCount(item, ZoteroItemCitationCounts._inspireUrl, ZoteroItemCitationCounts._inspireCallback);

        assert.isTrue(Zotero.HTTP.request.calledOnceWith("GET", "https://inspirehep.net/api/arxiv/1234.5678"));
        assert.isTrue(ZoteroItemCitationCounts.updateCitationCount.calledOnceWith(item, 99));
      });

      it("should handle invalid arXiv IDs (e.g., missing arXiv ID for an arXiv-type lookup)", async () => {
        const item = { itemID: 202, arXiv: null }; // arXiv is null
        // _getArXivID (stubbed in beforeEach) will return null

        await ZoteroItemCitationCounts._retrieveCitationCount(item, ZoteroItemCitationCounts._inspireUrl, ZoteroItemCitationCounts._inspireCallback);
        
        assert.isFalse(Zotero.HTTP.request.called);
        assert.isFalse(ZoteroItemCitationCounts.updateCitationCount.called);
        assert.isTrue(Zotero.debug.calledWith(sinon.match(/No identifier found for item 202 using INSPIRE/)));
      });

      it("should handle API errors for arXiv lookups", async () => {
        const item = { itemID: 203, arXiv: "error/arxiv" };
        Zotero.HTTP.request.rejects(new Error("Network error for arXiv"));

        await ZoteroItemCitationCounts._retrieveCitationCount(item, ZoteroItemCitationCounts._inspireUrl, ZoteroItemCitationCounts._inspireCallback);

        assert.isTrue(Zotero.HTTP.request.calledOnceWith("GET", "https://inspirehep.net/api/arxiv/error/arxiv"));
        assert.isFalse(ZoteroItemCitationCounts.updateCitationCount.called);
        assert.isTrue(Zotero.debug.calledWith(sinon.match(/Error retrieving citation count for arXiv error\/arxiv for item 203 from INSPIRE/)));
      });

      it("should handle cases where the citation count is not found for arXiv ID", async () => {
        const item = { itemID: 204, arXiv: "nocount/arxiv" };
        const mockApiResponse = { metadata: {} }; // No citation_count
        Zotero.HTTP.request.resolves({ text: JSON.stringify(mockApiResponse) });

        await ZoteroItemCitationCounts._retrieveCitationCount(item, ZoteroItemCitationCounts._inspireUrl, ZoteroItemCitationCounts._inspireCallback);

        assert.isTrue(Zotero.HTTP.request.calledOnceWith("GET", "https://inspirehep.net/api/arxiv/nocount/arxiv"));
        assert.isFalse(ZoteroItemCitationCounts.updateCitationCount.called);
        assert.isTrue(Zotero.debug.calledWith(sinon.match(/No citation count found for item ID 204 from INSPIRE/)));
      });
    });

    it("should handle cases where the API response is not valid JSON (DOI lookup example)", async () => {
      // This test can be for either DOI or arXiv, as the JSON parsing is common.
      // We'll use DOI path for this specific test.
      ZoteroItemCitationCounts._getIdentifierType.returns("DOI");
      sinon.stub(ZoteroItemCitationCounts, "_getDOI").callsFake(item => item.DOI);

      const item = { itemID: 301, DOI: "10.invalidjson/doi" };
      Zotero.HTTP.request.resolves({ text: "This is not JSON" });

      await ZoteroItemCitationCounts._retrieveCitationCount(item, ZoteroItemCitationCounts._inspireUrl, ZoteroItemCitationCounts._inspireCallback);

      assert.isTrue(Zotero.HTTP.request.calledOnceWith("GET", "https://inspirehep.net/api/doi/10.invalidjson/doi"));
      assert.isFalse(ZoteroItemCitationCounts.updateCitationCount.called);
      assert.isTrue(Zotero.debug.calledWith(sinon.match(/Error parsing INSPIRE response for item ID 301/)));
      ZoteroItemCitationCounts._getDOI.restore(); // Clean up the specific stub for this test
    });
  });
});
