const { isValidHostname } = require('./domainValidation');

function bareDomain(host) {
  if (!host || typeof host !== 'string') return '';
  const lower = host.toLowerCase();
  return lower.startsWith('www.') ? lower.slice(4) : lower;
}

function wwwDomain(host) {
  if (!host || typeof host !== 'string') return '';
  const lower = host.toLowerCase();
  return lower.startsWith('www.') ? lower : `www.${lower}`;
}

/** Hostnames to try when the primary domain yields no scraper icons. */
function scraperDomainAlternatives(domain) {
  if (!domain || typeof domain !== 'string') return [];
  const lower = domain.toLowerCase();
  const alts = [];

  if (!lower.startsWith('www.')) {
    const withWww = wwwDomain(lower);
    if (withWww !== lower && isValidHostname(withWww)) alts.push(withWww);
  } else {
    const withoutWww = bareDomain(lower);
    if (withoutWww && withoutWww !== lower && isValidHostname(withoutWww)) {
      alts.push(withoutWww);
    }
  }

  return alts;
}

module.exports = {
  bareDomain,
  wwwDomain,
  scraperDomainAlternatives,
};
