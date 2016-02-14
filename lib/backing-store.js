'use strict'
const levelup = require('level')
const sublevel = require('level-sublevel')
const levelPromise = require('./sublevel-promise')
let db

const backingStore = {
  sublevel: function (name) {
    return levelPromise(db.sublevel(name))
  },
  init: function (name) {
    db = sublevel(levelup(name, { valueEncoding: 'json' }))
  },
  provide: function (sublevelReturningFn) {  // if you need to provide a different implementation than the one reliant on levelDB/sublevel
    backingStore.sublevel = sublevelReturningFn
  }
}

module.exports = backingStore
