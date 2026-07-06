/**
 * @typedef {'hero' | 'landmark' | 'activity'} ImageKind
 */

/**
 * @typedef {Object} ResolveImageParams
 * @property {ImageKind} kind
 * @property {string} label
 * @property {string} [context]
 * @property {string} uiLang
 */

/**
 * @typedef {Object} ImageAttribution
 * @property {string} [author]
 * @property {string} [license]
 * @property {string} [licenseUrl]
 * @property {string} [sourceUrl]
 */

/**
 * @typedef {'commons-category' | 'wikidata-commons' | 'wikipedia' | 'wikivoyage' | 'unsplash' | 'fallback'} ImageSource
 */

/**
 * @typedef {'bundle' | 'p18' | 'pageimage' | 'wikivoyage' | 'commons' | 'commons-featured' | 'commons-quality' | 'geosearch' | 'fallback'} HeroSource
 */

/**
 * @typedef {Object} ResolvedImage
 * @property {string} url
 * @property {ImageAttribution} [attribution]
 * @property {ImageSource} source
 * @property {HeroSource} [heroSource]
 * @property {string} [entityId]
 * @property {boolean} [cached]
 */

/**
 * @typedef {Object} ImageCandidate
 * @property {string} url
 * @property {ImageSource} source
 * @property {string} [author]
 * @property {string} [license]
 * @property {string} [licenseUrl]
 * @property {string} [sourceUrl]
 * @property {number} [width]
 * @property {number} [height]
 * @property {number} [score]
 * @property {HeroSource} [heroSource]
 * @property {string} [unsplashDownloadLocation]
 */

export {};
