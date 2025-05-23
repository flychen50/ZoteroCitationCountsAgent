const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs');
const path = require('path');

describe('INSPIRE-HEP Integration Tests', function() {
  let sandbox;
  let mockZotero;
  let mockItem;
  let inspireAPI;
  const today = "2024-07-27"; // Fixed date for consistent testing

  // Helper function to create a mock Zotero item
  const createMockItem = (sandbox, props) => {
    const item = {
      id: props.id || 1,
      _changed: false,
      isFeedItem: false,
      // Stubs will be created using the sandbox
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

    inspireAPI = global.ZoteroCitationCounts.APIs.find( // Use global.ZoteroCitationCounts
      (api) => api.key === "inspire"
    );
    expect(inspireAPI).to.exist;
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

  describe("INSPIRE-HEP API Tests", () => {
    it("Scenario 1: Successful fetch and update via DOI", async () => {
      mockItem = createMockItem(sandbox, { DOI: "10.1000/xyz123" }); // Pass sandbox
      mockZotero.getActiveZoteroPane().getSelectedItems.returns([mockItem]);

      global.fetch.resolves({
        ok: true,
        json: async () => ({
          metadata: {
            citation_count: 123,
          },
        }),
      });

      await global.ZoteroCitationCounts.updateItems([mockItem], inspireAPI); // Use global.ZoteroCitationCounts

      const expectedUrl =
        "https://inspirehep.net/api/doi/10.1000%2Fxyz123";
      expect(global.fetch.calledOnceWith(expectedUrl)).to.be.true;
      expect(mockItem.setField.calledOnceWith("extra", `123 citations (INSPIRE-HEP/DOI) [${today}]`)).to.be.true;
      expect(mockItem.saveTx.calledOnce).to.be.true;
      
      // Check progress window
      const pwInstance = mockZotero.ProgressWindow();
      expect(pwInstance.changeHeadline.called).to.be.true;
      const itemProgressInstance = pwInstance.ItemProgress();
      expect(itemProgressInstance.setIcon.calledWith(global.ZoteroCitationCounts.icon("tick"))).to.be.true; // Use global.ZoteroCitationCounts
      expect(itemProgressInstance.setProgress.calledWith(100)).to.be.true;
    });

    it("Scenario 2: Successful fetch and update via arXiv ID", async () => {
      mockItem = createMockItem(sandbox, { url: "https://arxiv.org/abs/2101.00001" }); // Pass sandbox
      mockZotero.getActiveZoteroPane().getSelectedItems.returns([mockItem]);

      global.fetch.resolves({
        ok: true,
        json: async () => ({
          metadata: {
            citation_count: 456,
          },
        }),
      });

      await global.ZoteroCitationCounts.updateItems([mockItem], inspireAPI); // Use global.ZoteroCitationCounts

      const expectedUrl =
        "https://inspirehep.net/api/arxiv/2101.00001";
      expect(global.fetch.calledOnceWith(expectedUrl)).to.be.true;
      expect(mockItem.setField.calledOnceWith("extra", `456 citations (INSPIRE-HEP/arXiv) [${today}]`)).to.be.true;
      expect(mockItem.saveTx.calledOnce).to.be.true;
    });

    it("Scenario 3: Error handling for invalid DOI", async () => {
      mockItem = createMockItem(sandbox, { DOI: "10.1000/invalid" }); // Pass sandbox
      mockZotero.getActiveZoteroPane().getSelectedItems.returns([mockItem]);

      global.fetch.resolves({
        ok: false,
        status: 404,
        json: async () => ({ message: "Not Found" }),
      });

      await global.ZoteroCitationCounts.updateItems([mockItem], inspireAPI); // Use global.ZoteroCitationCounts

      const expectedUrl =
        "https://inspirehep.net/api/doi/10.1000%2Finvalid";
      expect(global.fetch.calledOnceWith(expectedUrl)).to.be.true;
      expect(mockItem.setField.called).to.be.false; // No field should be set
      expect(mockItem.saveTx.called).to.be.false;

      const pwInstance = mockZotero.ProgressWindow();
      const itemProgressInstance = pwInstance.ItemProgress();
      expect(itemProgressInstance.setError.calledOnce).to.be.true;
      
      const formatValueStub = global.ZoteroCitationCounts.l10n.formatValue; // Use global.ZoteroCitationCounts
      expect(formatValueStub.calledWith("citationcounts-progresswindow-error-bad-api-response", { api: "INSPIRE-HEP" })).to.be.true;
    });

    it("Scenario 4: Error handling for invalid arXiv ID", async () => {
      mockItem = createMockItem(sandbox, { url: "https://arxiv.org/abs/2101.invalid" }); // Pass sandbox
      mockZotero.getActiveZoteroPane().getSelectedItems.returns([mockItem]);

      global.fetch.resolves({
        ok: false,
        status: 404,
        json: async () => ({ message: "Not Found" }),
      });

      await global.ZoteroCitationCounts.updateItems([mockItem], inspireAPI); // Use global.ZoteroCitationCounts

      const expectedUrl =
        "https://inspirehep.net/api/arxiv/2101.invalid";
      expect(global.fetch.calledOnceWith(expectedUrl)).to.be.true;
      expect(mockItem.setField.called).to.be.false; // No field should be set
      expect(mockItem.saveTx.called).to.be.false;

      const pwInstance = mockZotero.ProgressWindow();
      const itemProgressInstance = pwInstance.ItemProgress();
      expect(itemProgressInstance.setError.calledOnce).to.be.true;
      
      const formatValueStub = global.ZoteroCitationCounts.l10n.formatValue; // Use global.ZoteroCitationCounts
      expect(formatValueStub.calledWith("citationcounts-progresswindow-error-bad-api-response", { api: "INSPIRE-HEP" })).to.be.true;
    });
  });
});
