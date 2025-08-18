const { expect } = require("chai");
const sinon = require("sinon");
const fs = require("fs");
const path = require("path");

let itemCounter = 0; // Global counter for unique item IDs

let zccCode; // To store script content

describe("Semantic Scholar Integration Tests", () => {
  let sandbox;
  let mockZotero; // Zotero will be global
  let semanticScholarAPI;
  const today = "2024-07-27"; // Fixed date for consistent testing

  const createMockItem = (sandbox, props) => { 
    const item = {
      id: props.id || 1,
      _changed: false,
      isFeedItem: false,
      uniqueTestID: `testItem-${itemCounter++}`,
    };
    item.getField = sandbox.stub();
    item.setField = sandbox.stub().callsFake(function() { item._changed = true; });
    item.saveTx = sandbox.stub().resolves();
    item.getCreators = sandbox.stub().returns(props.creators || []);

    item.getField.withArgs("title").returns(props.title || null);
    item.getField.withArgs("DOI").returns(props.DOI || null);
    item.getField.withArgs("url").returns(props.url || null);
    item.getField.withArgs("date").returns(props.date || null);
    item.getField.withArgs("year").returns(props.year || null);
    item.getField.withArgs("extra").returns(props.extra || null);
    item.getField.withArgs("seriesTitle").returns(props.seriesTitle || null);
    item.getField.withArgs("publicationTitle").returns(props.publicationTitle || null);
    item.getField.withArgs("volume").returns(props.volume || null);
    item.getField.withArgs("issue").returns(props.issue || null);
    item.getField.withArgs("pages").returns(props.pages || null);
    return item;
  };

  beforeEach(async () => {
    sandbox = sinon.createSandbox();

    // Create the item progress instance that will be returned
    const mockItemProgress = {
      setIcon: sandbox.stub(),
      setImage: sandbox.stub(),
      setText: sandbox.stub(),
      setProgress: sandbox.stub(),
      setError: sandbox.stub(),
    };

    // Create the progress window instance that will be returned
    const mockProgressWindow = {
      changeHeadline: sandbox.stub(),
      show: sandbox.stub(),
      startCloseTimer: sandbox.stub(),
      ItemProgress: sandbox.stub().returns(mockItemProgress),
    };

    mockZotero = {
      Prefs: {
        get: sandbox.stub(),
        set: sandbox.stub(),
      },
      debug: sandbox.stub(),
      ProgressWindow: sandbox.stub().returns(mockProgressWindow),
      getActiveZoteroPane: sandbox.stub().returns({
        getSelectedItems: sandbox.stub(), // Will be set per test
      }),
      Localization: sandbox.stub().returns({ // This is for the constructor `new Localization()`
        formatValue: sandbox.stub().callsFake(async (key, args) => {
          let message = key; 
          if (args) {
            message += ": " + JSON.stringify(args);
          }
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
      hiDPI: true,
      File: {
        exists: sandbox.stub().returns(true),
        getContentsAsync: sandbox.stub().resolves(""),
      },
      getMainWindow: sandbox.stub().returns({ 
        MozXULElement: {
            insertFTLIfNeeded: sandbox.stub(),
        }
      }),
      Utilities: { 
        getVersion: sandbox.stub().returns("test-zotero-version"),
      },
      Plugins: { 
        Utilities: {
          log: sandbox.stub()
        }
      }
    };
    global.Zotero = mockZotero;
    
    global.Localization = mockZotero.Localization; // Make the constructor available globally

    global.fetch = sandbox.stub();
    sandbox.stub(Date.prototype, 'toISOString').returns(`${today}T12:00:00.000Z`);

    if (!zccCode) {
      zccCode = fs.readFileSync(path.join(__dirname, '../../src/zoterocitationcounts.js'), 'utf-8');
    }
    new Function('Zotero', 'Localization', zccCode)(global.Zotero, global.Localization);

    const ftlPath = path.resolve(__dirname, '../../src/citation-counts.ftl');
    if (!fs.existsSync(ftlPath)) {
        fs.writeFileSync(ftlPath, "# Dummy FTL file for testing\n");
    }

    global.ZoteroCitationCounts.init({ 
      id: "zotero-citation-counts",
      version: "1.0.0",
      rootURI: "chrome://zoterocitationcounts/",
    });
    
    if (global.ZoteroCitationCounts.l10n && 
        (!global.ZoteroCitationCounts.l10n.formatValue || !global.ZoteroCitationCounts.l10n.formatValue.isSinonProxy)) {
      global.ZoteroCitationCounts.l10n.formatValue = mockZotero.Localization().formatValue;
    }


    semanticScholarAPI = global.ZoteroCitationCounts.APIs.find(
      (api) => api.key === "semanticscholar"
    );
    expect(semanticScholarAPI).to.exist;
  });

  afterEach(() => {
    sandbox.restore();
    delete global.Zotero;
    delete global.fetch;
    delete global.ZoteroCitationCounts; 
    delete global.Localization; 
    const ftlPath = path.resolve(__dirname, '../../src/citation-counts.ftl');
    if (fs.existsSync(ftlPath) && fs.readFileSync(ftlPath, 'utf8').startsWith("# Dummy FTL file for testing")) {
        fs.unlinkSync(ftlPath);
    }
  });

  describe("Semantic Scholar API Tests", () => {
    it("Scenario 1: Successful fetch and update via DOI", async () => {
      let mockItem = createMockItem(sandbox, { DOI: "10.1000/xyz123" }); 
      mockZotero.getActiveZoteroPane().getSelectedItems.returns([mockItem]);

      global.fetch.resolves({
        ok: true,
        json: async () => ({
          paperId: "abcdef123456",
          externalIds: { DOI: "10.1000/xyz123" },
          citationCount: 123,
        }),
      });

      await global.ZoteroCitationCounts.updateItems([mockItem], semanticScholarAPI); 

      const expectedUrl =
        "https://api.semanticscholar.org/graph/v1/paper/10.1000%2Fxyz123?fields=citationCount";
      sinon.assert.calledOnce(global.fetch);
      sinon.assert.calledWithExactly(global.fetch, expectedUrl, { headers: {} });
      sinon.assert.calledOnce(mockItem.setField);
      sinon.assert.calledWithExactly(mockItem.setField, "extra", `123 citations (Semantic Scholar/DOI) [${today}]\n`);
      sinon.assert.calledOnce(mockItem.saveTx);
      
      sinon.assert.calledOnce(mockZotero.ProgressWindow);
      const pwInstance = mockZotero.ProgressWindow.returnValues[0];
      sinon.assert.calledOnce(pwInstance.ItemProgress); 
      const itemProgressInstance = pwInstance.ItemProgress.returnValues[0];
      sinon.assert.calledWith(itemProgressInstance.setIcon, global.ZoteroCitationCounts.icon("tick"));
      sinon.assert.calledWith(itemProgressInstance.setProgress, 100);
    });

    it("Scenario 2: Successful fetch and update via arXiv ID", async () => {
      let mockItem = createMockItem(sandbox, { url: "https://arxiv.org/abs/2101.00001" }); 
      mockZotero.getActiveZoteroPane().getSelectedItems.returns([mockItem]);

      global.fetch.resolves({
        ok: true,
        json: async () => ({
          paperId: "abcdef123456",
          externalIds: { ArXiv: "2101.00001" },
          citationCount: 456,
        }),
      });

      await global.ZoteroCitationCounts.updateItems([mockItem], semanticScholarAPI); 

      const expectedUrl =
        "https://api.semanticscholar.org/graph/v1/paper/arXiv:2101.00001?fields=citationCount";
      sinon.assert.calledOnce(global.fetch);
      sinon.assert.calledWithExactly(global.fetch, expectedUrl, { headers: {} });
      sinon.assert.calledOnce(mockItem.setField);
      sinon.assert.calledWithExactly(mockItem.setField, "extra", `456 citations (Semantic Scholar/arXiv) [${today}]\n`);
      sinon.assert.calledOnce(mockItem.saveTx);
    });

    it("Scenario 3: Successful fetch and update via Title/Author/Year Search", async () => {
      let mockItem = createMockItem(sandbox, { 
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

      await global.ZoteroCitationCounts.updateItems([mockItem], semanticScholarAPI); 
      
      const title = "Test Paper Title"; const author = "Doe"; const year = "2023";
      const expectedQuery = `title:${encodeURIComponent(title)}+author:${encodeURIComponent(author)}+year:${encodeURIComponent(year)}`;
      const expectedUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${expectedQuery}&fields=citationCount,externalIds`;
      
      sinon.assert.calledOnce(global.fetch);
      sinon.assert.calledWithExactly(global.fetch, expectedUrl, { headers: {} });
      sinon.assert.calledOnce(mockItem.setField);
      sinon.assert.calledWithExactly(mockItem.setField, "extra", `42 citations (Semantic Scholar/Title) [${today}]\n`);
      sinon.assert.calledOnce(mockItem.saveTx);
    });

    it("Scenario 4: Title Search - No Results", async () => {
      let mockItem = createMockItem(sandbox, { 
        title: "Obscure Paper",
        creators: [{ lastName: "Nobody" }],
        year: "2020",
        date: "2020-01-01",
      });
      mockZotero.getActiveZoteroPane().getSelectedItems.returns([mockItem]);

      global.fetch.resolves({
        ok: true,
        json: async () => ({ total: 0, data: [] }), 
      });

      await global.ZoteroCitationCounts.updateItems([mockItem], semanticScholarAPI); 

      const title = "Obscure Paper"; const author = "Nobody"; const year = "2020";
      const expectedQuery = `title:${encodeURIComponent(title)}+author:${encodeURIComponent(author)}+year:${encodeURIComponent(year)}`;
      const expectedUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${expectedQuery}&fields=citationCount,externalIds`;
      sinon.assert.calledOnce(global.fetch);
      sinon.assert.calledWithExactly(global.fetch, expectedUrl, { headers: {} });
      sinon.assert.notCalled(mockItem.setField);
      sinon.assert.notCalled(mockItem.saveTx);

      const pwInstance = mockZotero.ProgressWindow.returnValues[0];
      const itemProgressInstance = pwInstance.ItemProgress.returnValues[0];
      sinon.assert.calledOnce(itemProgressInstance.setError);
      
      const formatValueStub = global.ZoteroCitationCounts.l10n.formatValue;
      sinon.assert.calledWith(formatValueStub, "citationcounts-progresswindow-error-no-results-all-attempts", { api: "Semantic Scholar" });
      sinon.assert.calledWith(mockZotero.debug, sinon.match("No citation count found via Semantic Scholar/Title"));
      sinon.assert.calledWith(mockZotero.debug, sinon.match(/No citation count found after all attempts.*for item 'Obscure Paper'/));
    });

    it("Scenario 5: Title Search - Insufficient Metadata", async () => {
      let mockItem = createMockItem(sandbox, { title: "A Title Alone" }); 
      mockZotero.getActiveZoteroPane().getSelectedItems.returns([mockItem]);

      await global.ZoteroCitationCounts.updateItems([mockItem], semanticScholarAPI);

      sinon.assert.notCalled(global.fetch);
      sinon.assert.notCalled(mockItem.setField);
      sinon.assert.notCalled(mockItem.saveTx);

      const pwInstance = mockZotero.ProgressWindow.returnValues[0];
      const itemProgressInstance = pwInstance.ItemProgress.returnValues[0];
      sinon.assert.calledOnce(itemProgressInstance.setError);
      const formatValueStub = global.ZoteroCitationCounts.l10n.formatValue; 
      sinon.assert.calledWith(formatValueStub, "citationcounts-progresswindow-error-insufficient-metadata-for-title-search", { api: "Semantic Scholar" });
      sinon.assert.calledWith(mockZotero.debug, sinon.match("Insufficient metadata for title search for item 'A Title Alone' using Semantic Scholar."));
    });

    it("Scenario 6: Prioritization - DOI Search Preferred over Title Search", async () => {
      let mockItem = createMockItem(sandbox, { 
        DOI: "10.1000/realdoi",
        title: "A Real Title",
        creators: [{ lastName: "Author" }],
        year: "2021",
        date: "2021-01-01",
      });
      mockZotero.getActiveZoteroPane().getSelectedItems.returns([mockItem]);

      global.fetch.resolves({ 
        ok: true,
        json: async () => ({ citationCount: 777 }),
      });

      await global.ZoteroCitationCounts.updateItems([mockItem], semanticScholarAPI); 

      const expectedDoiUrl = "https://api.semanticscholar.org/graph/v1/paper/10.1000%2Frealdoi?fields=citationCount";
      sinon.assert.calledOnce(global.fetch);
      sinon.assert.calledWithExactly(global.fetch, expectedDoiUrl, { headers: {} });
      
      const titleQuery = "title%3AA%20Real%20Title%2Bauthor%3AAuthor%2Byear%3A2021";
      const expectedTitleUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${titleQuery}&fields=citationCount,externalIds`;
      sinon.assert.neverCalledWith(global.fetch, expectedTitleUrl);

      sinon.assert.calledOnce(mockItem.setField);
      sinon.assert.calledWithExactly(mockItem.setField, "extra", `777 citations (Semantic Scholar/DOI) [${today}]\n`);
    });

    it("Scenario 7: Prioritization - arXiv Search Preferred over Title Search (No DOI)", async () => {
      let mockItem = createMockItem(sandbox, { 
        url: "http://arxiv.org/abs/2202.00002",
        title: "An ArXiv Title",
        creators: [{ lastName: "Scientist" }],
        year: "2022",
        date: "2022-01-01",
      });
       mockZotero.getActiveZoteroPane().getSelectedItems.returns([mockItem]);

      global.fetch.resolves({ 
        ok: true,
        json: async () => ({ citationCount: 888 }),
      });

      await global.ZoteroCitationCounts.updateItems([mockItem], semanticScholarAPI); 

      const expectedArxivUrl = "https://api.semanticscholar.org/graph/v1/paper/arXiv:2202.00002?fields=citationCount";
      sinon.assert.calledOnce(global.fetch);
      sinon.assert.calledWithExactly(global.fetch, expectedArxivUrl, { headers: {} });

      const titleQuery = "title%3AAn%20ArXiv%20Title%2Bauthor%3AScientist%2Byear%3A2022";
      const expectedTitleUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${titleQuery}&fields=citationCount,externalIds`;
      sinon.assert.neverCalledWith(global.fetch, expectedTitleUrl);

      sinon.assert.calledOnce(mockItem.setField);
      sinon.assert.calledWithExactly(mockItem.setField, "extra", `888 citations (Semantic Scholar/arXiv) [${today}]\n`);
    });

    it("Scenario 8: Fallback - DOI fails (no-id), arXiv fails (no-id), Title Search Succeeds", async () => {
      let mockItem = createMockItem(sandbox, { 
        DOI: null, 
        url: null,  
        title: "Fallback Title",
        creators: [{ lastName: "Persistent" }],
        year: "2019",
        date: "2019-01-01",
      });
      mockZotero.getActiveZoteroPane().getSelectedItems.returns([mockItem]);
      
      const titleQuery = "title%3AFallback%20Title%2Bauthor%3APersistent%2Byear%3A2019";
      const titleUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${titleQuery}&fields=citationCount,externalIds`;

      global.fetch
        .withArgs(titleUrl).resolves({
          ok: true,
          json: async () => ({ total: 1, data: [{ citationCount: 99 }] }),
        });
      
      sandbox.stub(global.ZoteroCitationCounts, "_getDoi").withArgs(mockItem).throws(new Error("citationcounts-progresswindow-error-no-doi"));
      sandbox.stub(global.ZoteroCitationCounts, "_getArxiv").withArgs(mockItem).throws(new Error("citationcounts-progresswindow-error-no-arxiv"));

      await global.ZoteroCitationCounts.updateItems([mockItem], semanticScholarAPI);

      sinon.assert.calledOnce(global.fetch);
      sinon.assert.calledWithExactly(global.fetch, titleUrl, { headers: {} });

      sinon.assert.calledOnce(mockItem.setField);
      sinon.assert.calledWithExactly(mockItem.setField, "extra", `99 citations (Semantic Scholar/Title) [${today}]\n`);
      sinon.assert.calledWith(mockZotero.debug, sinon.match("DOI lookup error: citationcounts-progresswindow-error-no-doi"));
      sinon.assert.calledWith(mockZotero.debug, sinon.match("ArXiv lookup error: citationcounts-progresswindow-error-no-arxiv"));
      sinon.assert.calledWith(mockZotero.debug, sinon.match("Successfully fetched citation count via Semantic Scholar/Title for item 'Fallback Title'. Count: 99"));
    });
    
    it("Scenario 9: API Error during Title Search (e.g., 500 server error)", async () => {
      let mockItem = createMockItem(sandbox, { 
        title: "Error Paper",
        creators: [{ lastName: "Unlucky" }],
        year: "2024",
        date: "2024-01-01",
      });
      mockZotero.getActiveZoteroPane().getSelectedItems.returns([mockItem]);

      const title = "Error Paper"; const author = "Unlucky"; const year = "2024";
      const expectedQuery = `title:${encodeURIComponent(title)}+author:${encodeURIComponent(author)}+year:${encodeURIComponent(year)}`;
      const effectiveTitleUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${expectedQuery}&fields=citationCount,externalIds`;

      global.fetch.withArgs(effectiveTitleUrl).resolves({ 
        ok: false, 
        status: 500,
        url: effectiveTitleUrl, 
        json: async () => ({ message: "Internal Server Error" }),
      });
      
      sandbox.stub(global.ZoteroCitationCounts, "_getDoi").withArgs(mockItem).throws(new Error("citationcounts-progresswindow-error-no-doi"));
      sandbox.stub(global.ZoteroCitationCounts, "_getArxiv").withArgs(mockItem).throws(new Error("citationcounts-progresswindow-error-no-arxiv"));

      await global.ZoteroCitationCounts.updateItems([mockItem], semanticScholarAPI);

      sinon.assert.calledOnce(global.fetch);
      sinon.assert.calledWithExactly(global.fetch, effectiveTitleUrl, { headers: {} }); 
      sinon.assert.notCalled(mockItem.setField);
      sinon.assert.notCalled(mockItem.saveTx);

      const pwInstance = mockZotero.ProgressWindow.returnValues[0];
      const itemProgressInstance = pwInstance.ItemProgress.returnValues[0];
      sinon.assert.calledOnce(itemProgressInstance.setError);
      const formatValueStub = global.ZoteroCitationCounts.l10n.formatValue;
      sinon.assert.calledWith(formatValueStub, "citationcounts-progresswindow-error-api-server-error", { api: "Semantic Scholar" });
      sinon.assert.calledWith(mockZotero.debug, sinon.match(`Server error for ${effectiveTitleUrl}: status 500`)); 
    });

    it("Scenario (User Feedback): OpenAI GPT-4.5 System Card - Title Search", function(done) {
      let mockItem = createMockItem(sandbox, { 
        title: "OpenAI GPT-4.5 System Card",
        creators: [{ lastName: "Paino" }], 
        extra: "Some pre-existing unrelated content in extra field", 
      });
      mockZotero.getActiveZoteroPane().getSelectedItems.returns([mockItem]);

      const title = "OpenAI GPT-4.5 System Card"; const author = "Paino";
      const expectedQuery = `title:${encodeURIComponent(title)}+author:${encodeURIComponent(author)}`;
      const effectiveExpectedUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${expectedQuery}&fields=citationCount,externalIds`;

      const mockApiResponse = {
        total: 2,
        offset: 0,
        data: [
          { paperId: "6b2f415b612c59f4f1eed6445806aa6f5874137a", externalIds: { CorpusId: 276649612 }, citationCount: 5 },
          { paperId: "57d5d06c6b0c4984694ac08f28c65371f95eb891", externalIds: { DOI: "10.2118/0423-0008-jpt", CorpusId: 258854010 }, citationCount: 3 }
        ]
      };

      global.fetch.withArgs(effectiveExpectedUrl).resolves({
        ok: true,
        json: async () => mockApiResponse,
      });

      sandbox.stub(global.ZoteroCitationCounts, "_getDoi").withArgs(mockItem).throws(new Error("citationcounts-progresswindow-error-no-doi"));
      sandbox.stub(global.ZoteroCitationCounts, "_getArxiv").withArgs(mockItem).throws(new Error("citationcounts-progresswindow-error-no-arxiv"));

      global.ZoteroCitationCounts.updateItems([mockItem], semanticScholarAPI)
        .then(() => {
            setTimeout(() => {
                try {
                    sinon.assert.calledOnce(mockItem.setField);
                    sinon.assert.calledWithExactly(mockItem.setField, 'extra', `5 citations (Semantic Scholar/Title) [${today}]\nSome pre-existing unrelated content in extra field`);
                    sinon.assert.calledOnce(mockItem.saveTx);
                    done();
                } catch (e) {
                    done(e);
                }
            }, 0); 
        })
        .catch(done);
    });
  });
});
