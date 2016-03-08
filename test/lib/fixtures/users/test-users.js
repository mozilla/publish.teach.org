'use strict';

var db = require(`../../db`);
var users = {};

users.invalid = {
  id: `thisisastring`,
  username: 1919
};

module.exports = function(cb) {
  if (users.valid) {
    return cb(null, users);
  }

  db.select().from(`users`).orderBy(`id`)
    .then(rows => {
      users.valid = rows;
      cb(null, users);
    })
    .catch(cb);
};
