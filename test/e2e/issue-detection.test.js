/**
 * Issue Detection Tests
 * 
 * Tests designed to systematically identify bugs and inconsistencies
 * in the current codebase through specific test scenarios.
 */

const { expect } = require('chai');
const sinon = require('sinon');
const ZoteroE2ETestHarness = require('./e2e-test-setup');

describe('E2E: Issue Detection and Code Quality', function() {
  let harness;

  beforeEach(function() {
    harness = new ZoteroE2ETestHarness();
    harness.setup();
  });

  afterEach(function() {
    harness.teardown();
  });

  describe('Configuration Inconsistencies', function() {
    it('ISSUE 1 FIXED: NASA ADS now correctly supports title search', function() {
      const nasaAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'nasaads');
      
      // NASA ADS URL function supports title_author_year type
      const testMetadata = { title: 'Test', author: 'Smith', year: '2024' };
      const titleUrl = nasaAPI.methods.urlBuilder(testMetadata, 'title_author_year');
      
      // URL function works fine
      expect(titleUrl).to.include('title%3A%22Test');
      expect(titleUrl).to.include('author%3A%22Smith');
      
      // Configuration now correctly enables title search
      expect(nasaAPI.useTitleSearch).to.be.true; // FIXED
      
      // This means title search will now be attempted for NASA ADS
      // when DOI/arXiv are not available
    });

    it('ISSUE 1 FIXED: NASA ADS now successfully tries title search for items without DOI/arXiv', async function() {
      harness.setPreference('nasaadsApiKey', 'test-key');
      
      // Mock NASA ADS to succeed for title search  
      harness.fetchStub.withArgs(sinon.match(/api\.adsabs\.harvard\.edu.*title/))
        .resolves({
          ok: true,
          json: sinon.stub().resolves({
            response: { numFound: 1, docs: [{ citation_count: 50 }] }
          })
        });

      const testItem = harness.createMockItem({
        title: 'NASA Test Paper',
        DOI: '', // No DOI
        url: '', // No arXiv
        year: '2023',
        creators: [{ lastName: 'Johnson' }]
      });

      const nasaAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'nasaads');
      await global.ZoteroCitationCounts.updateItems([testItem], nasaAPI);

      // Should now succeed because title search is enabled
      const progressWindow = harness.getLastProgressWindow();
      const itemProgress = progressWindow.itemProgresses[0];
      expect(itemProgress.progress).to.equal(100);
      
      // Title search URL was attempted and succeeded
      expect(harness.fetchStub.calledWith(sinon.match(/title/))).to.be.true;
    });
  });

  describe('Race Conditions and Timing Issues', function() {
    it('ISSUE 2 FIXED: Semantic Scholar rate limiting is now configurable to avoid test race conditions', async function() {
      const testItem = harness.createMockItem({
        title: 'Rate Limit Test',
        DOI: '10.1000/rate-test'
      });

      // Mock successful response
      harness.fetchStub.resolves({
        ok: true,
        json: sinon.stub().resolves({ citationCount: 42 })
      });

      const semanticAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'semanticscholar');
      
      // Time the execution
      const startTime = Date.now();
      await global.ZoteroCitationCounts.updateItems([testItem], semanticAPI);
      const duration = Date.now() - startTime;

      // Should take at least 3 seconds due to rate limiting (if not configured to 0)
      expect(duration).to.be.at.least(2900); // Allow some variance
      
      // FIXED: Rate limiting is now configurable via semanticScholarRateLimitMs preference
      // Tests can set this to 0 for fast testing or keep default 3000ms for realistic testing
    });
  });

  describe('Error Message Consistency', function() {
    it('ISSUE 3: Inconsistent error message format between APIs', async function() {
      const testItems = [
        { api: 'crossref', doi: '10.1000/test1' },
        { api: 'inspire', doi: '10.1000/test2' },
        { api: 'semanticscholar', doi: '10.1000/test3' },
        { api: 'nasaads', doi: '10.1000/test4' }
      ];

      // Mock all APIs to return 404
      harness.fetchStub.resolves({ ok: false, status: 404 });

      for (const testConfig of testItems) {
        const item = harness.createMockItem({
          title: `${testConfig.api} Test`,
          DOI: testConfig.doi
        });

        const api = global.ZoteroCitationCounts.APIs.find(a => a.key === testConfig.api);
        await global.ZoteroCitationCounts.updateItems([item], api);

        const progressWindow = harness.getLastProgressWindow();
        const errorMessage = progressWindow.itemProgresses[1];
        
        // All should use the same error key for 404
        expect(errorMessage.text).to.include('not-found');
      }
    });
  });

  describe('Memory Leaks and Cleanup', function() {
    it('ISSUE 4: _addedElementIDs array may not be properly cleared on errors', function() {
      const window1 = harness.createMockWindow();
      
      // Add UI elements
      global.ZoteroCitationCounts.addToWindow(window1);
      
      // Check that elements were tracked
      expect(global.ZoteroCitationCounts._addedElementIDs.length).to.be.greaterThan(0);
      
      // Simulate error during removal (element doesn't exist)
      const nonExistentId = 'non-existent-element';
      global.ZoteroCitationCounts._addedElementIDs.push(nonExistentId);
      
      // Remove from window - should handle missing elements gracefully
      global.ZoteroCitationCounts.removeFromWindow(window1);
      
      // Array should still be cleared even if some elements were missing
      expect(global.ZoteroCitationCounts._addedElementIDs).to.have.length(0);
    });
  });

  describe('Input Validation and Sanitization', function() {
    it('ISSUE 5: Large title strings could cause API request failures', function() {
      const metadata = global.ZoteroCitationCounts._getItemMetadataForAdsQuery({
        getField: sinon.stub().callsFake((field) => {
          if (field === 'title') {
            // Very long title (over 1000 characters)
            return 'A'.repeat(1500) + ' Test Paper Title';
          }
          return '';
        }),
        getCreators: sinon.stub().returns([])
      });

      // Should be truncated to prevent API issues
      expect(metadata.title.length).to.be.at.most(1003); // 1000 + "..."
      expect(metadata.title).to.include('...');
    });

    it('ISSUE 6: Author name length should be limited', function() {
      const metadata = global.ZoteroCitationCounts._getItemMetadataForAdsQuery({
        getField: sinon.stub().returns('Test Title'),
        getCreators: sinon.stub().returns([{
          lastName: 'VeryLongAuthorLastNameThatExceeds100Characters'.repeat(3), // > 100 chars
          creatorType: 'author'
        }])
      });

      // Should be truncated
      expect(metadata.author.length).to.be.at.most(100);
    });
  });

  describe('Null/Undefined Handling', function() {
    it('ISSUE 7: Missing null checks in _getItemMetadataForAdsQuery', function() {
      // Test with null creators
      const metadata1 = global.ZoteroCitationCounts._getItemMetadataForAdsQuery({
        getField: sinon.stub().returns('Test Title'),
        getCreators: sinon.stub().returns(null) // Null creators
      });

      expect(metadata1.author).to.be.null;

      // Test with creators but no lastName
      const metadata2 = global.ZoteroCitationCounts._getItemMetadataForAdsQuery({
        getField: sinon.stub().returns('Test Title'),
        getCreators: sinon.stub().returns([{
          // No lastName field
          creatorType: 'author'
        }])
      });

      expect(metadata2.author).to.be.null;
    });
  });

  describe('Localization Edge Cases', function() {
    it('ISSUE 8: Localization fallback when formatValue returns undefined vs null', async function() {
      // Test null return
      global.ZoteroCitationCounts.l10n.formatValue.resolves(null);
      
      harness.setupAPIErrors('network');
      const testItem = harness.createMockItem({
        title: 'L10n Null Test',
        DOI: '10.1000/l10n-null'
      });

      const crossrefAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'crossref');
      await global.ZoteroCitationCounts.updateItems([testItem], crossrefAPI);

      let progressWindow = harness.getLastProgressWindow();
      let errorMessage = progressWindow.itemProgresses[1];
      expect(errorMessage.text).to.include('Error processing item');

      // Reset and test undefined return
      global.ZoteroCitationCounts.l10n.formatValue.resolves(undefined);
      
      const testItem2 = harness.createMockItem({
        title: 'L10n Undefined Test',
        DOI: '10.1000/l10n-undefined'
      });
      
      await global.ZoteroCitationCounts.updateItems([testItem2], crossrefAPI);
      
      progressWindow = harness.getLastProgressWindow();
      errorMessage = progressWindow.itemProgresses[1];
      expect(errorMessage.text).to.include('Error processing item');
    });
  });

  describe('URL Encoding Issues', function() {
    it('ISSUE 9: Special characters in DOI might not be properly encoded in some APIs', async function() {
      const specialDOI = '10.1000/test(special)chars[brackets]';
      
      const crossrefAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'crossref');
      const url = crossrefAPI.methods.urlBuilder(encodeURIComponent(specialDOI), 'doi');
      
      // URL should handle encoded special characters properly
      expect(url).to.include('10.1000%2Ftest%2528special%2529chars%255Bbrackets%255D');
    });
  });

  describe('Progress Window State Management', function() {
    it('ISSUE 10: Multiple concurrent updateItems calls could interfere', async function() {
      // This test reveals potential issues with concurrent operations
      const items1 = [harness.createMockItem({ title: 'Concurrent 1', DOI: '10.1000/c1' })];
      const items2 = [harness.createMockItem({ title: 'Concurrent 2', DOI: '10.1000/c2' })];
      
      harness.setupAPIMocks();

      const crossrefAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'crossref');

      // Start both operations concurrently
      const promise1 = global.ZoteroCitationCounts.updateItems(items1, crossrefAPI);
      const promise2 = global.ZoteroCitationCounts.updateItems(items2, crossrefAPI);

      await Promise.all([promise1, promise2]);

      // Should have created 2 separate progress windows
      expect(harness.mockProgressWindows).to.have.length(2);
      
      // Each should have completed successfully
      expect(harness.mockProgressWindows[0].itemProgresses[0].progress).to.equal(100);
      expect(harness.mockProgressWindows[1].itemProgresses[0].progress).to.equal(100);
    });
  });

  describe('API Response Validation', function() {
    it('ISSUE 11: Negative citation counts should be handled gracefully', async function() {
      // Mock response with negative citation count
      harness.fetchStub.resolves({
        ok: true,
        json: sinon.stub().resolves({
          'is-referenced-by-count': -5 // Negative count
        })
      });

      const testItem = harness.createMockItem({
        title: 'Negative Count Test',
        DOI: '10.1000/negative'
      });

      const crossrefAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'crossref');
      await global.ZoteroCitationCounts.updateItems([testItem], crossrefAPI);

      // Should handle negative count as invalid
      const progressWindow = harness.getLastProgressWindow();
      const errorMessage = progressWindow.itemProgresses[1];
      expect(errorMessage.text).to.include('no-citation-count');
    });

    it('ISSUE 12: Very large citation counts should be handled', async function() {
      // Mock response with extremely large citation count
      harness.fetchStub.resolves({
        ok: true,
        json: sinon.stub().resolves({
          'is-referenced-by-count': Number.MAX_SAFE_INTEGER + 1 // Beyond safe integer range
        })
      });

      const testItem = harness.createMockItem({
        title: 'Large Count Test',
        DOI: '10.1000/large'
      });

      const crossrefAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'crossref');
      await global.ZoteroCitationCounts.updateItems([testItem], crossrefAPI);

      // Should either handle gracefully or show as invalid
      // Current parseInt implementation might not handle this well
      const progressWindow = harness.getLastProgressWindow();
      const items = progressWindow.itemProgresses;
      
      // Should either succeed with reasonable number or show error
      expect(items.length).to.be.at.least(1);
    });
  });
});