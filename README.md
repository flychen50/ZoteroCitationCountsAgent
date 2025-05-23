# Zotero 7 Citation Counts Manager Enhanced

- [GitHub](https://github.com/flychen50/ZoteroCitationCountsAgent): Source
  code repository

This is an add-on for [Zotero](https://www.zotero.org), a research source management tool. The add-on can auto-fetch citation counts for journal articles using various APIs, including [Crossref](https://www.crossref.org), [INSPIRE-HEP](https://inspirehep.net), and [Semantic Scholar](https://www.semanticscholar.org). [Google Scholar](https://scholar.google.com) is not supported because automated access is against its terms of service.

Please report any bugs, questions, or feature requests in the Github repository.

## Features

- Autoretrieve citation counts when a new item is added to your Zotero library.
- Retrieve citation counts manually by right-clicking on one or more items in your Zotero library.
- Works with the following APIs: [Crossref](https://www.crossref.org), [INSPIRE-HEP](https://inspirehep.net), [Semantic Scholar](https://www.semanticscholar.org), and [NASA ADS](https://ui.adsabs.harvard.edu).
- For NASA ADS, if DOI or arXiv ID is missing, attempts to fetch citations using title, author, and year.
- _NEW:_ The plugin is compatible with **Zotero 7** (Zotero 6 is **NOT** supported!).
- _NEW:_ The plugin registers a custom column ("Citation Counts") in your Zotero library so that items can be **ordered by citation count**.
- _NEW:_ Improved _citation count retrieval operation_ status reporting, including item-specific error messages for those items where a citation count couldn't be retrieved.
- _NEW:_ Concurrent citation count retrieval operations is now possible. Especially important for the autoretrieve feature.
- _NEW:_ Fluent is used for localizing, while the locale file has been simplified and now cover the whole plugin. You are welcome to submit translations as a PR.
- _NEW:_ The whole codebase has been refactored with a focus on easy maintenance, especially for the supported citation count APIs.

## Project Structure Refactoring

This plugin's directory structure has been refactored to improve maintainability and readability:

- `src/` directory: Contains the main JS source files (`zoterocitationcounts.js`, `preferences.js`, `prefs.js`).
- Root directory: Retains configuration and documentation files such as `manifest.json`, `bootstrap.js`, `preferences.xhtml`, `README.md`, and `LICENSE`.
- `locale/` and `bin/` directory structures remain unchanged.

If you need to develop or debug the main functions, please go to the `src/` directory.

## Acknowledgements

This plugin is a refactored and enhanced version of Erik Schnetter's [Zotero Citations Counts Manager](https://github.com/eschnett/zotero-citationcounts) for Zotero 7. Code for that extension was based on [Zotero DOI Manager](https://github.com/bwiernik/zotero-shortdoi), which is based in part on [Zotero Google Scholar Citations](https://github.com/beloglazov/zotero-scholar-citations) by Anton Beloglazov.
Boilerplate for this plugin was based on Zotero's sample plugin for v7 [Make-It-Red](https://github.com/zotero/make-it-red).

## Installing

- Download the add-on (the .xpi file) from the latest release: https://github.com/flychen50/ZoteroCitationCountsAgent/releases
- To download the .xpi file, right click it and select 'Save link as'
- Run Zotero (version 7.x)
- Go to `Tools -> Add-ons`
- `Install Add-on From File`
- Choose the file `zoterocitationcountsmanager-2.0.0.xpi`
- Restart Zotero

## Setting NASA ADS API Key

To use the NASA ADS API, you need to set your API key. Follow these steps:

1. Obtain your API key from [NASA ADS](https://ui.adsabs.harvard.edu/user/settings/token).
2. In Zotero, go to `Tools -> Add-ons -> Citation Counts -> Preferences`.
3. Enter your NASA ADS API key in the provided field.

## Using the Build and Release Process

To use the new build and release process, follow these steps:

1. Ensure you have Node.js installed on your machine.
2. Clone the repository: `git clone https://github.com/flychen50/ZoteroCitationCountsAgent.git`
3. Navigate to the project directory: `cd ZoteroCitationCountsAgent`
4. Install the dependencies: `npm install`
5. Build the xpi file: `npm run build`
6. The built xpi file will be located in the `dist/` directory.

The GitHub Actions workflow is configured to automatically build and create a release when changes are pushed to the `main` branch or a new release is created. The release will include the source code and the built xpi file.

## Running Tests

To run the integration tests for Crossref and INSPIRE-HEP, follow these steps:

1. Ensure you have Node.js installed on your machine.
2. Clone the repository: `git clone https://github.com/flychen50/ZoteroCitationCountsAgent.git`
3. Navigate to the project directory: `cd ZoteroCitationCountsAgent`
4. Install the dependencies: `npm install`
5. Run the integration tests: `npm run test:integration`

The integration tests for Crossref and INSPIRE-HEP are located in the `test/integration/crossref.integration.test.js` and `test/integration/inspirehep.integration.test.js` files, respectively.
