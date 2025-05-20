let ZoteroCitationCountsAgent, itemObserver;

async function startup({ id, version, rootURI }) {
  Services.scriptloader.loadSubScript(rootURI + "src/zoterocitationcountsagent.js");

  ZoteroCitationCountsAgent.init({ id, version, rootURI });
  ZoteroCitationCountsAgent.addToAllWindows();

  Zotero.PreferencePanes.register({
    pluginID: id,
    label: await ZoteroCitationCountsAgent.l10n.formatValue(
      "zoterocitationcountsagent-preference-pane-label"
    ),
    image: ZoteroCitationCountsAgent.icon("edit-list-order", false),
    src: "preferences.xhtml",
    scripts: ["src/preferences.js"],
  });

  await Zotero.ItemTreeManager.registerColumns({
    dataKey: "zoterocitationcountsagent",
    label: await ZoteroCitationCountsAgent.l10n.formatValue(
      "zoterocitationcountsagent-column-title"
    ),
    pluginID: id,
    dataProvider: (item) => ZoteroCitationCountsAgent.getCitationCount(item),
  });

  itemObserver = Zotero.Notifier.registerObserver(
    {
      notify: function (event, type, ids, extraData) {
        if (event == "add") {
          const pref = ZoteroCitationCountsAgent.getPref("autoretrieve");
          if (pref === "none") return;

          const api = ZoteroCitationCountsAgent.APIs.find((api) => api.key === pref);
          if (!api) return;

          ZoteroCitationCountsAgent.updateItems(Zotero.Items.get(ids), api);
        }
      },
    },
    ["item"]
  );
}

function onMainWindowLoad({ window }) {
  ZoteroCitationCountsAgent.addToWindow(window);
}

function onMainWindowUnload({ window }) {
  ZoteroCitationCountsAgent.removeFromWindow(window);
}

function shutdown() {
  ZoteroCitationCountsAgent.removeFromAllWindows();
  Zotero.Notifier.unregisterObserver(itemObserver);
  ZoteroCitationCountsAgent = undefined;
}
