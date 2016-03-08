'use strict';

// This file borrowed from api.webmaker.org

var Hoek = require(`hoek`);
var boom = require(`boom`);
var request = require(`request`);
var connString = process.env.ID_SERVER_CONNECTION_STRING;

Hoek.assert(
  connString,
  `You must provide a connection string to a Webmaker Identity Provider (ID_SERVER_CONNECTION_STRING)`
);

var req = request.defaults({
  baseUrl: connString,
  uri: `/user`,
  method: `get`,
  json: true
});

module.exports = function tokenValidator(token, callback) {
  req({
    headers: {
      authorization: `token ` + token
    }
  }, (err, resp, body) => {
    if ( err ) {
      return callback(err);
    }

    if ( resp.statusCode !== 200 ) {
      if ( resp.statusCode === 401 ) {
        return callback(null, false);
      }

      return callback(boom.wrap(new Error(body.message), resp.statusCode, body.message));
    }

    // coerce id to string, for compatibility with pg bigint type
    body.id = body.id.toString();

    callback(null, true, body);
  });
};
