'use strict'
const debug = require('debug')('mobxdb')
const traverse = require('traverse')

module.exports = (schema) => {
  const ret = {}
  traverse(schema).map(function (val) {
    const path = this.path.join('.')
    if (val && val.isJoi) {
      if (val._mobxdbRefTo) {
        debug('found ref on a path ', path)
        ret[path] = val._mobxdbRefTo
      }
      this.remove(true)
    }
  })
  return ret
}
