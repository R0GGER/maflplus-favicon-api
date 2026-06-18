const dns = require('dns');
const { fetch, Agent } = require('undici');

function ipv4Lookup(hostname, options, callback) {
  dns.lookup(hostname, { family: 4, all: false }, callback);
}

const connectOpts = {
  lookup: ipv4Lookup,
  family: 4,
  autoSelectFamily: false,
};

const ipv4Dispatcher = new Agent({ connect: connectOpts });

// Some origins (reddit.com HTML from datacenter IPs) fail over HTTP/2 while CDN assets work.
const ipv4Http1Dispatcher = new Agent({
  connect: connectOpts,
  allowH2: false,
});

function upstreamFetch(url, init = {}) {
  return fetch(url, {
    ...init,
    dispatcher: init.dispatcher ?? ipv4Dispatcher,
  });
}

module.exports = { upstreamFetch, ipv4Dispatcher, ipv4Http1Dispatcher };
