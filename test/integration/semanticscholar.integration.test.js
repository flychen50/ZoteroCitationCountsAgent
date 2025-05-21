const { expect } = require("chai");
const sinon = require("sinon");
const fs = require("fs");
const path = require("path");

// Load the ZoteroCitationCounts module
const ZoteroCitationCounts = require("../../src/zoterocitationcounts.js");

describe("Semantic Scholar Integration Tests", () => {
  let sandbox;
  let mockZotero;
  let mockItem;
  let semanticScholarAPI;
  const today = "2024-07-27"; // Fixed date for consistent testing

  // Helper function to create a mock Zotero item
  const createMockItem = (props) => {
    const item = {
      id: props.id || 1,
      _changed: false,
      isFeedItem: false,
      getField: sinon.stub(),
      setField: sinon.stub().callsFake(function() { item._changed = true; }),
      saveTx: sinon.stub().resolves(),
      getCreators: sinon.stub().returns(props.creators || []),
    };
    item.getField.withArgs("title").returns(props.title || "");
    item.getField.withArgs("DOI").returns(props.DOI || "");
    item.getField.withArgs("url").returns(props.url || ""); // For arXiv
    item.getField.withArgs("date").returns(props.date || "");
    item.getField.withArgs("year").returns(props.year || ""); // For _getItemMetadataForAdsQuery
    item.getField.withArgs("extra").returns(props.extra || "");
    return item;
  };

  beforeEach(async () => {
    sandbox = sinon.createSandbox();

    // Mock global Zotero object
    mockZotero = {
      Prefs: {
        get: sandbox.stub(),
        set: sandbox.stub(),
      },
      debug: sandbox.stub(),
      ProgressWindow: sandbox.stub().returns({
        changeHeadline: sandbox.stub(),
        show: sandbox.stub(),
        startCloseTimer: sandbox.stub(),
        ItemProgress: sandbox.stub().returns({
          setIcon: sandbox.stub(),
          setText: sandbox.stub(),
          setProgress: sandbox.stub(),
          setError: sandbox.stub(),
        }),
      }),
      getActiveZoteroPane: sandbox.stub().returns({
        getSelectedItems: sandbox.stub().returns([mockItem]), // Default behavior
      }),
      Localization: sandbox.stub().returns({
        formatValue: sandbox.stub().callsFake(async (key, args) => {
          let message = key; // Default to key if no specific message is needed
          if (args) {
            message += ": " + JSON.stringify(args);
          }
          // Add specific messages for errors if needed for assertions
          if (key === "citationcounts-progresswindow-error-no-results-all-attempts") {
            message = "No citation count found after all attempts.";
          } else if (key === "citationcounts-progresswindow-error-insufficient-metadata-for-title-search") {
            message = "Insufficient metadata for title search.";
          } else if (key === "citationcounts-progresswindow-error-bad-api-response") {
            message = "Bad API response.";
          } else if (key === "citationcounts-progresswindow-error-no-doi") {
            message = "No DOI found for item.";
          } else if (key === "citationcounts-progresswindow-error-no-arxiv") {
            message = "No arXiv ID found for item.";
          }
          return message;
        }),
      }),
      hiDPI: true, // Or false, depending on what you want to test
      // Ensure ZoteroCitationCounts can find its FTL file
      File: {
        exists: sandbox.stub().returns(true),
        getContentsAsync: sandbox.stub().resolves(""), // Mock FTL content
      },
      getMainWindow: sandbox.stub().returns({ // Mock for MozXULElement
        MozXULElement: {
            insertFTLIfNeeded: sandbox.stub(),
        }
      }),
    };
    global.Zotero = mockZotero;

    // Stub fetch
    global.fetch = sandbox.stub();

    // Control date
    sandbox.stub(Date.prototype, 'toISOString').returns(`${today}T12:00:00.000Z`);

    // Initialize ZoteroCitationCounts
    // Need to ensure the path to FTL is correctly handled if it's dynamic
    const ftlPath = path.resolve(__dirname, '../../src/citation-counts.ftl');
    if (!fs.existsSync(ftlPath)) {
        // Create a dummy FTL file if it doesn't exist, to prevent init errors
        fs.writeFileSync(ftlPath, "# Dummy FTL file for testing\n");
    }

    ZoteroCitationCounts.init({
      id: "zotero-citation-counts",
      version: "1.0.0",
      rootURI: "chrome://zoterocitationcounts/",
    });
    
    // Wait for l10n to be ready if it's async in init (it is due to new Localization)
    // This can be tricky; for now, we assume formatValue is ready after init.
    // If l10n setup is async and causes issues, a small delay or a more robust wait might be needed.
    // Or, if l10n.formatValue is called immediately in init, mock it before init.
    // For this setup, we'll mock it after init, assuming it's primarily used by updateItems.
    ZoteroCitationCounts.l10n.formatValue = mockZotero.Localization().formatValue;


    semanticScholarAPI = ZoteroCitationCounts.APIs.find(
      (api) => api.key === "semanticscholar"
    );
    expect(semanticScholarAPI).to.exist;
  });

  afterEach(() => {
    sandbox.restore();
    delete global.Zotero;
    delete global.fetch;
    // Clean up dummy FTL if created - be careful if it's a real file
    // const ftlPath = path.resolve(__dirname, '../../src/citation-counts.ftl');
    // if (fs.existsSync(ftlPath) && fs.readFileSync(ftlPath, 'utf8').startsWith("# Dummy FTL file for testing")) {
    //     fs.unlinkSync(ftlPath);
    // }
  });

  describe("Semantic Scholar API Tests", () => {
    it("Scenario 1: Successful fetch and update via DOI", async () => {
      mockItem = createMockItem({ DOI: "10.1000/xyz123" });
      mockZotero.getActiveZoteroPane().getSelectedItems.returns([mockItem]);

      global.fetch.resolves({
        ok: true,
        json: async () => ({
          paperId: "abcdef123456",
          externalIds: { DOI: "10.1000/xyz123" },
          citationCount: 123,
        }),
      });

      await ZoteroCitationCounts.updateItems([mockItem], semanticScholarAPI);

      const expectedUrl =
        "https://api.semanticscholar.org/graph/v1/paper/10.1000%2Fxyz123?fields=citationCount";
      expect(global.fetch.calledOnceWith(expectedUrl)).to.be.true;
      expect(mockItem.setField.calledOnceWith("extra", `123 citations (Semantic Scholar/DOI) [${today}]`)).to.be.true;
      expect(mockItem.saveTx.calledOnce).to.be.true;
      
      // Check progress window
      const pwInstance = mockZotero.ProgressWindow();
      expect(pwInstance.changeHeadline.called).to.be.true;
      const itemProgressInstance = pwInstance.ItemProgress();
      expect(itemProgressInstance.setIcon.calledWith(ZoteroCitationCounts.icon("tick"))).to.be.true;
      expect(itemProgressInstance.setProgress.calledWith(100)).to.be.true;

      // Check for throttle - fetch should be called, then callback has await.
      // Direct timing is hard, but we know fetch was called.
      // A more robust test might involve sinon.useFakeTimers() and advancing the clock.
      // For now, successful call implies callback was entered.
    });

    it("Scenario 2: Successful fetch and update via arXiv ID", async () => {
      mockItem = createMockItem({ url: "https://arxiv.org/abs/2101.00001" });
      mockZotero.getActiveZoteroPane().getSelectedItems.returns([mockItem]);

      global.fetch.resolves({
        ok: true,
        json: async () => ({
          paperId: "abcdef123456",
          externalIds: { ArXiv: "2101.00001" },
          citationCount: 456,
        }),
      });

      await ZoteroCitationCounts.updateItems([mockItem], semanticScholarAPI);

      const expectedUrl =
        "https://api.semanticscholar.org/graph/v1/paper/arXiv:2101.00001?fields=citationCount";
      expect(global.fetch.calledOnceWith(expectedUrl)).to.be.true;
      expect(mockItem.setField.calledOnceWith("extra", `456 citations (Semantic Scholar/arXiv) [${today}]`)).to.be.true;
      expect(mockItem.saveTx.calledOnce).to.be.true;
    });

    it("Scenario 3: Successful fetch and update via Title/Author/Year Search", async () => {
      mockItem = createMockItem({
        title: "Test Paper Title",
        creators: [{ lastName: "Doe", name: "John Doe" }],
        year: "2023",
        date: "2023-01-15", // _getItemMetadataForAdsQuery prefers year field but can use date
      });
      mockZotero.getActiveZoteroPane().getSelectedItems.returns([mockItem]);
      
      global.fetch.resolves({
        ok: true,
        json: async () => ({
          total: 1,
          data: [
            {
              paperId: "zyxwvu987654",
              externalIds: { DOI: "10.9999/testdoi" },
              citationCount: 42,
            },
          ],
        }),
      });

      await ZoteroCitationCounts.updateItems([mockItem], semanticScholarAPI);
      
      const expectedQuery = "title%3ATest%20Paper%20Title%2Bauthor%3ADoe%2Byear%3A2023";
      const expectedUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${expectedQuery}&fields=citationCount,externalIds`;
      
      expect(global.fetch.calledOnceWith(expectedUrl)).to.be.true;
      expect(mockItem.setField.calledOnceWith("extra", `42 citations (Semantic Scholar/Title) [${today}]`)).to.be.true;
      expect(mockItem.saveTx.calledOnce).to.be.true;
    });

    it("Scenario 4: Title Search - No Results", async () => {
      mockItem = createMockItem({
        title: "Obscure Paper",
        creators: [{ lastName: "Nobody" }],
        year: "2020",
        date: "2020-01-01",
      });
      mockZotero.getActiveZoteroPane().getSelectedItems.returns([mockItem]);

      global.fetch.resolves({
        ok: true,
        json: async () => ({ total: 0, data: [] }), // Empty result
      });

      await ZoteroCitationCounts.updateItems([mockItem], semanticScholarAPI);

      const expectedQuery = "title%3AObscure%20Paper%2Bauthor%3ANobody%2Byear%3A2020";
      const expectedUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${expectedQuery}&fields=citationCount,externalIds`;
      expect(global.fetch.calledOnceWith(expectedUrl)).to.be.true;
      expect(mockItem.setField.called).to.be.false; // Should not set field on no results
      expect(mockItem.saveTx.called).to.be.false;

      const pwInstance = mockZotero.ProgressWindow();
      const itemProgressInstance = pwInstance.ItemProgress();
      expect(itemProgressInstance.setError.calledOnce).to.be.true;
      
      const formatValueStub = ZoteroCitationCounts.l10n.formatValue;
      expect(formatValueStub.calledWith("citationcounts-progresswindow-error-no-results-all-attempts", { api: "Semantic Scholar" })).to.be.true;
      // Check Zotero.debug for the specific error message logged in _retrieveCitationCount
      sinon.assert.calledWith(mockZotero.debug, sinon.match("No citation count found via Semantic Scholar/Title"));
      sinon.assert.calledWith(mockZotero.debug, sinon.match("No citation count found after all attempts (DOI, ArXiv, Title if applicable) for item 'Obscure Paper'"));
    });

    it("Scenario 5: Title Search - Insufficient Metadata", async () => {
      mockItem = createMockItem({ title: "A Title Alone" }); // Missing author/year
      mockZotero.getActiveZoteroPane().getSelectedItems.returns([mockItem]);

      await ZoteroCitationCounts.updateItems([mockItem], semanticScholarAPI);

      expect(global.fetch.called).to.be.false; // Fetch should not be called
      expect(mockItem.setField.called).to.be.false;
      expect(mockItem.saveTx.called).to.be.false;

      const pwInstance = mockZotero.ProgressWindow();
      const itemProgressInstance = pwInstance.ItemProgress();
      expect(itemProgressInstance.setError.calledOnce).to.be.true;
      const formatValueStub = ZoteroCitationCounts.l10n.formatValue;
      expect(formatValueStub.calledWith("citationcounts-progresswindow-error-insufficient-metadata-for-title-search", { api: "Semantic Scholar" })).to.be.true;
      sinon.assert.calledWith(mockZotero.debug, sinon.match("Insufficient metadata for title search for item 'A Title Alone' using Semantic Scholar."));
    });

    it("Scenario 6: Prioritization - DOI Search Preferred over Title Search", async () => {
      mockItem = createMockItem({
        DOI: "10.1000/realdoi",
        title: "A Real Title",
        creators: [{ lastName: "Author" }],
        year: "2021",
        date: "2021-01-01",
      });
      mockZotero.getActiveZoteroPane().getSelectedItems.returns([mockItem]);

      global.fetch.resolves({ // Mock for DOI success
        ok: true,
        json: async () => ({ citationCount: 777 }),
      });

      await ZoteroCitationCounts.updateItems([mockItem], semanticScholarAPI);

      const expectedDoiUrl = "https://api.semanticscholar.org/graph/v1/paper/10.1000%2Frealdoi?fields=citationCount";
      expect(global.fetch.calledOnceWith(expectedDoiUrl)).to.be.true; // Only DOI url
      
      const titleQuery = "title%3AA%20Real%20Title%2Bauthor%3AAuthor%2Byear%3A2021";
      const expectedTitleUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${titleQuery}&fields=citationCount,externalIds`;
      expect(global.fetch.neverCalledWith(expectedTitleUrl)).to.be.true; // Title URL should not be called

      expect(mockItem.setField.calledOnceWith("extra", `777 citations (Semantic Scholar/DOI) [${today}]`)).to.be.true;
    });

    it("Scenario 7: Prioritization - arXiv Search Preferred over Title Search (No DOI)", async () => {
      mockItem = createMockItem({
        url: "http://arxiv.org/abs/2202.00002",
        title: "An ArXiv Title",
        creators: [{ lastName: "Scientist" }],
        year: "2022",
        date: "2022-01-01",
      });
       mockZotero.getActiveZoteroPane().getSelectedItems.returns([mockItem]);

      global.fetch.resolves({ // Mock for ArXiv success
        ok: true,
        json: async () => ({ citationCount: 888 }),
      });

      await ZoteroCitationCounts.updateItems([mockItem], semanticScholarAPI);

      const expectedArxivUrl = "https://api.semanticscholar.org/graph/v1/paper/arXiv:2202.00002?fields=citationCount";
      expect(global.fetch.calledOnceWith(expectedArxivUrl)).to.be.true;

      const titleQuery = "title%3AAn%20ArXiv%20Title%2Bauthor%3AScientist%2Byear%3A2022";
      const expectedTitleUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${titleQuery}&fields=citationCount,externalIds`;
      expect(global.fetch.neverCalledWith(expectedTitleUrl)).to.be.true;

      expect(mockItem.setField.calledOnceWith("extra", `888 citations (Semantic Scholar/arXiv) [${today}]`)).to.be.true;
    });

    it("Scenario 8: Fallback - DOI fails (no-id), arXiv fails (no-id), Title Search Succeeds", async () => {
      mockItem = createMockItem({
        DOI: "10.0000/nonexistentdoi", // Will cause "no-doi" or "no-citation-count"
        url: "http://arxiv.org/abs/0000.00000", // Will cause "no-arxiv" or "no-citation-count"
        title: "Fallback Title",
        creators: [{ lastName: "Persistent" }],
        year: "2019",
        date: "2019-01-01",
      });
      mockZotero.getActiveZoteroPane().getSelectedItems.returns([mockItem]);
      
      const doiUrl = "https://api.semanticscholar.org/graph/v1/paper/10.0000%2Fnonexistentdoi?fields=citationCount";
      const arxivUrl = "https://api.semanticscholar.org/graph/v1/paper/arXiv:0000.00000?fields=citationCount";
      const titleQuery = "title%3AFallback%20Title%2Bauthor%3APersistent%2Byear%3A2019";
      const titleUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${titleQuery}&fields=citationCount,externalIds`;

      // Mock fetch logic
      global.fetch
        .withArgs(doiUrl).resolves({ ok: true, json: async () => ({ citationCount: null }) }) // Simulate no count for DOI
        .withArgs(arxivUrl).resolves({ ok: true, json: async () => ({ citationCount: null }) }) // Simulate no count for arXiv
        .withArgs(titleUrl).resolves({ // Successful title search
          ok: true,
          json: async () => ({ total: 1, data: [{ citationCount: 99 }] }),
        });

      await ZoteroCitationCounts.updateItems([mockItem], semanticScholarAPI);

      expect(global.fetch.calledWith(doiUrl)).to.be.true;
      expect(global.fetch.calledWith(arxivUrl)).to.be.true;
      expect(global.fetch.calledWith(titleUrl)).to.be.true;
      expect(global.fetch.callCount).to.equal(3); // All three should be called

      expect(mockItem.setField.calledOnceWith("extra", `99 citations (Semantic Scholar/Title) [${today}]`)).to.be.true;
      sinon.assert.calledWith(mockZotero.debug, sinon.match("No citation count found via Semantic Scholar/DOI for item 'Fallback Title'"));
      sinon.assert.calledWith(mockZotero.debug, sinon.match("No citation count found via Semantic Scholar/arXiv for item 'Fallback Title'"));
      sinon.assert.calledWith(mockZotero.debug, sinon.match("Successfully fetched citation count via Semantic Scholar/Title for item 'Fallback Title'. Count: 99"));
    });
    
    it("Scenario 9: API Error during Title Search (e.g., 500 server error)", async () => {
      mockItem = createMockItem({
        title: "Error Paper",
        creators: [{ lastName: "Unlucky" }],
        year: "2024",
        date: "2024-01-01",
      });
      mockZotero.getActiveZoteroPane().getSelectedItems.returns([mockItem]);

      const titleQuery = "title%3AError%20Paper%2Bauthor%3AUnlucky%2Byear%3A2024";
      const titleUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${titleQuery}&fields=citationCount,externalIds`;

      global.fetch.withArgs(titleUrl).resolves({
        ok: false, // API error
        status: 500,
        json: async () => ({ message: "Internal Server Error" }),
      });

      await ZoteroCitationCounts.updateItems([mockItem], semanticScholarAPI);

      expect(global.fetch.calledOnceWith(titleUrl)).to.be.true;
      expect(mockItem.setField.called).to.be.false;
      expect(mockItem.saveTx.called).to.be.false;

      const pwInstance = mockZotero.ProgressWindow();
      const itemProgressInstance = pwInstance.ItemProgress();
      expect(itemProgressInstance.setError.calledOnce).to.be.true;
      const formatValueStub = ZoteroCitationCounts.l10n.formatValue;
      expect(formatValueStub.calledWith("citationcounts-progresswindow-error-bad-api-response", { api: "Semantic Scholar" })).to.be.true;
      sinon.assert.calledWith(mockZotero.debug, sinon.match(`Bad API response for ${titleUrl}: status 500`));
    });
  });
});
