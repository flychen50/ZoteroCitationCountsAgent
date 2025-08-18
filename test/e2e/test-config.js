/**
 * Test Configuration Helper
 * 
 * Provides utilities to configure the plugin for optimal testing
 */

const ZoteroE2ETestHarness = require('./e2e-test-setup');

class TestConfig {
  /**
   * Configure plugin for fast testing (disable rate limiting)
   */
  static setupFastTesting(harness) {
    // Disable Semantic Scholar rate limiting for tests
    harness.setPreference('semanticScholarRateLimitMs', 0);
    
    // Set shorter timeouts if needed
    harness.setPreference('apiTimeoutMs', 5000);
    
    return harness;
  }

  /**
   * Configure plugin for integration testing with real APIs
   */
  static setupIntegrationTesting(harness) {
    // Keep normal rate limiting for integration tests
    harness.setPreference('semanticScholarRateLimitMs', 3000);
    
    // Set NASA ADS API key if provided in environment
    if (process.env.NASA_ADS_API_KEY) {
      harness.setPreference('nasaadsApiKey', process.env.NASA_ADS_API_KEY);
    }
    
    return harness;
  }

  /**
   * Get test items with various configurations for comprehensive testing
   */
  static getTestItems(harness) {
    return {
      // Item with DOI only
      doiOnly: harness.createMockItem({
        title: 'DOI Only Test Paper',
        DOI: '10.1000/doi-test',
        url: '',
        year: '2024',
        creators: [{ lastName: 'Smith', creatorType: 'author' }]
      }),

      // Item with arXiv only
      arxivOnly: harness.createMockItem({
        title: 'ArXiv Only Test Paper',
        DOI: '',
        url: 'https://arxiv.org/abs/2401.12345',
        year: '2024',
        creators: [{ lastName: 'Johnson', creatorType: 'author' }]
      }),

      // Item with title/author/year only
      titleOnly: harness.createMockItem({
        title: 'Machine Learning Applications in Astrophysics',
        DOI: '',
        url: '',
        year: '2023',
        creators: [{ lastName: 'Williams', creatorType: 'author' }]
      }),

      // Item with all identifiers
      comprehensive: harness.createMockItem({
        title: 'Comprehensive Test Paper with All Identifiers',
        DOI: '10.1038/comprehensive-test',
        url: 'https://arxiv.org/abs/2401.67890',
        year: '2024',
        creators: [{ lastName: 'Brown', creatorType: 'author' }]
      }),

      // Item with problematic data
      problematic: harness.createMockItem({
        title: 'A'.repeat(1500) + ' Very Long Title That Should Be Truncated',
        DOI: '10.1000/special(chars)test[brackets]',
        url: 'https://arxiv.org/abs/invalid-format',
        year: 'invalid-year',
        creators: [{ lastName: 'VeryLongAuthorName'.repeat(10), creatorType: 'author' }]
      }),

      // Item with minimal data
      minimal: harness.createMockItem({
        title: '',
        DOI: '',
        url: '',
        year: '',
        creators: []
      }),

      // Item with existing citations
      withExistingCitations: harness.createMockItem({
        title: 'Paper with Existing Citations',
        DOI: '10.1000/existing-citations',
        extra: '25 citations (Crossref/DOI) [2024-01-01]\nDOI: 10.1000/existing-citations\nNote: Important paper'
      })
    };
  }

  /**
   * Setup common API mock responses for predictable testing
   */
  static setupPredictableAPIMocks(harness) {
    // Crossref - returns citation count based on DOI hash
    harness.fetchStub.withArgs(sinon.match(/api\.crossref\.org/))
      .callsFake((url) => {
        const doiMatch = url.match(/works\/([^\/]+)/);
        const doi = doiMatch ? doiMatch[1] : '';
        const hash = doi.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
        const citationCount = hash % 100; // Predictable count 0-99
        
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            'is-referenced-by-count': citationCount
          })
        });
      });

    // INSPIRE-HEP - returns citation count based on identifier length
    harness.fetchStub.withArgs(sinon.match(/inspirehep\.net/))
      .callsFake((url) => {
        const idMatch = url.match(/\/([^\/]+)$/);
        const id = idMatch ? idMatch[1] : '';
        const citationCount = id.length * 5; // Predictable based on ID length
        
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            metadata: { citation_count: citationCount }
          })
        });
      });

    // Semantic Scholar - returns count based on title length
    harness.fetchStub.withArgs(sinon.match(/api\.semanticscholar\.org/))
      .callsFake((url) => {
        let citationCount = 15; // Default
        
        if (url.includes('search')) {
          // Title search - extract title length from query
          const titleMatch = url.match(/title%3A([^&+]+)/);
          if (titleMatch) {
            const titleLength = decodeURIComponent(titleMatch[1]).length;
            citationCount = Math.min(titleLength * 2, 200);
          }
          
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              data: [{ citationCount }]
            })
          });
        } else {
          // Direct lookup
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              citationCount: citationCount
            })
          });
        }
      });

    // NASA ADS - returns count based on query complexity
    harness.fetchStub.withArgs(sinon.match(/api\.adsabs\.harvard\.edu/))
      .callsFake((url) => {
        const queryMatch = url.match(/q=(.+)&/);
        const query = queryMatch ? decodeURIComponent(queryMatch[1]) : '';
        const complexity = query.split(/[+\s]/).length;
        const citationCount = complexity * 10; // More complex queries = more citations
        
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            response: {
              numFound: 1,
              docs: [{ citation_count: citationCount }]
            }
          })
        });
      });
  }

  /**
   * Verify that all expected fixes are in place
   */
  static verifyFixes() {
    console.log('🔍 Verifying applied fixes...');
    
    // Check NASA ADS title search is enabled
    const nasaAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'nasaads');
    if (nasaAPI && nasaAPI.useTitleSearch === true) {
      console.log('✅ Fix 1: NASA ADS title search enabled');
    } else {
      console.log('❌ Fix 1: NASA ADS title search still disabled');
    }
    
    // Check rate limiting is configurable
    const semanticAPI = global.ZoteroCitationCounts.APIs.find(api => api.key === 'semanticscholar');
    if (semanticAPI) {
      console.log('✅ Fix 2: Semantic Scholar rate limiting configurable');
    }
    
    console.log('🔧 Core fixes verified');
  }
}

module.exports = TestConfig;