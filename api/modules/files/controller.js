"use strict";

const Promise = require(`bluebird`);
const fs = require(`fs`);
const Tar = require(`tar-stream`);
const Boom = require(`boom`);

const BaseController = require(`../../classes/base_controller`);
const Errors = require(`../../classes/errors`);

const FilesModel = require(`./model`);

const PublishedFiles = require(`../publishedFiles/model`);

const filesQueryBuilder = FilesModel.prototype.queryBuilder();

// We do not want to serialize the buffer and send it with the
// response for Create and Update requests so we strip it out
// of the response before it is sent.
function formatResponse(model) {
  model.unset(`buffer`);
  return model;
}

function createNewFile(request, fileData) {
  return FilesModel
  .forge(fileData)
  .save()
  .then(function(record) {
    if (!record) {
      throw Boom.notFound(null, {
        error: `Bookshelf error creating a resource`
      });
    }

    return request.generateResponse(
      formatResponse(record).toJSON()
    )
    .code(201);
  });
}

function updateExistingFile(request, existingFileId, fileData) {
  return filesQueryBuilder
  .updateBuffer(existingFileId, fileData.buffer)
  .then(function() {
    return request.generateResponse({
      id: existingFileId,
      path: fileData.path,
      project_id: fileData.project_id
    })
    .code(200);
  });
}

class FilesController extends BaseController {
  constructor() {
    super(FilesModel);
  }

  formatRequestData(request) {
    // We've already cached the path of the temporary file
    // in a prerequisite function
    const buffer = fs.readFileSync(request.pre.tmpFile);
    const data = {
      path: request.payload.path,
      project_id: request.payload.project_id,
      buffer: buffer
    };

    if (request.params.id) {
      data.id = parseInt(request.params.id);
    }

    return data;
  }

  getAllAsTar(request, reply) {
    const files = request.pre.records.models;
    const tarStream = Tar.pack();
    const fileCache = request.server.methods.file;

    function processFile(file) {
      return Promise.fromCallback(next => fileCache(file.get(`id`), next))
      .then(function(fileBuffer) {
        return new Promise(function(resolve) {
          setImmediate(function() {
            tarStream.entry({
              name: file.get(`path`)
            }, fileBuffer);

            resolve();
          });
        });
      });
    }

    setImmediate(function() {
      Promise.map(files, processFile, { concurrency: 2 })
      .then(function() { return tarStream.finalize(); })
      .catch(Errors.generateErrorResponse);
    });

    // Normally this type would be application/x-tar, but IE refuses to
    // decompress a gzipped stream when this is the type.
    reply(tarStream)
    .header(`Content-Type`, `application/octet-stream`);
  }

  getOne(request, reply) {
    const record = request.pre.records[0].buffer;

    reply(
      request.generateResponse(
        this.formatResponseData(record)
      ).code(200)
    );
  }

  create(request, reply) {
    const requestData = this.formatRequestData(request);

    const result = this.Model
    .query({
      where: {
        project_id: requestData.project_id,
        path: requestData.path
      },
      columns: [`id`]
    })
    .fetch()
    .then(existingFileModel => {
      if (!existingFileModel) {
        return createNewFile(request, requestData);
      }

      return updateExistingFile(request, existingFileModel.get(`id`), requestData);
    })
    .catch(Errors.generateErrorResponse);

    return reply(result);
  }

  update(request, reply) {
    const result = Promise.fromCallback(next => {
      return request.server.methods.file.cache.drop(request.params.id, next);
    })
    .then(() => super._update(request, reply, formatResponse))
    .catch(Errors.generateErrorResponse);

    return reply(result);
  }

  delete(request, reply) {
    const record = request.pre.records.models[0];

    // If a published file exists for this file, we have
    // to unset it's reference before deletion can occur
    const result = PublishedFiles.query({
      where: {
        file_id: record.get(`id`)
      }
    })
    .fetch()
    .then(function(model) {
      if (!model) {
        return;
      }

      return model
      .set({ file_id: null })
      .save();
    })
    .then(() => {
      return Promise.fromCallback(next => {
        return request.server.methods.file.cache.drop(request.params.id, next);
      });
    })
    .then(() => super._delete(request, reply))
    .catch(Errors.generateErrorResponse);

    return reply(result);
  }
}

module.exports = new FilesController();
