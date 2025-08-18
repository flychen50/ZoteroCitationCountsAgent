ZoteroCitationCounts_Prefs = {
  // Reference shared API registry - TODO resolved
  APIs: ZoteroCitationCounts_Shared.getAllAPIs(),

  init: function () {
    this.APIs.concat({ key: "none" }).forEach((api) => {
      const label =
        api.key === "none"
          ? {
              "data-l10n-id":
                "citationcounts-preferences-pane-autoretrieve-api-none",
            }
          : {
              "data-l10n-id":
                "citationcounts-preferences-pane-autoretrieve-api",
              "data-l10n-args": `{"api": "${api.name}"}`,
            };

      ZoteroCitationCounts_Shared.injectXULElement(
        document,
        "radio",
        `citationcounts-preferences-pane-autoretrieve-radio-${api.key}`,
        {
          ...label,
          value: api.key,
        },
        "citationcounts-preference-pane-autoretrieve-radiogroup"
      );
    });
  },

  // TODO resolved - now using shared XUL injection utility
};
