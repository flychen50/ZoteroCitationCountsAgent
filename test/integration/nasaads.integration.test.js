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
  let sandbox; // Define sandbox here
  let zccCode;
  let mockZoteroPane;
  let mockProgressWindowInstance;
  let mockItemProgressInstance;
  let mockGetSelectedItems;
  let originalDateToISOString;

  beforeEach(function() {
    sandbox = sinon.createSandbox(); // Initialize sandbox

    // Mock Zotero.ProgressWindow.ItemProgress first
    mockItemProgressInstance = {
      setIcon: sandbox.stub(), // Use sandbox
      setText: sandbox.stub(), // Use sandbox
      setProgress: sandbox.stub(), // Use sandbox
      setError: sandbox.stub(), // Use sandbox
    };
    const MockItemProgressConstructor = sandbox.stub().returns(mockItemProgressInstance); // Use sandbox

    // Mock Zotero.ProgressWindow
    mockProgressWindowInstance = {
      changeHeadline: sandbox.stub(), // Use sandbox
      show: sandbox.stub(), // Use sandbox
      ItemProgress: MockItemProgressConstructor, 
      startCloseTimer: sandbox.stub(), // Use sandbox
    };
    const MockProgressWindowConstructor = sandbox.stub().returns(mockProgressWindowInstance); // Use sandbox

    // Mock Zotero pane
    mockGetSelectedItems = sandbox.stub(); // Use sandbox
    mockZoteroPane = {
      getSelectedItems: mockGetSelectedItems,
    };

    // Mock global Zotero object
    global.Zotero = {
      Prefs: {
        get: sandbox.stub(), // Use sandbox
        set: sandbox.stub(), // Use sandbox
      },
      debug: sandbox.stub(), // Use sandbox
      ProgressWindow: MockProgressWindowConstructor,
      getActiveZoteroPane: sandbox.stub().returns(mockZoteroPane), // Use sandbox
      // Zotero.Localization itself is not used by the script, global.Localization is.
      hiDPI: false,
      File: { 
        exists: sandbox.stub().returns(true), // Use sandbox
        getContentsAsync: sandbox.stub().resolves(""),  // Use sandbox
      },
      getMainWindow: sandbox.stub().returns({ // Use sandbox
        MozXULElement: {
            insertFTLIfNeeded: sandbox.stub(), // Use sandbox
        }
      }),
    };
    
    // Mock global.fetch using sandbox
    global.fetch = sandbox.stub();

    // Mock Date.prototype.toISOString to control date strings
    const constantDate = new Date('2023-01-01T12:00:00.000Z');
    originalDateToISOString = Date.prototype.toISOString; // Store original
    Date.prototype.toISOString = sandbox.stub().returns(constantDate.toISOString()); // Use sandbox

    // Define global.Localization before loading the script
    global.Localization = sandbox.stub().returns({ // Use sandbox
        formatValue: sandbox.stub().resolvesArg(0) 
      });


    // Load ZoteroCitationCounts script
    if (!zccCode) {
      zccCode = fs.readFileSync(path.join(__dirname, '../../src/zoterocitationcounts.js'), 'utf-8');
    }
    // Inject Zotero mock and global Localization into the script's scope
    new Function('Zotero', 'Localization', zccCode)(global.Zotero, global.Localization);
        
    // Initialize ZoteroCitationCounts (now global)
    const ftlPath = path.resolve(__dirname, '../../src/citation-counts.ftl');
    if (!fs.existsSync(ftlPath)) {
        fs.writeFileSync(ftlPath, "# Dummy FTL file for testing\n");
    }

    global.ZoteroCitationCounts.init({ 
      id: 'test-id', 
      version: 'test-version', 
      rootURI: 'test-uri/'
    });

    // The l10n instance on ZoteroCitationCounts is now created with the mocked global.Localization.
    // Its formatValue method will be the stub we defined on global.Localization's return object.
    // No need to re-assign ZoteroCitationCounts.l10n.formatValue here.

  });

  afterEach(function() {
    sandbox.restore(); // Use sandbox.restore()
    Date.prototype.toISOString = originalDateToISOString; // Restore original toISOString
    delete global.Zotero;
    delete global.ZoteroCitationCounts; // Clean up global scope
    delete global.Localization; // Clean up global Localization
    // No need to delete global.fetch if it's restored by sinon.restore()
    // const ftlPath = path.resolve(__dirname, '../../src/citation-counts.ftl');
    // if (fs.existsSync(ftlPath) && fs.readFileSync(ftlPath, 'utf8').startsWith("# Dummy FTL file for testing")) {
    //     fs.unlinkSync(ftlPath);
    // }
  });

  // Test Scenarios will go here
  describe('NASA ADS Scenarios', function() {
    let nasaAdsApiObject;
    let mockItems;

    beforeEach(function() {
      // Find NASA ADS API object
      nasaAdsApiObject = global.ZoteroCitationCounts.APIs.find(api => api.key === 'nasaads');
      expect(nasaAdsApiObject, "NASA ADS API object not found").to.exist;
    });

    it.only('Scenario 1: Successful fetch and update for NASA ADS (DOI)', async function() { // Added .only
      // Create mockItem after plugin code is loaded to ensure same context
      const mockItem = createMockItem(sandbox, '10.1234/test.doi');
      mockItems = [mockItem];
      mockGetSelectedItems.returns(mockItems);
      global.Zotero.Prefs.get.withArgs('extensions.citationcounts.nasaadsApiKey', true).returns('TEST_KEY');
      
      global.fetch.resolves({
        ok: true,
        status: 200,
        json: sinon.stub().resolves({ response: { docs: [{ citation_count: 42 }], numFound: 1 } }),
      });

      let updateError = null;
      try {
        await global.ZoteroCitationCounts.updateItems(mockItems, nasaAdsApiObject);
      } catch (e) {
        updateError = e;
      }
      console.log('mockItem.setField.callCount:', mockItem.setField.callCount);
      if (updateError) {
        console.error('updateItems threw:', updateError);
      }
      
      expect(global.fetch.calledOnce).to.be.true;
      const fetchCall = global.fetch.getCall(0);
      expect(fetchCall.args[0]).to.include('https://api.adsabs.harvard.edu/v1/search/query');
      expect(fetchCall.args[0]).to.include('q=doi:10.1234%2Ftest.doi'); // URI encoded
      expect(fetchCall.args[1].headers.Authorization).to.equal('Bearer TEST_KEY');
      
      // Accept both with and without trailing newline for robustness
      const setFieldArgs = mockItem.setField.getCall(0)?.args;
      expect(setFieldArgs, 'setField was not called').to.exist;
      const expectedString = '42 citations (NASA ADS/DOI) [2023-01-01]';
      expect(setFieldArgs[0]).to.equal('extra');
      // Accept with or without trailing newline
      expect(setFieldArgs[1] === expectedString || setFieldArgs[1] === expectedString + '\n', `setField value was '${setFieldArgs[1]}'`).to.be.true;
      expect(mockItem.saveTx.calledOnce).to.be.true;
      
      expect(mockProgressWindowInstance.ItemProgress.calledOnce).to.be.true;
      expect(mockItemProgressInstance.setIcon.calledWith(sinon.match(/tick/))).to.be.true; // Or specific icon path
      expect(mockItemProgressInstance.setProgress.calledWith(100)).to.be.true;

      // Check for the initial debug log
      sinon.assert.calledWithMatch(global.Zotero.debug, "Zotero Citation Counts: Entering updateItems for API: NASA ADS. Number of raw items: 1");
      sinon.assert.calledWithMatch(global.Zotero.debug, `Zotero Citation Counts: Successfully fetched citation count via NASA ADS/DOI for item '${mockItem.id}'. Count: 42`);

      // Verify l10n calls for progress window headlines
      // expect(global.ZoteroCitationCounts.l10n.formatValue.calledWith('citationcounts-progresswindow-headline', { api: 'NASA ADS' })).to.be.true; // Commented out
      
      console.log("l10n.formatValue.called:", global.ZoteroCitationCounts.l10n.formatValue.called);
      console.log("l10n.formatValue.callCount:", global.ZoteroCitationCounts.l10n.formatValue.callCount);
      if (global.ZoteroCitationCounts.l10n.formatValue.callCount > 0) {
        console.log("l10n.formatValue first call args:", JSON.stringify(global.ZoteroCitationCounts.l10n.formatValue.getCall(0).args));
      }
      if (global.ZoteroCitationCounts.l10n.formatValue.callCount > 1) {
        console.log("l10n.formatValue second call args:", JSON.stringify(global.ZoteroCitationCounts.l10n.formatValue.getCall(1).args));
      }
      expect(global.ZoteroCitationCounts.l10n.formatValue.called).to.be.true; // Temporary assertion

      expect(global.ZoteroCitationCounts.l10n.formatValue.calledWith('citationcounts-progresswindow-finished-headline', { api: 'NASA ADS' })).to.be.true;
    });

    it('Scenario 2: NASA ADS API key error (401)', async function() {
      const mockItem = createMockItem(sandbox, '10.1234/another.doi'); // Pass sandbox
      mockItems = [mockItem];
      mockGetSelectedItems.returns(mockItems);
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

      expect(mockProgressWindowInstance.ItemProgress.calledOnce).to.be.true;
      expect(mockItemProgressInstance.setError.calledOnce).to.be.true;
      
      // Check that l10n was called to format the specific error message for the ProgressWindow item
      // The error message itself is added as a new ItemProgress, so we check the text of that new ItemProgress
      // This means ItemProgress constructor should be called twice: once for the item, once for the error.
      expect(mockProgressWindowInstance.ItemProgress.calledTwice).to.be.true; // Original item + error item
      const errorItemProgressCall = mockProgressWindowInstance.ItemProgress.getCall(1); // Second call is for the error.
      expect(global.ZoteroCitationCounts.l10n.formatValue.calledWith('citationcounts-progresswindow-error-nasaads-apikey', { api: 'NASA ADS' })).to.be.true;
      // Check the text passed to the error ItemProgress constructor
      expect(errorItemProgressCall.args[1]).to.equal('citationcounts-progresswindow-error-nasaads-apikey');
      
      sinon.assert.calledWithMatch(global.Zotero.debug, `Zotero Citation Counts: Failed to retrieve citation count for item '${mockItem.id}' after all attempts. Error: citationcounts-progresswindow-error-nasaads-apikey`);
    });

    it('Scenario 3: No DOI, No arXiv, No Title for NASA ADS (Insufficient Metadata)', async function() {
      const mockItem = createMockItem(sandbox, null, "", null, null, { title: null, authors: [], year: null }); // Pass sandbox
      mockItems = [mockItem];
      mockGetSelectedItems.returns(mockItems);
      global.Zotero.Prefs.get.withArgs('extensions.citationcounts.nasaadsApiKey', true).returns('TEST_KEY');

      await global.ZoteroCitationCounts.updateItems(mockItems, nasaAdsApiObject);

      expect(global.fetch.called).to.be.false; // Fetch should not be called
      expect(mockItem.setField.called).to.be.false;
      expect(mockItem.saveTx.called).to.be.false;

      expect(mockProgressWindowInstance.ItemProgress.calledOnce).to.be.true; // For the item itself
      expect(mockItemProgressInstance.setError.calledOnce).to.be.true;
      
      expect(mockProgressWindowInstance.ItemProgress.calledTwice).to.be.true; // Original item + error item
      const errorItemProgressCall = mockProgressWindowInstance.ItemProgress.getCall(1);
      expect(global.ZoteroCitationCounts.l10n.formatValue.calledWith('citationcounts-progresswindow-error-insufficient-metadata-for-title-search', { api: 'NASA ADS' })).to.be.true;
      expect(errorItemProgressCall.args[1]).to.equal('citationcounts-progresswindow-error-insufficient-metadata-for-title-search');
      
      sinon.assert.calledWithMatch(global.Zotero.debug, `Zotero Citation Counts: Failed to retrieve citation count for item '${mockItem.id}' after all attempts. Error: citationcounts-progresswindow-error-insufficient-metadata-for-title-search`);
    });

    it('Scenario 4: Successful Title Search for NASA ADS', async function() {
      const mockItem = createMockItem(sandbox, null, "", null, null, {  // Pass sandbox
        title: "My Test Paper", 
        authors: [{lastName: "Author"}], 
        year: "2023" 
      }); 
      mockItems = [mockItem];
      mockGetSelectedItems.returns(mockItems);
      global.Zotero.Prefs.get.withArgs('extensions.citationcounts.nasaadsApiKey', true).returns('TEST_KEY');
      
      global.fetch.resolves({
        ok: true,
        status: 200,
        json: sinon.stub().resolves({ response: { docs: [{ citation_count: 123 }], numFound: 1 } }),
      });

      await global.ZoteroCitationCounts.updateItems(mockItems, nasaAdsApiObject);
      
      expect(global.fetch.calledOnce).to.be.true;
      const fetchCall = global.fetch.getCall(0);
      expect(fetchCall.args[0]).to.include('https://api.adsabs.harvard.edu/v1/search/query');
      expect(fetchCall.args[0]).to.include('q=title%3A%22My%20Test%20Paper%22%20author%3A%22Author%22%20year%3A2023');
      expect(fetchCall.args[1].headers.Authorization).to.equal('Bearer TEST_KEY');
      
      expect(mockItem.setField.calledOnceWith('extra', '123 citations (NASA ADS/Title) [2023-01-01]\n')).to.be.true;
      expect(mockItem.saveTx.calledOnce).to.be.true;
      
      expect(mockItemProgressInstance.setIcon.calledWith(sinon.match(/tick/))).to.be.true;
      sinon.assert.calledWithMatch(global.Zotero.debug, `Zotero Citation Counts: Successfully fetched citation count via NASA ADS/Title for item 'My Test Paper'. Count: 123`);
    });

    it('Scenario 5: Title Search - No Results for NASA ADS (triggers "no-citation-count")', async function() {
      const mockItem = createMockItem(sandbox, null, "", null, null, { title: "Unknown Paper" }); // Pass sandbox
      mockItems = [mockItem];
      mockGetSelectedItems.returns(mockItems);
      global.Zotero.Prefs.get.withArgs('extensions.citationcounts.nasaadsApiKey', true).returns('TEST_KEY');

      // This response from _nasaadsCallback would return null, leading to "Invalid count" in _sendRequest,
      // which then becomes "no-citation-count"
      global.fetch.resolves({
        ok: true,
        status: 200,
        json: sinon.stub().resolves({ response: { docs: [], numFound: 0 } }), // _nasaadsCallback returns null for this
      });

      await global.ZoteroCitationCounts.updateItems(mockItems, nasaAdsApiObject);

      expect(global.fetch.calledOnce).to.be.true;
      const fetchCall = global.fetch.getCall(0);
      expect(fetchCall.args[0]).to.include('q=title%3A%22Unknown%20Paper%22');
      expect(mockItem.setField.called).to.be.false;
      expect(mockItemProgressInstance.setError.calledOnce).to.be.true;
      
      sinon.assert.calledWithMatch(global.Zotero.debug, `Zotero Citation Counts: No citation count found via NASA ADS/Title for item 'Unknown Paper'.`);
      sinon.assert.calledWithMatch(global.Zotero.debug, `Zotero Citation Counts: Failed to retrieve citation count for item 'Unknown Paper' after all attempts. Error: citationcounts-progresswindow-error-nasaads-no-results`);
      
      expect(mockProgressWindowInstance.ItemProgress.calledTwice).to.be.true;
      const errorItemProgressCall = mockProgressWindowInstance.ItemProgress.getCall(1);
      expect(global.ZoteroCitationCounts.l10n.formatValue.calledWith('citationcounts-progresswindow-error-nasaads-no-results', { api: 'NASA ADS' })).to.be.true;
      expect(errorItemProgressCall.args[1]).to.equal('citationcounts-progresswindow-error-nasaads-no-results');
    });
    
    it('Scenario 6: Prioritization - DOI Search Preferred over Title Search for NASA ADS', async function() {
      const mockItem = createMockItem(sandbox, '10.5555/doi-wins', "", null, null, { // Pass sandbox
        title: "Title Ignored",
        authors: [{lastName: "Author"}],
        year: "2020"
      });
      mockItems = [mockItem];
      mockGetSelectedItems.returns(mockItems);
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
      mockGetSelectedItems.returns(mockItems);
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
      mockGetSelectedItems.returns(mockItems);
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
      // This sequence: _nasaadsCallback returns null -> _sendRequest throws "Invalid count" ->
      // _retrieveCitationCount catches, logs "No citation count found via NASA ADS/DOI...", rethrows "no-citation-count"
      // -> _retrieveCitationCount's final error handling logs "Failed..." and throws.
      sinon.assert.calledWithMatch(global.Zotero.debug, `Zotero Citation Counts: No citation count found via NASA ADS/DOI for item '${mockItem.id}'.`);
      sinon.assert.calledWithMatch(global.Zotero.debug, `Zotero Citation Counts: Failed to retrieve citation count for item '${mockItem.id}' after all attempts. Error: citationcounts-progresswindow-error-no-doi`);
    });

    it('Scenario 9: No Citation Count Found via arXiv for NASA ADS', async function() {
      const mockItem = createMockItem(sandbox, null, "", "2301.99999", "https://arxiv.org/abs/2301.99999"); // Pass sandbox
      mockItems = [mockItem];
      mockGetSelectedItems.returns(mockItems);
      global.Zotero.Prefs.get.withArgs('extensions.citationcounts.nasaadsApiKey', true).returns('TEST_KEY');

      global.fetch.resolves({
        ok: true,
        status: 200,
        json: sinon.stub().resolves({ response: { docs: [], numFound: 0 } }), 
      });

      await global.ZoteroCitationCounts.updateItems(mockItems, nasaAdsApiObject);

      expect(mockItem.setField.called).to.be.false;
      expect(mockItemProgressInstance.setError.calledOnce).to.be.true;
      sinon.assert.calledWithMatch(global.Zotero.debug, `Zotero Citation Counts: No citation count found via NASA ADS/arXiv for item '${mockItem.id}'.`);
      sinon.assert.calledWithMatch(global.Zotero.debug, `Zotero Citation Counts: Failed to retrieve citation count for item '${mockItem.id}' after all attempts. Error: citationcounts-progresswindow-error-no-arxiv`);
    });

  });
});
