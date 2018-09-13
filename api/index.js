"use strict";

const Hoek = require(`hoek`);

exports.register = function api(server, options, next) {
  if (server.app.cacheEnabled) {
    const catbox = server.root._caches._default.client;

    Hoek.assert(catbox && typeof catbox === `object`, `Can't find catbox cache client`);

    const catboxEngine = catbox.connection;

    Hoek.assert(catboxEngine && typeof catboxEngine === `object`, `Can't find catbox engine`);
    Hoek.assert(typeof catboxEngine.isReady === `function`, `Catbox engine doesn't have a ready function`);
  }

  server.app.cacheContexts = {};

  // Add each module's cache functions to the global server methods
  [
    require(`./modules/users/cache`),
    require(`./modules/files/cache`),
    require(`./modules/projects/cache`),
    require(`./modules/publishedProjects/cache`),
    require(`./modules/publishedFiles/cache`)
  ].forEach(module => {
    Object.keys(module).forEach(CacheClassKey => {
      const cache = new module[CacheClassKey](server);
      const cacheMethod = cache.run.bind(cache);
      let cacheConfig;

      if (server.app.cacheEnabled) {
        if (cache.config) {
          cacheConfig = {
            cache: cache.config
          };

          if (cache.generateKey) {
            cacheConfig.generateKey = cache.generateKey;
          }
        } else {
          // We expose the drop method in this way to maintain the
          // same API that Hapi's server method caching uses
          cacheMethod.cache = {
            drop: cache.drop.bind(cache)
          };
        }
      } else {
        // We stub the drop method if cache is disabled since Hapi does not
        // provide the API for it
        cacheMethod.cache = {
          drop(...args) {
            const callback = args[args.length - 1];

            if (typeof callback === `function`) {
              callback();
            }
          }
        };
      }

      server.app.cacheContexts[cache.name] = cache;

      server.method(cache.name, cacheMethod, cacheConfig);
    });
  });

  server.register([{
    register: require(`./modules/users/routes`)
  }, {
    register: require(`./modules/projects/routes`)
  }, {
    register: require(`./modules/files/routes`)
  }, {
    register: require(`./modules/publishedProjects/routes`)
  }, {
    register: require(`./modules/publishedFiles/routes`)
  }], function(err) {
    if (err) {
      return next(err);
    }

    server.route([{
      method: `GET`,
      path: `/`,
      config: {
        auth: false
      },
      handler(request, reply) {
        return reply(request.generateResponse({
          name: `publish.webmaker.org`,
          description: `the publishing service for the Mozilla Leadership Network`,
          routes: {
            users: `/users`,
            projects: `/projects`,
            files: `/files`,
            publishedProjects: `/publishedProjects`,
            publishedFiles: `/publishedFiles`
          }
        })
        .code(200));
      }
    }, {
      method: `GET`,
      path: `/healthcheck`,
      config: {
        auth: false
      },
      handler(request, reply) {
        return reply(request.generateResponse({
          http: `okay`
        })
        .code(200));
      }
    }]);

    next();
  });
};

exports.register.attributes = {
  name: `publish-webmaker-api`,
  version: `0.0.0`
};
