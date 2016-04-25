'use strict'
const debug = require('debug')('proxdb')
const traverse = require('traverse')

module.exports = (schema) => {
  const ret = {}
  traverse(schema).map(function (val) {
    const path = this.path.join('.')
    if (val && val.isJoi) {
      if (val._proxDbRefTo) {
        debug('found ref on a path ', path)
        ret[path] = val._proxDbRefTo
      }
      this.remove(true)
    }
  })
  return ret
}
