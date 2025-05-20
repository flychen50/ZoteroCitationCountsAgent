# ZoteroCitationCountsAgent

- [GitHub](https://github.com/FrLars21/ZoteroCitationCountsManager): Source
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
- _NEW:_ The whole codebade has been refactored with a focus on easy maintenance, especially for the supported citation count APIs.

## 项目结构重构说明

本插件已重构目录结构以提升可维护性和可读性：

- `src/` 目录：存放主要 JS 源码文件（`zoterocitationcountsagent.js`, `preferences.js`, `prefs.js`）。
- 根目录：保留 `manifest.json`, `bootstrap.js`, `preferences.xhtml`, `README.md`, `LICENSE` 等配置和文档文件。
- `locale/`、`bin/` 目录结构保持不变。

如需开发或调试主功能，请前往 `src/` 目录。

## Acknowledgements

This plugin (ZoteroCitationCountsAgent) is a refactored and enhanced version of Erik Schnetter's original [Zotero Citations Counts Manager](https://github.com/eschnett/zotero-citationcounts) for Zotero 7. Code for that extension was based on [Zotero DOI Manager](https://github.com/bwiernik/zotero-shortdoi), which is based in part on [Zotero Google Scholar Citations](https://github.com/beloglazov/zotero-scholar-citations) by Anton Beloglazov.
Boilerplate for this plugin was based on Zotero's sample plugin for v7 [Make-It-Red](https://github.com/zotero/make-it-red).

## Installing

- Download the add-on (the .xpi file) from the latest release: https://github.com/FrLars21/ZoteroCitationCountsManager/releases
- To download the .xpi file, right click it and select 'Save link as'
- Run Zotero (version 7.x)
- Go to `Tools -> Add-ons`
- `Install Add-on From File`
- Choose the file `zoterocitationcountsagent-2.0.0.xpi`
- Restart Zotero

## Setting NASA ADS API Key

To use the NASA ADS API, you need to set your API key. Follow these steps:

1. Obtain your API key from [NASA ADS](https://ui.adsabs.harvard.edu/user/settings/token).
2. In Zotero, go to `Tools -> Add-ons -> ZoteroCitationCountsAgent -> Preferences`.
3. Enter your NASA ADS API key in the provided field.

## Using the Build and Release Process

To use the new build and release process, follow these steps:

1. Ensure you have Node.js installed on your machine.
2. Clone the repository: `git clone https://github.com/FrLars21/ZoteroCitationCountsManager.git`
3. Navigate to the project directory: `cd ZoteroCitationCountsManager`
4. Install the dependencies: `npm install`
5. Build the xpi file: `npm run build`
6. The built xpi file will be located in the `dist/` directory.

The GitHub Actions workflow is configured to automatically build and create a release when changes are pushed to the `main` branch or a new release is created. The release will include the source code and the built xpi file.
