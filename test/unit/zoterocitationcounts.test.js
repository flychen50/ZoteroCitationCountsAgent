const { expect } = require('chai');
const sinon = require('sinon');

describe('ZoteroCitationCounts', function() {
  let mockZoteroPrefsGet;
  let originalFetch;

  beforeEach(function() {
    // Store original fetch
    originalFetch = global.fetch;

    // Setup Zotero mock
    mockZoteroPrefsGet = sinon.stub();
    global.Zotero = {
      Prefs: {
        get: mockZoteroPrefsGet,
        set: sinon.stub() 
      },
      debug: sinon.stub(), // Mock for this._log
      ProgressWindow: sinon.stub(), // Will be further customized in specific tests
      // ... other necessary Zotero mocks
    };
    
    // Stub fetch globally for most tests
    global.fetch = sinon.stub();

    // Require the main source file directly for coverage tracking  
    global.ZoteroCitationCounts = require('../../src/zoterocitationcounts');
    
    // Ensure ZoteroCitationCounts.l10n is stubbed for tests that need it
    if (global.ZoteroCitationCounts && !global.ZoteroCitationCounts.l10n) {
        global.ZoteroCitationCounts.l10n = {
            formatValue: sinon.stub().resolvesArg(0) // Simple stub returns key
        };
    } else if (global.ZoteroCitationCounts && global.ZoteroCitationCounts.l10n && !global.ZoteroCitationCounts.l10n.formatValue.isSinonProxy) {
        // If l10n exists but formatValue is not a stub, make it one.
        global.ZoteroCitationCounts.l10n.formatValue = sinon.stub().resolvesArg(0);
    }

  });

  afterEach(function() {
    sinon.restore();
    global.fetch = originalFetch; // Restore original fetch
    delete global.Zotero;
    delete global.ZoteroCitationCounts; 
  });

  // ... (keep existing _getDoi, getCitationCount, _setCitationCount, _getArxiv, _getItemMetadataForAdsQuery, UI Logic tests as they are good) ...
  // (These tests from the original file are assumed to be here and correct)
  // For brevity, I will omit them in this response, but they should be retained in the actual file.

  describe('_getDoi', function() {
    let mockItem;
    beforeEach(function() {
      mockItem = {
        getField: sinon.stub()
      };
    });

    it('should return the DOI if present', function() {
      mockItem.getField.withArgs('DOI').returns('10.1000/xyz123');
      const doi = global.ZoteroCitationCounts._getDoi(mockItem);
      expect(doi).to.equal(encodeURIComponent('10.1000/xyz123'));
    });

    it('should throw an error if DOI is not present', function() {
      mockItem.getField.withArgs('DOI').returns(''); // Or undefined or null
      expect(() => global.ZoteroCitationCounts._getDoi(mockItem))
        .to.throw('citationcounts-progresswindow-error-no-doi');
    });
  });

  describe('getCitationCount (getter)', function() {
    let mockItem;
    beforeEach(function() {
      mockItem = {
        getField: sinon.stub()
      };
    });

    it('should return the citation count string if "Citations: X" exists', function() {
      mockItem.getField.withArgs('extra').returns('Citations: 123\nSome other data');
      expect(global.ZoteroCitationCounts.getCitationCount(mockItem)).to.equal('123');
    });
    
    it('should return "-" if no citation line is found', function() {
      mockItem.getField.withArgs('extra').returns('Just some random notes\nNo citation info here');
      expect(global.ZoteroCitationCounts.getCitationCount(mockItem)).to.equal('-');
    });
  });

  describe('_setCitationCount', function() {
    let mockItem;
    let clock;

    beforeEach(function() {
      mockItem = {
        getField: sinon.stub(),
        setField: sinon.stub(),
        saveTx: sinon.stub()
      };
      // Use UTC midnight to avoid timezone issues with toISOString()
      clock = sinon.useFakeTimers({ now: new Date('2024-01-15T00:00:00.000Z') });
    });

    afterEach(function() {
      clock.restore();
    });

    it('should add citation count to an empty extra field', function() {
      mockItem.getField.withArgs('extra').returns('');
      global.ZoteroCitationCounts._setCitationCount(mockItem, 'TestSource', 123);
      const expectedExtra = '123 citations (TestSource) [2024-01-15]\n';
      if (!mockItem.setField.called) {
        console.error('setField was not called!');
      } else {
        console.log('setField call args:', mockItem.setField.getCall(0).args);
      }
      expect(mockItem.setField.calledOnce).to.be.true;
      expect(mockItem.setField.getCall(0).args[0]).to.equal('extra');
      expect(mockItem.setField.getCall(0).args[1]).to.equal(expectedExtra);
    });
  });

  describe('_getArxiv', function() {
    let mockItem;
    beforeEach(function() {
      mockItem = {
        getField: sinon.stub()
      };
    });

    it('should extract arXiv ID from URL (abs format)', function() {
      mockItem.getField.withArgs('url').returns('https://arxiv.org/abs/1234.5678');
      const arxiv = global.ZoteroCitationCounts._getArxiv(mockItem);
      expect(arxiv).to.equal(encodeURIComponent('1234.5678'));
    });

    it('should throw an error if URL does not contain arXiv ID', function() {
      mockItem.getField.withArgs('url').returns('https://example.com');
      expect(() => global.ZoteroCitationCounts._getArxiv(mockItem))
        .to.throw('citationcounts-progresswindow-error-no-arxiv');
    });
  });

  describe('_getItemMetadataForAdsQuery', function() {
    let mockItem;
    beforeEach(function() {
      mockItem = {
        getField: sinon.stub(),
        getCreators: sinon.stub().returns([])
      };
    });

    it('should extract title, author last name, and year', function() {
      mockItem.getField.withArgs('title').returns('Test Title');
      mockItem.getField.withArgs('year').returns('2023');
      mockItem.getCreators.returns([{ lastName: 'Doe', creatorType: 'author' }]);
      const metadata = global.ZoteroCitationCounts._getItemMetadataForAdsQuery(mockItem);
      expect(metadata).to.deep.equal({ title: 'Test Title', author: 'Doe', year: '2023' });
    });
  });


  describe('_sendRequest', function() {
    const testUrl = 'https://api.example.com/data';
    const nasaAdsUrl = 'https://api.adsabs.harvard.edu/v1/search/query';
    let mockCallback;

    beforeEach(function() {
      mockCallback = sinon.stub().resolves(10); // Default successful callback
      global.Zotero.Prefs.get.withArgs('extensions.citationcounts.nasaadsApiKey', true).returns('TEST_NASA_KEY');
    });

    it('should throw "citationcounts-progresswindow-error-network-issue" on fetch network failure', async function() {
      global.fetch.rejects(new Error('Simulated network failure'));
      try {
        await global.ZoteroCitationCounts._sendRequest(testUrl, mockCallback);
        expect.fail('Should have thrown an error');
      } catch (e) {
        expect(e.message).to.equal('citationcounts-progresswindow-error-network-issue');
        expect(global.Zotero.debug.calledWith(sinon.match(/Network error fetching/))).to.be.true;
      }
    });

    const httpErrorTests = [
      { status: 400, expectedError: 'citationcounts-progresswindow-error-api-bad-request', logMsg: /Bad request for/ },
      { status: 404, expectedError: 'citationcounts-progresswindow-error-api-not-found', logMsg: /Resource not found for/ },
      { status: 429, expectedError: 'citationcounts-progresswindow-error-api-rate-limit', logMsg: /Rate limit exceeded for/ },
      { status: 500, expectedError: 'citationcounts-progresswindow-error-api-server-error', logMsg: /Server error for/ },
      { status: 502, expectedError: 'citationcounts-progresswindow-error-api-server-error', logMsg: /Server error for/ },
      { status: 503, expectedError: 'citationcounts-progresswindow-error-api-server-error', logMsg: /Server error for/ },
      { status: 401, url: 'https://api.nonnasa.com', expectedError: 'citationcounts-progresswindow-error-bad-api-response', logMsg: /Authentication\/Authorization error/ },
      { status: 403, url: 'https://api.nonnasa.com', expectedError: 'citationcounts-progresswindow-error-bad-api-response', logMsg: /Authentication\/Authorization error/ },
      { status: 418, expectedError: 'citationcounts-progresswindow-error-bad-api-response', logMsg: /Unhandled non-ok HTTP status/ } // I'm a teapot
    ];

    httpErrorTests.forEach(({ status, expectedError, logMsg, url: currentUrl }) => {
      const effectiveUrl = currentUrl || testUrl;
      it(`should throw "${expectedError}" for HTTP status ${status} from ${effectiveUrl.includes('nonnasa') ? 'non-NASA' : 'generic'} URL`, async function() {
        global.fetch.resolves({ ok: false, status: status, url: effectiveUrl });
        try {
          await global.ZoteroCitationCounts._sendRequest(effectiveUrl, mockCallback);
          expect.fail('Should have thrown an error');
        } catch (e) {
          expect(e.message).to.equal(expectedError);
          if (logMsg) expect(global.Zotero.debug.calledWith(sinon.match(logMsg))).to.be.true;
        }
      });
    });

    it('should throw "citationcounts-progresswindow-error-nasaads-apikey" for NASA ADS 401', async function() {
      global.fetch.resolves({ ok: false, status: 401, url: nasaAdsUrl });
      try {
        await global.ZoteroCitationCounts._sendRequest(nasaAdsUrl, mockCallback);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e.message).to.equal('citationcounts-progresswindow-error-nasaads-apikey');
        expect(global.Zotero.debug.calledWith(sinon.match(/NASA ADS API key error/))).to.be.true;
      }
    });
    
    it('should throw "citationcounts-progresswindow-error-nasaads-apikey" for NASA ADS 403', async function() {
      global.fetch.resolves({ ok: false, status: 403, url: nasaAdsUrl });
      try {
        await global.ZoteroCitationCounts._sendRequest(nasaAdsUrl, mockCallback);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e.message).to.equal('citationcounts-progresswindow-error-nasaads-apikey');
         expect(global.Zotero.debug.calledWith(sinon.match(/NASA ADS API key error/))).to.be.true;
      }
    });

    it('should throw "citationcounts-progresswindow-error-no-citation-count" if response.json() fails', async function() {
      global.fetch.resolves({ ok: true, json: sinon.stub().rejects(new Error('Parse error')) });
      try {
        await global.ZoteroCitationCounts._sendRequest(testUrl, mockCallback);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e.message).to.equal('citationcounts-progresswindow-error-no-citation-count');
        expect(global.Zotero.debug.calledWith(sinon.match(/Error processing API response or invalid count/))).to.be.true;
      }
    });

    it('should throw "citationcounts-progresswindow-error-no-citation-count" if callback returns null', async function() {
      global.fetch.resolves({ ok: true, json: sinon.stub().resolves({}) });
      mockCallback.resolves(null);
      try {
        await global.ZoteroCitationCounts._sendRequest(testUrl, mockCallback);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e.message).to.equal('citationcounts-progresswindow-error-no-citation-count');
        expect(global.Zotero.debug.calledWith(sinon.match(/Invalid count received from callback/))).to.be.true;
      }
    });
    
    it('should throw "citationcounts-progresswindow-error-no-citation-count" if callback result is not a number (parseInt fails)', async function() {
      global.fetch.resolves({ ok: true, json: sinon.stub().resolves({}) });
      mockCallback.resolves("not-a-number"); // parseInt("not-a-number") is NaN
      try {
        await global.ZoteroCitationCounts._sendRequest(testUrl, mockCallback);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e.message).to.equal('citationcounts-progresswindow-error-no-citation-count');
         expect(global.Zotero.debug.calledWith(sinon.match(/Invalid count received from callback/))).to.be.true;
      }
    });

    it('should return count on successful fetch and callback', async function() {
      global.fetch.resolves({ ok: true, json: sinon.stub().resolves({ data: 'some data' }) });
      mockCallback.resolves(42);
      const count = await global.ZoteroCitationCounts._sendRequest(testUrl, mockCallback);
      expect(count).to.equal(42);
    });
  });

  describe('_retrieveCitationCount', function() {
    let mockItem;
    let mockUrlFunction;
    let mockRequestCallback;

    beforeEach(function() {
      mockItem = { getField: sinon.stub().withArgs('title').returns('Test Item Title') };
      mockUrlFunction = sinon.stub();
      mockRequestCallback = sinon.stub();

      sinon.stub(global.ZoteroCitationCounts, '_getDoi');
      sinon.stub(global.ZoteroCitationCounts, '_getArxiv');
      sinon.stub(global.ZoteroCitationCounts, '_getItemMetadataForAdsQuery');
      // _sendRequest is part of ZoteroCitationCounts, so we stub it on the object itself.
      // It will be restored in afterEach by sinon.restore().
      sinon.stub(global.ZoteroCitationCounts, '_sendRequest');
    });

    // Error Prioritization Tests
    it('should throw DOI error (server-error) even if arXiv has a lower priority error', async function() {
      global.ZoteroCitationCounts._getDoi.returns('mockDOI');
      global.ZoteroCitationCounts._sendRequest
        .onFirstCall().rejects(new Error('citationcounts-progresswindow-error-api-server-error')) // DOI
        .onSecondCall().rejects(new Error('citationcounts-progresswindow-error-no-arxiv')); // ArXiv (would be from _getArxiv)
      
      try {
        await global.ZoteroCitationCounts._retrieveCitationCount(mockItem, 'TestAPI', true, true, mockUrlFunction, mockRequestCallback, false);
        expect.fail('Should have thrown api-server-error');
      } catch (e) {
        expect(e.message).to.equal('citationcounts-progresswindow-error-api-server-error');
      }
    });

    it('should throw arXiv error (rate-limit) if DOI had a "no-doi" error', async function() {
      global.ZoteroCitationCounts._getDoi.throws(new Error('citationcounts-progresswindow-error-no-doi')); // DOI attempt fails to get ID
      global.ZoteroCitationCounts._getArxiv.returns('mockArXiv');
      global.ZoteroCitationCounts._sendRequest
        .onFirstCall().rejects(new Error('citationcounts-progresswindow-error-api-rate-limit')); // ArXiv
        
      try {
        await global.ZoteroCitationCounts._retrieveCitationCount(mockItem, 'TestAPI', true, true, mockUrlFunction, mockRequestCallback, false);
        expect.fail('Should have thrown api-rate-limit');
      } catch (e) {
        expect(e.message).to.equal('citationcounts-progresswindow-error-api-rate-limit');
      }
    });
    
    it('should prioritize network-issue from DOI over server-error from ArXiv', async function() {
        global.ZoteroCitationCounts._getDoi.returns('mockDOI');
        global.ZoteroCitationCounts._getArxiv.returns('mockArXiv');
        global.ZoteroCitationCounts._sendRequest
            .onFirstCall().rejects(new Error('citationcounts-progresswindow-error-network-issue')) // DOI
            .onSecondCall().rejects(new Error('citationcounts-progresswindow-error-api-server-error')); // ArXiv
        try {
            await global.ZoteroCitationCounts._retrieveCitationCount(mockItem, 'TestAPI', true, true, mockUrlFunction, mockRequestCallback, false);
            expect.fail('Should have thrown network-issue');
        } catch (e) {
            expect(e.message).to.equal('citationcounts-progresswindow-error-network-issue');
        }
    });

    it('should prioritize nasaads-apikey from Title Search over no-doi and no-arxiv', async function() {
        global.ZoteroCitationCounts._getDoi.throws(new Error('citationcounts-progresswindow-error-no-doi'));
        global.ZoteroCitationCounts._getArxiv.throws(new Error('citationcounts-progresswindow-error-no-arxiv'));
        global.ZoteroCitationCounts._getItemMetadataForAdsQuery.returns({ title: 'T', author: 'A', year: 'Y' });
        global.ZoteroCitationCounts._sendRequest // For Title search
            .rejects(new Error('citationcounts-progresswindow-error-nasaads-apikey')); 
        try {
            await global.ZoteroCitationCounts._retrieveCitationCount(mockItem, 'NASA ADS', true, true, mockUrlFunction, mockRequestCallback, true);
            expect.fail('Should have thrown nasaads-apikey');
        } catch (e) {
            expect(e.message).to.equal('citationcounts-progresswindow-error-nasaads-apikey');
        }
    });

    // Low-Priority Consolidated Error Tests
    it('should throw "no-results-all-attempts" if all methods fail with "no-citation-count"', async function() {
      global.ZoteroCitationCounts._getDoi.returns('mockDOI');
      global.ZoteroCitationCounts._getArxiv.returns('mockArXiv');
      global.ZoteroCitationCounts._getItemMetadataForAdsQuery.returns({ title: 'T', author: 'A', year: 'Y' });
      global.ZoteroCitationCounts._sendRequest.rejects(new Error('citationcounts-progresswindow-error-no-citation-count')); // For DOI, ArXiv, and Title

      try {
        await global.ZoteroCitationCounts._retrieveCitationCount(mockItem, 'Semantic Scholar', true, true, mockUrlFunction, mockRequestCallback, true);
        expect.fail('Should have thrown no-results-all-attempts');
      } catch (e) {
        expect(e.message).to.equal('citationcounts-progresswindow-error-no-results-all-attempts');
      }
    });
    
    it('should throw "nasaads-no-results" for NASA ADS if all methods yield no results', async function() {
      global.ZoteroCitationCounts._getDoi.throws(new Error('citationcounts-progresswindow-error-no-doi'));
      global.ZoteroCitationCounts._getArxiv.throws(new Error('citationcounts-progresswindow-error-no-arxiv'));
      global.ZoteroCitationCounts._getItemMetadataForAdsQuery.returns({ title: 'T', author: 'A', year: 'Y' });
      global.ZoteroCitationCounts._sendRequest.rejects(new Error('citationcounts-progresswindow-error-no-citation-count')); // For Title search

      try {
        await global.ZoteroCitationCounts._retrieveCitationCount(mockItem, 'NASA ADS', true, true, mockUrlFunction, mockRequestCallback, true);
        expect.fail('Should have thrown nasaads-no-results');
      } catch (e) {
        expect(e.message).to.equal('citationcounts-progresswindow-error-nasaads-no-results');
      }
    });

    it('should throw "insufficient-metadata-for-title-search" if title search fails that way and others are non-critical', async function() {
      global.ZoteroCitationCounts._getDoi.throws(new Error('citationcounts-progresswindow-error-no-doi'));
      global.ZoteroCitationCounts._getArxiv.throws(new Error('citationcounts-progresswindow-error-no-arxiv'));
      global.ZoteroCitationCounts._getItemMetadataForAdsQuery.returns({ title: null, author: 'A', year: 'Y' }); // Insufficient

      try {
        // Note: _getItemMetadataForAdsQuery itself doesn't throw, the logic in _retrieveCitationCount uses its output.
        // The actual "insufficient-metadata" error is created inside _retrieveCitationCount.
        await global.ZoteroCitationCounts._retrieveCitationCount(mockItem, 'TestAPI', true, true, mockUrlFunction, mockRequestCallback, true);
        expect.fail('Should have thrown insufficient-metadata');
      } catch (e) {
        expect(e.message).to.equal('citationcounts-progresswindow-error-insufficient-metadata-for-title-search');
      }
    });

    // No Retrieval Methods Test
    it('should throw "internal-error-no-retrieval-methods" if all useDoi, useArxiv, useTitleSearch are false', async function() {
      try {
        await global.ZoteroCitationCounts._retrieveCitationCount(mockItem, 'TestAPI', false, false, mockUrlFunction, mockRequestCallback, false);
        expect.fail('Should have thrown internal-error-no-retrieval-methods');
      } catch (e) {
        expect(e.message).to.equal('citationcounts-internal-error-no-retrieval-methods');
      }
    });
    
    // Fallback to unknown

  });

  describe('_updateItem error display', function() {
    let mockItem;
    let mockApiConfig;
    let mockProgressWindow;
    let mockPwItem;

    beforeEach(function() {
      mockItem = { itemID: 1, getField: sinon.stub().withArgs('title').returns('Error Test Item') };
      mockApiConfig = { 
        name: 'ErrorAPI', 
        useDoi: true, 
        useArxiv: false, 
        methods: { urlBuilder: sinon.stub(), responseCallback: sinon.stub() },
        useTitleSearch: false 
      };

      mockPwItem = {
        setError: sinon.stub(),
        setIcon: sinon.stub(),
        setProgress: sinon.stub(),
      };
      mockProgressWindow = {
        show: sinon.stub(),
        changeHeadline: sinon.stub(),
        ItemProgress: sinon.stub().returns(mockPwItem), // Constructor for individual item lines
        startCloseTimer: sinon.stub(),
      };
      global.Zotero.ProgressWindow.returns(mockProgressWindow); // Main ProgressWindow constructor

      sinon.stub(global.ZoteroCitationCounts, '_retrieveCitationCount');
      // l10n.formatValue is already stubbed in global beforeEach to return the key
    });

    const errorMessagesToTest = [
      'citationcounts-progresswindow-error-network-issue',
      'citationcounts-progresswindow-error-api-bad-request',
      'citationcounts-progresswindow-error-no-results-all-attempts',
      'citationcounts-progresswindow-error-nasaads-apikey'
    ];

    errorMessagesToTest.forEach(errorMessageKey => {
      it(`should display error message "${errorMessageKey}" from _retrieveCitationCount`, async function() {
        global.ZoteroCitationCounts._retrieveCitationCount.rejects(new Error(errorMessageKey));

        // Call updateItems and wait for all async work to complete
        await global.ZoteroCitationCounts.updateItems([mockItem], mockApiConfig);
        // Wait for all microtasks to flush (l10n.formatValue is async)
        await new Promise(resolve => setTimeout(resolve, 0));

        // Check that _updateItem's catch block behaved as expected
        expect(mockPwItem.setError.calledOnce).to.be.true;

        // Check that a new ItemProgress was created for the error message itself
        // The first ItemProgress is for the item being processed. The second is for the error.
        expect(mockProgressWindow.ItemProgress.calledTwice).to.be.true;
        const errorItemProgressArgs = mockProgressWindow.ItemProgress.secondCall.args;
        expect(errorItemProgressArgs[0]).to.equal(global.ZoteroCitationCounts.icon("bullet_yellow")); // Error icon

        // Check that l10n.formatValue was called with the correct error key and API name
        expect(global.ZoteroCitationCounts.l10n.formatValue.calledWith(errorMessageKey, { api: mockApiConfig.name })).to.be.true;
        // And that its result (the key itself in our stub) was used for the error ItemProgress label
        expect(errorItemProgressArgs[1]).to.equal(errorMessageKey);
        expect(errorItemProgressArgs[2]).to.equal(mockPwItem); // Parent item for the error message
      });
    });
  });
  
  // Keep existing API specific URL and Callback tests
  describe('init', function() {
    beforeEach(function() {
      global.Localization = sinon.stub().returns({
        formatValue: sinon.stub()
      });
      // Reset initialization state before each test
      global.ZoteroCitationCounts._initialized = false;
    });
    
    it('should initialize the plugin with provided parameters', function() {
      const params = {
        id: 'test-plugin-id',
        version: '1.0.0',
        rootURI: 'chrome://test/'
      };
      
      global.ZoteroCitationCounts.init(params);
      
      expect(global.ZoteroCitationCounts.pluginID).to.equal(params.id);
      expect(global.ZoteroCitationCounts.pluginVersion).to.equal(params.version);
      expect(global.ZoteroCitationCounts.rootURI).to.equal(params.rootURI);
      expect(global.ZoteroCitationCounts._initialized).to.be.true;
    });

    it('should not reinitialize if already initialized', function() {
      const params1 = { id: 'test1', version: '1.0', rootURI: 'chrome://test1/' };
      const params2 = { id: 'test2', version: '2.0', rootURI: 'chrome://test2/' };
      
      global.ZoteroCitationCounts.init(params1);
      global.ZoteroCitationCounts.init(params2);
      
      expect(global.ZoteroCitationCounts.pluginID).to.equal(params1.id);
    });
  });

  describe('getPref', function() {
    it('should return preference value from Zotero', function() {
      mockZoteroPrefsGet.returns('test-value');
      
      const result = global.ZoteroCitationCounts.getPref('test-pref');
      
      sinon.assert.calledWith(mockZoteroPrefsGet, 'extensions.citationcounts.test-pref');
      expect(result).to.equal('test-value');
    });
  });

  describe('setPref', function() {
    it('should set preference value in Zotero', function() {
      global.ZoteroCitationCounts.setPref('test-pref', 'test-value');
      
      sinon.assert.calledWith(global.Zotero.Prefs.set, 'extensions.citationcounts.test-pref', 'test-value', true);
    });
  });

  describe('icon', function() {
    beforeEach(function() {
      global.Zotero = { 
        ...global.Zotero,
        hiDPI: false  // Default to false
      };
    });

    it('should return correct icon path for normal resolution', function() {
      const result = global.ZoteroCitationCounts.icon('tick');
      expect(result).to.equal('chrome://zotero/skin/tick.png');
    });

    it('should return correct icon path for hiDPI when Zotero.hiDPI is true', function() {
      global.Zotero.hiDPI = true;
      const result = global.ZoteroCitationCounts.icon('tick', true);
      expect(result).to.equal('chrome://zotero/skin/tick@2x.png');
    });

    it('should return normal resolution path when hiDPI requested but Zotero.hiDPI is false', function() {
      global.Zotero.hiDPI = false;
      const result = global.ZoteroCitationCounts.icon('tick', true);
      expect(result).to.equal('chrome://zotero/skin/tick.png');
    });
  });

  describe('_sanitizeUrlForLogging', function() {
    it('should remove API key from NASA ADS URL', function() {
      const url = 'https://api.adsabs.harvard.edu/v1/search?api_key=secret123&q=test';
      const result = global.ZoteroCitationCounts._sanitizeUrlForLogging(url);
      expect(result).to.equal('https://api.adsabs.harvard.edu/v1/search?q=test');
    });

    it('should remove multiple sensitive parameters', function() {
      const url = 'https://example.com/api?api_key=secret&token=abc123&q=test';
      const result = global.ZoteroCitationCounts._sanitizeUrlForLogging(url);
      expect(result).to.equal('https://example.com/api?q=test');
    });

    it('should return original URL if no sensitive data', function() {
      const url = 'https://api.crossref.org/works/10.1000/test';
      const result = global.ZoteroCitationCounts._sanitizeUrlForLogging(url);
      expect(result).to.equal(url);
    });
  });

  describe('_inspireUrl', function() {
    it('should construct the correct URL for DOI', function() {
      const result = global.ZoteroCitationCounts._inspireUrl('10.1000/test', 'doi');
      expect(result).to.equal('https://inspirehep.net/api/doi/10.1000/test');
    });

    it('should construct the correct URL for arXiv', function() {
      const result = global.ZoteroCitationCounts._inspireUrl('1234.5678', 'arxiv');
      expect(result).to.equal('https://inspirehep.net/api/arxiv/1234.5678');
    });
  });

  describe('_inspireCallback', function() {
    it('should extract citation count from valid response', function() {
      const response = { metadata: { citation_count: 42 } };
      const result = global.ZoteroCitationCounts._inspireCallback(response);
      expect(result).to.equal(42);
    });
  });

  describe('_semanticScholarUrl', function() {
    it('should construct URL for DOI search', function() {
      const result = global.ZoteroCitationCounts._semanticScholarUrl('10.1000/test', 'doi');
      expect(result).to.equal('https://api.semanticscholar.org/graph/v1/paper/10.1000/test?fields=citationCount');
    });

    it('should construct URL for arXiv search', function() {
      const result = global.ZoteroCitationCounts._semanticScholarUrl('1234.5678', 'arxiv');
      expect(result).to.equal('https://api.semanticscholar.org/graph/v1/paper/arXiv:1234.5678?fields=citationCount');
    });

    it('should construct URL for title/author/year search', function() {
      const metadata = { title: 'Test Paper', author: 'Smith', year: '2024' };
      const result = global.ZoteroCitationCounts._semanticScholarUrl(metadata, 'title_author_year');
      expect(result).to.include('https://api.semanticscholar.org/graph/v1/paper/search');
      expect(result).to.include('title%3ATest%2520Paper');
      expect(result).to.include('author%3ASmith');
      expect(result).to.include('year%3A2024');
    });
  });

  describe('_nasaadsUrl', function() {
    it('should construct URL for DOI search', function() {
      const result = global.ZoteroCitationCounts._nasaadsUrl('10.1000/test', 'doi');
      expect(result).to.equal('https://api.adsabs.harvard.edu/v1/search/query?q=doi:10.1000/test&fl=citation_count');
    });

    it('should construct URL for arXiv search', function() {
      const result = global.ZoteroCitationCounts._nasaadsUrl('1234.5678', 'arxiv');
      expect(result).to.equal('https://api.adsabs.harvard.edu/v1/search/query?q=arxiv:1234.5678&fl=citation_count');
    });

    it('should construct URL for title/author/year search', function() {
      const metadata = { title: 'Test Paper', author: 'Smith', year: '2024' };
      const result = global.ZoteroCitationCounts._nasaadsUrl(metadata, 'title_author_year');
      expect(result).to.include('https://api.adsabs.harvard.edu/v1/search/query');
      expect(result).to.include('title%3A%22Test%2520Paper%22');
      expect(result).to.include('author%3A%22Smith%22');
      expect(result).to.include('year%3A2024');
    });

    it('should return empty string for unknown type', function() {
      const result = global.ZoteroCitationCounts._nasaadsUrl('test-id', 'unknown_type');
      expect(result).to.equal('');
    });
  });

  describe('_nasaadsCallback', function() {
    beforeEach(function() {
      global.ZoteroCitationCounts._log = sinon.stub();
    });

    it('should extract citation count from valid response', function() {
      const response = {
        response: {
          numFound: 1,
          docs: [{ citation_count: 42 }]
        }
      };
      const result = global.ZoteroCitationCounts._nasaadsCallback(response);
      expect(result).to.equal(42);
    });

    it('should log warning for multiple results', function() {
      const response = {
        response: {
          numFound: 3,
          docs: [{ citation_count: 42 }]
        }
      };
      const result = global.ZoteroCitationCounts._nasaadsCallback(response);
      expect(result).to.equal(42);
      sinon.assert.calledWith(global.ZoteroCitationCounts._log, 'NASA ADS query returned 3 results. Using the first one.');
    });

    it('should return null if no citation_count in response', function() {
      const response = {
        response: {
          numFound: 1,
          docs: [{ title: 'test paper' }]
        }
      };
      const result = global.ZoteroCitationCounts._nasaadsCallback(response);
      expect(result).to.be.null;
      sinon.assert.called(global.ZoteroCitationCounts._log);
    });

    it('should return null if no docs in response', function() {
      const response = {
        response: {
          numFound: 0,
          docs: []
        }
      };
      const result = global.ZoteroCitationCounts._nasaadsCallback(response);
      expect(result).to.be.null;
    });
  });

  describe('_semanticScholarCallback', function() {
    let clock;

    beforeEach(function() {
      global.ZoteroCitationCounts._log = sinon.stub();
      // Mock the preference to return 3000ms for consistent test behavior
      mockZoteroPrefsGet.withArgs('extensions.citationcounts.semanticScholarRateLimitMs', true).returns(3000);
      // Mock setTimeout to avoid 3 second delay
      clock = sinon.useFakeTimers();
    });

    afterEach(function() {
      clock.restore();
    });

    it('should handle direct DOI/arXiv response', async function() {
      const response = { citationCount: 42 };
      const promise = global.ZoteroCitationCounts._semanticScholarCallback(response);
      clock.tick(3000); // Fast forward through the setTimeout
      const result = await promise;
      expect(result).to.equal(42);
    });

    it('should handle search results with data array', async function() {
      const response = {
        data: [
          { citationCount: 15 },
          { citationCount: 30 }
        ]
      };
      const promise = global.ZoteroCitationCounts._semanticScholarCallback(response);
      clock.tick(3000);
      const result = await promise;
      expect(result).to.equal(15);
      sinon.assert.calledWith(global.ZoteroCitationCounts._log, 'Semantic Scholar query returned 2 results. Using the first one.');
    });

    it('should return null for search with no results', async function() {
      const response = { data: [] };
      const promise = global.ZoteroCitationCounts._semanticScholarCallback(response);
      clock.tick(3000);
      const result = await promise;
      expect(result).to.be.null;
    });

    it('should return null for search with null citationCount', async function() {
      const response = { data: [{ citationCount: null }] };
      const promise = global.ZoteroCitationCounts._semanticScholarCallback(response);
      clock.tick(3000);
      const result = await promise;
      expect(result).to.be.null;
      sinon.assert.called(global.ZoteroCitationCounts._log);
    });

    it('should return null for direct response with null citationCount', async function() {
      const response = { citationCount: null };
      const promise = global.ZoteroCitationCounts._semanticScholarCallback(response);
      clock.tick(3000);
      const result = await promise;
      expect(result).to.be.null;
      sinon.assert.called(global.ZoteroCitationCounts._log);
    });
  });

  describe('_crossrefUrl', function() {
    it('should construct the correct URL for Crossref API', function() {
      const id = '10.1000/xyz123';
      const actualUrl = global.ZoteroCitationCounts._crossrefUrl(id, 'doi');
      const expectedUrl = `https://api.crossref.org/works/${id}/transform/application/vnd.citationstyles.csl+json`;
      expect(actualUrl).to.equal(expectedUrl);
    });
  });

  describe('_crossrefCallback', function() {
    it('should extract citation count from Crossref response', function() {
      const response = { "is-referenced-by-count": 25 };
      const result = global.ZoteroCitationCounts._crossrefCallback(response);
      expect(result).to.equal(25);
    });
  });
});
