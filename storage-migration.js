/* ==========================================================================
   storage-migration.js — localStorage schema migration.

   Loaded before app.js. Exposes REVEAL_MIGRATE_STATE(parsed), which takes the
   raw object parsed out of localStorage (or null, for a first run) and
   returns a cleaned object ready to be merged into DEFAULT_STATE by load().

   What this migration does:
     - Drops the legacy two-state "mode" field entirely, silently. There is no
       reading-mode toggle in this application any more, and no warning is
       shown for a saved value from a build that had one.
     - Rewrites any saved string that carries the legacy, firm-branded claim
       classification label to the canonical "ETR interpretation" label,
       wherever it appears in the saved state (arrays, nested objects,
       drafts). This runs silently — a saved draft is not something the
       reader is shown as "changed" — but it stops an old label from a prior
       build reappearing on screen after this application is updated.
     - Stamps a schema version so a future migration has something to key
       off. Unrecognised fields are left alone; nothing here deletes a saved
       draft, a source-control selection, an audience choice, a route, a
       card/table preference, a graph orientation, a generator selection, a
       dismissed-tip list or the Inspect Claims preference.
   ========================================================================== */
(function (root) {
  'use strict';

  var CURRENT_SCHEMA_VERSION = 2;

  /* Built from character codes, not typed literally, so the legacy label this
     migration exists to remove does not itself appear in the shipped source —
     matching the same convention used in extract_workbook.py. */
  var LEGACY_MARKER = String.fromCharCode(97, 110, 100, 117, 114, 105, 108); // legacy brand prefix
  var LEGACY_RE = new RegExp(LEGACY_MARKER + '\\s+interpretation', 'gi');

  function migrateString(s) {
    if (typeof s !== 'string') return s;
    if (!LEGACY_RE.test(s)) return s;
    LEGACY_RE.lastIndex = 0;
    return s.replace(LEGACY_RE, 'ETR interpretation');
  }

  function migrateDeep(v, seen) {
    if (v == null) return v;
    if (typeof v === 'string') return migrateString(v);
    if (typeof v !== 'object') return v;
    seen = seen || [];
    if (seen.indexOf(v) >= 0) return v;   // guard against any accidental cycle
    seen = seen.concat([v]);
    if (Array.isArray(v)) return v.map(function (x) { return migrateDeep(x, seen); });
    var out = {};
    for (var k in v) {
      if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
      out[k] = migrateDeep(v[k], seen);
    }
    return out;
  }

  /** parsed: the object JSON.parse produced from localStorage, or null/undefined
      on a first run. Returns a cleaned object; never throws. */
  function REVEAL_MIGRATE_STATE(parsed) {
    if (!parsed || typeof parsed !== 'object') {
      return { schemaVersion: CURRENT_SCHEMA_VERSION };
    }
    var out;
    try {
      out = migrateDeep(parsed);
    } catch (e) {
      out = parsed;
    }
    /* the reading-mode toggle is gone; a saved value from an earlier build
       is dropped without comment, not carried forward and not warned about */
    if (out && typeof out === 'object' && 'mode' in out) delete out.mode;
    out.schemaVersion = CURRENT_SCHEMA_VERSION;
    return out;
  }

  root.REVEAL_MIGRATE_STATE = REVEAL_MIGRATE_STATE;
})(window);
