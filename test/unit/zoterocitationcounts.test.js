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

    it('should return the citation count string if "X citations" exists', function() {
      mockItem.getField.withArgs('extra').returns('456 citations (TestSource) [2023-01-01]\nAnother line');
      expect(global.ZoteroCitationCounts.getCitationCount(mockItem)).to.equal('456');
    });
    
    it('should return the first match if multiple citation lines exist', function() {
      mockItem.getField.withArgs('extra').returns('Citations: 789\n101 citations (AnotherSource)\nMore data');
      expect(global.ZoteroCitationCounts.getCitationCount(mockItem)).to.equal('789');
    });
    
    it('should return "-" if no citation line is found', function() {
      mockItem.getField.withArgs('extra').returns('Just some random notes\nNo citation info here');
      expect(global.ZoteroCitationCounts.getCitationCount(mockItem)).to.equal('-');
    });

    it('should return "-" if extra field is empty or null', function() {
      mockItem.getField.withArgs('extra').returns('');
      expect(global.ZoteroCitationCounts.getCitationCount(mockItem)).to.equal('-');
      
      mockItem.getField.withArgs('extra').returns(null);
      expect(global.ZoteroCitationCounts.getCitationCount(mockItem)).to.equal('-');
    });
    
    it('should handle case-insensitivity in "Citations:"', function() {
      mockItem.getField.withArgs('extra').returns('citations: 22');
      expect(global.ZoteroCitationCounts.getCitationCount(mockItem)).to.equal('22');
    });

    it('should handle case-insensitivity in "X citations"', function() {
      mockItem.getField.withArgs('extra').returns('33 CITATIONS');
      expect(global.ZoteroCitationCounts.getCitationCount(mockItem)).to.equal('33');
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
      // Freeze time for consistent date formatting in tests
      clock = sinon.useFakeTimers(new Date(2024, 0, 15).getTime()); // Jan 15, 2024
    });

    afterEach(function() {
      clock.restore();
    });

    it('should add citation count to an empty extra field', function() {
      mockItem.getField.withArgs('extra').returns('');
      global.ZoteroCitationCounts._setCitationCount(mockItem, 'TestSource', 123);
      const expectedExtra = '123 citations (TestSource) [2024-01-15]';
      expect(mockItem.setField.calledOnceWith('extra', expectedExtra)).to.be.true;
      expect(mockItem.saveTx.calledOnce).to.be.true;
    });

    it('should add citation count to an existing extra field with other data', function() {
      mockItem.getField.withArgs('extra').returns('Some other note\nAnother line');
      global.ZoteroCitationCounts._setCitationCount(mockItem, 'TestSource', 456);
      const expectedExtra = '456 citations (TestSource) [2024-01-15]\nSome other note\nAnother line';
      expect(mockItem.setField.calledOnceWith('extra', expectedExtra)).to.be.true;
    });

    it('should update existing citation count from the same source (Citations: format)', function() {
      mockItem.getField.withArgs('extra').returns('Citations (TestSource): 100 [2023-10-10]\nOther data');
      global.ZoteroCitationCounts._setCitationCount(mockItem, 'TestSource', 789);
      const expectedExtra = '789 citations (TestSource) [2024-01-15]\nOther data';
      expect(mockItem.setField.calledOnceWith('extra', expectedExtra)).to.be.true;
    });
    
    it('should update existing citation count from the same source (X citations format)', function() {
      mockItem.getField.withArgs('extra').returns('50 citations (TestSource) [2023-11-11]\nOther data');
      global.ZoteroCitationCounts._setCitationCount(mockItem, 'TestSource', 789);
      const expectedExtra = '789 citations (TestSource) [2024-01-15]\nOther data';
      expect(mockItem.setField.calledOnceWith('extra', expectedExtra)).to.be.true;
    });

    it('should add new citation count if existing one is from a different source', function() {
      mockItem.getField.withArgs('extra').returns('Citations (AnotherSource): 200 [2023-12-12]');
      global.ZoteroCitationCounts._setCitationCount(mockItem, 'TestSource', 321);
      const expectedExtra = '321 citations (TestSource) [2024-01-15]\nCitations (AnotherSource): 200 [2023-12-12]';
      expect(mockItem.setField.calledOnceWith('extra', expectedExtra)).to.be.true;
    });
    
    it('should correctly place new citation count at the top, preserving multiple other lines', function() {
      mockItem.getField.withArgs('extra').returns('Line 1\nLine 2\nCitations (OldSource): 50 [2020-01-01]\nLine 4');
      global.ZoteroCitationCounts._setCitationCount(mockItem, 'NewSource', 25);
      const expectedExtra = '25 citations (NewSource) [2024-01-15]\nLine 1\nLine 2\nLine 4';
      // The line 'Citations (OldSource): 50 [2020-01-01]' should be removed because it matches the general pattern,
      // even if the source is different. The current implementation filters out any line starting with "Citations:" or "X citations"
      // if it doesn't match the *current* source. This test clarifies that behavior.
      // To be more precise, the filter is `!pattern.test(line)` where pattern is `/^Citations \(${source}\):|^\d+ citations \(${source}\)/i`
      // This means lines from OTHER sources are KEPT. Let's adjust the test.
      
      // Corrected expectation:
      mockItem.getField.withArgs('extra').returns('Line 1\nLine 2\nCitations (OldSource): 50 [2020-01-01]\nLine 4');
      global.ZoteroCitationCounts._setCitationCount(mockItem, 'NewSource', 25);
      const correctedExpectedExtra = '25 citations (NewSource) [2024-01-15]\nLine 1\nLine 2\nCitations (OldSource): 50 [2020-01-01]\nLine 4';
      expect(mockItem.setField.calledOnceWith('extra', correctedExpectedExtra)).to.be.true;
    });

    it('should handle case-insensitivity for "Citations:" and source matching', function() {
      mockItem.getField.withArgs('extra').returns('citations (tEsTsOuRcE): 10 [2023-01-01]');
      global.ZoteroCitationCounts._setCitationCount(mockItem, 'TestSource', 30);
      const expectedExtra = '30 citations (TestSource) [2024-01-15]';
      expect(mockItem.setField.calledOnceWith('extra', expectedExtra)).to.be.true;
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

    it('should extract arXiv ID from URL (arXiv: format)', function() {
      mockItem.getField.withArgs('url').returns('arXiv:0901.0001');
      const arxiv = global.ZoteroCitationCounts._getArxiv(mockItem);
      expect(arxiv).to.equal(encodeURIComponent('0901.0001'));
    });
    
    it('should extract arXiv ID with version from URL', function() {
      mockItem.getField.withArgs('url').returns('http://arxiv.org/abs/1501.00001v2');
      const arxiv = global.ZoteroCitationCounts._getArxiv(mockItem);
      expect(arxiv).to.equal(encodeURIComponent('1501.00001v2'));
    });

    it('should extract arXiv ID with category from URL', function() {
      mockItem.getField.withArgs('url').returns('https://arxiv.org/abs/cs.AI/0401001');
      const arxiv = global.ZoteroCitationCounts._getArxiv(mockItem);
      expect(arxiv).to.equal(encodeURIComponent('cs.AI/0401001'));
    });

    it('should throw an error if URL is missing', function() {
      mockItem.getField.withArgs('url').returns('');
      expect(() => global.ZoteroCitationCounts._getArxiv(mockItem))
        .to.throw('citationcounts-progresswindow-error-no-arxiv');
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

    it('should extract year from date field if year is missing', function() {
      mockItem.getField.withArgs('title').returns('Another Title');
      mockItem.getField.withArgs('year').returns(''); // No year
      mockItem.getField.withArgs('date').returns('2022-01-15');
      mockItem.getCreators.returns([{ name: 'Smith', creatorType: 'author' }]); // Using 'name' as fallback
      const metadata = global.ZoteroCitationCounts._getItemMetadataForAdsQuery(mockItem);
      expect(metadata).to.deep.equal({ title: 'Another Title', author: 'Smith', year: '2022' });
    });
    
    it('should extract year from date field with "c. YYYY" format', function() {
      mockItem.getField.withArgs('date').returns('c. 2021');
      const metadata = global.ZoteroCitationCounts._getItemMetadataForAdsQuery(mockItem);
      expect(metadata.year).to.equal('2021');
    });

    it('should handle missing title', function() {
      mockItem.getField.withArgs('year').returns('2020');
      mockItem.getCreators.returns([{ lastName: 'Jane', creatorType: 'author' }]);
      const metadata = global.ZoteroCitationCounts._getItemMetadataForAdsQuery(mockItem);
      expect(metadata).to.deep.equal({ title: null, author: 'Jane', year: '2020' });
    });

    it('should handle missing author', function() {
      mockItem.getField.withArgs('title').returns('Title Only');
      mockItem.getField.withArgs('year').returns('2019');
      const metadata = global.ZoteroCitationCounts._getItemMetadataForAdsQuery(mockItem);
      expect(metadata).to.deep.equal({ title: 'Title Only', author: null, year: '2019' });
    });

    it('should handle missing year and date', function() {
      mockItem.getField.withArgs('title').returns('Timeless Work');
      mockItem.getCreators.returns([{ lastName: 'Ancient', creatorType: 'author' }]);
      const metadata = global.ZoteroCitationCounts._getItemMetadataForAdsQuery(mockItem);
      expect(metadata).to.deep.equal({ title: 'Timeless Work', author: 'Ancient', year: null });
    });
    
    it('should return all null if no relevant fields are present', function() {
      const metadata = global.ZoteroCitationCounts._getItemMetadataForAdsQuery(mockItem);
      expect(metadata).to.deep.equal({ title: null, author: null, year: null });
    });
  });

  describe('UI Logic (Basic Checks)', function() {
    describe('_storeAddedElement', function() {
      beforeEach(function() {
        global.ZoteroCitationCounts._addedElementIDs = []; // Reset before each test
      });

      it('should add an element ID to the list', function() {
        global.ZoteroCitationCounts._storeAddedElement({ id: 'test-id-1' });
        expect(global.ZoteroCitationCounts._addedElementIDs).to.include('test-id-1');
      });

      it('should throw an error if element has no ID', function() {
        expect(() => global.ZoteroCitationCounts._storeAddedElement({}))
          .to.throw('Element must have an id.');
      });
    });

    describe('_injectXULElement', function() {
      let mockDocument;
      let mockElement;

      beforeEach(function() {
        mockElement = { 
          id: '', 
          setAttribute: sinon.stub(),
          addEventListener: sinon.stub()
        };
        mockDocument = {
          createXULElement: sinon.stub().returns(mockElement),
          getElementById: sinon.stub().returns({ appendChild: sinon.stub() })
        };
        global.ZoteroCitationCounts._addedElementIDs = []; // Reset
      });

      it('should create an element, set its ID, attributes, and append it', function() {
        const attributes = { label: 'Test', class: 'test-class' };
        const eventListeners = { command: () => {} };
        global.ZoteroCitationCounts._injectXULElement(
          mockDocument,
          'menuitem',
          'test-elem-id',
          attributes,
          'parent-id',
          eventListeners
        );

        expect(mockDocument.createXULElement.calledOnceWith('menuitem')).to.be.true;
        expect(mockElement.id).to.equal('test-elem-id');
        expect(mockElement.setAttribute.calledWith('label', 'Test')).to.be.true;
        expect(mockElement.setAttribute.calledWith('class', 'test-class')).to.be.true;
        expect(mockElement.addEventListener.calledOnceWith('command', eventListeners.command)).to.be.true;
        expect(mockDocument.getElementById.calledOnceWith('parent-id')).to.be.true;
        expect(mockDocument.getElementById('parent-id').appendChild.calledOnceWith(mockElement)).to.be.true;
        expect(global.ZoteroCitationCounts._addedElementIDs).to.include('test-elem-id');
      });
    });
  });
  
  describe('updateItems & _updateItem', function() {
    let mockItems;
    let mockApi;
    let mockProgressWindow;
    let mockProgressWindowItem;

    beforeEach(function() {
      mockProgressWindowItem = {
        setError: sinon.stub(),
        setIcon: sinon.stub(),
        setProgress: sinon.stub(),
      };
      mockProgressWindow = {
        show: sinon.stub(),
        changeHeadline: sinon.stub(),
        ItemProgress: sinon.stub().returns(mockProgressWindowItem),
        startCloseTimer: sinon.stub(),
      };
      sinon.stub(global.Zotero, 'ProgressWindow').returns(mockProgressWindow);

      // Stub the core logic functions that are called by _updateItem
      sinon.stub(global.ZoteroCitationCounts, '_retrieveCitationCount');
      sinon.stub(global.ZoteroCitationCounts, '_setCitationCount');
      
      // Mock l10n
      global.ZoteroCitationCounts.l10n = {
        formatValue: sinon.stub().resolvesArg(0) // Return the key itself for simplicity
      };


      mockApi = { 
        name: 'TestAPI', 
        useDoi: true, 
        useArxiv: false, 
        methods: { 
          urlBuilder: sinon.stub(), 
          responseCallback: sinon.stub() 
        },
        useTitleSearch: false
      };
      
      mockItems = [
        { itemID: 1, getField: sinon.stub().withArgs('title').returns('Title 1'), isFeedItem: false },
        { itemID: 2, getField: sinon.stub().withArgs('title').returns('Title 2'), isFeedItem: false },
        { itemID: 3, getField: sinon.stub().withArgs('title').returns('Title 3'), isFeedItem: true }, // Feed item
      ];
    });

    afterEach(function() {
      global.Zotero.ProgressWindow.restore();
      global.ZoteroCitationCounts._retrieveCitationCount.restore();
      global.ZoteroCitationCounts._setCitationCount.restore();
    });

    it('updateItems should filter out feed items and initialize progress window', async function() {
      await global.ZoteroCitationCounts.updateItems(mockItems, mockApi);

      expect(global.Zotero.ProgressWindow.calledOnce).to.be.true;
      expect(mockProgressWindow.changeHeadline.calledOnce).to.be.true;
      // Two non-feed items
      expect(mockProgressWindow.ItemProgress.callCount).to.equal(2); 
      expect(mockProgressWindow.show.calledOnce).to.be.true;
      // Check that _updateItem was called, starting with index 0 for non-feed items
      expect(global.ZoteroCitationCounts._retrieveCitationCount.called).to.be.true; // Indirectly checks if _updateItem was run
    });
    
    it('updateItems should not proceed if no valid items are found', async function() {
      const feedItemsOnly = [{ isFeedItem: true }, { isFeedItem: true }];
      await global.ZoteroCitationCounts.updateItems(feedItemsOnly, mockApi);
      expect(global.Zotero.ProgressWindow.called).to.be.false;
    });

    it('_updateItem should process items successfully', async function() {
      const itemsToProcess = [mockItems[0], mockItems[1]];
      global.ZoteroCitationCounts._retrieveCitationCount.resolves([10, 'TestAPI/DOI']);

      // Directly call _updateItem to test its recursive logic
      // Need to manually create the progressWindowItems for the direct call
      const pwItems = itemsToProcess.map(() => new mockProgressWindow.ItemProgress());
      
      await global.ZoteroCitationCounts._updateItem(0, itemsToProcess, mockApi, mockProgressWindow, pwItems);

      expect(global.ZoteroCitationCounts._retrieveCitationCount.callCount).to.equal(2);
      expect(global.ZoteroCitationCounts._setCitationCount.callCount).to.equal(2);
      expect(pwItems[0].setIcon.calledWith(global.ZoteroCitationCounts.icon("tick"))).to.be.true;
      expect(pwItems[1].setIcon.calledWith(global.ZoteroCitationCounts.icon("tick"))).to.be.true;
      expect(mockProgressWindow.changeHeadline.calledWith('citationcounts-progresswindow-finished-headline')).to.be.true;
      expect(mockProgressWindow.startCloseTimer.calledOnce).to.be.true;
    });
    
    it('_updateItem should handle errors during citation retrieval', async function() {
      const itemsToProcess = [mockItems[0], mockItems[1]];
      global.ZoteroCitationCounts._retrieveCitationCount
        .onFirstCall().resolves([20, 'TestAPI/DOI'])
        .onSecondCall().rejects(new Error('citationcounts-progresswindow-error-no-doi')); // Simulate error for the second item

      const pwItems = itemsToProcess.map(() => new mockProgressWindow.ItemProgress());

      await global.ZoteroCitationCounts._updateItem(0, itemsToProcess, mockApi, mockProgressWindow, pwItems);

      expect(global.ZoteroCitationCounts._retrieveCitationCount.callCount).to.equal(2);
      expect(global.ZoteroCitationCounts._setCitationCount.callCount).to.equal(1); // Only for the first item
      expect(pwItems[0].setIcon.calledWith(global.ZoteroCitationCounts.icon("tick"))).to.be.true;
      expect(pwItems[1].setError.calledOnce).to.be.true;
      // Check that a new ItemProgress was created for the error message
      expect(mockProgressWindow.ItemProgress.callCount).to.equal(itemsToProcess.length + 1); // 2 initial + 1 for error message
      expect(mockProgressWindow.changeHeadline.calledWith('citationcounts-progresswindow-finished-headline')).to.be.true;
    });
  });

  describe('_nasaadsUrl', function() {
    it('should construct the correct URL with API key for DOI', function() {
      global.Zotero.Prefs.get.withArgs('extensions.citationcounts.nasaadsApiKey', true).returns('TEST_API_KEY');
      
      const id = '10.1000/xyz123';
      const type = 'doi';
      const actualUrl = global.ZoteroCitationCounts._nasaadsUrl(id, type);
      const expectedUrl = `https://api.adsabs.harvard.edu/v1/search/query?q=doi:${id}&fl=citation_count`;
      expect(actualUrl).to.equal(expectedUrl);
    });

    it('should construct the correct URL with API key for arXiv', function() {
      global.Zotero.Prefs.get.withArgs('extensions.citationcounts.nasaadsApiKey', true).returns('TEST_API_KEY_ARXIV');
      
      const id = '2303.12345';
      const type = 'arxiv';
      const actualUrl = global.ZoteroCitationCounts._nasaadsUrl(id, type);
      const expectedUrl = `https://api.adsabs.harvard.edu/v1/search/query?q=arxiv:${id}&fl=citation_count`;
      expect(actualUrl).to.equal(expectedUrl);
    });

    it('should use an empty string if API key is not set', function() {
      global.Zotero.Prefs.get.withArgs('extensions.citationcounts.nasaadsApiKey', true).returns('');
      
      const id = '10.1000/abc789';
      const type = 'doi';
      const actualUrl = global.ZoteroCitationCounts._nasaadsUrl(id, type);
      const expectedUrl = `https://api.adsabs.harvard.edu/v1/search/query?q=doi:${id}&fl=citation_count`;
      expect(actualUrl).to.equal(expectedUrl);
    });
  });

  describe('_semanticScholarUrl', function() {
    it('should construct the correct URL for DOI lookup', function() {
      const id = '10.1000/xyz123';
      const type = 'doi';
      const actualUrl = global.ZoteroCitationCounts._semanticScholarUrl(id, type);
      const expectedUrl = `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(id)}?fields=citationCount`;
      expect(actualUrl).to.equal(expectedUrl);
    });

    it('should construct the correct URL for arXiv lookup', function() {
      const id = '2303.12345';
      const type = 'arxiv';
      const actualUrl = global.ZoteroCitationCounts._semanticScholarUrl(id, type);
      const expectedUrl = `https://api.semanticscholar.org/graph/v1/paper/arXiv:${encodeURIComponent(id)}?fields=citationCount`;
      expect(actualUrl).to.equal(expectedUrl);
    });

    it('should construct the correct URL for title/author/year search with all fields', function() {
      const metadata = {
        title: "A Test Paper",
        author: "Doe, J.", // Assuming author might have comma, should be encoded
        year: "2023"
      };
      const type = 'title_author_year';
      const actualUrl = global.ZoteroCitationCounts._semanticScholarUrl(metadata, type);
      const expectedQuery = `title:${encodeURIComponent(metadata.title)}+author:${encodeURIComponent(metadata.author)}+year:${encodeURIComponent(metadata.year)}`;
      const expectedUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${expectedQuery}&fields=citationCount,externalIds`;
      expect(actualUrl).to.equal(expectedUrl);
    });

    it('should construct the correct URL for title/author/year search with title and author only', function() {
      const metadata = {
        title: "Another Test Paper",
        author: "Smith"
      };
      const type = 'title_author_year';
      const actualUrl = global.ZoteroCitationCounts._semanticScholarUrl(metadata, type);
      const expectedQuery = `title:${encodeURIComponent(metadata.title)}+author:${encodeURIComponent(metadata.author)}`;
      const expectedUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${expectedQuery}&fields=citationCount,externalIds`;
      expect(actualUrl).to.equal(expectedUrl);
    });

    it('should construct the correct URL for title/author/year search with title and year only', function() {
      const metadata = {
        title: "A Third Test Paper",
        year: "2021"
      };
      const type = 'title_author_year';
      const actualUrl = global.ZoteroCitationCounts._semanticScholarUrl(metadata, type);
      const expectedQuery = `title:${encodeURIComponent(metadata.title)}+year:${encodeURIComponent(metadata.year)}`;
      const expectedUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${expectedQuery}&fields=citationCount,externalIds`;
      expect(actualUrl).to.equal(expectedUrl);
    });

    it('should construct the correct URL for title/author/year search with title only', function() {
      const metadata = {
        title: "Title Only Paper"
      };
      const type = 'title_author_year';
      const actualUrl = global.ZoteroCitationCounts._semanticScholarUrl(metadata, type);
      const expectedQuery = `title:${encodeURIComponent(metadata.title)}`;
      const expectedUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${expectedQuery}&fields=citationCount,externalIds`;
      expect(actualUrl).to.equal(expectedUrl);
    });
  });

  describe('_semanticScholarCallback', function() {
    let clock;

    beforeEach(function() {
      // Use fake timers to control setTimeout for throttling tests
      clock = sinon.useFakeTimers();
    });

    afterEach(function() {
      clock.restore();
    });

    it('should return citationCount for direct DOI/ArXiv lookup response', async function() {
      const mockResponse = {
        paperId: "abcdef123456",
        citationCount: 123
      };
      const promise = global.ZoteroCitationCounts._semanticScholarCallback(mockResponse);
      await clock.tickAsync(3001);
      const count = await promise;
      expect(count).to.equal(123);
    });

    it('should return citationCount from the first result for title search response', async function() {
      const mockResponse = {
        total: 1,
        data: [
          { paperId: "zyxwvu987654", citationCount: 42, externalIds: {} }
        ]
      };
      const promise = global.ZoteroCitationCounts._semanticScholarCallback(mockResponse);
      await clock.tickAsync(3001);
      const count = await promise;
      expect(count).to.equal(42);
    });

    it('should log and use first result if title search returns multiple results', async function() {
      const mockResponse = {
        total: 2,
        data: [
          { paperId: "zyxwvu987654", citationCount: 77 },
          { paperId: "abcdef123456", citationCount: 88 }
        ]
      };
      const promise = global.ZoteroCitationCounts._semanticScholarCallback(mockResponse);
      await clock.tickAsync(3001);
      await promise;
      expect(global.Zotero.debug.calledWith(sinon.match(/Semantic Scholar query returned 2 results. Using the first one./))).to.be.true;
    });
    
    it('should return null if direct lookup response has no citationCount', async function() {
        const mockResponse = { paperId: "abcdef123456" }; // Missing citationCount
        const promise = global.ZoteroCitationCounts._semanticScholarCallback(mockResponse);
        await clock.tickAsync(3001);
        const count = await promise;
        expect(count).to.be.null;
        expect(global.Zotero.debug.calledWith(sinon.match(/Semantic Scholar response did not contain expected citationCount/))).to.be.true;
    });

    it('should return null if title search response is empty', async function() {
      const mockResponse = { total: 0, data: [] };
      const promise = global.ZoteroCitationCounts._semanticScholarCallback(mockResponse);
      await clock.tickAsync(3001);
      const count = await promise;
      expect(count).to.be.null;
      expect(global.Zotero.debug.calledWith(sinon.match(/Semantic Scholar search response did not contain expected citationCount in the first result or no results found/))).to.be.true;
    });

    it('should return null if title search first result has no citationCount', async function() {
      const mockResponse = {
        total: 1,
        data: [{ paperId: "zyxwvu987654" }] // Missing citationCount
      };
      const promise = global.ZoteroCitationCounts._semanticScholarCallback(mockResponse);
      await clock.tickAsync(3001);
      const count = await promise;
      expect(count).to.be.null;
      expect(global.Zotero.debug.calledWith(sinon.match(/Semantic Scholar search response did not contain expected citationCount in the first result or no results found/))).to.be.true;
    });
    
    it('should apply a 3-second throttle', async function() {
      const mockResponse = { citationCount: 10 };
      const callbackPromise = global.ZoteroCitationCounts._semanticScholarCallback(mockResponse);
      
      // Check that it's not resolved immediately
      let resolved = false;
      callbackPromise.then(() => resolved = true);

      await clock.tickAsync(2999); // Advance time by just under 3 seconds
      expect(resolved).to.be.false;

      await clock.tickAsync(1); // Advance time by 1ms to cross the 3000ms threshold
      expect(resolved).to.be.true; // Now it should be resolved
      
      const count = await callbackPromise;
      expect(count).to.equal(10);
    });
  });
  
  describe('getPref', function() {
    it('should call Zotero.Prefs.get with the correct preference key', function() {
      // The ZoteroCitationCounts object is globally available.
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
    const nasaAdsUrl = 'https://api.adsabs.harvard.edu/v1/search/query?q=doi:anything&api_key=SOMEKEY';
    const otherApiUrl = 'https://api.anotherexample.com/data';
    let mockCallback;

    beforeEach(function() {
      mockCallback = sinon.stub();
    });

    it('should throw nasaads-apikey error for NASA ADS 401 response', async function() {
      global.fetch.resolves({
        ok: false,
        status: 401,
        url: nasaAdsUrl 
      });

      let actualError = null;
      try {
        await global.ZoteroCitationCounts._sendRequest(nasaAdsUrl, mockCallback);
      } catch (e) {
        actualError = e;
      }
      expect(actualError).to.be.an('Error');
      expect(actualError.message).to.equal('citationcounts-progresswindow-error-nasaads-apikey');
      expect(global.Zotero.debug.calledWith(sinon.match(/NASA ADS API key error/))).to.be.true;
    });

    it('should throw nasaads-apikey error for NASA ADS 403 response', async function() {
      global.fetch.resolves({
        ok: false,
        status: 403,
        url: nasaAdsUrl
      });

      let actualError = null;
      try {
        await global.ZoteroCitationCounts._sendRequest(nasaAdsUrl, mockCallback);
      } catch (e) {
        actualError = e;
      }
      expect(actualError).to.be.an('Error');
      expect(actualError.message).to.equal('citationcounts-progresswindow-error-nasaads-apikey');
      expect(global.Zotero.debug.calledWith(sinon.match(/NASA ADS API key error/))).to.be.true;
    });

    it('should throw bad-api-response error for other NASA ADS errors (e.g., 500)', async function() {
      global.fetch.resolves({
        ok: false,
        status: 500,
        url: nasaAdsUrl
      });

      let actualError = null;
      try {
        await global.ZoteroCitationCounts._sendRequest(nasaAdsUrl, mockCallback);
      } catch (e) {
        actualError = e;
      }
      expect(actualError).to.be.an('Error');
      expect(actualError.message).to.equal('citationcounts-progresswindow-error-bad-api-response');
      expect(global.Zotero.debug.calledWith(sinon.match(/Bad API response for/))).to.be.true;
    });

    it('should throw bad-api-response error for non-NASA ADS API errors (e.g., 404)', async function() {
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
      expect(global.Zotero.debug.calledWith(sinon.match(/Bad API response for/))).to.be.true;
    });

    it('should throw bad-api-response error for network failures', async function() {
      global.fetch.rejects(new Error('Network failure'));

      let actualError = null;
      try {
        await global.ZoteroCitationCounts._sendRequest(otherApiUrl, mockCallback);
      } catch (e) {
        actualError = e;
      }
      expect(actualError).to.be.an('Error');
      expect(actualError.message).to.equal('citationcounts-progresswindow-error-bad-api-response');
      expect(global.Zotero.debug.calledWith(sinon.match(/Network error fetching/))).to.be.true;
    });

    it('should return count for successful response and valid count', async function() {
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
    });

    it('should throw no-citation-count error for successful response but invalid count (string)', async function() {
      const mockResponseData = { some_count_field: "not-a-number" };
      global.fetch.resolves({
        ok: true,
        status: 200,
        json: sinon.stub().resolves(mockResponseData)
      });
      mockCallback.returns(mockResponseData.some_count_field);

      let actualError = null;
      try {
        await global.ZoteroCitationCounts._sendRequest(otherApiUrl, mockCallback);
      } catch (e) {
        actualError = e;
      }
      expect(actualError).to.be.an('Error');
      expect(actualError.message).to.equal('citationcounts-progresswindow-error-no-citation-count');
      expect(global.Zotero.debug.calledWith(sinon.match(/Error processing API response/))).to.be.true;
    });
    
    it('should throw no-citation-count error for successful response but invalid count (negative)', async function() {
      const mockResponseData = { some_count_field: -5 };
      global.fetch.resolves({
        ok: true,
        status: 200,
        json: sinon.stub().resolves(mockResponseData)
      });
      mockCallback.returns(mockResponseData.some_count_field);

      let actualError = null;
      try {
        await global.ZoteroCitationCounts._sendRequest(otherApiUrl, mockCallback);
      } catch (e) {
        actualError = e;
            }
            expect(actualError).to.be.an('Error');
            expect(actualError.message).to.equal('citationcounts-progresswindow-error-no-citation-count');
          });


    it('should throw no-citation-count error for successful response but malformed JSON', async function() {
      global.fetch.resolves({
        ok: true,
        status: 200,
        json: sinon.stub().rejects(new Error('JSON.parse: unexpected character at line 1 column 1 of the JSON data'))
      });

      let actualError = null;
      try {
        await global.ZoteroCitationCounts._sendRequest(otherApiUrl, mockCallback);
      } catch (e) {
        actualError = e;
            }
            expect(actualError).to.be.an('Error');
            expect(actualError.message).to.equal('citationcounts-progresswindow-error-no-citation-count');
            expect(global.Zotero.debug.calledWith(sinon.match(/Error processing API response/))).to.be.true;
          });

          it('should send Authorization header for NASA ADS requests', async function() {
            // Arrange
            global.Zotero.Prefs.get.withArgs('extensions.citationcounts.nasaadsApiKey', true).returns('MY_NASA_KEY');
            const nasaUrl = 'https://api.adsabs.harvard.edu/v1/search/query?q=doi:10.1000/xyz123&fl=citation_count';
            const mockResponseData = { response: { docs: [{ citation_count: 42 }] } };
            global.fetch.resolves({
        ok: true,
        status: 200,
        json: sinon.stub().resolves(mockResponseData)
            });
            const callback = sinon.stub().returns(42);

            // Act
            await global.ZoteroCitationCounts._sendRequest(nasaUrl, callback);

            // Assert
            expect(global.fetch.calledOnce).to.be.true;
            const fetchArgs = global.fetch.getCall(0).args;
            expect(fetchArgs[0]).to.equal(nasaUrl);
            expect(fetchArgs[1]).to.have.property('headers');
            expect(fetchArgs[1].headers).to.have.property('Authorization', 'Bearer MY_NASA_KEY');
          });

          it('should not send Authorization header for non-NASA ADS requests', async function() {
            const url = 'https://api.crossref.org/works/10.1000/xyz123';
            const mockResponseData = { "is-referenced-by-count": 5 };
            global.fetch.resolves({
        ok: true,
        status: 200,
        json: sinon.stub().resolves(mockResponseData)
            });
            const callback = sinon.stub().returns(5);

            await global.ZoteroCitationCounts._sendRequest(url, callback);

            expect(global.fetch.calledOnce).to.be.true;
            const fetchArgs = global.fetch.getCall(0).args;
            expect(fetchArgs[0]).to.equal(url);
            expect(fetchArgs[1]).to.have.property('headers');
            expect(fetchArgs[1].headers).to.deep.equal({});
          });

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

describe('_inspireUrl', function() {
  it('should construct the correct URL for INSPIRE-HEP API with DOI', function() {
    const id = '10.1000/xyz123';
    const actualUrl = global.ZoteroCitationCounts._inspireUrl(id, 'doi');
    const expectedUrl = `https://inspirehep.net/api/doi/${id}`;
    expect(actualUrl).to.equal(expectedUrl);
  });

  it('should construct the correct URL for INSPIRE-HEP API with arXiv ID', function() {
    const id = '2303.12345';
    const actualUrl = global.ZoteroCitationCounts._inspireUrl(id, 'arxiv');
    const expectedUrl = `https://inspirehep.net/api/arxiv/${id}`;
    expect(actualUrl).to.equal(expectedUrl);
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

describe('_inspireUrl', function() {
  it('should construct the correct URL for INSPIRE-HEP API with DOI', function() {
    const id = '10.1000/xyz123';
    const actualUrl = global.ZoteroCitationCounts._inspireUrl(id, 'doi');
    const expectedUrl = `https://inspirehep.net/api/doi/${id}`;
    expect(actualUrl).to.equal(expectedUrl);
  });

  it('should construct the correct URL for INSPIRE-HEP API with arXiv ID', function() {
    const id = '2303.12345';
    const actualUrl = global.ZoteroCitationCounts._inspireUrl(id, 'arxiv');
    const expectedUrl = `https://inspirehep.net/api/arxiv/${id}`;
    expect(actualUrl).to.equal(expectedUrl);
  });
});

describe('_semanticScholarUrl', function() {
  it('should construct the correct URL for DOI lookup', function() {
    const id = '10.1000/xyz123';
    const type = 'doi';
    const actualUrl = global.ZoteroCitationCounts._semanticScholarUrl(id, type);
    const expectedUrl = `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(id)}?fields=citationCount`;
    expect(actualUrl).to.equal(expectedUrl);
  });

  it('should construct the correct URL for arXiv lookup', function() {
    const id = '2303.12345';
    const type = 'arxiv';
    const actualUrl = global.ZoteroCitationCounts._semanticScholarUrl(id, type);
    const expectedUrl = `https://api.semanticscholar.org/graph/v1/paper/arXiv:${encodeURIComponent(id)}?fields=citationCount`;
    expect(actualUrl).to.equal(expectedUrl);
  });

  it('should construct the correct URL for title/author/year search with all fields', function() {
    const metadata = {
      title: "A Test Paper",
      author: "Doe, J.", // Assuming author might have comma, should be encoded
      year: "2023"
    };
    const type = 'title_author_year';
    const actualUrl = global.ZoteroCitationCounts._semanticScholarUrl(metadata, type);
    const expectedQuery = `title:${encodeURIComponent(metadata.title)}+author:${encodeURIComponent(metadata.author)}+year:${encodeURIComponent(metadata.year)}`;
    const expectedUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${expectedQuery}&fields=citationCount,externalIds`;
    expect(actualUrl).to.equal(expectedUrl);
  });

  it('should construct the correct URL for title/author/year search with title and author only', function() {
    const metadata = {
      title: "Another Test Paper",
      author: "Smith"
    };
    const type = 'title_author_year';
    const actualUrl = global.ZoteroCitationCounts._semanticScholarUrl(metadata, type);
    const expectedQuery = `title:${encodeURIComponent(metadata.title)}+author:${encodeURIComponent(metadata.author)}`;
    const expectedUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${expectedQuery}&fields=citationCount,externalIds`;
    expect(actualUrl).to.equal(expectedUrl);
  });

  it('should construct the correct URL for title/author/year search with title and year only', function() {
    const metadata = {
      title: "A Third Test Paper",
      year: "2021"
    };
    const type = 'title_author_year';
    const actualUrl = global.ZoteroCitationCounts._semanticScholarUrl(metadata, type);
    const expectedQuery = `title:${encodeURIComponent(metadata.title)}+year:${encodeURIComponent(metadata.year)}`;
    const expectedUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${expectedQuery}&fields=citationCount,externalIds`;
    expect(actualUrl).to.equal(expectedUrl);
  });

  it('should construct the correct URL for title/author/year search with title only', function() {
    const metadata = {
      title: "Title Only Paper"
    };
    const type = 'title_author_year';
    const actualUrl = global.ZoteroCitationCounts._semanticScholarUrl(metadata, type);
    const expectedQuery = `title:${encodeURIComponent(metadata.title)}`;
    const expectedUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${expectedQuery}&fields=citationCount,externalIds`;
    expect(actualUrl).to.equal(expectedUrl);
  });
});

describe('_nasaadsUrl', function() {
  it('should construct the correct URL with API key for DOI', function() {
    global.Zotero.Prefs.get.withArgs('extensions.citationcounts.nasaadsApiKey', true).returns('TEST_API_KEY');
    
    const id = '10.1000/xyz123';
    const type = 'doi';
    const actualUrl = global.ZoteroCitationCounts._nasaadsUrl(id, type);
    const expectedUrl = `https://api.adsabs.harvard.edu/v1/search/query?q=doi:${id}&fl=citation_count`;
    expect(actualUrl).to.equal(expectedUrl);
  });

  it('should construct the correct URL with API key for arXiv', function() {
    global.Zotero.Prefs.get.withArgs('extensions.citationcounts.nasaadsApiKey', true).returns('TEST_API_KEY_ARXIV');
    
    const id = '2303.12345';
    const type = 'arxiv';
    const actualUrl = global.ZoteroCitationCounts._nasaadsUrl(id, type);
    const expectedUrl = `https://api.adsabs.harvard.edu/v1/search/query?q=arxiv:${id}&fl=citation_count`;
    expect(actualUrl).to.equal(expectedUrl);
  });

  it('should use an empty string if API key is not set', function() {
    global.Zotero.Prefs.get.withArgs('extensions.citationcounts.nasaadsApiKey', true).returns('');
    
    const id = '10.1000/abc789';
    const type = 'doi';
    const actualUrl = global.ZoteroCitationCounts._nasaadsUrl(id, type);
    const expectedUrl = `https://api.adsabs.harvard.edu/v1/search/query?q=doi:${id}&fl=citation_count`;
    expect(actualUrl).to.equal(expectedUrl);
  });
});
