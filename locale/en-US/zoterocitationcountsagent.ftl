## For the custom column that the plugin registers
zoterocitationcountsagent-column-title = Citation count

## For the "Item" contextmenu, where citation counts can be manually retrieved for the selected items.
zoterocitationcountsagent-itemmenu-retrieve-title =
    .label = Get citation count
zoterocitationcountsagent-itemmenu-retrieve-api =
    .label = Get { $api } citation count

## For the ProgressWindow, showing citation counts retrieval operation status
zoterocitationcountsagent-progresswindow-headline = Getting { $api } citation counts.
zoterocitationcountsagent-progresswindow-finished-headline = Finished getting { $api } citation counts.
zoterocitationcountsagent-progresswindow-error-no-doi = No DOI field exists on the item.
zoterocitationcountsagent-progresswindow-error-no-arxiv = No arXiv id found on the item.
zoterocitationcountsagent-progresswindow-error-no-doi-or-arxiv = No DOI / arXiv ID found on the item.
zoterocitationcountsagent-progresswindow-error-bad-api-response = Problem accesing the { $api } API.
zoterocitationcountsagent-progresswindow-error-nasaads-apikey = NASA ADS API Key error. Please check your key in preferences or visit the NASA ADS website for more information. It's also possible you've hit an API rate limit.
zoterocitationcountsagent-progresswindow-error-no-citation-count = { $api } doesn't have a citation count for this item.
# Added based on code changes, ensure these are in the FTL file if used in UI
zoterocitationcountsagent-progresswindow-error-insufficient-metadata-for-title-search = Insufficient metadata (title, author, year) for NASA ADS title search.
zoterocitationcountsagent-progresswindow-error-nasaads-no-results = Could not find citation counts for NASA ADS using DOI, arXiv ID, or Title/Author/Year.
zoterocitationcountsagent-progresswindow-error-unknown = An unknown error occurred while trying to get citation counts.

## For the "Tools" menu, where the "autoretrieve" preference can be set.
zoterocitationcountsagent-menutools-autoretrieve-title =
    .label = Get citation counts for new items?
zoterocitationcountsagent-menutools-autoretrieve-api =
    .label = { $api }
zoterocitationcountsagent-menutools-autoretrieve-api-none =
    .label = No

## For the plugins "Preferences" pane.
zoterocitationcountsagent-preference-pane-label = Citation Counts
zoterocitationcountsagent-preferences-pane-autoretrieve-title = Get citation counts for new items?
zoterocitationcountsagent-preferences-pane-autoretrieve-api =
    .label = { $api }
zoterocitationcountsagent-preferences-pane-autoretrieve-api-none =
    .label = No
zoterocitationcountsagent-preferences-pane-nasaads-api-key-label = NASA ADS API Key

## Misc
zoterocitationcountsagent-internal-error = Internal error
