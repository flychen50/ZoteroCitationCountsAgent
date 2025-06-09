# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Building and Testing
```bash
# Build the Zotero extension (.xpi file)
npm run build

# Run unit tests with coverage (80% threshold required)
npm run test:unit

# Run integration tests for API functionality
npm run test:integration

# Run all tests
npm run test

# Alternative build using shell script
./bin/build
```

### Testing Framework
- **Unit tests**: Mocha + Chai + Sinon with NYC coverage
- **Integration tests**: API-specific testing for each citation service
- **Mocking**: Comprehensive Zotero API mocking in unit tests

## Project Architecture

This is a Zotero 7 plugin that fetches citation counts from academic APIs. The architecture follows Zotero's extension patterns:

### Core Components
- **`bootstrap.js`**: Extension entry point handling initialization and shutdown
- **`src/zoterocitationcounts.js`**: Main plugin logic with 4 citation service integrations (Crossref, INSPIRE-HEP, Semantic Scholar, NASA ADS)
- **`manifest.json`**: Zotero extension manifest for plugin metadata
- **`preferences.xhtml`**: XUL-based preferences interface

### Citation Service Integration
Each API supports different lookup methods:
- **Crossref**: DOI only
- **INSPIRE-HEP**: DOI and arXiv ID
- **Semantic Scholar**: DOI, arXiv, and title search
- **NASA ADS**: DOI, arXiv (requires API key)

### Key Architectural Patterns
- **Bootstrap Pattern**: Follows Zotero 7's recommended extension structure
- **Service Registration**: Registers custom columns, preference panes, and observers
- **XUL UI Injection**: Adds menu items to Zotero's interface
- **Fluent Localization**: Uses `locale/en-US/citation-counts.ftl` for all UI text
- **Async API Handling**: Modern async/await with rate limiting and error prioritization

### Data Flow
1. Auto-retrieval monitors new library items or manual selection via context menu
2. Citation counts stored in item's "extra" field with structured format
3. Progress windows provide real-time feedback with detailed error handling
4. Custom column integration for sortable citation display

### Error Handling Strategy
- Hierarchical error prioritization (network/API errors over missing data)
- Fallback mechanisms: DOI → arXiv → Title search progression
- User-friendly error messages through Fluent localization

## Extension Development Notes

### Adding New Citation APIs
Follow the established pattern in `src/zoterocitationcounts.js`:
1. Add API configuration to service definitions
2. Implement URL building and response parsing functions
3. Add corresponding integration tests in `test/integration/`

### Zotero Integration Points
- Custom column registration for citation display
- Context menu injection for manual retrieval
- Preference system integration using Zotero's APIs
- Item monitoring through Zotero's notification system