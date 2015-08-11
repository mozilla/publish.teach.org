var Promise = require('bluebird');

var errors = require('../../classes/errors');
var BaseController = require('../../classes/base_controller');

var controller = new BaseController(require('./model'));

var Projects = require('../projects/model');
var Files = require('../files/model');
var PublishedFiles = require('../publishedFiles/model');

controller.remix = function(req, reply) {
  var publishedProject = req.pre.records.models[0];
  var user = req.pre.user;

  function copyFiles(newProject) {
    function getPublishedFiles() {
      return PublishedFiles.query({
        where: {
          published_id: publishedProject.get('id')
        }
      }).fetchAll();
    }

    function duplicateFiles(publishedFiles) {
      return Promise.map(publishedFiles.records, function(publishedFile) {
        return Files.forge({
          path: publishedFile.get('path'),
          project_id: newProject.get('id'),
          buffer: publishedFile.get('buffer')
        }).save();
      });
    }

    return getPublishedFiles()
      .then(duplicateFiles)
      .then(function() {
        return newProject;
      });
  }

  function duplicateProject() {
    return Projects.forge({
      title: publishedProject.get('title') + ' (remix)',
      user_id: user.get('id'),
      tags: publishedProject.get('tags'),
      description: publishedProject.description,
      date_created: req.query.now,
      date_updated: req.query.now
    }).save()
    .then(copyFiles)
    .catch(errors.generateErrorResponse);
  }

  return reply(duplicateProject());
};

module.exports = controller;
