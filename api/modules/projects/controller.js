var Boom = require('boom');
var Promise = require('bluebird');

var errors = require('../../classes/errors');
var BaseController = require('../../classes/base_controller');
var Publisher = require('../../classes/publisher');

var Files = require('../files/model');
var PublishedFiles = require('../publishedFiles/model');

var Model = require('./model');
var controller = new BaseController(Model);

controller.getAll = function(req, reply) {
 var records = req.pre.records.toJSON()
     .sort(function(project1, project2) {
         return  new Date(project2.date_updated).getTime() -   new Date(project1.date_updated).getTime() ;
     });

 reply(req.generateResponse(records));
};

controller.formatRequestData = function(req) {
  var data = {
    title: req.payload.title,
    user_id: req.payload.user_id,
    tags: req.payload.tags,
    description: req.payload.description,
    date_created: req.payload.date_created,
    date_updated: req.payload.date_updated
  };
  if (req.params.id) {
    data.id = parseInt(req.params.id);
  }
  return data;
};

controller.publishProject = function(req, reply) {
  var result = Promise.resolve().then(function() {
    var record = req.pre.records.models[0];

    return Publisher.publish(record)
      .then(function() {
        return req.generateResponse(record).code(200);
      });
  })
  .catch(errors.generateErrorResponse);

  return reply(result);
};

controller.unpublishProject = function(req, reply) {
  var result = Promise.resolve().then(function() {
    var record = req.pre.records.models[0];

    if (!record.attributes.publish_url) { throw Boom.notFound(); }

    return Publisher.unpublish(record)
      .then(function() {
        return req.generateResponse(record).code(200);
      });
  })
  .catch(errors.generateErrorResponse);

  return reply(result);
};

controller.delete = function(req, reply) {
  var self = this;
  var project = req.pre.records.models[0];

  function clearAllPublishedFiles() {
    function fetchFiles() {
      return Files.query({
        where: {
          project_id: project.get('id')
        }
      }).fetchAll();
    }

    function fetchPublishedFiles(file) {
      return PublishedFiles.query({
        where: {
          file_id: file.get('id')
        }
      }).fetchAll();
    }

    function clearPublishedFiles(publishedFiles) {
      if (publishedFiles.length === 0) {
        return;
      }
      return publishedFiles.mapThen(function(publishedFile) {
        return publishedFile.destroy();
      });
    }

    return Promise.resolve()
      .then(fetchFiles)
      .then(function(files) {
        return files.mapThen(function(file) {
          return fetchPublishedFiles(file)
            .then(clearPublishedFiles);
        });
      });
  }

  // If this project is published, we have to
  // unpublish it before it can be safely deleted.
  // We then do a dummy check to make sure no old publishedFiles
  // exist for this. Horribly inefficent!
  // TODO: https://github.com/mozilla/publish.webmaker.org/issues/140
  Promise.resolve().then(function() {
    if (project.get('published_id')) {
      return Publisher.unpublish(project);
    }
  })
  .then(clearAllPublishedFiles)
  .then(function() {
    BaseController.prototype.delete.call(self, req, reply);
  })
  .catch(function(e) {
    reply(errors.generateErrorResponse(e));
  });
};

module.exports = controller;
