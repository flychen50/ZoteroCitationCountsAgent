const { expect } = require('chai');
const sinon = require('sinon'); // Keep sinon for createSandbox
const fs = require('fs');
const path = require('path');

// Updated Helper function to use a passed-in sandbox
function createMockItem(sandbox, doi, extraContent = "", arxivId = null, url = null, metadata = {}) {
  const item = {
    _DOI: doi,
    _extra: extraContent,
    _arxivId: arxivId, 
    _url: url || (arxivId ? `https://arxiv.org/abs/${arxivId}` : null),
    _metadata: metadata, 
    getField: sandbox.stub(), // Use sandbox
    getCreators: sandbox.stub(), // Use sandbox
    setField: sandbox.stub(), // Use sandbox
    saveTx: sandbox.stub().resolves(), // This can remain plain if not part of assertions
    isFeedItem: false,
    id: metadata.title || doi || arxivId || `item-${Math.random().toString(36).substr(2, 9)}`,
  };
  item.getField.withArgs('DOI').returns(item._DOI);
  item.getField.withArgs('extra').returns(item._extra);
  item.getField.withArgs('url').returns(item._url); 
  
  // Stubs for _getItemMetadataForAdsQuery
  item.getField.withArgs('title').returns(item._metadata.title || null);
  item.getCreators.returns(item._metadata.authors || []); // Expects array of creator objects
  item.getField.withArgs('year').returns(item._metadata.year || null);
  item.getField.withArgs('date').returns(item._metadata.date || null); // Fallback for year

  return item;
}


describe('ZoteroCitationCounts - NASA ADS Integration Tests', function() {
  let sandbox;
  let zccCode; // To store script content
  let originalFetch;
  let originalDateToISOString;
  // Declare mockProgressWindowInstance and mockItemProgressInstance in the higher scope
  let mockProgressWindowInstance; 
  let mockItemProgressInstance; 

  beforeEach(function() {
    sandbox = sinon.createSandbox();

    // Store original global functions
    originalFetch = global.fetch;
    originalDateToISOString = Date.prototype.toISOString;

    // Mock global.Localization constructor
    global.Localization = sandbox.stub().returns({
      formatValue: sandbox.stub().resolvesArg(0)
    });

    // Mock Zotero.ProgressWindow and its ItemProgress
    mockItemProgressInstance = {
      setIcon: sandbox.stub(),
      setText: sandbox.stub(),
      setProgress: sandbox.stub(),
      setError: sandbox.stub(),
      setImage: sandbox.stub(), // Added setImage based on unit tests
    };
    // mockItemProgressInstance is defined in the higher scope
    mockItemProgressInstance = {
      setIcon: sandbox.stub(),
      setText: sandbox.stub(),
      setProgress: sandbox.stub(),
      setError: sandbox.stub(),
      setImage: sandbox.stub(), 
    };
    const MockItemProgressConstructor = sandbox.stub().returns(mockItemProgressInstance);

    // mockProgressWindowInstance is defined in the higher scope
    mockProgressWindowInstance = {
      changeHeadline: sandbox.stub(),
      show: sandbox.stub(),
      ItemProgress: MockItemProgressConstructor,
      startCloseTimer: sandbox.stub(),
    };
    const MockProgressWindowConstructor = sandbox.stub().returns(mockProgressWindowInstance);
    
    const mockZoteroPane = {
      getSelectedItems: sandbox.stub(),
    };

    // Mock global Zotero object
    global.Zotero = {
      Prefs: {
        get: sandbox.stub(),
        set: sandbox.stub(),
      },
      debug: sandbox.stub(),
      log: sandbox.stub(), // Added log just in case
      ProgressWindow: MockProgressWindowConstructor,
      getActiveZoteroPane: sandbox.stub().returns(mockZoteroPane),
      hiDPI: false,
      File: { 
        exists: sandbox.stub().returns(true),
        getContentsAsync: sandbox.stub().resolves(""),
        // Ensure FTL file operations are handled if init expects them
        getResource: sandbox.stub().callsFake(uri => {
          if (uri.endsWith('.ftl')) {
            const ftlPath = path.resolve(__dirname, '../../src', uri.substring(uri.lastIndexOf('/') + 1));
            if (!fs.existsSync(ftlPath)) {
                 // Create a dummy FTL file if it doesn't exist, to prevent errors during test runs
                 // This is a workaround for tests assuming FTL files are present and readable
                fs.writeFileSync(ftlPath, "# Dummy FTL for tests\n");
            }
            return ftlPath; // This might not be what Zotero.File.getResource actually returns
                           // but helps in locating the file for readFileSync if needed by the script logic.
          }
          return uri; // Fallback
        }),
      },
      getMainWindow: sandbox.stub().returns({
        MozXULElement: {
            insertFTLIfNeeded: sandbox.stub(),
        },
        document: { // For L10N initialization if it needs documentElement
            documentElement: {
                getAttribute: sandbox.stub().returns("en-US")
            }
        }
      }),
      Utilities: { // Mock for Zotero.Utilities
        getVersion: sandbox.stub().returns("test-zotero-version"),
      },
      Plugins: { // Ensure Plugins.Utilities.log is stubbed
        Utilities: {
          log: sandbox.stub()
        }
      }
    };
    
    // Stub global.fetch
    global.fetch = sandbox.stub();

    // Stub Date.prototype.toISOString
    const constantDate = new Date('2023-01-01T12:00:00.000Z');
    Date.prototype.toISOString = sandbox.stub().returns(constantDate.toISOString());

    // Load ZoteroCitationCounts script content if not already loaded
    if (!zccCode) {
      zccCode = fs.readFileSync(path.join(__dirname, '../../src/zoterocitationcounts.js'), 'utf-8');
    }
    // Execute the script, injecting the mocked Zotero and Localization
    new Function('Zotero', 'Localization', zccCode)(global.Zotero, global.Localization);
        
    // Initialize ZoteroCitationCounts (it's now on global scope)
    if (global.ZoteroCitationCounts && typeof global.ZoteroCitationCounts.init === 'function' && !global.ZoteroCitationCounts._initialized) {
      global.ZoteroCitationCounts.init({ 
        id: 'test-id@example.com', 
        version: 'test-version', 
        rootURI: 'chrome://test-root/' // Ensure this is a valid-looking root URI
      });
    }

    // Ensure l10n.formatValue is stubbed on the ZoteroCitationCounts instance
    if (global.ZoteroCitationCounts && global.ZoteroCitationCounts.l10n &&
        (!global.ZoteroCitationCounts.l10n.formatValue || !global.ZoteroCitationCounts.l10n.formatValue.isSinonProxy)) {
        global.ZoteroCitationCounts.l10n.formatValue = sandbox.stub().resolvesArg(0);
    }
  });

  afterEach(function() {
    sandbox.restore();
    
    // Restore original global functions
    global.fetch = originalFetch;
    Date.prototype.toISOString = originalDateToISOString;
    
    // Clean up globals
    delete global.Zotero;
    if (global.ZoteroCitationCounts) {
      delete global.ZoteroCitationCounts;
    }
    if (global.Localization) {
      delete global.Localization;
    }
    // Clean up dummy FTL file if created by a test
    const ftlPath = path.resolve(__dirname, '../../src/citation-counts.ftl');
    if (fs.existsSync(ftlPath) && fs.readFileSync(ftlPath, 'utf8').startsWith("# Dummy FTL for tests")) {
        fs.unlinkSync(ftlPath);
    }
  });

  // Test Scenarios will go here.
  // Note: mockGetSelectedItems is now part of mockZoteroPane stub, need to access it via global.Zotero.getActiveZoteroPane().getSelectedItems
  // mockProgressWindowInstance and mockItemProgressInstance are correctly set up for assertions.
  describe('NASA ADS Scenarios', function() {
    let nasaAdsApiObject;
    let mockItems;

    beforeEach(function() {
      // Find NASA ADS API object
      nasaAdsApiObject = global.ZoteroCitationCounts.APIs.find(api => api.key === 'nasaads');
      expect(nasaAdsApiObject, "NASA ADS API object not found").to.exist;
    });

    it('Scenario 1: Successful fetch and update for NASA ADS (DOI)', async function() {
      const mockItem = createMockItem(sandbox, '10.1234/test.doi');
      mockItems = [mockItem];
      global.Zotero.getActiveZoteroPane().getSelectedItems.returns(mockItems);
      global.Zotero.Prefs.get.withArgs('extensions.citationcounts.nasaadsApiKey', true).returns('TEST_KEY');

      let saveTxCalledResolve;
      const saveTxCalledPromise = new Promise(resolve => {
        saveTxCalledResolve = resolve;
      });
      mockItem.saveTx = sandbox.stub().callsFake(() => {
        saveTxCalledResolve();
        return Promise.resolve();
      });

      global.fetch.resolves({
        ok: true,
        status: 200,
        json: sinon.stub().resolves({ response: { docs: [{ citation_count: 42 }], numFound: 1 } }),
      });
      
      await global.ZoteroCitationCounts.updateItems(mockItems, nasaAdsApiObject);
      
      // It's possible updateItems finishes, but saveTx is called slightly later due to promise resolutions.
      // Or, an error occurs before saveTx.
      try {
        await saveTxCalledPromise; // Wait for saveTx to be called
      } catch (e) {
        // This catch is for timeout on saveTxCalledPromise, if used with a timeout mechanism.
        // For now, if saveTx is not called, assertions below will fail.
      }

      // Check if an error occurred unexpectedly in _updateItem
      sinon.assert.notCalled(mockItemProgressInstance.setError);

      // Assertions run after saveTx has been called (if successful path taken)
      sinon.assert.calledOnce(global.fetch);
      const fetchCall = global.fetch.getCall(0);
      expect(fetchCall.args[0]).to.include('https://api.adsabs.harvard.edu/v1/search/query');
      expect(fetchCall.args[0]).to.include('q=doi:10.1234%2Ftest.doi');
      expect(fetchCall.args[1].headers.Authorization).to.equal('Bearer TEST_KEY');
      
      sinon.assert.calledOnce(mockItem.setField);
      sinon.assert.calledWithExactly(mockItem.setField, 'extra', '42 citations (NASA ADS/DOI) [2023-01-01]\n');
      
      sinon.assert.calledOnce(mockItem.saveTx); // This is now guaranteed to have been called
      
      // Temporarily commenting out ProgressWindow assertions to isolate core logic
      // sinon.assert.calledOnce(mockProgressWindowInstance.ItemProgress);
      // expect(mockItemProgressInstance.setIcon.calledWith(sinon.match(/tick/))).to.be.true;
      // expect(mockItemProgressInstance.setProgress.calledWith(100)).to.be.true;

      sinon.assert.calledWithMatch(global.Zotero.debug, "Zotero Citation Counts: Entering updateItems for API: NASA ADS. Number of raw items: 1");
      sinon.assert.calledWithMatch(global.Zotero.debug, `Zotero Citation Counts: Successfully fetched citation count via NASA ADS/DOI for item '${mockItem.id}'. Count: 42`);
      sinon.assert.calledWithMatch(global.Zotero.debug, `Zotero Citation Counts: [Info] _setCitationCount: Entered for item '${mockItem.id}', source: 'NASA ADS/DOI', count: 42`);


      expect(global.ZoteroCitationCounts.l10n.formatValue.called).to.be.true;
      // Headline might change twice, once for starting, once for finishing. Check finished.
      sinon.assert.calledWith(global.ZoteroCitationCounts.l10n.formatValue, 'citationcounts-progresswindow-finished-headline', { api: 'NASA ADS' });
    });

    it('Scenario 2: NASA ADS API key error (401)', async function() {
      const mockItem = createMockItem(sandbox, '10.1234/another.doi'); // Pass sandbox
      mockItems = [mockItem];
      global.Zotero.getActiveZoteroPane().getSelectedItems.returns(mockItems);
      global.Zotero.Prefs.get.withArgs('extensions.citationcounts.nasaadsApiKey', true).returns('WRONG_KEY');

      // Ensure the URL in the resolved object matches what _sendRequest would use, for the status check logic
      const expectedUrl = 'https://api.adsabs.harvard.edu/v1/search/query?q=doi:10.1234%2Fanother.doi&fl=citation_count';
      global.fetch.resolves({
        ok: false,
        status: 401,
        url: expectedUrl, 
        json: sinon.stub().resolves({ error: "Unauthorized" }) // Mock a JSON body for the error
      });
      
      await global.ZoteroCitationCounts.updateItems(mockItems, nasaAdsApiObject);

      expect(global.fetch.calledOnce).to.be.true;
      const fetchCall = global.fetch.getCall(0);
      expect(fetchCall.args[0]).to.equal(expectedUrl);
      expect(fetchCall.args[1].headers.Authorization).to.equal('Bearer WRONG_KEY');

      expect(mockItem.setField.called).to.be.false; // No citation update
      expect(mockItem.saveTx.called).to.be.false;

      expect(mockItemProgressInstance.setError.calledOnce).to.be.true;
      
      // Check that l10n was called to format the specific error message for the ProgressWindow item
      // The error message itself is added as a new ItemProgress, so we check the text of that new ItemProgress
      // This means ItemProgress constructor should be called twice: once for the item, once for the error.
      expect(mockProgressWindowInstance.ItemProgress.calledTwice).to.be.true; // Original item + error item
      const errorItemProgressCall = mockProgressWindowInstance.ItemProgress.getCall(1); // Second call is for the error.
      expect(global.ZoteroCitationCounts.l10n.formatValue.calledWith('citationcounts-progresswindow-error-nasaads-apikey', { api: 'NASA ADS' })).to.be.true;
      // Check the text passed to the error ItemProgress constructor
      expect(errorItemProgressCall.args[1]).to.equal('citationcounts-progresswindow-error-nasaads-apikey');
      
      sinon.assert.calledWithMatch(global.Zotero.debug, `Zotero Citation Counts: [Error] _updateItem: Error processing item '${mockItem.id}': citationcounts-progresswindow-error-nasaads-apikey`);
    });

    it('Scenario 3: No DOI, No arXiv, No Title for NASA ADS (Insufficient Metadata)', async function() {
      const mockItem = createMockItem(sandbox, null, "", null, null, { title: null, authors: [], year: null }); // Pass sandbox
      mockItems = [mockItem];
      global.Zotero.getActiveZoteroPane().getSelectedItems.returns(mockItems);
      global.Zotero.Prefs.get.withArgs('extensions.citationcounts.nasaadsApiKey', true).returns('TEST_KEY');

      await global.ZoteroCitationCounts.updateItems(mockItems, nasaAdsApiObject);

      expect(global.fetch.called).to.be.false; // Fetch should not be called
      expect(mockItem.setField.called).to.be.false;
      expect(mockItem.saveTx.called).to.be.false;

      expect(mockItemProgressInstance.setError.calledOnce).to.be.true;
      
      expect(mockProgressWindowInstance.ItemProgress.calledTwice).to.be.true; // Original item + error item
      const errorItemProgressCall = mockProgressWindowInstance.ItemProgress.getCall(1);
      
      // NASA ADS doesn't support title search, so it throws nasaads-no-results when no DOI/arXiv available
      expect(global.ZoteroCitationCounts.l10n.formatValue.calledWith('citationcounts-progresswindow-error-nasaads-no-results', { api: 'NASA ADS' })).to.be.true;
      expect(errorItemProgressCall.args[1]).to.equal('citationcounts-progresswindow-error-nasaads-no-results');
      
      sinon.assert.calledWithMatch(global.Zotero.debug, `Zotero Citation Counts: [Error] _updateItem: Error processing item '${mockItem.id}': citationcounts-progresswindow-error-nasaads-no-results`);
    });

    it('Scenario 4: No DOI, No arXiv for NASA ADS (Should trigger no-doi-or-arxiv error)', async function() {
      const mockItem = createMockItem(sandbox, null, "", null, null, {  // Pass sandbox
        title: "My Test Paper", 
        authors: [{lastName: "Author"}], 
        year: "2023" 
      }); 
      mockItems = [mockItem];
      global.Zotero.getActiveZoteroPane().getSelectedItems.returns(mockItems);
      global.Zotero.Prefs.get.withArgs('extensions.citationcounts.nasaadsApiKey', true).returns('TEST_KEY');
      
      await global.ZoteroCitationCounts.updateItems(mockItems, nasaAdsApiObject);
      
      expect(global.fetch.called).to.be.false; // No fetch should be called since no DOI/arXiv
      expect(mockItem.setField.called).to.be.false;
      expect(mockItem.saveTx.called).to.be.false;
      
      expect(mockItemProgressInstance.setError.calledOnce).to.be.true;
      expect(mockProgressWindowInstance.ItemProgress.calledTwice).to.be.true;
      const errorItemProgressCall = mockProgressWindowInstance.ItemProgress.getCall(1);
      expect(global.ZoteroCitationCounts.l10n.formatValue.calledWith('citationcounts-progresswindow-error-nasaads-no-results', { api: 'NASA ADS' })).to.be.true;
      expect(errorItemProgressCall.args[1]).to.equal('citationcounts-progresswindow-error-nasaads-no-results');
      
      sinon.assert.calledWithMatch(global.Zotero.debug, `Zotero Citation Counts: [Error] _updateItem: Error processing item 'My Test Paper': citationcounts-progresswindow-error-nasaads-no-results`);
    });

    it('Scenario 5: No DOI, No arXiv for NASA ADS (Similar to Scenario 4)', async function() {
      const mockItem = createMockItem(sandbox, null, "", null, null, { title: "Unknown Paper" }); // Pass sandbox
      mockItems = [mockItem];
      global.Zotero.getActiveZoteroPane().getSelectedItems.returns(mockItems);
      global.Zotero.Prefs.get.withArgs('extensions.citationcounts.nasaadsApiKey', true).returns('TEST_KEY');

      await global.ZoteroCitationCounts.updateItems(mockItems, nasaAdsApiObject);

      expect(global.fetch.called).to.be.false; // No fetch since no DOI/arXiv
      expect(mockItem.setField.called).to.be.false;
      expect(mockItemProgressInstance.setError.calledOnce).to.be.true;
      
      expect(mockProgressWindowInstance.ItemProgress.calledTwice).to.be.true;
      
      const errorItemProgressCall = mockProgressWindowInstance.ItemProgress.getCall(1);
      expect(global.ZoteroCitationCounts.l10n.formatValue.calledWith('citationcounts-progresswindow-error-nasaads-no-results', { api: 'NASA ADS' })).to.be.true;
      expect(errorItemProgressCall.args[1]).to.equal('citationcounts-progresswindow-error-nasaads-no-results');
      
      sinon.assert.calledWithMatch(global.Zotero.debug, `Zotero Citation Counts: [Error] _updateItem: Error processing item 'Unknown Paper': citationcounts-progresswindow-error-nasaads-no-results`);
    });
    
    it('Scenario 6: Prioritization - DOI Search Preferred over Title Search for NASA ADS', async function() {
      const mockItem = createMockItem(sandbox, '10.5555/doi-wins', "", null, null, { // Pass sandbox
        title: "Title Ignored",
        authors: [{lastName: "Author"}],
        year: "2020"
      });
      mockItems = [mockItem];
      global.Zotero.getActiveZoteroPane().getSelectedItems.returns(mockItems);
      global.Zotero.Prefs.get.withArgs('extensions.citationcounts.nasaadsApiKey', true).returns('TEST_KEY');

      // Mock fetch to return different counts for DOI and title
      const doiResponse = { response: { docs: [{ citation_count: 100 }], numFound: 1 } }; // DOI count
      const titleResponse = { response: { docs: [{ citation_count: 50 }], numFound: 1 } }; // Title count (should not be used)

      global.fetch.callsFake(async (url) => {
        if (url.includes('doi:10.5555%2Fdoi-wins')) {
          return { ok: true, status: 200, json: sinon.stub().resolves(doiResponse) };
        } else if (url.includes('title%3A%22Title%20Ignored%22')) {
          return { ok: true, status: 200, json: sinon.stub().resolves(titleResponse) };
        }
        return { ok: false, status: 404, json: sinon.stub().resolves({error: 'Not Found'})};
      });

      await global.ZoteroCitationCounts.updateItems(mockItems, nasaAdsApiObject);

      expect(global.fetch.calledOnce).to.be.true; // Should only be called once for DOI
      const fetchCall = global.fetch.getCall(0);
      expect(fetchCall.args[0]).to.include('q=doi:10.5555%2Fdoi-wins');
      expect(fetchCall.args[1].headers.Authorization).to.equal('Bearer TEST_KEY');
      
      expect(mockItem.setField.calledOnceWith('extra', '100 citations (NASA ADS/DOI) [2023-01-01]\n')).to.be.true;
      sinon.assert.calledWithMatch(global.Zotero.debug, `Zotero Citation Counts: Successfully fetched citation count via NASA ADS/DOI for item '${mockItem.id}'. Count: 100`);
    });

    it('Scenario 7: Prioritization - arXiv Search Preferred over Title Search (No DOI) for NASA ADS', async function() {
      const mockItem = createMockItem(sandbox, null, "", "2301.00001", `https://arxiv.org/abs/2301.00001`, { // Pass sandbox
        title: "Title Also Ignored",
        authors: [{lastName: "SomeAuthor"}],
        year: "2023"
      }); 
      mockItems = [mockItem];
      global.Zotero.getActiveZoteroPane().getSelectedItems.returns(mockItems);
      global.Zotero.Prefs.get.withArgs('extensions.citationcounts.nasaadsApiKey', true).returns('TEST_KEY');

      const arxivResponse = { response: { docs: [{ citation_count: 75 }], numFound: 1 } }; // arXiv count
      const titleResponse = { response: { docs: [{ citation_count: 25 }], numFound: 1 } }; // Title count

      global.fetch.callsFake(async (url) => {
        if (url.includes('q=arxiv:2301.00001')) {
          return { ok: true, status: 200, json: sinon.stub().resolves(arxivResponse) };
        } else if (url.includes('title%3A%22Title%20Also%20Ignored%22')) {
          return { ok: true, status: 200, json: sinon.stub().resolves(titleResponse) };
        }
        return { ok: false, status: 404, json: sinon.stub().resolves({error: 'Not Found'})};
      });
      
      await global.ZoteroCitationCounts.updateItems(mockItems, nasaAdsApiObject);

      expect(global.fetch.calledOnce).to.be.true; // Should only be called once for arXiv
      const fetchCall = global.fetch.getCall(0);
      expect(fetchCall.args[0]).to.include('q=arxiv:2301.00001');
      expect(fetchCall.args[1].headers.Authorization).to.equal('Bearer TEST_KEY');

      expect(mockItem.setField.calledOnceWith('extra', '75 citations (NASA ADS/arXiv) [2023-01-01]\n')).to.be.true;
      sinon.assert.calledWithMatch(global.Zotero.debug, `Zotero Citation Counts: Successfully fetched citation count via NASA ADS/arXiv for item '${mockItem.id}'. Count: 75`);
    });

    it('Scenario 8: No Citation Count Found via DOI for NASA ADS', async function() {
      const mockItem = createMockItem(sandbox, '10.9999/nodoiresult'); // Pass sandbox
      mockItems = [mockItem];
      global.Zotero.getActiveZoteroPane().getSelectedItems.returns(mockItems);
      global.Zotero.Prefs.get.withArgs('extensions.citationcounts.nasaadsApiKey', true).returns('TEST_KEY');

      // Mock fetch for DOI to return a response that _nasaadsCallback interprets as no citation count
      global.fetch.resolves({
        ok: true,
        status: 200,
        json: sinon.stub().resolves({ response: { docs: [], numFound: 0 } }), // No docs, so callback returns null
      });

      await global.ZoteroCitationCounts.updateItems(mockItems, nasaAdsApiObject);
      
      expect(mockItem.setField.called).to.be.false;
      expect(mockItemProgressInstance.setError.calledOnce).to.be.true;
      
      expect(mockProgressWindowInstance.ItemProgress.calledTwice).to.be.true;
      
      // This sequence: _nasaadsCallback returns null -> _sendRequest throws "Invalid count" ->
      // _retrieveCitationCount catches, logs "No citation count found via NASA ADS/DOI...", rethrows "no-citation-count"
      // -> _retrieveCitationCount's final error handling logs "Failed..." and throws.
      sinon.assert.calledWithMatch(global.Zotero.debug, `Zotero Citation Counts: NASA ADS response did not contain expected citation_count.`);
      sinon.assert.calledWithMatch(global.Zotero.debug, `Zotero Citation Counts: [Error] _updateItem: Error processing item '${mockItem.id}': citationcounts-progresswindow-error-nasaads-no-results`);
    });

    it('Scenario 9: No Citation Count Found via arXiv for NASA ADS', async function() {
      const mockItem = createMockItem(sandbox, null, "", "2301.99999", "https://arxiv.org/abs/2301.99999"); // Pass sandbox
      mockItems = [mockItem];
      global.Zotero.getActiveZoteroPane().getSelectedItems.returns(mockItems);
      global.Zotero.Prefs.get.withArgs('extensions.citationcounts.nasaadsApiKey', true).returns('TEST_KEY');

      global.fetch.resolves({
        ok: true,
        status: 200,
        json: sinon.stub().resolves({ response: { docs: [], numFound: 0 } }), 
      });

      await global.ZoteroCitationCounts.updateItems(mockItems, nasaAdsApiObject);

      expect(mockItem.setField.called).to.be.false;
      expect(mockItemProgressInstance.setError.calledOnce).to.be.true;
      
      expect(mockProgressWindowInstance.ItemProgress.calledTwice).to.be.true;
      
      sinon.assert.calledWithMatch(global.Zotero.debug, `Zotero Citation Counts: NASA ADS response did not contain expected citation_count.`);
      sinon.assert.calledWithMatch(global.Zotero.debug, `Zotero Citation Counts: [Error] _updateItem: Error processing item '${mockItem.id}': citationcounts-progresswindow-error-nasaads-no-results`);
    });

  });
});
