const { expect } = require("chai");
const sinon = require("sinon");
const fs = require("fs");
const path = require("path");

let itemCounter = 0; // Global counter for unique item IDs

// const ZoteroCitationCounts = require("../../src/zoterocitationcounts.js"); // Removed require
let zccCode; // To store script content

describe("Semantic Scholar Integration Tests", () => {
  let sandbox;
  let mockZotero; // Zotero will be global
  let mockItem;
  let semanticScholarAPI;
  const today = "2024-07-27"; // Fixed date for consistent testing

  // Helper function to create a mock Zotero item
  const createMockItem = (sandbox, props) => { 
    const item = {
      id: props.id || 1,
      _changed: false,
      isFeedItem: false,
      uniqueTestID: `testItem-${itemCounter++}`, // Add unique ID
      // Stubs will be created using the sandbox
    };
    item.getField = sandbox.stub();
    item.setField = sandbox.stub().callsFake(function() { item._changed = true; });
    item.saveTx = sandbox.stub().resolves();
    item.getCreators = sandbox.stub().returns(props.creators || []);

    item.getField.withArgs("title").returns(props.title || null); // Use null
    item.getField.withArgs("DOI").returns(props.DOI || null); // Use null
    item.getField.withArgs("url").returns(props.url || null); // For arXiv, use null
    item.getField.withArgs("date").returns(props.date || null); // Use null
    item.getField.withArgs("year").returns(props.year || null); // For _getItemMetadataForAdsQuery, use null
    item.getField.withArgs("extra").returns(props.extra || null); // Use null
    // Add other common fields if necessary, defaulting to null
    item.getField.withArgs("seriesTitle").returns(props.seriesTitle || null);
    item.getField.withArgs("publicationTitle").returns(props.publicationTitle || null);
    item.getField.withArgs("volume").returns(props.volume || null);
    item.getField.withArgs("issue").returns(props.issue || null);
    item.getField.withArgs("pages").returns(props.pages || null);
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

    // Define global.Localization before loading the script
    global.Localization = sandbox.stub().returns({
        formatValue: sandbox.stub().resolvesArg(0) // Simplified stub
      });

    // Read the script content once
    if (!zccCode) {
      zccCode = fs.readFileSync(path.join(__dirname, '../../src/zoterocitationcounts.js'), 'utf-8');
    }
    // Execute the script content, making ZoteroCitationCounts available globally
    // ZoteroCitationCounts.init will use the global.Localization defined above
    new Function('Zotero', 'Localization', zccCode)(global.Zotero, global.Localization);


    // Initialize ZoteroCitationCounts (now global)
    // Need to ensure the path to FTL is correctly handled if it's dynamic
    const ftlPath = path.resolve(__dirname, '../../src/citation-counts.ftl');
    if (!fs.existsSync(ftlPath)) {
        // Create a dummy FTL file if it doesn't exist, to prevent init errors
        fs.writeFileSync(ftlPath, "# Dummy FTL file for testing\n");
    }

    global.ZoteroCitationCounts.init({ // Use global.ZoteroCitationCounts
      id: "zotero-citation-counts",
      version: "1.0.0",
      rootURI: "chrome://zoterocitationcounts/",
    });
    
    // Wait for l10n to be ready if it's async in init (it is due to new Localization)
    // This can be tricky; for now, we assume formatValue is ready after init.
    // If l10n setup is async and causes issues, a small delay or a more robust wait might be needed.
    // Or, if l10n.formatValue is called immediately in init, mock it before init.
    // The l10n instance on ZoteroCitationCounts is now created with the mocked global.Localization.
    // Its formatValue method will be the stub we defined on global.Localization's return object.
    // No need to re-assign ZoteroCitationCounts.l10n.formatValue here.

    semanticScholarAPI = global.ZoteroCitationCounts.APIs.find( // Use global.ZoteroCitationCounts
      (api) => api.key === "semanticscholar"
    );
    expect(semanticScholarAPI).to.exist;
  });

  afterEach(() => {
    sandbox.restore();
    delete global.Zotero;
    delete global.fetch;
    delete global.ZoteroCitationCounts; // Clean up the global
    delete global.Localization; // Clean up global Localization
    // Clean up dummy FTL if created - be careful if it's a real file
    // const ftlPath = path.resolve(__dirname, '../../src/citation-counts.ftl');
    // if (fs.existsSync(ftlPath) && fs.readFileSync(ftlPath, 'utf8').startsWith("# Dummy FTL file for testing")) {
    //     fs.unlinkSync(ftlPath);
    // }
  });

  describe("Semantic Scholar API Tests", () => {
    it("Scenario 1: Successful fetch and update via DOI", async () => {
      mockItem = createMockItem(sandbox, { DOI: "10.1000/xyz123" }); // Pass sandbox
      mockZotero.getActiveZoteroPane().getSelectedItems.returns([mockItem]);

      global.fetch.resolves({
        ok: true,
        json: async () => ({
          paperId: "abcdef123456",
          externalIds: { DOI: "10.1000/xyz123" },
          citationCount: 123,
        }),
      });

      await global.ZoteroCitationCounts.updateItems([mockItem], semanticScholarAPI); // Use global.ZoteroCitationCounts

      const expectedUrl =
        "https://api.semanticscholar.org/graph/v1/paper/10.1000%2Fxyz123?fields=citationCount";
      expect(global.fetch.calledOnceWith(expectedUrl)).to.be.true;
      expect(mockItem.setField.calledOnceWith("extra", `123 citations (Semantic Scholar/DOI) [${today}]`)).to.be.true;
      expect(mockItem.saveTx.calledOnce).to.be.true;
      
      // Check progress window
      const pwInstance = mockZotero.ProgressWindow();
      expect(pwInstance.changeHeadline.called).to.be.true;
      const itemProgressInstance = pwInstance.ItemProgress();
      expect(itemProgressInstance.setIcon.calledWith(global.ZoteroCitationCounts.icon("tick"))).to.be.true; // Use global.ZoteroCitationCounts
      expect(itemProgressInstance.setProgress.calledWith(100)).to.be.true;

      // Check for throttle - fetch should be called, then callback has await.
      // Direct timing is hard, but we know fetch was called.
      // A more robust test might involve sinon.useFakeTimers() and advancing the clock.
      // For now, successful call implies callback was entered.
    });

    it("Scenario 2: Successful fetch and update via arXiv ID", async () => {
      mockItem = createMockItem(sandbox, { url: "https://arxiv.org/abs/2101.00001" }); // Pass sandbox
      mockZotero.getActiveZoteroPane().getSelectedItems.returns([mockItem]);

      global.fetch.resolves({
        ok: true,
        json: async () => ({
          paperId: "abcdef123456",
          externalIds: { ArXiv: "2101.00001" },
          citationCount: 456,
        }),
      });

      await global.ZoteroCitationCounts.updateItems([mockItem], semanticScholarAPI); // Use global.ZoteroCitationCounts

      const expectedUrl =
        "https://api.semanticscholar.org/graph/v1/paper/arXiv:2101.00001?fields=citationCount";
      expect(global.fetch.calledOnceWith(expectedUrl)).to.be.true;
      expect(mockItem.setField.calledOnceWith("extra", `456 citations (Semantic Scholar/arXiv) [${today}]`)).to.be.true;
      expect(mockItem.saveTx.calledOnce).to.be.true;
    });

    it("Scenario 3: Successful fetch and update via Title/Author/Year Search", async () => {
      mockItem = createMockItem(sandbox, { // Pass sandbox
        title: "Test Paper Title",
        creators: [{ lastName: "Doe", name: "John Doe" }],
        year: "2023",
        date: "2023-01-15", 
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

      await global.ZoteroCitationCounts.updateItems([mockItem], semanticScholarAPI); // Use global.ZoteroCitationCounts
      
      const expectedQuery = "title%3ATest%20Paper%20Title%2Bauthor%3ADoe%2Byear%3A2023";
      const expectedUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${expectedQuery}&fields=citationCount,externalIds`;
      
      expect(global.fetch.calledOnceWith(expectedUrl)).to.be.true;
      expect(mockItem.setField.calledOnceWith("extra", `42 citations (Semantic Scholar/Title) [${today}]`)).to.be.true;
      expect(mockItem.saveTx.calledOnce).to.be.true;
    });

    it("Scenario 4: Title Search - No Results", async () => {
      mockItem = createMockItem(sandbox, { // Pass sandbox
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

      await global.ZoteroCitationCounts.updateItems([mockItem], semanticScholarAPI); // Use global.ZoteroCitationCounts

      const expectedQuery = "title%3AObscure%20Paper%2Bauthor%3ANobody%2Byear%3A2020";
      const expectedUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${expectedQuery}&fields=citationCount,externalIds`;
      expect(global.fetch.calledOnceWith(expectedUrl)).to.be.true;
      expect(mockItem.setField.called).to.be.false; // Should not set field on no results
      expect(mockItem.saveTx.called).to.be.false;

      const pwInstance = mockZotero.ProgressWindow();
      const itemProgressInstance = pwInstance.ItemProgress();
      expect(itemProgressInstance.setError.calledOnce).to.be.true;
      
      const formatValueStub = global.ZoteroCitationCounts.l10n.formatValue; // Use global.ZoteroCitationCounts
      expect(formatValueStub.calledWith("citationcounts-progresswindow-error-no-results-all-attempts", { api: "Semantic Scholar" })).to.be.true;
      // Check Zotero.debug for the specific error message logged in _retrieveCitationCount
      sinon.assert.calledWith(mockZotero.debug, sinon.match("No citation count found via Semantic Scholar/Title"));
      sinon.assert.calledWith(mockZotero.debug, sinon.match("No citation count found after all attempts (DOI, ArXiv, Title if applicable) for item 'Obscure Paper'"));
    });

    it("Scenario 5: Title Search - Insufficient Metadata", async () => {
      mockItem = createMockItem(sandbox, { title: "A Title Alone" }); // Pass sandbox
      mockZotero.getActiveZoteroPane().getSelectedItems.returns([mockItem]);

      await global.ZoteroCitationCounts.updateItems([mockItem], semanticScholarAPI); // Use global.ZoteroCitationCounts

      expect(global.fetch.called).to.be.false; // Fetch should not be called
      expect(mockItem.setField.called).to.be.false;
      expect(mockItem.saveTx.called).to.be.false;

      const pwInstance = mockZotero.ProgressWindow();
      const itemProgressInstance = pwInstance.ItemProgress();
      expect(itemProgressInstance.setError.calledOnce).to.be.true;
      const formatValueStub = global.ZoteroCitationCounts.l10n.formatValue; // Use global.ZoteroCitationCounts
      expect(formatValueStub.calledWith("citationcounts-progresswindow-error-insufficient-metadata-for-title-search", { api: "Semantic Scholar" })).to.be.true;
      sinon.assert.calledWith(mockZotero.debug, sinon.match("Insufficient metadata for title search for item 'A Title Alone' using Semantic Scholar."));
    });

    it("Scenario 6: Prioritization - DOI Search Preferred over Title Search", async () => {
      mockItem = createMockItem(sandbox, { // Pass sandbox
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

      await global.ZoteroCitationCounts.updateItems([mockItem], semanticScholarAPI); // Use global.ZoteroCitationCounts

      const expectedDoiUrl = "https://api.semanticscholar.org/graph/v1/paper/10.1000%2Frealdoi?fields=citationCount";
      expect(global.fetch.calledOnceWith(expectedDoiUrl)).to.be.true; // Only DOI url
      
      const titleQuery = "title%3AA%20Real%20Title%2Bauthor%3AAuthor%2Byear%3A2021";
      const expectedTitleUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${titleQuery}&fields=citationCount,externalIds`;
      expect(global.fetch.neverCalledWith(expectedTitleUrl)).to.be.true; // Title URL should not be called

      expect(mockItem.setField.calledOnceWith("extra", `777 citations (Semantic Scholar/DOI) [${today}]`)).to.be.true;
    });

    it("Scenario 7: Prioritization - arXiv Search Preferred over Title Search (No DOI)", async () => {
      mockItem = createMockItem(sandbox, { // Pass sandbox
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

      await global.ZoteroCitationCounts.updateItems([mockItem], semanticScholarAPI); // Use global.ZoteroCitationCounts

      const expectedArxivUrl = "https://api.semanticscholar.org/graph/v1/paper/arXiv:2202.00002?fields=citationCount";
      expect(global.fetch.calledOnceWith(expectedArxivUrl)).to.be.true;

      const titleQuery = "title%3AAn%20ArXiv%20Title%2Bauthor%3AScientist%2Byear%3A2022";
      const expectedTitleUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${titleQuery}&fields=citationCount,externalIds`;
      expect(global.fetch.neverCalledWith(expectedTitleUrl)).to.be.true;

      expect(mockItem.setField.calledOnceWith("extra", `888 citations (Semantic Scholar/arXiv) [${today}]`)).to.be.true;
    });

    it("Scenario 8: Fallback - DOI fails (no-id), arXiv fails (no-id), Title Search Succeeds", async () => {
      mockItem = createMockItem(sandbox, { // Pass sandbox
        DOI: null, // Explicitly null for this test
        url: null,  // Explicitly null for this test
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

      await global.ZoteroCitationCounts.updateItems([mockItem], semanticScholarAPI); // Use global.ZoteroCitationCounts

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
      mockItem = createMockItem(sandbox, { // Pass sandbox
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

      await global.ZoteroCitationCounts.updateItems([mockItem], semanticScholarAPI); // Use global.ZoteroCitationCounts

      expect(global.fetch.calledOnceWith(titleUrl)).to.be.true;
      expect(mockItem.setField.called).to.be.false;
      expect(mockItem.saveTx.called).to.be.false;

      const pwInstance = mockZotero.ProgressWindow();
      const itemProgressInstance = pwInstance.ItemProgress();
      expect(itemProgressInstance.setError.calledOnce).to.be.true;
      const formatValueStub = global.ZoteroCitationCounts.l10n.formatValue; // Use global.ZoteroCitationCounts
      expect(formatValueStub.calledWith("citationcounts-progresswindow-error-bad-api-response", { api: "Semantic Scholar" })).to.be.true;
      sinon.assert.calledWith(mockZotero.debug, sinon.match(`Bad API response for ${titleUrl}: status 500`));
    });

    it("Scenario (User Feedback): OpenAI GPT-4.5 System Card - Title Search", function(done) { // MODIFIED: No .only, function(done)
      mockItem = createMockItem(sandbox, {
        title: "OpenAI GPT-4.5 System Card",
        creators: [{ lastName: "Paino" }], 
        extra: "Some pre-existing unrelated content in extra field", 
      });
      // console.log("[Test Log] mockItem.uniqueTestID created in test:", mockItem.uniqueTestID); // Log ID in test
      mockZotero.getActiveZoteroPane().getSelectedItems.returns([mockItem]);

      const expectedQuery = "title:OpenAI%20GPT-4.5%20System%20Card%2Bauthor:Paino"; // Removed year as it's not in mockItem creation for this test
      const expectedUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${expectedQuery}&fields=citationCount,externalIds`;

      const mockApiResponse = {
        total: 2,
        offset: 0,
        data: [
          { paperId: "6b2f415b612c59f4f1eed6445806aa6f5874137a", externalIds: { CorpusId: 276649612 }, citationCount: 5 },
          { paperId: "57d5d06c6b0c4984694ac08f28c65371f95eb891", externalIds: { DOI: "10.2118/0423-0008-jpt", CorpusId: 258854010 }, citationCount: 3 }
        ]
      };

      global.fetch.withArgs(expectedUrl).resolves({
        ok: true,
        json: async () => mockApiResponse,
      });

      global.ZoteroCitationCounts.updateItems([mockItem], semanticScholarAPI)
        .then(() => {
            setTimeout(() => {
                try {
                    // console.logs for debugging this test can remain for now
                    console.log("[Test Log] mockItem.setField.called:", mockItem.setField.called);
                    console.log("[Test Log] mockItem.setField.callCount:", mockItem.setField.callCount);
                    if (mockItem.setField.called) {
                        console.log("[Test Log] mockItem.setField first call args:", JSON.stringify(mockItem.setField.getCall(0).args));
                    }

                    // The primary assertion:
                    sinon.assert.calledWith(mockItem.setField, 'extra', sinon.match(/^5 citations \(Semantic Scholar\/Title\)/));
                    // Add other assertions if there were any for this test.
                    // For example, check saveTx if that's relevant for this test
                    // expect(mockItem.saveTx.calledOnce).to.be.true;

                    done();
                } catch (e) {
                    console.error("Assertion Error during test:", e.message); // Keep this to see the error if it happens
                    done(e);
                }
            }, 0);
        })
        .catch(err => {
            console.error("Error from updateItems promise:", err);
            done(err);
        });
    });
  });
});
