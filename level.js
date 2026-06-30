/**
 * level.js — Level Loader Module
 * Issue #4: Level System & Map Design
 *
 * Loads JSON level definitions and provides a unified Level object
 * with the grid, wall type metadata, spawn point, and dimensions.
 *
 * Public API:
 *   Level.load(json)          -> Level instance from parsed JSON object
 *   Level.loadFromUrl(url)    -> Promise<Level> fetched & parsed from URL
 *   Level.loadDefault()       -> Level instance from embedded fallback
 *
 * Level instance properties:
 *   .width, .height, .grid, .spawn, .wallTypes, .name
 *   .getWallColor(type)       -> [r,g,b] array
 *   .isWalkable(x, y)         -> boolean
 *   .getCell(x, y)            -> wall type id (0 = empty)
 *
 * Vanilla JS (ES6+), no build step, no frameworks.
 */

const Level = (() => {
  'use strict';

  /**
   * Create a Level instance from a parsed JSON object.
   * Validates structure and normalizes wall type keys to integers.
   *
   * @param {Object} json - parsed level JSON
   * @returns {Object} Level instance
   */
  function load(json) {
    if (!json || typeof json !== 'object') {
      throw new Error('Level.load: expected a JSON object');
    }
    if (!Array.isArray(json.grid) || json.grid.length === 0) {
      throw new Error('Level.load: grid must be a non-empty 2D array');
    }

    const height = json.height || json.grid.length;
    const width = json.width || (json.grid[0] ? json.grid[0].length : 0);

    // Validate dimensions match grid
    if (json.grid.length !== height) {
      console.warn('Level.load: grid height ' + json.grid.length + ' != declared height ' + height + ', using grid length');
    }
    for (let y = 0; y < json.grid.length; y++) {
      if (!Array.isArray(json.grid[y])) {
        throw new Error('Level.load: grid row ' + y + ' is not an array');
      }
      if (json.grid[y].length !== width) {
        console.warn('Level.load: grid row ' + y + ' has width ' + json.grid[y].length + ' != declared width ' + width);
      }
    }

    // Normalize wall types so keys are integers
    const wallTypes = {};
    if (json.wallTypes) {
      for (const key of Object.keys(json.wallTypes)) {
        wallTypes[parseInt(key, 10)] = json.wallTypes[key];
      }
    }

    // Ensure at least a default type-1 wall
    if (!wallTypes[1]) {
      wallTypes[1] = { name: 'Default Wall', color: [180, 60, 60] };
    }

    const spawn = json.spawn || { x: width / 2, y: height / 2, angle: 0 };

    return {
      name: json.name || 'Untitled Level',
      width,
      height,
      grid: json.grid,
      spawn,
      wallTypes,

      /**
       * Get the wall type id at grid coordinates (0 = empty, 1+ = wall).
       * Returns 0 for out-of-bounds.
       */
      getCell(x, y) {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        if (ix < 0 || ix >= this.width || iy < 0 || iy >= this.height) {
          return 0;
        }
        return this.grid[iy][ix];
      },

      /**
       * Check whether a position is walkable (not inside a wall).
       */
      isWalkable(x, y) {
        return this.getCell(x, y) === 0;
      },

      /**
       * Get the base color [r,g,b] for a wall type.
       * Falls back to type 1, then to a gray.
       */
      getWallColor(type) {
        const def = this.wallTypes[type] || this.wallTypes[1];
        if (def && def.color) return def.color;
        return [128, 128, 128];
      },
    };
  }

  /**
   * Fetch and parse a level JSON file from a URL.
   * @param {string} url - path to the JSON level file
   * @returns {Promise<Object>} Level instance
   */
  async function loadFromUrl(url) {
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error('Level.loadFromUrl: failed to fetch ' + url + ' (HTTP ' + resp.status + ')');
    }
    const json = await resp.json();
    return load(json);
  }

  /**
   * Return a minimal embedded fallback level (16x16).
   * Used when no external JSON is available.
   */
  function loadDefault() {
    return load({
      name: 'Fallback Arena',
      width: 16,
      height: 16,
      grid: [
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,1,1,1,0,0,0,0,0,0,1,1,1,0,1],
        [1,0,1,0,0,0,0,0,0,0,0,0,0,1,0,1],
        [1,0,1,0,0,0,2,2,0,0,0,0,0,1,0,1],
        [1,0,0,0,0,0,2,2,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,3,3,0,0,0,0,0,0,1],
        [1,0,1,0,0,0,0,3,3,0,0,0,0,1,0,1],
        [1,0,1,0,0,0,0,0,0,0,0,0,0,1,0,1],
        [1,0,1,1,1,0,0,0,0,0,0,1,1,1,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      spawn: { x: 8, y: 8, angle: 0 },
      wallTypes: {
        '1': { name: 'Stone Wall',   color: [180,  60,  60] },
        '2': { name: 'Brick Wall',   color: [ 60, 180,  60] },
        '3': { name: 'Tech Panel',   color: [ 60,  60, 180] },
        '4': { name: 'Energy Field', color: [180, 180,  60] },
      },
    });
  }

  return { load, loadFromUrl, loadDefault };
})();

// Export for both module systems and global scope
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Level;
}
if (typeof window !== 'undefined') {
  window.Level = Level;
}
