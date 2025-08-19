/**
 * Complete Workflow End-to-End Tests
 * 
 * Tests the complete user workflows from plugin initialization
 * through citation retrieval and UI updates.
 */

const { expect } = require('chai');
const sinon = require('sinon');
const ZoteroE2ETestHarness = require('./e2e-test-setup');

describe('E2E: Complete Plugin Workflow', function() {
  let harness;

  beforeEach(function() {
    harness = new ZoteroE2ETestHarness();
    harness.setup();
  });

  afterEach(function() {
    harness.teardown();
  });

  describe('Plugin Initialization and UI Setup', function() {
    it('should initialize plugin and create UI elements in all windows', function() {
      // Create mock windows
      const window1 = harness.createMockWindow();
      const window2 = harness.createMockWindow();

      // Add UI to all windows
      global.ZoteroCitationCounts.addToAllWindows();

      // Verify menus were created in all windows
      harness.verifyMenusCreated(window1);
      harness.verifyMenusCreated(window2);

      // Verify FTL localization was loaded
      expect(window1.MozXULElement.insertFTLIfNeeded.calledWith('citation-counts.ftl')).to.be.true;
      expect(window2.MozXULElement.insertFTLIfNeeded.calledWith('citation-counts.ftl')).to.be.true;
    });

    it('should remove UI elements when plugin is unloaded', function() {
      const window1 = harness.createMockWindow();
      
      // Add UI elements
      global.ZoteroCitationCounts.addToWindow(window1);
      
      // Verify elements exist
      const { toolsMenu, itemMenu } = harness.verifyMenusCreated(window1);
      
      // Remove elements
      global.ZoteroCitationCounts.removeFromWindow(window1);
      
      // Verify elements were removed
      expect(toolsMenu.remove.called).to.be.true;
      expect(itemMenu.remove.called).to.be.true;
    });
  });

  describe('Auto-Retrieval Configuration', function() {
    it('should allow setting auto-retrieval preference via Tools menu', function() {
      const window1 = harness.createMockWindow();
      global.ZoteroCitationCounts.addToWindow(window1);

      // Simulate clicking Crossref auto-retrieval option
      const success = harness.simulateMenuClick('menu_Tools-citationcounts-menu-popup-crossref', window1);
      expect(success).to.be.true;

      // Verify preference was set
      expect(global.ZoteroCitationCounts.getPref('autoretrieve')).to.equal('crossref');
    });

    it('should disable auto-retrieval when "none" is selected', function() {
      const window1 = harness.createMockWindow();
      global.ZoteroCitationCounts.addToWindow(window1);

      // Set initial preference
      harness.setPreference('autoretrieve', 'crossref');

      // Simulate clicking "none" option
      const success = harness.simulateMenuClick('menu_Tools-citationcounts-menu-popup-none', window1);
      expect(success).to.be.true;

      // Verify preference was set to none
      expect(global.ZoteroCitationCounts.getPref('autoretrieve')).to.equal('none');
    });
  });

  describe('Manual Citation Retrieval Workflow', function() {
    beforeEach(function() {
      harness.setupAPIMocks();
    });

    it('should complete full citation retrieval workflow for DOI-based item', async function() {
      // Create test item with DOI
      const testItem = harness.createMockItem({
        title: 'Test Paper with DOI',
        DOI: '10.1000/test-doi-123',
        extra: ''
      });

      // Create window and add UI
      const window1 = harness.createMockWindow();
      global.ZoteroCitationCounts.addToWindow(window1);

      // Simulate manual retrieval via Crossref
      const crossrefAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'crossref');
      
      // Execute the update workflow
      await global.ZoteroCitationCounts.updateItems([testItem], crossrefAPI);

      // Verify progress window was created and shown
      const progressWindow = harness.getLastProgressWindow();
      expect(progressWindow).to.not.be.undefined;
      expect(progressWindow.visible).to.be.true;
      expect(progressWindow.headline).to.include('Crossref');

      // Verify item progress was tracked
      expect(progressWindow.itemProgresses).to.have.length(2); // Item + success message
      const itemProgress = progressWindow.itemProgresses[0];
      expect(itemProgress.text).to.equal('Test Paper with DOI');
      expect(itemProgress.progress).to.equal(100);

      // Verify citation count was saved to item
      expect(testItem.setField.calledWith('extra')).to.be.true;
      const extraCall = testItem.setField.getCalls().find(call => call.args[0] === 'extra');
      expect(extraCall.args[1]).to.include('42 citations (Crossref/DOI)');
      expect(testItem.saveTx.called).to.be.true;

      // Verify progress window was set to auto-close
      expect(progressWindow.startCloseTimer.calledWith(5000)).to.be.true;
    });

    it('should handle arXiv-based item citation retrieval', async function() {
      // Create test item with arXiv ID
      const testItem = harness.createMockItem({
        title: 'Test Paper with arXiv',
        DOI: '',
        url: 'https://arxiv.org/abs/1234.5678',
        extra: ''
      });

      // Use INSPIRE-HEP API (supports both DOI and arXiv)
      const inspireAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'inspire');
      
      // Execute workflow
      await global.ZoteroCitationCounts.updateItems([testItem], inspireAPI);

      // Verify citation was retrieved via arXiv
      const extraCall = testItem.setField.getCalls().find(call => call.args[0] === 'extra');
      expect(extraCall.args[1]).to.include('15 citations (INSPIRE-HEP/arXiv)');
    });

    it('should handle title-based search for items without DOI/arXiv', async function() {
      // Create test item with only title/author/year
      const testItem = harness.createMockItem({
        title: 'Advanced Machine Learning Techniques',
        DOI: '',
        url: '',
        year: '2023',
        creators: [{ lastName: 'Smith', creatorType: 'author' }],
        extra: ''
      });

      // Use Semantic Scholar API (supports title search)
      const semanticAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'semanticscholar');
      
      // Mock the title search response
      harness.fetchStub.withArgs(sinon.match(/api\.semanticscholar\.org.*search/))
        .resolves({
          ok: true,
          json: sinon.stub().resolves({
            data: [{ citationCount: 28 }]
          })
        });

      // Execute workflow
      await global.ZoteroCitationCounts.updateItems([testItem], semanticAPI);

      // Verify citation was retrieved via title search
      const extraCall = testItem.setField.getCalls().find(call => call.args[0] === 'extra');
      expect(extraCall.args[1]).to.include('28 citations (Semantic Scholar/Title)');
    });
  });

  describe('Error Handling and Recovery', function() {
    it('should display network error in progress window', async function() {
      harness.setupAPIErrors('network');

      const testItem = harness.createMockItem({
        title: 'Test Item for Network Error',
        DOI: '10.1000/network-error-test'
      });

      const crossrefAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'crossref');
      
      await global.ZoteroCitationCounts.updateItems([testItem], crossrefAPI);

      // Verify error was shown in progress window
      const progressWindow = harness.getLastProgressWindow();
      const itemProgress = progressWindow.itemProgresses[0];
      expect(itemProgress.error).to.be.true;
      
      // Verify error message was created
      expect(progressWindow.itemProgresses).to.have.length(2);
      const errorMessage = progressWindow.itemProgresses[1];
      expect(errorMessage.text).to.include('network-issue');
    });

    it('should handle rate limiting gracefully', async function() {
      harness.setupAPIErrors('rate_limit');

      const testItem = harness.createMockItem({
        title: 'Rate Limited Test Item',
        DOI: '10.1000/rate-limit-test'
      });

      const crossrefAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'crossref');
      
      await global.ZoteroCitationCounts.updateItems([testItem], crossrefAPI);

      // Verify rate limit error was handled
      const progressWindow = harness.getLastProgressWindow();
      const errorMessage = progressWindow.itemProgresses[1];
      expect(errorMessage.text).to.include('rate-limit');
    });

    it('should prioritize critical errors over missing data errors', async function() {
      const testItem = harness.createMockItem({
        title: 'Error Priority Test',
        DOI: '', // No DOI will cause no-doi error
        url: 'https://arxiv.org/abs/1234.5678' // Has arXiv
      });

      // Mock arXiv request to return server error (high priority)
      harness.fetchStub.withArgs(sinon.match(/inspirehep\.net/))
        .resolves({ ok: false, status: 500 });

      const inspireAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'inspire');
      
      await global.ZoteroCitationCounts.updateItems([testItem], inspireAPI);

      // Should show server error, not no-doi error
      const progressWindow = harness.getLastProgressWindow();
      const errorMessage = progressWindow.itemProgresses[1];
      expect(errorMessage.text).to.include('server-error');
    });
  });

  describe('Multi-Item Batch Processing', function() {
    beforeEach(function() {
      harness.setupAPIMocks();
    });

    it('should process multiple items sequentially with progress tracking', async function() {
      // Create multiple test items
      const items = [
        harness.createMockItem({ title: 'First Paper', DOI: '10.1000/first' }),
        harness.createMockItem({ title: 'Second Paper', DOI: '10.1000/second' }),
        harness.createMockItem({ title: 'Third Paper', DOI: '10.1000/third' })
      ];

      const crossrefAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'crossref');
      
      await global.ZoteroCitationCounts.updateItems(items, crossrefAPI);

      // Verify all items were processed
      const progressWindow = harness.getLastProgressWindow();
      expect(progressWindow.itemProgresses).to.have.length(4); // 3 items + 1 completion message

      // Verify each item shows completion
      for (let i = 0; i < 3; i++) {
        const itemProgress = progressWindow.itemProgresses[i];
        expect(itemProgress.progress).to.equal(100);
        expect(itemProgress.error).to.be.false;
      }

      // Verify all items were saved
      items.forEach(item => {
        expect(item.saveTx.called).to.be.true;
        const extraCall = item.setField.getCalls().find(call => call.args[0] === 'extra');
        expect(extraCall.args[1]).to.include('42 citations (Crossref/DOI)');
      });
    });

    it('should continue processing remaining items when one fails', async function() {
      const items = [
        harness.createMockItem({ title: 'Good Paper', DOI: '10.1000/good' }),
        harness.createMockItem({ title: 'Bad Paper', DOI: '10.1000/bad' }),
        harness.createMockItem({ title: 'Another Good Paper', DOI: '10.1000/good2' })
      ];

      // Mock second item to fail
      harness.fetchStub.withArgs(sinon.match(/10\.1000\/bad/))
        .resolves({ ok: false, status: 404 });

      const crossrefAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'crossref');
      
      await global.ZoteroCitationCounts.updateItems(items, crossrefAPI);

      const progressWindow = harness.getLastProgressWindow();
      
      // First item should succeed
      const firstProgress = progressWindow.itemProgresses[0];
      expect(firstProgress.progress).to.equal(100);
      expect(firstProgress.error).to.be.false;

      // Second item should show error
      const secondProgress = progressWindow.itemProgresses[1];
      expect(secondProgress.error).to.be.true;

      // Third item should still succeed
      const thirdProgress = progressWindow.itemProgresses[2];
      expect(thirdProgress.progress).to.equal(100);
      expect(thirdProgress.error).to.be.false;

      // Verify successful items were saved
      expect(items[0].saveTx.called).to.be.true;
      expect(items[2].saveTx.called).to.be.true;
    });
  });

  describe('Citation Count Display and Parsing', function() {
    it('should correctly parse existing citation counts from extra field', function() {
      const testItem = harness.createMockItem({
        extra: '42 citations (Crossref/DOI) [2024-01-15]\nDOI: 10.1000/test\nNote: Important paper'
      });

      const count = global.ZoteroCitationCounts.getCitationCount(testItem);
      expect(count).to.equal('42');
    });

    it('should return "-" for items without citation counts', function() {
      const testItem = harness.createMockItem({
        extra: 'DOI: 10.1000/test\nNote: No citations yet'
      });

      const count = global.ZoteroCitationCounts.getCitationCount(testItem);
      expect(count).to.equal('-');
    });

    it('should update existing citation counts without losing other data', async function() {
      harness.setupAPIMocks();
      
      const testItem = harness.createMockItem({
        title: 'Previously Cited Paper',
        DOI: '10.1000/update-test',
        extra: '15 citations (Crossref/DOI) [2024-01-01]\nDOI: 10.1000/update-test\nNote: Important research'
      });

      const crossrefAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'crossref');
      await global.ZoteroCitationCounts.updateItems([testItem], crossrefAPI);

      // Verify old citation line was replaced and other data preserved
      const extraCall = testItem.setField.getCalls().find(call => call.args[0] === 'extra');
      const newExtra = extraCall.args[1];
      
      expect(newExtra).to.include('42 citations (Crossref/DOI)'); // New count
      expect(newExtra).to.not.include('15 citations'); // Old count removed
      expect(newExtra).to.include('DOI: 10.1000/update-test'); // Other data preserved
      expect(newExtra).to.include('Note: Important research'); // Other data preserved
    });
  });

  describe('NASA ADS API Key Integration', function() {
    it('should use API key for NASA ADS requests', async function() {
      harness.setPreference('nasaadsApiKey', 'test-api-key-123');
      
      const testItem = harness.createMockItem({
        title: 'NASA ADS Test Paper',
        DOI: '10.1000/nasa-test'
      });

      const nasaAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'nasaads');
      await global.ZoteroCitationCounts.updateItems([testItem], nasaAPI);

      // Verify request was made with Authorization header
      expect(harness.fetchStub.calledWith(
        sinon.match(/api\.adsabs\.harvard\.edu/),
        sinon.match({ headers: { 'Authorization': 'Bearer test-api-key-123' } })
      )).to.be.true;
    });

    it('should handle NASA ADS API key errors specifically', async function() {
      harness.setPreference('nasaadsApiKey', 'invalid-key');
      
      // Mock 401 response from NASA ADS
      harness.fetchStub.withArgs(sinon.match(/api\.adsabs\.harvard\.edu/))
        .resolves({ ok: false, status: 401 });

      const testItem = harness.createMockItem({
        title: 'NASA Key Error Test',
        DOI: '10.1000/nasa-key-error'
      });

      const nasaAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'nasaads');
      await global.ZoteroCitationCounts.updateItems([testItem], nasaAPI);

      // Verify NASA-specific API key error was shown
      const progressWindow = harness.getLastProgressWindow();
      const errorMessage = progressWindow.itemProgresses[1];
      expect(errorMessage.text).to.include('nasaads-apikey');
    });
  });

  describe('Localization and Error Messages', function() {
    it('should use localized error messages with API fallbacks', async function() {
      // Mock l10n to return null for testing fallback behavior
      global.ZoteroCitationCounts.l10n.formatValue.resolves(null);

      harness.setupAPIErrors('network');

      const testItem = harness.createMockItem({
        title: 'Localization Test Item',
        DOI: '10.1000/l10n-test'
      });

      const crossrefAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'crossref');
      await global.ZoteroCitationCounts.updateItems([testItem], crossrefAPI);

      // Should fall back to hardcoded message when l10n fails
      const progressWindow = harness.getLastProgressWindow();
      const errorMessage = progressWindow.itemProgresses[1];
      expect(errorMessage.text).to.include('Error processing item');
    });
  });
});