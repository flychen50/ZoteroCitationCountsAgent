let ZoteroCitationCounts, itemObserver;

async function startup({ id, version, rootURI }) {
  Services.scriptloader.loadSubScript(rootURI + "src/shared.js");
  Services.scriptloader.loadSubScript(rootURI + "src/zoterocitationcounts.js");

  ZoteroCitationCounts.init({ id, version, rootURI });
  ZoteroCitationCounts.addToAllWindows();

  Zotero.PreferencePanes.register({
    pluginID: id,
    label: await ZoteroCitationCounts.l10n.formatValue(
      "citationcounts-preference-pane-label"
    ),
    image: ZoteroCitationCounts.icon(ZoteroCitationCounts_Shared.CONSTANTS.PREFERENCE_ICON, false),
    src: "preferences.xhtml",
    scripts: ["src/shared.js", "src/preferences.js"],
  });

  await Zotero.ItemTreeManager.registerColumns({
    dataKey: "citationcounts",
    label: await ZoteroCitationCounts.l10n.formatValue(
      "citationcounts-column-title"
    ),
    pluginID: id,
    dataProvider: (item) => ZoteroCitationCounts.getCitationCount(item),
  });

  itemObserver = Zotero.Notifier.registerObserver(
    {
      notify: async function (event, type, ids, extraData) {
        if (event == "add") {
          try {
            const pref = ZoteroCitationCounts.getPref("autoretrieve");
            if (pref === "none") return;

            const api = ZoteroCitationCounts.APIs.find((api) => api.key === pref);
            if (!api) return;

            await ZoteroCitationCounts.updateItems(Zotero.Items.get(ids), api);
          } catch (error) {
            ZoteroCitationCounts._log(`Auto-retrieval error: ${error.message}`);
          }
        }
      },
    },
    ["item"]
  );
}

function onMainWindowLoad({ window }) {
  ZoteroCitationCounts.addToWindow(window);
}

function onMainWindowUnload({ window }) {
  ZoteroCitationCounts.removeFromWindow(window);
}

function shutdown() {
  ZoteroCitationCounts.removeFromAllWindows();
  Zotero.Notifier.unregisterObserver(itemObserver);
  ZoteroCitationCounts = undefined;
}
