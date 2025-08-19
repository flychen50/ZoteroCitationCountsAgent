# Testing Documentation

This document describes the comprehensive testing strategy for the Zotero Citation Counts plugin.

## Test Structure

The test suite is organized into three levels:

### 1. Unit Tests (`test/unit/`)
- **Purpose**: Test individual functions and methods in isolation
- **Coverage**: 80% threshold required
- **Location**: `test/unit/zoterocitationcounts.test.js`
- **Run**: `npm run test:unit`

**What it tests**:
- Individual function logic (`_getDoi`, `_getArxiv`, `_setCitationCount`, etc.)
- Error handling and validation
- URL building and response parsing
- Preference management
- Input sanitization

### 2. Integration Tests (`test/integration/`)
- **Purpose**: Test interaction with real external APIs
- **Location**: Individual files for each API service
- **Run**: `npm run test:integration`

**Services tested**:
- `crossref.integration.test.js` - Crossref API integration
- `inspirehep.integration.test.js` - INSPIRE-HEP API integration  
- `semanticscholar.integration.test.js` - Semantic Scholar API integration
- `nasaads.integration.test.js` - NASA ADS API integration

### 3. End-to-End Tests (`test/e2e/`)
- **Purpose**: Test complete user workflows and system behavior
- **Location**: Multiple specialized test files
- **Run**: `npm run test:e2e`

**E2E Test Files**:

#### `e2e-test-setup.js`
Central test harness providing:
- Full Zotero environment simulation
- Mock DOM/XUL elements for UI testing
- Progress window mocking
- API response mocking utilities
- Test item and preference management

#### `complete-workflow.e2e.test.js`
Tests complete user workflows:
- Plugin initialization and UI setup
- Menu creation and interaction
- Auto-retrieval preference configuration
- Manual citation retrieval workflows
- Multi-item batch processing
- Error handling and recovery
- Citation count display and parsing
- NASA ADS API key integration
- Localization fallbacks

#### `api-integration.e2e.test.js`
Tests real API integration scenarios:
- All 4 citation APIs end-to-end
- URL building and response parsing
- Rate limiting behavior
- Fallback mechanisms (DOI → arXiv → Title)
- Error prioritization
- Edge cases (malformed responses, null values)
- URL sanitization for logging

#### `issue-detection.test.js`
Systematic issue detection tests:
- Configuration inconsistencies
- Race conditions and timing issues
- Error message consistency
- Memory leaks and cleanup
- Input validation edge cases
- Null/undefined handling
- Localization edge cases
- Response parsing edge cases

#### `test-config.js`
Test configuration utilities:
- Fast testing setup (disable rate limiting)
- Integration testing configuration
- Predictable API mock responses
- Test item generators
- Fix verification utilities

## Key Issues Identified and Fixed

### Issue 1: NASA ADS Configuration Inconsistency ✅ **FIXED**
**Problem**: NASA ADS had complete title search implementation but `useTitleSearch: false`
**Impact**: Title search never attempted for items without DOI/arXiv
**Fix**: Set `useTitleSearch: true` for NASA ADS API configuration

### Issue 2: Rate Limiting Not Configurable ✅ **FIXED**
**Problem**: Semantic Scholar 3-second delay hardcoded, problematic for testing
**Fix**: Made rate limiting configurable via preference `semanticScholarRateLimitMs`

### Issue 3: Input Validation Robustness ✅ **VERIFIED**
**Status**: Already robust - title/author length limiting, null checks, sanitization

### Issue 4: Error Message Consistency ✅ **VERIFIED**
**Status**: Consistent error keys across APIs with proper prioritization

## Running Tests

### All Tests
```bash
npm test
```

### Individual Test Suites
```bash
npm run test:unit        # Unit tests with coverage
npm run test:integration # Integration tests with real APIs  
npm run test:e2e         # End-to-end workflow tests
```

### Single Test Files
```bash
npx mocha test/unit/zoterocitationcounts.test.js
npx mocha test/e2e/complete-workflow.e2e.test.js
npx mocha test/integration/crossref.integration.test.js
```

## Test Configuration

### Fast Testing (E2E)
To run E2E tests quickly without rate limiting:
```javascript
// Tests automatically disable rate limiting via test-config.js
harness.setPreference('semanticScholarRateLimitMs', 0);
```

### Integration Testing with Real APIs
Set NASA ADS API key for full integration testing:
```bash
export NASA_ADS_API_KEY=your_api_key_here
npm run test:integration
```

## CI/CD Integration

Tests run automatically in GitHub Actions:

- **`unit-tests.yml`** - Unit tests with coverage on push/PR
- **`integration-tests.yml`** - Integration tests with real APIs
- **`e2e-tests.yml`** - Complete workflow testing (**NEW**)

## Coverage Requirements

- **Unit Tests**: 80% line/function/branch coverage required
- **Integration Tests**: Verify API compatibility and error handling
- **E2E Tests**: Ensure complete user workflows function correctly

## Test Utilities

### Mock Zotero Environment
The E2E test harness provides comprehensive Zotero API mocking:
```javascript
const harness = new ZoteroE2ETestHarness();
harness.setup();

// Create mock items, windows, API responses
const testItem = harness.createMockItem({ title: 'Test', DOI: '10.1000/test' });
const mockWindow = harness.createMockWindow();
harness.setupAPIMocks();
```

### Predictable Testing
Use `TestConfig.setupPredictableAPIMocks()` for deterministic test results based on input data rather than random API responses.

## Best Practices

1. **Isolation**: Each test should be independent and not affect others
2. **Cleanup**: Use proper setup/teardown to avoid test interference
3. **Mocking**: Mock external dependencies for unit tests, use real APIs for integration
4. **Coverage**: Aim for high coverage but focus on critical paths and edge cases
5. **Performance**: E2E tests use fast configuration by default, integration tests use real timing
6. **Documentation**: Keep this README updated as tests evolve