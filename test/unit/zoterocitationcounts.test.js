const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs');
const path = require('path');

describe('ZoteroCitationCounts', function() {
  let mockZoteroPrefsGet;
  let zccCode;

  beforeEach(function() {
    // Setup Zotero mock
    mockZoteroPrefsGet = sinon.stub();
    global.Zotero = {
      Prefs: {
        get: mockZoteroPrefsGet,
        // Add set stub if any tests require setting preferences
        set: sinon.stub() 
      },
      debug: sinon.stub(), // Mock for this._log
      // ... other necessary Zotero mocks
    };

    // Mock fetch
    sinon.stub(global, 'fetch');

    // Read the script content once
    if (!zccCode) {
      zccCode = fs.readFileSync(path.join(__dirname, '../../src/zoterocitationcounts.js'), 'utf-8');
    }
    
    // Execute the script content, making ZoteroCitationCounts available globally
    // and injecting the mocked Zotero object.
    // Using new Function to avoid direct eval and to pass Zotero as an argument.
    new Function('Zotero', zccCode)(global.Zotero);
    
    // Ensure that ZoteroCitationCounts.getPref is bound to the Zotero.Prefs.get mock for these tests
    // This is necessary because the original script uses 'this.getPref' internally for _nasaadsUrl
    // and 'this' inside _nasaadsUrl refers to ZoteroCitationCounts.
    // We need to ensure that ZoteroCitationCounts.getPref calls our stubbed Zotero.Prefs.get.
    // The ZoteroCitationCounts object is defined as an object literal, and its methods
    // like getPref are defined within that literal. When these methods are called,
    // 'this' correctly refers to ZoteroCitationCounts.
    // The 'getPref' method in ZoteroCitationCounts itself calls Zotero.Prefs.get,
    // which we have stubbed. So, direct assignment as below is not strictly needed
    // if the script structure ensures 'this' is ZoteroCitationCounts.
    // However, explicitly binding or ensuring the methods use the mocked global.Zotero
    // can be a good safeguard.
    // In this case, ZoteroCitationCounts.getPref will use global.Zotero.Prefs.get due to lexical scoping
    // or the way 'this' is resolved in the original script when it refers to Zotero.Prefs.get.
    // The new Function approach should make global.Zotero available to the script.
  });

  afterEach(function() {
    sinon.restore();
    if (global.fetch && global.fetch.restore) { // Ensure fetch was stubbed before trying to restore
        global.fetch.restore();
    }
    delete global.Zotero;
    delete global.ZoteroCitationCounts; // Clean up the global scope
  });

  describe('_nasaadsUrl', function() {
    it('should construct the correct URL for DOI, without API key', function() {
      const id = '10.1000/xyz123';
      const type = 'doi';
      const actualUrl = global.ZoteroCitationCounts._nasaadsUrl(id, type);
      const expectedUrl = `https://api.adsabs.harvard.edu/v1/search/query?q=doi:${id}&fl=citation_count`;
      expect(actualUrl).to.equal(expectedUrl);
      // Ensure Prefs.get is not called for nasaadsApiKey within this function
      expect(global.Zotero.Prefs.get.calledWith('extensions.citationcounts.nasaadsApiKey', true)).to.be.false;
    });

    it('should construct the correct URL for arXiv, without API key', function() {
      const id = '2303.12345';
      const type = 'arxiv';
      const actualUrl = global.ZoteroCitationCounts._nasaadsUrl(id, type);
      const expectedUrl = `https://api.adsabs.harvard.edu/v1/search/query?q=arxiv:${id}&fl=citation_count`;
      expect(actualUrl).to.equal(expectedUrl);
      expect(global.Zotero.Prefs.get.calledWith('extensions.citationcounts.nasaadsApiKey', true)).to.be.false;
    });

    // This test might be redundant now as _nasaadsUrl no longer handles the API key, 
    // but it's harmless to keep to ensure the base URL construction is fine.
    it('should construct the base URL correctly even if API key pref might be set elsewhere', function() {
      const id = '10.1000/abc789';
      const type = 'doi';
      const actualUrl = global.ZoteroCitationCounts._nasaadsUrl(id, type);
      const expectedUrl = `https://api.adsabs.harvard.edu/v1/search/query?q=doi:${id}&fl=citation_count`;
      expect(actualUrl).to.equal(expectedUrl);
      expect(global.Zotero.Prefs.get.calledWith('extensions.citationcounts.nasaadsApiKey', true)).to.be.false;
    });
  });
  
  describe('getPref', function() {
    it('should call Zotero.Prefs.get with the correct preference key', function() {
      global.ZoteroCitationCounts.getPref('myTestPref');
      expect(global.Zotero.Prefs.get.calledOnceWith('extensions.citationcounts.myTestPref', true)).to.be.true;
    });

    it('should return the value from Zotero.Prefs.get', function() {
      global.Zotero.Prefs.get.withArgs('extensions.citationcounts.anotherPref', true).returns('expectedValue');
      const val = global.ZoteroCitationCounts.getPref('anotherPref');
      expect(val).to.equal('expectedValue');
    });
  });

  describe('_sendRequest', function() {
    // Adjusted nasaAdsUrl to reflect it no longer contains api_key from _nasaadsUrl function
    const baseNasaAdsUrl = 'https://api.adsabs.harvard.edu/v1/search/query?q=doi:anything&fl=citation_count';
    const otherApiUrl = 'https://api.anotherexample.com/data';
    let mockCallback;
    const testApiKey = 'NASA_ADS_TEST_KEY_FROM_PREFS';

    beforeEach(function() {
      mockCallback = sinon.stub();
      // Reset the Prefs.get stub for each test to ensure clean state for nasaadsApiKey checks
      global.Zotero.Prefs.get.reset();
      global.Zotero.Prefs.get.withArgs('extensions.citationcounts.nasaadsApiKey', true).returns(testApiKey);
      // Make sure other pref calls are still possible if needed by other parts of the code.
      global.Zotero.Prefs.get.callThrough(); 
    });
    
    describe('NASA ADS Calls', function() {
      it('should use Authorization header and no api_key in URL for successful response', async function() {
        global.fetch.resolves({
          ok: true,
          status: 200,
          json: async () => ({ response: { docs: [{ citation_count: 123 }] } }) // Example NASA ADS response structure
        });
        mockCallback.callsFake(response => response.response.docs[0].citation_count); // Simulate callback logic

        await global.ZoteroCitationCounts._sendRequest(baseNasaAdsUrl, mockCallback);

        expect(global.Zotero.Prefs.get.calledWith('extensions.citationcounts.nasaadsApiKey', true)).to.be.true;
        expect(global.fetch.calledOnce).to.be.true;
        const fetchCall = global.fetch.getCall(0);
        expect(fetchCall.args[0]).to.equal(baseNasaAdsUrl); // URL should not have api_key
        expect(fetchCall.args[1]).to.deep.include({
          headers: {
            'Authorization': 'Bearer ' + testApiKey
          }
        });
        expect(mockCallback.calledOnce).to.be.true;
      });

      it('should throw nasaads-apikey error for 401 response, using Authorization header', async function() {
        global.fetch.resolves({
          ok: false,
          status: 401,
          url: baseNasaAdsUrl // url property on response is not strictly used by the code but good for mock completeness
        });
        
        let actualError = null;
        try {
          await global.ZoteroCitationCounts._sendRequest(baseNasaAdsUrl, mockCallback);
        } catch (e) {
          actualError = e;
        }
        expect(actualError).to.be.an('Error');
        expect(actualError.message).to.equal('citationcounts-progresswindow-error-nasaads-apikey');
        expect(global.Zotero.Prefs.get.calledWith('extensions.citationcounts.nasaadsApiKey', true)).to.be.true;
        const fetchCall = global.fetch.getCall(0);
        expect(fetchCall.args[0]).to.equal(baseNasaAdsUrl);
        expect(fetchCall.args[1]).to.deep.include({ headers: { 'Authorization': 'Bearer ' + testApiKey } });
        expect(global.Zotero.debug.calledWith(sinon.match(/NASA ADS API key error/))).to.be.true;
        expect(global.Zotero.debug.calledWith(sinon.match(/Used token: Bearer NASA_ADS_.../))).to.be.true;
      });

      it('should throw nasaads-apikey error for 403 response, using Authorization header', async function() {
        global.fetch.resolves({
          ok: false,
          status: 403,
          url: baseNasaAdsUrl
        });

        let actualError = null;
        try {
          await global.ZoteroCitationCounts._sendRequest(baseNasaAdsUrl, mockCallback);
        } catch (e) {
          actualError = e;
        }
        expect(actualError).to.be.an('Error');
        expect(actualError.message).to.equal('citationcounts-progresswindow-error-nasaads-apikey');
        expect(global.Zotero.Prefs.get.calledWith('extensions.citationcounts.nasaadsApiKey', true)).to.be.true;
        const fetchCall = global.fetch.getCall(0);
        expect(fetchCall.args[0]).to.equal(baseNasaAdsUrl);
        expect(fetchCall.args[1]).to.deep.include({ headers: { 'Authorization': 'Bearer ' + testApiKey } });
        expect(global.Zotero.debug.calledWith(sinon.match(/NASA ADS API key error/))).to.be.true;
        expect(global.Zotero.debug.calledWith(sinon.match(/Used token: Bearer NASA_ADS_.../))).to.be.true;
      });
      
      it('should handle NASA ADS URL that might accidentally have api_key and still use Authorization header', async function() {
        const urlWithApiKey = baseNasaAdsUrl + '&api_key=OLD_KEY_IN_URL';
        global.fetch.resolves({
            ok: true, status: 200, json: async () => ({ response: { docs: [{ citation_count: 50 }] } })
        });
        mockCallback.callsFake(response => response.response.docs[0].citation_count);

        await global.ZoteroCitationCounts._sendRequest(urlWithApiKey, mockCallback);

        expect(global.Zotero.Prefs.get.calledWith('extensions.citationcounts.nasaadsApiKey', true)).to.be.true;
        const fetchCall = global.fetch.getCall(0);
        // The URL passed to fetch should have api_key removed
        expect(fetchCall.args[0]).to.equal(baseNasaAdsUrl); 
        expect(fetchCall.args[1]).to.deep.include({ headers: { 'Authorization': 'Bearer ' + testApiKey } });
      });

      it('should throw bad-api-response error for other NASA ADS errors (e.g., 500), using Authorization header', async function() {
        global.fetch.resolves({
          ok: false,
          status: 500,
          url: baseNasaAdsUrl
        });

        let actualError = null;
        try {
          await global.ZoteroCitationCounts._sendRequest(baseNasaAdsUrl, mockCallback);
        } catch (e) {
          actualError = e;
        }
        expect(actualError).to.be.an('Error');
        expect(actualError.message).to.equal('citationcounts-progresswindow-error-bad-api-response');
        expect(global.Zotero.Prefs.get.calledWith('extensions.citationcounts.nasaadsApiKey', true)).to.be.true;
        const fetchCall = global.fetch.getCall(0);
        expect(fetchCall.args[0]).to.equal(baseNasaAdsUrl);
        expect(fetchCall.args[1]).to.deep.include({ headers: { 'Authorization': 'Bearer ' + testApiKey } });
        expect(global.Zotero.debug.calledWith(sinon.match(/Bad API response for/))).to.be.true;
      });
    });

    describe('Non-NASA ADS Calls', function() {
      beforeEach(function() {
        // Crucial: ensure nasaadsApiKey pref is NOT called for these tests.
        // Reset the specific stub for nasaadsApiKey and ensure other calls pass through
        global.Zotero.Prefs.get.withArgs('extensions.citationcounts.nasaadsApiKey', true).reset();
      });

      it('should throw bad-api-response error for non-NASA ADS API errors (e.g., 404) and not use Authorization header', async function() {
        global.fetch.resolves({
          ok: false,
          status: 404,
          url: otherApiUrl
        });

        let actualError = null;
        try {
          await global.ZoteroCitationCounts._sendRequest(otherApiUrl, mockCallback);
        } catch (e) {
          actualError = e;
        }
        expect(actualError).to.be.an('Error');
        expect(actualError.message).to.equal('citationcounts-progresswindow-error-bad-api-response');
        expect(global.Zotero.Prefs.get.calledWith('extensions.citationcounts.nasaadsApiKey', true)).to.be.false;
        const fetchCall = global.fetch.getCall(0);
        expect(fetchCall.args[1]).to.not.have.property('headers'); // Or check headers is empty or doesn't have Authorization
        expect(global.Zotero.debug.calledWith(sinon.match(/Bad API response for/))).to.be.true;
      });

      it('should throw bad-api-response error for network failures (non-NASA ADS) and not use Authorization header', async function() {
        global.fetch.rejects(new Error('Network failure'));

        let actualError = null;
        try {
          await global.ZoteroCitationCounts._sendRequest(otherApiUrl, mockCallback);
        } catch (e) {
          actualError = e;
        }
        expect(actualError).to.be.an('Error');
        expect(actualError.message).to.equal('citationcounts-progresswindow-error-bad-api-response');
        expect(global.Zotero.Prefs.get.calledWith('extensions.citationcounts.nasaadsApiKey', true)).to.be.false;
        const fetchCall = global.fetch.getCall(0); // fetch is still called once, but it rejects
        expect(fetchCall.args[1]).to.not.have.property('headers');
        expect(global.Zotero.debug.calledWith(sinon.match(/Network error fetching/))).to.be.true;
      });

      it('should return count for successful response and valid count (non-NASA ADS) and not use Authorization header', async function() {
        const mockResponseData = { some_count_field: 123 };
        global.fetch.resolves({
          ok: true,
          status: 200,
          json: sinon.stub().resolves(mockResponseData)
        });
        mockCallback.returns(mockResponseData.some_count_field);

        const count = await global.ZoteroCitationCounts._sendRequest(otherApiUrl, mockCallback);
        expect(count).to.equal(123);
        expect(mockCallback.calledWith(mockResponseData)).to.be.true;
        expect(global.Zotero.Prefs.get.calledWith('extensions.citationcounts.nasaadsApiKey', true)).to.be.false;
        const fetchCall = global.fetch.getCall(0);
        expect(fetchCall.args[1]).to.not.have.property('headers');
      });
      
      // ... other non-NASA ADS tests like invalid count, malformed JSON remain similar, ensuring no Auth header and no nasaadsApiKey pref call ...
      it('should throw no-citation-count error for successful response but invalid count (string, non-NASA ADS)', async function() {
        const mockResponseData = { some_count_field: "not-a-number" };
        global.fetch.resolves({ ok: true, status: 200, json: sinon.stub().resolves(mockResponseData) });
        mockCallback.returns(mockResponseData.some_count_field);
        let actualError = null;
        try { await global.ZoteroCitationCounts._sendRequest(otherApiUrl, mockCallback); } catch (e) { actualError = e; }
        expect(actualError.message).to.equal('citationcounts-progresswindow-error-no-citation-count');
        expect(global.Zotero.Prefs.get.calledWith('extensions.citationcounts.nasaadsApiKey', true)).to.be.false;
        expect(global.fetch.getCall(0).args[1]).to.not.have.property('headers');
      });

      it('should throw no-citation-count error for successful response but malformed JSON (non-NASA ADS)', async function() {
        global.fetch.resolves({ ok: true, status: 200, json: sinon.stub().rejects(new Error('JSON parse error')) });
        let actualError = null;
        try { await global.ZoteroCitationCounts._sendRequest(otherApiUrl, mockCallback); } catch (e) { actualError = e; }
        expect(actualError.message).to.equal('citationcounts-progresswindow-error-no-citation-count');
        expect(global.Zotero.Prefs.get.calledWith('extensions.citationcounts.nasaadsApiKey', true)).to.be.false;
        expect(global.fetch.getCall(0).args[1]).to.not.have.property('headers');
      });
    });
  });
});
