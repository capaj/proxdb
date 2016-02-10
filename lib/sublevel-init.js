'use strict'
const levelup = require('level')
const sublevel = require('level-sublevel')
const levelPromise = require('./sublevel-promise')
let db

function subLevel (name) {
  return levelPromise(db.sublevel(name))
}

subLevel.init = function (name) {
  db = sublevel(levelup(name, { valueEncoding: 'json' }))
}

module.exports = subLevel
