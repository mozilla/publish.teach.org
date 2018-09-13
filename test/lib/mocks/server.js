"use strict";

var Hapi = require('hapi');
var expect = require('code').expect;

var tokenValidators = require('../../../lib/tokenValidator');

var TOKENS = {
  'ag-dubs': {
    scope: ['user', 'email'],
    id: '1',
    username: 'ag-dubs',
    prefLocale: 'en-US'
  },
  'TestUser': {
    scope: ['user', 'email'],
    id: '2',
    username: 'TestUser',
    prefLocale: 'en-US'
  },
  'UpdatedTestUser': {
    scope: ['user', 'email'],
    id: '2',
    username: 'NewUserName',
    prefLocale: 'en-US'
  }
};

function mockTokenValidator(token, callback) {
  var t = TOKENS[token];
  callback(null, !!t, t);
}

module.exports = function(done) {
  var server = new Hapi.Server();
  server.connection();

  server.register(require('hapi-auth-bearer-token'), function(err) {
    if ( err ) {
      throw err;
    }

    server.auth.strategy('token', 'bearer-access-token', true, {
      validateFunc: mockTokenValidator,
      allowQueryToken: false,
      tokenType: 'token'
    });

    server.auth.strategy(
      `projectToken`,
      `bearer-access-token`,
      {
        accessTokenName: `export_token`,
        tokenType: `export`,
        validateFunc: tokenValidators.exportProjectTokenValidator
      }
    );

    server.auth.strategy(
      `publishedProjectToken`,
      `bearer-access-token`,
      {
        accessTokenName: `export_token`,
        tokenType: `export`,
        validateFunc: tokenValidators.exportPublishedProjectTokenValidator
      }
    );

    server.app.cacheContexts = {};

    // Add each module's cache functions to the global server methods
    [
      require(`../../../api/modules/users/cache`),
      require(`../../../api/modules/files/cache`),
      require(`../../../api/modules/projects/cache`),
      require(`../../../api/modules/publishedProjects/cache`),
      require(`../../../api/modules/publishedFiles/cache`)
    ].forEach(module => {
      Object.keys(module).forEach(CacheClassKey => {
        const cache = new module[CacheClassKey](server);
        const cacheMethod = cache.run.bind(cache);

        cacheMethod.cache = {
          drop(...args) {
            const next = args[args.length - 1];

            if (typeof next === `function`) {
              next();
            }
          }
        };

        server.app.cacheContexts[cache.name] = cache;

        server.method(cache.name, cacheMethod);
      });
    });

    server.register([
      require('../../../api/modules/files/routes.js'),
      require('../../../api/modules/projects/routes.js'),
      require('../../../api/modules/users/routes.js'),
      require('../../../api/modules/publishedProjects/routes.js')
    ], function(err) {
      expect(err).to.not.exist();

      server.start(function(err) {
        expect(err).to.not.exist();

        return done(server);
      });
    });
  });
};
