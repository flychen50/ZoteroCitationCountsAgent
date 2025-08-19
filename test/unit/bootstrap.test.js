const { expect } = require('chai');
const sinon = require('sinon');

// bootstrap.js is not a module, so we need to load it in a specific way
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const bootstrapPath = path.resolve(__dirname, '../../bootstrap.js');
const bootstrapCode = fs.readFileSync(bootstrapPath, 'utf8');
const bootstrapCodeModified = bootstrapCode.replace('let ZoteroCitationCounts, itemObserver;', 'var ZoteroCitationCounts, itemObserver;');

describe('bootstrap.js', function() {
  let context;

  beforeEach(function() {
    // Mock Zotero and other globals
    global.Zotero = {
      PreferencePanes: {
        register: sinon.stub(),
      },
      ItemTreeManager: {
        registerColumns: sinon.stub(),
      },
      Notifier: {
        registerObserver: sinon.stub().returns({}),
        unregisterObserver: sinon.stub(),
      },
      Items: {
        get: sinon.stub().returns([]),
      },
      getMainWindows: sinon.stub().returns([]),
    };

    global.Services = {
      scriptloader: {
        loadSubScript: sinon.stub(),
      },
    };

    // Mock ZoteroCitationCounts which is loaded by bootstrap
    global.ZoteroCitationCounts = {
      init: sinon.stub(),
      addToAllWindows: sinon.stub(),
      addToWindow: sinon.stub(),
      removeFromWindow: sinon.stub(),
      removeFromAllWindows: sinon.stub(),
      getPref: sinon.stub(),
      updateItems: sinon.stub(),
      l10n: {
        formatValue: sinon.stub().resolves(''),
      },
      icon: sinon.stub(),
      APIs: [],
      _log: sinon.stub(),
    };

    // The script runs in a new context to isolate its global variables
    context = {
      Services: global.Services,
      Zotero: global.Zotero,
      ZoteroCitationCounts: global.ZoteroCitationCounts,
      // The script will define these
      startup: undefined,
      shutdown: undefined,
      onMainWindowLoad: undefined,
      onMainWindowUnload: undefined,
      itemObserver: undefined,
    };
    // Execute the script in the context
    vm.runInNewContext(bootstrapCodeModified, context);
  });

  afterEach(function() {
    sinon.restore();
    delete global.Zotero;
    delete global.Services;
    delete global.ZoteroCitationCounts;
  });

  describe('startup', function() {
    it('should initialize ZoteroCitationCounts and register components', async function() {
      const params = { id: 'test-id', version: '1.0', rootURI: 'test-uri/' };
      await context.startup(params);

      // Check that script is loaded
      expect(context.Services.scriptloader.loadSubScript.calledWith('test-uri/src/zoterocitationcounts.js')).to.be.true;

      // Check that ZoteroCitationCounts is initialized
      expect(context.ZoteroCitationCounts.init.calledWith(params)).to.be.true;
      expect(context.ZoteroCitationCounts.addToAllWindows.calledOnce).to.be.true;

      // Check that PreferencePanes, Columns and Observer are registered
      expect(context.Zotero.PreferencePanes.register.calledOnce).to.be.true;
      expect(context.Zotero.ItemTreeManager.registerColumns.calledOnce).to.be.true;
      expect(context.Zotero.Notifier.registerObserver.calledOnce).to.be.true;
    });
  });

  describe('shutdown', function() {
    it('should unregister components and clean up', async function() {
      // Get a reference to the mock before it's destroyed by the shutdown function.
      const mockZoteroCitationCounts = context.ZoteroCitationCounts;

      // Run startup to ensure itemObserver is created and set on the context.
      const startupParams = { id: 'test-id', version: '1.0', rootURI: 'test-uri/' };
      await context.startup(startupParams);

      const observer = context.itemObserver;

      context.shutdown();

      // Assertions
      expect(mockZoteroCitationCounts.removeFromAllWindows.calledOnce).to.be.true;
      expect(context.Zotero.Notifier.unregisterObserver.calledOnce).to.be.true;
      expect(context.Zotero.Notifier.unregisterObserver.calledWith(observer)).to.be.true;
      expect(context.ZoteroCitationCounts).to.be.undefined;
    });
  });

  describe('onMainWindowLoad', function() {
    it('should call addToWindow for the given window', function() {
      const mockWindow = { ZoteroPane: {} };
      context.onMainWindowLoad({ window: mockWindow });
      expect(context.ZoteroCitationCounts.addToWindow.calledWith(mockWindow)).to.be.true;
    });
  });

  describe('onMainWindowUnload', function() {
    it('should call removeFromWindow for the given window', function() {
      const mockWindow = { ZoteroPane: {} };
      context.onMainWindowUnload({ window: mockWindow });
      expect(context.ZoteroCitationCounts.removeFromWindow.calledWith(mockWindow)).to.be.true;
    });
  });

  describe('itemObserver', function() {
    let observer;
    const items = [{ id: 1 }, { id: 2 }];
    const api = { key: 'crossref', name: 'Crossref' };

    beforeEach(async function() {
        // Run startup to register the observer
        await context.startup({ id: 'test', version: '1.0', rootURI: '' });
        // Get the actual observer object created in the script
        observer = context.Zotero.Notifier.registerObserver.getCall(0).args[0];
        // Set up APIs for the observer to find
        context.ZoteroCitationCounts.APIs = [api];
    });

    it('should not do anything if event is not "add"', async function() {
        await observer.notify('modify', 'item', [1, 2]);
        expect(context.ZoteroCitationCounts.getPref.called).to.be.false;
        expect(context.ZoteroCitationCounts.updateItems.called).to.be.false;
    });

    it('should not do anything if autoretrieve preference is "none"', async function() {
        context.ZoteroCitationCounts.getPref.withArgs('autoretrieve').returns('none');
        await observer.notify('add', 'item', [1, 2]);
        expect(context.ZoteroCitationCounts.getPref.calledOnce).to.be.true;
        expect(context.ZoteroCitationCounts.updateItems.called).to.be.false;
    });

    it('should not do anything if the API is not found', async function() {
        context.ZoteroCitationCounts.getPref.withArgs('autoretrieve').returns('nonexistent-api');
        await observer.notify('add', 'item', [1, 2]);
        expect(context.ZoteroCitationCounts.updateItems.called).to.be.false;
    });

    it('should call updateItems if event is "add" and a valid API is set', async function() {
        context.ZoteroCitationCounts.getPref.withArgs('autoretrieve').returns('crossref');
        context.Zotero.Items.get.withArgs([1, 2]).returns(items);

        await observer.notify('add', 'item', [1, 2]);

        expect(context.Zotero.Items.get.calledWith([1, 2])).to.be.true;
        expect(context.ZoteroCitationCounts.updateItems.calledWith(items, api)).to.be.true;
    });

    it('should log an error if updateItems fails', async function() {
        context.ZoteroCitationCounts.getPref.withArgs('autoretrieve').returns('crossref');
        const testError = new Error('Update failed');
        context.ZoteroCitationCounts.updateItems.rejects(testError);

        await observer.notify('add', 'item', [1, 2]);

        expect(context.ZoteroCitationCounts._log.calledWith(`Auto-retrieval error: ${testError.message}`)).to.be.true;
    });
  });
});
