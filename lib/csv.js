'use strict';

/** Escapes a single CSV field per RFC 4180. */
function escapeField(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Converts an array of flat objects into a CSV string. `columns` controls
 * the column order and header labels; defaults to the keys of the first row.
 */
function toCsv(rows, columns) {
  if (rows.length === 0 && !columns) return '';
  const cols = columns || Object.keys(rows[0]);
  const header = cols.map((c) => (typeof c === 'string' ? c : c.label)).join(',');
  const keys = cols.map((c) => (typeof c === 'string' ? c : c.key));

  const body = rows.map((row) => keys.map((key) => escapeField(row[key])).join(','));
  return [header, ...body].join('\r\n') + (rows.length ? '\r\n' : '');
}

module.exports = { toCsv, escapeField };
