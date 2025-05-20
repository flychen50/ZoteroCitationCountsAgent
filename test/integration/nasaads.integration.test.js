const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs');
const path = require('path');

// Updated Helper function
function createMockItem(doi, extraContent = "", arxivId = null, url = null, metadata = {}) {
  const item = {
    _DOI: doi,
    _extra: extraContent,
    _arxivId: arxivId, // Note: _getArxiv primarily uses 'url' field
    _url: url || (arxivId ? `https://arxiv.org/abs/${arxivId}` : null),
    _metadata: metadata, // Store for clarity, used in stubs
    getField: sinon.stub(),
    getCreators: sinon.stub(), // For author extraction
    setField: sinon.stub(),
    saveTx: sinon.stub().resolves(),
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


describe('ZoteroCitationCountsAgent - NASA ADS Integration Tests', function() {
  let zccCode;
  let mockZoteroPane;
  let mockProgressWindowInstance;
  let mockItemProgressInstance;
  let mockGetSelectedItems;
  let originalDateToISOString;

  beforeEach(function() {
    // Mock Zotero.ProgressWindow.ItemProgress first as it's a constructor used by Zotero.ProgressWindow
    mockItemProgressInstance = {
      setIcon: sinon.stub(),
      setText: sinon.stub(),
      setProgress: sinon.stub(),
      setError: sinon.stub(),
      // Mock any other methods that might be called on an ItemProgress instance
    };
    const MockItemProgressConstructor = sinon.stub().returns(mockItemProgressInstance);

    // Mock Zotero.ProgressWindow
    mockProgressWindowInstance = {
      changeHeadline: sinon.stub(),
      show: sinon.stub(),
      ItemProgress: MockItemProgressConstructor, // Assign the mocked constructor
      startCloseTimer: sinon.stub(),
    };
    const MockProgressWindowConstructor = sinon.stub().returns(mockProgressWindowInstance);

    // Mock Zotero pane
    mockGetSelectedItems = sinon.stub();
    mockZoteroPane = {
      getSelectedItems: mockGetSelectedItems,
    };

    // Mock global Zotero object
    global.Zotero = {
      Prefs: {
        get: sinon.stub(),
        set: sinon.stub(),
      },
      debug: sinon.stub(), // For ZoteroCitationCounts._log
      ProgressWindow: MockProgressWindowConstructor,
      getActiveZoteroPane: sinon.stub().returns(mockZoteroPane),
      // Mock Localization (L10n)
      // ZoteroCitationCounts.l10n is initialized with `new Localization(["citation-counts.ftl"]);`
      // We need to mock the constructor and its methods if used, or mock the instance directly after script load.
      Localization: sinon.stub().returnsThis(), // Make constructor return 'this'
      // Then mock methods on 'this' or on the instance if it's assigned (e.g., Zotero.L10n.formatValue)
      // For simplicity, we'll mock formatValue on ZoteroCitationCounts.l10n after script load.
      
      // other necessary Zotero mocks
      hiDPI: false, // For ZoteroCitationCounts.icon
    };
    
    // Mock global.fetch
    sinon.stub(global, 'fetch');

    // Mock Date.prototype.toISOString to control date strings
    const constantDate = new Date('2023-01-01T12:00:00.000Z');
    originalDateToISOString = Date.prototype.toISOString;
    Date.prototype.toISOString = sinon.stub().returns(constantDate.toISOString());


    // Load ZoteroCitationCounts script
    if (!zccCode) {
      zccCode = fs.readFileSync(path.join(__dirname, '../../src/zoterocitationcounts.js'), 'utf-8');
    }
    // Inject Zotero mock into the script's scope
    new Function('Zotero', zccCode)(global.Zotero);
    
    // Now that ZoteroCitationCounts is loaded and has its l10n instance, mock its formatValue
    if (global.ZoteroCitationCounts && global.ZoteroCitationCounts.l10n) {
      global.ZoteroCitationCounts.l10n.formatValue = sinon.stub().resolvesArg(0);
    } else {
      // Fallback if l10n is not on ZoteroCitationCounts but on Zotero.L10n instance
      global.Zotero.L10n = { // Assuming L10n might be used as Zotero.L10n
          formatValue: sinon.stub().resolvesArg(0)
      };
    }
    // The init function is called during script load. APIs should be populated.
    // Ensure ZoteroCitationCounts.init has been called
    if (global.ZoteroCitationCounts && !global.ZoteroCitationCounts._initialized) {
        global.ZoteroCitationCounts.init({ id: 'test-id', version: 'test-version', rootURI: 'test-uri/'});
    }


  });

  afterEach(function() {
    sinon.restore(); // Restores all sinon stubs and mocks
    if (global.fetch && global.fetch.restore) {
        global.fetch.restore(); // Specifically restore fetch if it was stubbed
    }
    Date.prototype.toISOString = originalDateToISOString; // Restore original toISOString
    delete global.Zotero;
    delete global.ZoteroCitationCounts; // Clean up global scope
  });

  // Test Scenarios will go here
  describe('NASA ADS Scenarios', function() {
    let nasaAdsApiObject;
    let mockItems;

    beforeEach(function() {
      // Find NASA ADS API object
      nasaAdsApiObject = global.ZoteroCitationCountsAgent.APIs.find(api => api.key === 'nasaads');
      expect(nasaAdsApiObject, "NASA ADS API object not found").to.exist;
    });

    it('Scenario 1: Successful fetch and update for NASA ADS (DOI)', async function() {
      const mockItem = createMockItem('10.1234/test.doi');
      mockItems = [mockItem];
      mockGetSelectedItems.returns(mockItems);
      global.Zotero.Prefs.get.withArgs('extensions.zoterocitationcountsagent.nasaadsApiKey', true).returns('TEST_KEY');
      
      global.fetch.resolves({
        ok: true,
        status: 200,
        json: sinon.stub().resolves({ response: { docs: [{ citation_count: 42 }], numFound: 1 } }),
      });

      await global.ZoteroCitationCountsAgent.updateItems(mockItems, nasaAdsApiObject);
      
      expect(global.fetch.calledOnce).to.be.true;
      const fetchCall = global.fetch.getCall(0);
      expect(fetchCall.args[0]).to.include('https://api.adsabs.harvard.edu/v1/search/query');
      expect(fetchCall.args[0]).to.include('q=doi:10.1234%2Ftest.doi'); // URI encoded
      expect(fetchCall.args[1].headers.Authorization).to.equal('Bearer TEST_KEY');
      
      expect(mockItem.setField.calledOnceWith('extra', '42 citations (NASA ADS/DOI) [2023-01-01]\n')).to.be.true;
      expect(mockItem.saveTx.calledOnce).to.be.true;
      
      expect(mockProgressWindowInstance.ItemProgress.calledOnce).to.be.true;
      expect(mockItemProgressInstance.setIcon.calledWith(sinon.match(/tick/))).to.be.true; // Or specific icon path
      expect(mockItemProgressInstance.setProgress.calledWith(100)).to.be.true;

      sinon.assert.calledWithMatch(global.Zotero.debug, `ZoteroCitationCountsAgent: Successfully fetched citation count via NASA ADS/DOI for item '${mockItem.id}'. Count: 42`);

      // Verify l10n calls for progress window headlines
      expect(global.ZoteroCitationCountsAgent.l10n.formatValue.calledWith('zoterocitationcountsagent-progresswindow-headline', { api: 'NASA ADS' })).to.be.true;
      expect(global.ZoteroCitationCountsAgent.l10n.formatValue.calledWith('zoterocitationcountsagent-progresswindow-finished-headline', { api: 'NASA ADS' })).to.be.true;
    });

    it('Scenario 2: NASA ADS API key error (401)', async function() {
      const mockItem = createMockItem('10.1234/another.doi');
      mockItems = [mockItem];
      mockGetSelectedItems.returns(mockItems);
      global.Zotero.Prefs.get.withArgs('extensions.zoterocitationcountsagent.nasaadsApiKey', true).returns('WRONG_KEY');

      // Ensure the URL in the resolved object matches what _sendRequest would use, for the status check logic
      const expectedUrl = 'https://api.adsabs.harvard.edu/v1/search/query?q=doi:10.1234%2Fanother.doi&fl=citation_count';
      global.fetch.resolves({
        ok: false,
        status: 401,
        url: expectedUrl, 
        json: sinon.stub().resolves({ error: "Unauthorized" }) // Mock a JSON body for the error
      });
      
      await global.ZoteroCitationCountsAgent.updateItems(mockItems, nasaAdsApiObject);

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
      expect(global.ZoteroCitationCountsAgent.l10n.formatValue.calledWith('zoterocitationcountsagent-progresswindow-error-nasaads-apikey', { api: 'NASA ADS' })).to.be.true;
      // Check the text passed to the error ItemProgress constructor
      expect(errorItemProgressCall.args[1]).to.equal('zoterocitationcountsagent-progresswindow-error-nasaads-apikey');
      
      sinon.assert.calledWithMatch(global.Zotero.debug, `ZoteroCitationCountsAgent: Failed to retrieve citation count for item '${mockItem.id}' after all attempts. Error: zoterocitationcountsagent-progresswindow-error-nasaads-apikey`);
    });

    it('Scenario 3: No DOI, No arXiv, No Title for NASA ADS (Insufficient Metadata)', async function() {
      const mockItem = createMockItem(null, "", null, null, { title: null, authors: [], year: null }); // No identifiers
      mockItems = [mockItem];
      mockGetSelectedItems.returns(mockItems);
      global.Zotero.Prefs.get.withArgs('extensions.zoterocitationcountsagent.nasaadsApiKey', true).returns('TEST_KEY');

      await global.ZoteroCitationCountsAgent.updateItems(mockItems, nasaAdsApiObject);

      expect(global.fetch.called).to.be.false; // Fetch should not be called
      expect(mockItem.setField.called).to.be.false;
      expect(mockItem.saveTx.called).to.be.false;

      expect(mockProgressWindowInstance.ItemProgress.calledOnce).to.be.true; // For the item itself
      expect(mockItemProgressInstance.setError.calledOnce).to.be.true;
      
      expect(mockProgressWindowInstance.ItemProgress.calledTwice).to.be.true; // Original item + error item
      const errorItemProgressCall = mockProgressWindowInstance.ItemProgress.getCall(1);
      expect(global.ZoteroCitationCountsAgent.l10n.formatValue.calledWith('zoterocitationcountsagent-progresswindow-error-insufficient-metadata-for-title-search', { api: 'NASA ADS' })).to.be.true;
      expect(errorItemProgressCall.args[1]).to.equal('zoterocitationcountsagent-progresswindow-error-insufficient-metadata-for-title-search');
      
      sinon.assert.calledWithMatch(global.Zotero.debug, `ZoteroCitationCountsAgent: Failed to retrieve citation count for item '${mockItem.id}' after all attempts. Error: zoterocitationcountsagent-progresswindow-error-insufficient-metadata-for-title-search`);
    });

    it('Scenario 4: Successful Title Search for NASA ADS', async function() {
      const mockItem = createMockItem(null, "", null, null, { 
        title: "My Test Paper", 
        authors: [{lastName: "Author"}], 
        year: "2023" 
      }); // item.id will be "My Test Paper"
      mockItems = [mockItem];
      mockGetSelectedItems.returns(mockItems);
      global.Zotero.Prefs.get.withArgs('extensions.zoterocitationcountsagent.nasaadsApiKey', true).returns('TEST_KEY');
      
      global.fetch.resolves({
        ok: true,
        status: 200,
        json: sinon.stub().resolves({ response: { docs: [{ citation_count: 123 }], numFound: 1 } }),
      });

      await global.ZoteroCitationCountsAgent.updateItems(mockItems, nasaAdsApiObject);
      
      expect(global.fetch.calledOnce).to.be.true;
      const fetchCall = global.fetch.getCall(0);
      expect(fetchCall.args[0]).to.include('https://api.adsabs.harvard.edu/v1/search/query');
      expect(fetchCall.args[0]).to.include('q=title%3A%22My%20Test%20Paper%22%20author%3A%22Author%22%20year%3A2023');
      expect(fetchCall.args[1].headers.Authorization).to.equal('Bearer TEST_KEY');
      
      expect(mockItem.setField.calledOnceWith('extra', '123 citations (NASA ADS/Title) [2023-01-01]\n')).to.be.true;
      expect(mockItem.saveTx.calledOnce).to.be.true;
      
      expect(mockItemProgressInstance.setIcon.calledWith(sinon.match(/tick/))).to.be.true;
      sinon.assert.calledWithMatch(global.Zotero.debug, `ZoteroCitationCountsAgent: Successfully fetched citation count via NASA ADS/Title for item 'My Test Paper'. Count: 123`);
    });

    it('Scenario 5: Title Search - No Results for NASA ADS (triggers "no-citation-count")', async function() {
      const mockItem = createMockItem(null, "", null, null, { title: "Unknown Paper" }); // item.id will be "Unknown Paper"
      mockItems = [mockItem];
      mockGetSelectedItems.returns(mockItems);
      global.Zotero.Prefs.get.withArgs('extensions.zoterocitationcountsagent.nasaadsApiKey', true).returns('TEST_KEY');

      // This response from _nasaadsCallback would return null, leading to "Invalid count" in _sendRequest,
      // which then becomes "no-citation-count"
      global.fetch.resolves({
        ok: true,
        status: 200,
        json: sinon.stub().resolves({ response: { docs: [], numFound: 0 } }), // _nasaadsCallback returns null for this
      });

      await global.ZoteroCitationCountsAgent.updateItems(mockItems, nasaAdsApiObject);

      expect(global.fetch.calledOnce).to.be.true;
      const fetchCall = global.fetch.getCall(0);
      expect(fetchCall.args[0]).to.include('q=title%3A%22Unknown%20Paper%22');
      expect(mockItem.setField.called).to.be.false;
      expect(mockItemProgressInstance.setError.calledOnce).to.be.true;
      
      sinon.assert.calledWithMatch(global.Zotero.debug, `ZoteroCitationCountsAgent: No citation count found via NASA ADS/Title for item 'Unknown Paper'.`);
      sinon.assert.calledWithMatch(global.Zotero.debug, `ZoteroCitationCountsAgent: Failed to retrieve citation count for item 'Unknown Paper' after all attempts. Error: zoterocitationcountsagent-progresswindow-error-nasaads-no-results`);
      
      expect(mockProgressWindowInstance.ItemProgress.calledTwice).to.be.true;
      const errorItemProgressCall = mockProgressWindowInstance.ItemProgress.getCall(1);
      expect(global.ZoteroCitationCountsAgent.l10n.formatValue.calledWith('zoterocitationcountsagent-progresswindow-error-nasaads-no-results', { api: 'NASA ADS' })).to.be.true;
      expect(errorItemProgressCall.args[1]).to.equal('zoterocitationcountsagent-progresswindow-error-nasaads-no-results');
    });
    
    it('Scenario 6: Prioritization - DOI Search Preferred over Title Search for NASA ADS', async function() {
      const mockItem = createMockItem('10.5555/doi-wins', "", null, null, {
        title: "Title Ignored",
        authors: [{lastName: "Author"}],
        year: "2020"
      });
      mockItems = [mockItem];
      mockGetSelectedItems.returns(mockItems);
      global.Zotero.Prefs.get.withArgs('extensions.zoterocitationcountsagent.nasaadsApiKey', true).returns('TEST_KEY');

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

      await global.ZoteroCitationCountsAgent.updateItems(mockItems, nasaAdsApiObject);

      expect(global.fetch.calledOnce).to.be.true; // Should only be called once for DOI
      const fetchCall = global.fetch.getCall(0);
      expect(fetchCall.args[0]).to.include('q=doi:10.5555%2Fdoi-wins');
      expect(fetchCall.args[1].headers.Authorization).to.equal('Bearer TEST_KEY');
      
      expect(mockItem.setField.calledOnceWith('extra', '100 citations (NASA ADS/DOI) [2023-01-01]\n')).to.be.true;
      sinon.assert.calledWithMatch(global.Zotero.debug, `Zotero Citation Counts: Successfully fetched citation count via NASA ADS/DOI for item '${mockItem.id}'. Count: 100`);
    });

    it('Scenario 7: Prioritization - arXiv Search Preferred over Title Search (No DOI) for NASA ADS', async function() {
      const mockItem = createMockItem(null, "", "2301.00001", `https://arxiv.org/abs/2301.00001`, { // arXiv ID, no DOI
        title: "Title Also Ignored",
        authors: [{lastName: "SomeAuthor"}],
        year: "2023"
      }); // item.id will be "2301.00001"
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
      const mockItem = createMockItem('10.9999/nodoiresult');
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
      const mockItem = createMockItem(null, "", "2301.99999", "https://arxiv.org/abs/2301.99999");
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
