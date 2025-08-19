/**
 * API Integration End-to-End Tests
 * 
 * Tests real API integration with all supported citation services
 * to ensure URL building, response parsing, and error handling work
 * correctly in complete scenarios.
 */

const { expect } = require('chai');
const sinon = require('sinon');
const ZoteroE2ETestHarness = require('./e2e-test-setup');

describe('E2E: API Integration Scenarios', function() {
  let harness;

  beforeEach(function() {
    harness = new ZoteroE2ETestHarness();
    harness.setup();
  });

  afterEach(function() {
    harness.teardown();
  });

  describe('Crossref API Integration', function() {
    it('should complete full Crossref workflow with DOI', async function() {
      // Mock successful Crossref response
      harness.fetchStub.withArgs(sinon.match(/api\.crossref\.org/))
        .resolves({
          ok: true,
          json: sinon.stub().resolves({
            'is-referenced-by-count': 123
          })
        });

      const testItem = harness.createMockItem({
        title: 'Crossref Test Paper',
        DOI: '10.1038/nature12373'
      });

      const crossrefAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'crossref');
      await global.ZoteroCitationCounts.updateItems([testItem], crossrefAPI);

      // Verify correct URL was called
      expect(harness.fetchStub.calledWith(
        'https://api.crossref.org/works/10.1038%2Fnature12373/transform/application/vnd.citationstyles.csl+json'
      )).to.be.true;

      // Verify citation count was extracted and saved
      const extraCall = testItem.setField.getCalls().find(call => call.args[0] === 'extra');
      expect(extraCall.args[1]).to.include('123 citations (Crossref/DOI)');
    });

    it('should handle Crossref API errors appropriately', async function() {
      // Mock 404 response (DOI not found)
      harness.fetchStub.withArgs(sinon.match(/api\.crossref\.org/))
        .resolves({ ok: false, status: 404 });

      const testItem = harness.createMockItem({
        title: 'Nonexistent DOI Paper',
        DOI: '10.1000/nonexistent'
      });

      const crossrefAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'crossref');
      await global.ZoteroCitationCounts.updateItems([testItem], crossrefAPI);

      // Verify error was handled
      const progressWindow = harness.getLastProgressWindow();
      const errorMessage = progressWindow.itemProgresses[1];
      expect(errorMessage.text).to.include('not-found');
    });
  });

  describe('INSPIRE-HEP API Integration', function() {
    it('should handle DOI lookup via INSPIRE-HEP', async function() {
      harness.fetchStub.withArgs(sinon.match(/inspirehep\.net.*doi/))
        .resolves({
          ok: true,
          json: sinon.stub().resolves({
            metadata: { citation_count: 87 }
          })
        });

      const testItem = harness.createMockItem({
        title: 'INSPIRE DOI Test',
        DOI: '10.1016/j.physrep.2012.01.001'
      });

      const inspireAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'inspire');
      await global.ZoteroCitationCounts.updateItems([testItem], inspireAPI);

      // Verify correct INSPIRE URL was called
      expect(harness.fetchStub.calledWith(
        'https://inspirehep.net/api/doi/10.1016%2Fj.physrep.2012.01.001'
      )).to.be.true;

      // Verify citation count extraction
      const extraCall = testItem.setField.getCalls().find(call => call.args[0] === 'extra');
      expect(extraCall.args[1]).to.include('87 citations (INSPIRE-HEP/DOI)');
    });

    it('should fallback from DOI to arXiv when DOI fails', async function() {
      // Mock DOI request failure
      harness.fetchStub.withArgs(sinon.match(/inspirehep\.net.*doi/))
        .resolves({ ok: false, status: 404 });

      // Mock successful arXiv request
      harness.fetchStub.withArgs(sinon.match(/inspirehep\.net.*arxiv/))
        .resolves({
          ok: true,
          json: sinon.stub().resolves({
            metadata: { citation_count: 65 }
          })
        });

      const testItem = harness.createMockItem({
        title: 'INSPIRE Fallback Test',
        DOI: '10.1000/nonexistent',
        url: 'https://arxiv.org/abs/1234.5678'
      });

      const inspireAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'inspire');
      await global.ZoteroCitationCounts.updateItems([testItem], inspireAPI);

      // Verify both requests were made
      expect(harness.fetchStub.calledWith(sinon.match(/doi/))).to.be.true;
      expect(harness.fetchStub.calledWith(sinon.match(/arxiv/))).to.be.true;

      // Verify arXiv result was used
      const extraCall = testItem.setField.getCalls().find(call => call.args[0] === 'extra');
      expect(extraCall.args[1]).to.include('65 citations (INSPIRE-HEP/arXiv)');
    });
  });

  describe('Semantic Scholar API Integration', function() {
    it('should handle direct DOI lookup with rate limiting', async function() {
      // Mock Semantic Scholar response
      harness.fetchStub.withArgs(sinon.match(/api\.semanticscholar\.org.*paper\/10/))
        .resolves({
          ok: true,
          json: sinon.stub().resolves({
            citationCount: 245
          })
        });

      const testItem = harness.createMockItem({
        title: 'Semantic Scholar DOI Test',
        DOI: '10.1145/3097983.3098056'
      });

      const semanticAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'semanticscholar');
      
      // Start request
      const startTime = Date.now();
      await global.ZoteroCitationCounts.updateItems([testItem], semanticAPI);
      const endTime = Date.now();

      // Verify rate limiting delay occurred (should be at least 3 seconds)
      expect(endTime - startTime).to.be.at.least(3000);

      // Verify citation count
      const extraCall = testItem.setField.getCalls().find(call => call.args[0] === 'extra');
      expect(extraCall.args[1]).to.include('245 citations (Semantic Scholar/DOI)');
    });

    it('should perform title/author/year search when no DOI/arXiv', async function() {
      // Mock search API response
      harness.fetchStub.withArgs(sinon.match(/api\.semanticscholar\.org.*search/))
        .resolves({
          ok: true,
          json: sinon.stub().resolves({
            data: [
              { citationCount: 156, externalIds: { DOI: '10.1000/found' } },
              { citationCount: 23, externalIds: { DOI: '10.1000/other' } }
            ]
          })
        });

      const testItem = harness.createMockItem({
        title: 'Machine Learning for Data Science',
        DOI: '',
        url: '',
        year: '2023',
        creators: [{ lastName: 'Johnson', creatorType: 'author' }]
      });

      const semanticAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'semanticscholar');
      await global.ZoteroCitationCounts.updateItems([testItem], semanticAPI);

      // Verify search URL was constructed correctly
      const searchCall = harness.fetchStub.getCalls().find(call => 
        call.args[0].includes('search') && call.args[0].includes('title%3A')
      );
      expect(searchCall).to.not.be.undefined;
      expect(searchCall.args[0]).to.include('title%3AMachine%2520Learning');
      expect(searchCall.args[0]).to.include('author%3AJohnson');
      expect(searchCall.args[0]).to.include('year%3A2023');

      // Verify first result was used
      const extraCall = testItem.setField.getCalls().find(call => call.args[0] === 'extra');
      expect(extraCall.args[1]).to.include('156 citations (Semantic Scholar/Title)');
    });

    it('should handle multiple search results appropriately', async function() {
      // Mock search returning multiple results
      harness.fetchStub.withArgs(sinon.match(/search/))
        .resolves({
          ok: true,
          json: sinon.stub().resolves({
            data: [
              { citationCount: 42 },
              { citationCount: 128 },
              { citationCount: 7 }
            ]
          })
        });

      const testItem = harness.createMockItem({
        title: 'Common Paper Title',
        DOI: '',
        creators: [{ lastName: 'Smith' }]
      });

      const semanticAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'semanticscholar');
      await global.ZoteroCitationCounts.updateItems([testItem], semanticAPI);

      // Should use first result and log the multiple results
      const extraCall = testItem.setField.getCalls().find(call => call.args[0] === 'extra');
      expect(extraCall.args[1]).to.include('42 citations');
      
      // Verify logging occurred
      expect(global.Zotero.debug.calledWith(sinon.match(/returned \d+ results/))).to.be.true;
    });
  });

  describe('NASA ADS API Integration', function() {
    beforeEach(function() {
      harness.setPreference('nasaadsApiKey', 'test-nasa-key-123');
    });

    it('should handle DOI lookup with API key authentication', async function() {
      harness.fetchStub.withArgs(
        sinon.match(/api\.adsabs\.harvard\.edu/),
        sinon.match({ headers: { 'Authorization': 'Bearer test-nasa-key-123' } })
      ).resolves({
        ok: true,
        json: sinon.stub().resolves({
          response: {
            numFound: 1,
            docs: [{ citation_count: 178 }]
          }
        })
      });

      const testItem = harness.createMockItem({
        title: 'NASA ADS DOI Test',
        DOI: '10.3847/1538-4357/ab1b21'
      });

      const nasaAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'nasaads');
      await global.ZoteroCitationCounts.updateItems([testItem], nasaAPI);

      // Verify API key was used
      expect(harness.fetchStub.calledWith(
        sinon.match(/q=doi%3A10\.3847/),
        sinon.match({ headers: { 'Authorization': 'Bearer test-nasa-key-123' } })
      )).to.be.true;

      // Verify result
      const extraCall = testItem.setField.getCalls().find(call => call.args[0] === 'extra');
      expect(extraCall.args[1]).to.include('178 citations (NASA ADS/DOI)');
    });

    it('should handle title/author/year search for items without identifiers', async function() {
      harness.fetchStub.withArgs(
        sinon.match(/api\.adsabs\.harvard\.edu/),
        sinon.match.any
      ).resolves({
        ok: true,
        json: sinon.stub().resolves({
          response: {
            numFound: 3,
            docs: [
              { citation_count: 45 },
              { citation_count: 12 },
              { citation_count: 8 }
            ]
          }
        })
      });

      const testItem = harness.createMockItem({
        title: 'Stellar Evolution and Nucleosynthesis',
        DOI: '',
        url: '',
        year: '2022',
        creators: [{ lastName: 'Williams', creatorType: 'author' }]
      });

      const nasaAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'nasaads');
      await global.ZoteroCitationCounts.updateItems([testItem], nasaAPI);

      // Verify search query was constructed
      const titleSearchCall = harness.fetchStub.getCalls().find(call => 
        call.args[0].includes('title%3A%22') && call.args[0].includes('author%3A%22')
      );
      expect(titleSearchCall).to.not.be.undefined;

      // Verify multiple results were logged and first used
      expect(global.Zotero.debug.calledWith(sinon.match(/returned 3 results/))).to.be.true;
      const extraCall = testItem.setField.getCalls().find(call => call.args[0] === 'extra');
      expect(extraCall.args[1]).to.include('45 citations (NASA ADS/Title)');
    });

    it('should handle NASA ADS specific error when API key is invalid', async function() {
      // Mock 403 Forbidden (invalid API key)
      harness.fetchStub.withArgs(sinon.match(/api\.adsabs\.harvard\.edu/))
        .resolves({ ok: false, status: 403 });

      const testItem = harness.createMockItem({
        title: 'NASA Key Error Test',
        DOI: '10.1000/test'
      });

      const nasaAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'nasaads');
      await global.ZoteroCitationCounts.updateItems([testItem], nasaAPI);

      // Should show NASA-specific API key error
      const progressWindow = harness.getLastProgressWindow();
      const errorMessage = progressWindow.itemProgresses[1];
      expect(errorMessage.text).to.include('nasaads-apikey');
    });

    it('should show specific "no results" error for NASA ADS when all methods fail', async function() {
      // Mock all requests to return no results
      harness.fetchStub.withArgs(sinon.match(/api\.adsabs\.harvard\.edu/))
        .resolves({
          ok: true,
          json: sinon.stub().resolves({
            response: {
              numFound: 0,
              docs: []
            }
          })
        });

      const testItem = harness.createMockItem({
        title: 'Obscure Paper Not in ADS',
        DOI: '10.1000/not-in-ads',
        url: 'https://arxiv.org/abs/9999.9999',
        year: '2024',
        creators: [{ lastName: 'Unknown' }]
      });

      const nasaAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'nasaads');
      await global.ZoteroCitationCounts.updateItems([testItem], nasaAPI);

      // Should show NASA-specific "no results" error
      const progressWindow = harness.getLastProgressWindow();
      const errorMessage = progressWindow.itemProgresses[1];
      expect(errorMessage.text).to.include('nasaads-no-results');
    });
  });

  describe('Cross-API Error Prioritization', function() {
    it('should prioritize network errors over missing identifier errors', async function() {
      // Create item with no DOI but valid arXiv
      const testItem = harness.createMockItem({
        title: 'Network Error Priority Test',
        DOI: '', // Will cause no-DOI error
        url: 'https://arxiv.org/abs/1234.5678' // Valid arXiv
      });

      // Mock arXiv request to fail with network error
      harness.fetchStub.withArgs(sinon.match(/inspirehep\.net.*arxiv/))
        .rejects(new Error('DNS lookup failed'));

      const inspireAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'inspire');
      await global.ZoteroCitationCounts.updateItems([testItem], inspireAPI);

      // Should show network error, not no-DOI error
      const progressWindow = harness.getLastProgressWindow();
      const errorMessage = progressWindow.itemProgresses[1];
      expect(errorMessage.text).to.include('network-issue');
    });

    it('should prioritize API key errors over other errors', async function() {
      const testItem = harness.createMockItem({
        title: 'API Key Priority Test',
        DOI: '10.1000/test',
        url: 'https://arxiv.org/abs/1234.5678'
      });

      // Mock DOI to succeed but return no citations
      harness.fetchStub.withArgs(sinon.match(/doi/))
        .resolves({
          ok: true,
          json: sinon.stub().resolves({ response: { docs: [] } })
        });

      // Mock arXiv to fail with API key error
      harness.fetchStub.withArgs(sinon.match(/arxiv/))
        .resolves({ ok: false, status: 401 });

      harness.setPreference('nasaadsApiKey', 'invalid-key');
      const nasaAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'nasaads');
      await global.ZoteroCitationCounts.updateItems([testItem], nasaAPI);

      // Should show API key error
      const progressWindow = harness.getLastProgressWindow();
      const errorMessage = progressWindow.itemProgresses[1];
      expect(errorMessage.text).to.include('nasaads-apikey');
    });
  });

  describe('Response Parsing Edge Cases', function() {
    it('should handle malformed JSON responses gracefully', async function() {
      harness.fetchStub.withArgs(sinon.match(/api\.crossref\.org/))
        .resolves({
          ok: true,
          json: sinon.stub().rejects(new Error('Unexpected token'))
        });

      const testItem = harness.createMockItem({
        title: 'Malformed Response Test',
        DOI: '10.1000/malformed'
      });

      const crossrefAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'crossref');
      await global.ZoteroCitationCounts.updateItems([testItem], crossrefAPI);

      // Should show no-citation-count error
      const progressWindow = harness.getLastProgressWindow();
      const errorMessage = progressWindow.itemProgresses[1];
      expect(errorMessage.text).to.include('no-citation-count');
    });

    it('should handle responses with missing citation count fields', async function() {
      harness.fetchStub.withArgs(sinon.match(/api\.crossref\.org/))
        .resolves({
          ok: true,
          json: sinon.stub().resolves({
            // Missing 'is-referenced-by-count' field
            title: 'Test Paper',
            DOI: '10.1000/test'
          })
        });

      const testItem = harness.createMockItem({
        title: 'Missing Field Test',
        DOI: '10.1000/missing-field'
      });

      const crossrefAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'crossref');
      await global.ZoteroCitationCounts.updateItems([testItem], crossrefAPI);

      // Should handle gracefully
      const progressWindow = harness.getLastProgressWindow();
      const errorMessage = progressWindow.itemProgresses[1];
      expect(errorMessage.text).to.include('no-citation-count');
    });

    it('should handle null or non-numeric citation counts', async function() {
      harness.fetchStub.withArgs(sinon.match(/api\.crossref\.org/))
        .resolves({
          ok: true,
          json: sinon.stub().resolves({
            'is-referenced-by-count': null // Null citation count
          })
        });

      const testItem = harness.createMockItem({
        title: 'Null Citation Count Test',
        DOI: '10.1000/null-count'
      });

      const crossrefAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'crossref');
      await global.ZoteroCitationCounts.updateItems([testItem], crossrefAPI);

      // Should handle null gracefully
      const progressWindow = harness.getLastProgressWindow();
      const errorMessage = progressWindow.itemProgresses[1];
      expect(errorMessage.text).to.include('no-citation-count');
    });
  });

  describe('URL Sanitization for Logging', function() {
    it('should sanitize API keys from URLs in logs', async function() {
      harness.setPreference('nasaadsApiKey', 'secret-key-123');
      
      // Force a network error to trigger logging
      harness.fetchStub.rejects(new Error('Network failure'));

      const testItem = harness.createMockItem({
        title: 'URL Sanitization Test',
        DOI: '10.1000/sanitize-test'
      });

      const nasaAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'nasaads');
      await global.ZoteroCitationCounts.updateItems([testItem], nasaAPI);

      // Verify that logged URLs don't contain the API key
      const debugCalls = global.Zotero.debug.getCalls();
      const networkErrorLog = debugCalls.find(call => 
        call.args[0] && call.args[0].includes('Network error fetching')
      );
      
      if (networkErrorLog) {
        expect(networkErrorLog.args[0]).to.not.include('secret-key-123');
        expect(networkErrorLog.args[0]).to.not.include('api_key=');
      }
    });
  });
});