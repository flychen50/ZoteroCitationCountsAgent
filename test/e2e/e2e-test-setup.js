/**
 * End-to-End Test Setup for Zotero Citation Counts Plugin
 * 
 * This module provides infrastructure for E2E testing of the complete
 * plugin workflow within a simulated Zotero environment.
 */

const { expect } = require('chai');
const sinon = require('sinon');

/**
 * Creates a comprehensive Zotero environment simulation for E2E testing
 */
class ZoteroE2ETestHarness {
  constructor() {
    this.mockWindows = [];
    this.mockItems = [];
    this.mockPreferences = new Map();
    this.mockProgressWindows = [];
    this.fetchStub = null;
  }

  /**
   * Initialize the full Zotero environment with all required APIs
   */
  setup() {
    // Mock Zotero global
    global.Zotero = {
      debug: sinon.stub(),
      hiDPI: false,
      Prefs: {
        get: sinon.stub().callsFake((key, global) => {
          return this.mockPreferences.get(key) || null;
        }),
        set: sinon.stub().callsFake((key, value, global) => {
          this.mockPreferences.set(key, value);
          return true;
        })
      },
      ProgressWindow: sinon.stub().callsFake(() => {
        const mockProgressWindow = this.createMockProgressWindow();
        this.mockProgressWindows.push(mockProgressWindow);
        return mockProgressWindow;
      }),
      getMainWindows: sinon.stub().returns(this.mockWindows),
      getActiveZoteroPane: sinon.stub().returns({
        getSelectedItems: sinon.stub().returns(this.mockItems)
      }),
      Plugins: {
        Utilities: {
          log: sinon.stub()
        }
      }
    };

    // Mock Localization API
    global.Localization = sinon.stub().returns({
      formatValue: sinon.stub().resolvesArg(0)
    });

    // Mock fetch for API calls
    this.fetchStub = sinon.stub(global, 'fetch');

    // Load the main plugin code
    global.ZoteroCitationCounts = require('../../src/zoterocitationcounts');
    
    // Initialize plugin
    global.ZoteroCitationCounts.init({
      id: 'zotero-citation-counts-e2e-test',
      version: '2.0.0-test',
      rootURI: 'chrome://citationcounts-test/'
    });
  }

  /**
   * Clean up after tests
   */
  teardown() {
    if (this.fetchStub) {
      this.fetchStub.restore();
    }
    sinon.restore();
    delete global.Zotero;
    delete global.Localization;
    delete global.ZoteroCitationCounts;
    this.mockWindows = [];
    this.mockItems = [];
    this.mockPreferences.clear();
    this.mockProgressWindows = [];
  }

  /**
   * Create a mock Zotero window with DOM capabilities
   */
  createMockWindow() {
    const mockDocument = this.createMockDocument();
    const mockWindow = {
      document: mockDocument,
      ZoteroPane: true,
      MozXULElement: {
        insertFTLIfNeeded: sinon.stub()
      }
    };
    this.mockWindows.push(mockWindow);
    return mockWindow;
  }

  /**
   * Create a mock DOM document for XUL element testing
   */
  createMockDocument() {
    const elements = new Map();
    
    const mockDocument = {
      elements: elements,
      createXULElement: sinon.stub().callsFake((tagName) => {
        const element = {
          id: null,
          tagName: tagName,
          attributes: new Map(),
          children: [],
          parent: null,
          addEventListener: sinon.stub(),
          setAttribute: sinon.stub().callsFake((key, value) => {
            element.attributes.set(key, value);
          }),
          getAttribute: sinon.stub().callsFake((key) => {
            return element.attributes.get(key);
          }),
          appendChild: sinon.stub().callsFake((child) => {
            element.children.push(child);
            child.parent = element;
          }),
          remove: sinon.stub().callsFake(() => {
            if (element.parent) {
              const index = element.parent.children.indexOf(element);
              if (index > -1) {
                element.parent.children.splice(index, 1);
              }
            }
            if (element.id) {
              elements.delete(element.id);
            }
          })
        };
        return element;
      }),
      getElementById: sinon.stub().callsFake((id) => {
        return elements.get(id) || null;
      }),
      querySelector: sinon.stub().returns(null)
    };

    // Add standard Zotero menu elements
    const toolsPopup = mockDocument.createXULElement('menupopup');
    toolsPopup.id = 'menu_ToolsPopup';
    elements.set('menu_ToolsPopup', toolsPopup);

    const itemMenu = mockDocument.createXULElement('menupopup');
    itemMenu.id = 'zotero-itemmenu';
    elements.set('zotero-itemmenu', itemMenu);

    return mockDocument;
  }

  /**
   * Create a mock progress window for testing UI feedback
   */
  createMockProgressWindow() {
    const mockProgressWindow = {
      itemProgresses: [],
      headline: '',
      visible: false,
      show: sinon.stub().callsFake(() => {
        mockProgressWindow.visible = true;
      }),
      changeHeadline: sinon.stub().callsFake((text, icon) => {
        mockProgressWindow.headline = text;
        mockProgressWindow.icon = icon;
      }),
      startCloseTimer: sinon.stub().callsFake((timeout) => {
        mockProgressWindow.autoCloseTimeout = timeout;
      }),
      ItemProgress: sinon.stub().callsFake((icon, text, parent) => {
        const itemProgress = {
          icon: icon,
          text: text,
          parent: parent,
          progress: 0,
          error: false,
          setIcon: sinon.stub().callsFake((newIcon) => {
            itemProgress.icon = newIcon;
          }),
          setProgress: sinon.stub().callsFake((percent) => {
            itemProgress.progress = percent;
          }),
          setText: sinon.stub().callsFake((newText) => {
            itemProgress.text = newText;
          }),
          setError: sinon.stub().callsFake(() => {
            itemProgress.error = true;
          })
        };
        mockProgressWindow.itemProgresses.push(itemProgress);
        return itemProgress;
      })
    };
    return mockProgressWindow;
  }

  /**
   * Create a mock Zotero item for testing
   */
  createMockItem(properties = {}) {
    const mockItem = {
      itemID: properties.itemID || Math.floor(Math.random() * 10000),
      itemType: properties.itemType || 'journalArticle',
      fields: new Map(),
      creators: properties.creators || [],
      isFeedItem: false,
      
      getField: sinon.stub().callsFake((field) => {
        return mockItem.fields.get(field) || properties[field] || '';
      }),
      setField: sinon.stub().callsFake((field, value) => {
        mockItem.fields.set(field, value);
      }),
      saveTx: sinon.stub().returns(Promise.resolve()),
      getCreators: sinon.stub().returns(mockItem.creators)
    };

    // Set default fields
    mockItem.fields.set('title', properties.title || 'Test Article Title');
    mockItem.fields.set('DOI', properties.DOI || '');
    mockItem.fields.set('url', properties.url || '');
    mockItem.fields.set('extra', properties.extra || '');
    mockItem.fields.set('year', properties.year || '2024');

    this.mockItems.push(mockItem);
    return mockItem;
  }

  /**
   * Set up API mock responses for different services
   */
  setupAPIMocks() {
    // Crossref mock
    this.fetchStub.withArgs(sinon.match(/api\.crossref\.org/))
      .resolves({
        ok: true,
        json: sinon.stub().resolves({
          'is-referenced-by-count': 42
        })
      });

    // INSPIRE-HEP mock
    this.fetchStub.withArgs(sinon.match(/inspirehep\.net/))
      .resolves({
        ok: true,
        json: sinon.stub().resolves({
          metadata: { citation_count: 15 }
        })
      });

    // Semantic Scholar mock
    this.fetchStub.withArgs(sinon.match(/api\.semanticscholar\.org/))
      .resolves({
        ok: true,
        json: sinon.stub().resolves({
          citationCount: 28
        })
      });

    // NASA ADS mock
    this.fetchStub.withArgs(sinon.match(/api\.adsabs\.harvard\.edu/))
      .resolves({
        ok: true,
        json: sinon.stub().resolves({
          response: {
            numFound: 1,
            docs: [{ citation_count: 35 }]
          }
        })
      });
  }

  /**
   * Set up API error responses for testing error handling
   */
  setupAPIErrors(errorType = 'network') {
    const errorResponse = {
      network: () => this.fetchStub.rejects(new Error('Network error')),
      rate_limit: () => this.fetchStub.resolves({ ok: false, status: 429 }),
      not_found: () => this.fetchStub.resolves({ ok: false, status: 404 }),
      server_error: () => this.fetchStub.resolves({ ok: false, status: 500 }),
      bad_request: () => this.fetchStub.resolves({ ok: false, status: 400 })
    };

    if (errorResponse[errorType]) {
      errorResponse[errorType]();
    }
  }

  /**
   * Set preferences for testing different configurations
   */
  setPreference(key, value) {
    this.mockPreferences.set(`extensions.citationcounts.${key}`, value);
  }

  /**
   * Get the last created progress window for assertions
   */
  getLastProgressWindow() {
    return this.mockProgressWindows[this.mockProgressWindows.length - 1];
  }

  /**
   * Verify UI elements were created correctly
   */
  verifyMenusCreated(window) {
    const document = window.document;
    
    // Check Tools menu was created
    const toolsMenu = document.getElementById('menu_Tools-citationcounts-menu');
    expect(toolsMenu).to.not.be.null;
    expect(toolsMenu.tagName).to.equal('menu');
    
    // Check Item context menu was created
    const itemMenu = document.getElementById('zotero-itemmenu-citationcounts-menu');
    expect(itemMenu).to.not.be.null;
    expect(itemMenu.tagName).to.equal('menu');
    
    return { toolsMenu, itemMenu };
  }

  /**
   * Simulate user clicking a menu item
   */
  simulateMenuClick(menuItemId, window) {
    const menuItem = window.document.getElementById(menuItemId);
    expect(menuItem).to.not.be.null;
    
    // Find and execute the command event listener
    const commandListener = menuItem.addEventListener
      .getCalls()
      .find(call => call.args[0] === 'command');
    
    if (commandListener) {
      commandListener.args[1]();
      return true;
    }
    return false;
  }
}

module.exports = ZoteroE2ETestHarness;