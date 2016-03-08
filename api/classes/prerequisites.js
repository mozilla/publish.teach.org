'use strict';

var Boom = require(`boom`);
var Promise = require(`bluebird`); // jshint ignore:line

var Users = require(`../modules/users/model`);
var errors = require(`./errors`);

var prerequisites = {};

/**
 * confirmRecordExists(model[, mode, requestKey, databasekey])
 *
 * Returns a HAPI pre-req package configured to
 * to fetch all matching records of the passed `model`,
 * using data from the route parameters or the request payload
 * to build the query.
 *
 * @param {Object} model - Bookshelf model for querying
 * @param {Object} config - Contains the following optional info:
 *      mode {String}: 'param' or 'payload' (if omitted, returns all records),
 *      requestKey {String}: key of the param/payload,
 *      databaseKey {String}: key of the database model
 *
 * @returns {Object} - Sets the `records` on the Hapi `request` object
 */
prerequisites.confirmRecordExists = function(model, config) {
  config = config || {};
  config.databaseKey = config.databaseKey || config.requestKey;

  return {
    assign: `records`,
    method: function(req, reply) {
      var queryOptions = {};

      if (config.requestKey) {
        queryOptions.where = {};

        if (config.mode === `param`) {
          queryOptions.where[config.databaseKey] = req.params[config.requestKey];
        } else {
          queryOptions.where[config.databaseKey] = req.payload[config.requestKey];
        }
      }

      var fetchOptions;

      if (config.columns) {
        fetchOptions = { columns: config.columns };
      }

      var result = model.query(queryOptions)
        .fetchAll(fetchOptions)
        .then(records => {
          if (records.length === 0) {
            throw Boom.notFound(null, {
              debug: true,
              error: `resource not found`
            });
          }

          return records;
        })
        .catch(errors.generateErrorResponse);

      return reply(result);
    }
  };
};

/**
 * validateUser()
 *
 * Ensures that the user sending the request exists in the
 * current context. This means that the user should have hit the
 * /users/login route first
 *
 * @returns {Object} - Sets the `user` on the Hapi `request` object
 */
prerequisites.validateUser = function() {
  return {
    assign: `user`,
    method: function validateUser(req, reply) {
      var result = Users.query({
        where: {
          name: req.auth.credentials.username
        }
      }).fetch()
      .then(authenticatedUser => {
        if (!authenticatedUser) {
          // This case means our auth logic failed unexpectedly
          throw Boom.badImplementation(null, {
            error: `authenticated user doesn't exist (mayday!)`
          });
        }

        return authenticatedUser;
      })
      .catch(errors.generateErrorResponse);

      return reply(result);
    }
  };
};

/**
 * validateOwnership()
 *
 * Ensures the authenticated user is the owner of the
 * resource being manipulated or requested.
 *
 * @returns {Object} - Contains Hapi validation method
 */
prerequisites.validateOwnership = function() {
  return {
    method: function validateOwnership(req, reply) {
      var resource = req.pre.records.models[0];
      var authenticatedUser = req.pre.user;

      var result = Promise.resolve().then(() => {
        // Check if the resource is the owning user, otherwise fetch
        // the user it's owned by
        if (resource.tableName === `users`) {
          return resource;
        }
        return resource.user().query({})
          .fetch()
          .then(owner => {
            if (!owner) {
              // This should never ever happen
              throw Boom.badImplementation(null, {
                error: `An owning user can't be found (mayday!)`
              });
            }
            return owner;
          });
      })
      .then(owner => {
        if (owner.get(`id`) !== authenticatedUser.get(`id`)) {
          throw Boom.unauthorized(null, {
            debug: true,
            error: `User doesn't own the resource requested`
          });
        }
      })
      .catch(errors.generateErrorResponse);

      return reply(result);
    }
  };
};

/**
 * validateCreationPermission([foreignKey, model])
 *
 * Ensures the authenticated user is the owner of the
 * resource being created.
 *
 * @param {Object} foreignKey - Foreign key of an existing resource
 * @param {Object} model - Bookshelf model for querying
 *
 * @returns {Object} - Contains Hapi validation method for creation permission
 */
prerequisites.validateCreationPermission = function(foreignKey, model) {
  return {
    method: function validateCreationPermission(req, reply) {
      var result = Users.query({
        where: {
          name: req.auth.credentials.username
        }
      }).fetch()
      .then(userRecord => {
        if (!userRecord) {
          // This case means our auth logic failed unexpectedly
          throw Boom.badImplementation(null, {
            error: `User doesn't exist!`
          });
        }

        // Check to see if there's a direct reference to `user_id` in the payload
        if (!foreignKey) {
          if (userRecord.get(`id`) !== req.payload.user_id) {
            throw Boom.unauthorized(null, {
              debug: true,
              error: `User doesn't own the resource being referenced`
            });
          }
          return;
        }

        var query = {
          where: {
            id: req.payload[foreignKey]
          }
        };

        return model.query(query).fetch()
          .then(record => {
            if (!record) {
              throw Boom.notFound(null, {
                debug: true,
                error: `Foreign key doesn't reference an existing record`
              });
            }

            if (userRecord.get(`id`) !== record.get(`user_id`)) {
              throw Boom.unauthorized(null, {
                debug: true,
                error: `User doesn't own the resource being referenced`
              });
            }
          });
      })
      .catch(errors.generateErrorResponse);

      reply(result);
    }
  };
};

/**
 * trackTemporaryFile()
 *
 * Stores the path to a temporary file in req.app for clearing after a request completes
 * and in req.pre for use in the handler
 *
 * @returns {Object} - Sets the `tmpFile` on the Hapi `request` object
 */
prerequisites.trackTemporaryFile = function() {
  return {
    assign: `tmpFile`,
    method: function trackTemporaryFile(req, reply) {
      var buffer = req.payload.buffer;

      // Store the paths for after the request completes
      req.app.tmpFile = buffer.path;

      reply(buffer.path);
    }
  };
};

module.exports = prerequisites;
