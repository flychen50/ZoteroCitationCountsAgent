## For the custom column that the plugin registers
citationcounts-column-title = Citation count

## For the "Item" contextmenu, where citation counts can be manually retrieved for the selected items.
citationcounts-itemmenu-retrieve-title =
    .label = Get citation count
citationcounts-itemmenu-retrieve-api =
    .label = Get { $api } citation count

## For the ProgressWindow, showing citation counts retrieval operation status
citationcounts-progresswindow-headline = Getting { $api } citation counts.
citationcounts-progresswindow-finished-headline = Finished getting { $api } citation counts.
citationcounts-progresswindow-error-no-doi = No DOI field exists on the item.
citationcounts-progresswindow-error-no-arxiv = No arXiv id found on the item.
citationcounts-progresswindow-error-no-doi-or-arxiv = No DOI / arXiv ID found on the item.
citationcounts-progresswindow-error-bad-api-response = Received an unexpected response from { $api }. The API might be down or there could be an issue with the request format.
citationcounts-progresswindow-error-nasaads-apikey = NASA ADS API Key error. Please check your key in preferences or visit the NASA ADS website for more information. It's also possible you've hit an API rate limit.
citationcounts-progresswindow-error-no-citation-count = { $api } doesn't have a citation count for this item.
citationcounts-progresswindow-error-api-not-found = The { $api } could not find this item. Please check the item's details (e.g., DOI, arXiv ID) or the item may not be indexed by this service.
citationcounts-progresswindow-error-api-rate-limit = You've made too many requests to { $api } in a short period. Please try again later.
citationcounts-progresswindow-error-api-server-error = The { $api } is currently experiencing technical difficulties or is temporarily unavailable. Please try again later.
citationcounts-progresswindow-error-network-issue = A network problem occurred while trying to reach { $api }. Please check your internet connection and try again.
citationcounts-progresswindow-error-api-bad-request = There was an issue with the request sent to { $api }. This might be an internal plugin error. If the problem persists, please consider reporting it.
citationcounts-progresswindow-error-unknown = An unknown error occurred while trying to get citations from { $api }.
citationcounts-progresswindow-error-insufficient-metadata-for-title-search = Not enough information (title, author, year) on the item to perform a title-based search with { $api }.
citationcounts-progresswindow-error-no-results-all-attempts = { $api } could not find any results for this item using any available method (DOI, arXiv, Title).
citationcounts-progresswindow-error-nasaads-no-results = NASA ADS could not find any results for this item. Please check the item's metadata or try searching directly on the NASA ADS website.

## For the "Tools" menu, where the "autoretrieve" preference can be set.
citationcounts-menutools-autoretrieve-title =
    .label = Get citation counts for new items?
citationcounts-menutools-autoretrieve-api =
    .label = { $api }
citationcounts-menutools-autoretrieve-api-none =
    .label = No

## For the plugins "Preferences" pane.
citationcounts-preference-pane-label = Citation Counts
citationcounts-preferences-pane-autoretrieve-title = Get citation counts for new items?
citationcounts-preferences-pane-autoretrieve-api =
    .label = { $api }
citationcounts-preferences-pane-autoretrieve-api-none =
    .label = No
citationcounts-preferences-pane-nasaads-api-key-label = NASA ADS API Key

## Misc
citationcounts-internal-error = Internal error
citationcounts-internal-error-no-retrieval-methods = Internal plugin error: No lookup method (DOI, arXiv, Title) was enabled for { $api }. Please check plugin configuration or report this issue.
