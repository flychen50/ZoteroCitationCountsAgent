const chai = require("chai");
const sinon = require("sinon");
const { assert } = chai;
const ZoteroItemCitationCounts = require("../../src/zoterocitationcounts.js");

describe("Crossref Integration Tests", () => {
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
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("_crossrefUrl", () => {
    it("should construct the correct URL for a given DOI", () => {
      const item = { DOI: "10.1000/xyz123" };
      const expectedUrl = "https://api.crossref.org/works/10.1000/xyz123";
      assert.equal(ZoteroItemCitationCounts._crossrefUrl(item), expectedUrl);
    });
  });

  describe("_crossrefCallback", () => {
    it("should extract the citation count from a valid API response", () => {
      const response = {
        message: {
          "is-referenced-by-count": 42,
        },
      };
      const item = { DOI: "10.1000/xyz123" };
      const citationCount = ZoteroItemCitationCounts._crossrefCallback(response, item);
      assert.equal(citationCount, 42);
    });

    it("should return null if the citation count is not found in the API response", () => {
      const response = {
        message: {}, // Missing "is-referenced-by-count"
      };
      const item = { DOI: "10.1000/xyz123" };
      const citationCount = ZoteroItemCitationCounts._crossrefCallback(response, item);
      assert.isNull(citationCount);
    });

    it("should return null if the response message is undefined", () => {
      const response = {}; // Missing "message"
      const item = { DOI: "10.1000/xyz123" };
      const citationCount = ZoteroItemCitationCounts._crossrefCallback(response, item);
      assert.isNull(citationCount);
    });

    it("should return null if the response itself is null", () => {
      const response = null;
      const item = { DOI: "10.1000/xyz123" };
      const citationCount = ZoteroItemCitationCounts._crossrefCallback(response, item);
      assert.isNull(citationCount);
    });
  });

  describe("_retrieveCitationCount (via Crossref)", () => {
    beforeEach(() => {
      // Mock ZoteroItemCitationCounts methods that are not part of Crossref integration
      sinon.stub(ZoteroItemCitationCounts, "updateCitationCount");
      sinon.stub(ZoteroItemCitationCounts, "_getDOI").callsFake(item => item.DOI); // Assume DOI is directly on item for these tests
    });

    afterEach(() => {
      ZoteroItemCitationCounts.updateCitationCount.restore();
      ZoteroItemCitationCounts._getDOI.restore();
    });

    it("should retrieve and update the citation count for a valid DOI", async () => {
      const item = { itemID: 1, DOI: "10.1000/xyz123" };
      const mockApiResponse = {
        message: { "is-referenced-by-count": 50 },
      };
      Zotero.HTTP.request.resolves({ text: JSON.stringify(mockApiResponse) });

      await ZoteroItemCitationCounts._retrieveCitationCount(item, ZoteroItemCitationCounts._crossrefUrl, ZoteroItemCitationCounts._crossrefCallback);

      assert.isTrue(Zotero.HTTP.request.calledOnceWith("GET", "https://api.crossref.org/works/10.1000/xyz123"));
      assert.isTrue(ZoteroItemCitationCounts.updateCitationCount.calledOnceWith(item, 50));
    });

    it("should handle invalid DOIs (e.g., missing DOI)", async () => {
      const item = { itemID: 2, DOI: null }; // Invalid DOI

      await ZoteroItemCitationCounts._retrieveCitationCount(item, ZoteroItemCitationCounts._crossrefUrl, ZoteroItemCitationCounts._crossrefCallback);

      assert.isFalse(Zotero.HTTP.request.called); // No API call should be made
      assert.isFalse(ZoteroItemCitationCounts.updateCitationCount.called);
      assert.isTrue(Zotero.debug.calledWith(sinon.match(/No DOI found for item/)));
    });

    it("should handle API errors", async () => {
      const item = { itemID: 3, DOI: "10.1000/xyz123" };
      Zotero.HTTP.request.rejects(new Error("Network error")); // Simulate API error

      await ZoteroItemCitationCounts._retrieveCitationCount(item, ZoteroItemCitationCounts._crossrefUrl, ZoteroItemCitationCounts._crossrefCallback);

      assert.isTrue(Zotero.HTTP.request.calledOnceWith("GET", "https://api.crossref.org/works/10.1000/xyz123"));
      assert.isFalse(ZoteroItemCitationCounts.updateCitationCount.called); // Should not update on error
      assert.isTrue(Zotero.debug.calledWith(sinon.match(/Error retrieving citation count for DOI/)));
    });

    it("should handle cases where the citation count is not found in API response", async () => {
      const item = { itemID: 4, DOI: "10.1000/xyz123" };
      const mockApiResponse = { message: {} }; // No 'is-referenced-by-count'
      Zotero.HTTP.request.resolves({ text: JSON.stringify(mockApiResponse) });

      await ZoteroItemCitationCounts._retrieveCitationCount(item, ZoteroItemCitationCounts._crossrefUrl, ZoteroItemCitationCounts._crossrefCallback);

      assert.isTrue(Zotero.HTTP.request.calledOnceWith("GET", "https://api.crossref.org/works/10.1000/xyz123"));
      assert.isFalse(ZoteroItemCitationCounts.updateCitationCount.called); // Should not update if count is null
      assert.isTrue(Zotero.debug.calledWith(sinon.match(/No citation count found for item ID 4 from Crossref/)));
    });

    it("should handle cases where the API response is not valid JSON", async () => {
      const item = { itemID: 5, DOI: "10.1000/xyz123" };
      Zotero.HTTP.request.resolves({ text: "This is not JSON" }); // Invalid JSON response

      await ZoteroItemCitationCounts._retrieveCitationCount(item, ZoteroItemCitationCounts._crossrefUrl, ZoteroItemCitationCounts._crossrefCallback);
      
      assert.isTrue(Zotero.HTTP.request.calledOnceWith("GET", "https://api.crossref.org/works/10.1000/xyz123"));
      assert.isFalse(ZoteroItemCitationCounts.updateCitationCount.called);
      assert.isTrue(Zotero.debug.calledWith(sinon.match(/Error parsing Crossref response for item ID 5/)));
    });
  });
});
