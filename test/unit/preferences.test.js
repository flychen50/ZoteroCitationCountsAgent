const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const preferencesScriptPath = path.resolve(__dirname, '../../src/preferences.js');
const preferencesScriptCode = fs.readFileSync(preferencesScriptPath, 'utf8');

describe('preferences.js', function() {
  let context;
  let mockDocument;
  let mockParentElement;

  beforeEach(function() {
    mockParentElement = {
      appendChild: sinon.stub()
    };
    mockDocument = {
      getElementById: sinon.stub().returns(mockParentElement),
      createXULElement: sinon.stub().callsFake(type => ({
        id: '',
        setAttribute: sinon.stub(),
        addEventListener: sinon.stub(),
        _type: type,
      })),
    };

    context = {
      document: mockDocument,
      ZoteroCitationCounts_Prefs: undefined,
    };

    vm.runInNewContext(preferencesScriptCode, context);
  });

  afterEach(function() {
    sinon.restore();
  });

  describe('init', function() {
    it('should create and inject a radio button for each API plus "none"', function() {
      const prefs = context.ZoteroCitationCounts_Prefs;
      const expectedCallCount = prefs.APIs.length + 1;

      prefs.init();

      expect(mockDocument.getElementById.calledWith('citationcounts-preference-pane-autoretrieve-radiogroup')).to.be.true;
      expect(mockDocument.getElementById.callCount).to.equal(expectedCallCount);
      expect(mockDocument.createXULElement.callCount).to.equal(expectedCallCount);
      expect(mockDocument.createXULElement.alwaysCalledWith('radio')).to.be.true;
      expect(mockParentElement.appendChild.callCount).to.equal(expectedCallCount);

      // Check attributes for the first API call (crossref)
      const firstInjectedElement = mockParentElement.appendChild.getCall(0).args[0];
      expect(firstInjectedElement.id).to.equal('citationcounts-preferences-pane-autoretrieve-radio-crossref');
      expect(firstInjectedElement.setAttribute.calledWith('value', 'crossref')).to.be.true;

      // Check attributes for the last call (none)
      const lastInjectedElement = mockParentElement.appendChild.getCall(expectedCallCount - 1).args[0];
      expect(lastInjectedElement.id).to.equal('citationcounts-preferences-pane-autoretrieve-radio-none');
      expect(lastInjectedElement.setAttribute.calledWith('value', 'none')).to.be.true;
    });
  });

  describe('_injectXULElement', function() {
    it('should create an element, set attributes, and append it to the parent', function() {
      const prefs = context.ZoteroCitationCounts_Prefs;
      const mockElement = {
          id: '',
          setAttribute: sinon.stub(),
          addEventListener: sinon.stub()
      };
      mockDocument.createXULElement.returns(mockElement);

      const attributes = { 'data-l10n-id': 'test-id', 'class': 'test-class', 'irrelevant': undefined, 'another': null };
      const listeners = { 'command': () => {}, 'click': () => {} };
      const parentId = 'test-parent';

      prefs._injectXULElement(mockDocument, 'menuitem', 'test-id', attributes, parentId, listeners);

      expect(mockDocument.createXULElement.calledOnceWith('menuitem')).to.be.true;
      expect(mockElement.id).to.equal('test-id');
      // undefined and null values should be filtered out
      expect(mockElement.setAttribute.calledTwice).to.be.true;
      expect(mockElement.setAttribute.calledWith('data-l10n-id', 'test-id')).to.be.true;
      expect(mockElement.setAttribute.calledWith('class', 'test-class')).to.be.true;
      expect(mockElement.addEventListener.calledTwice).to.be.true;
      expect(mockElement.addEventListener.calledWith('command')).to.be.true;
      expect(mockElement.addEventListener.calledWith('click')).to.be.true;
      expect(mockDocument.getElementById.calledOnceWith(parentId)).to.be.true;
      expect(mockParentElement.appendChild.calledOnceWith(mockElement)).to.be.true;
    });
  });
});
