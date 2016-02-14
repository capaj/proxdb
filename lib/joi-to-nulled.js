const traverse = require('traverse')
const debug = require('debug')('joi-to-nulled')

function mapNode (node) {
  if (node.isJoi) {
    if (node._type === 'alternatives') {
      throw new Error('alternatives in Joi schemas are not supported')
    }
    if (node._type !== 'object') {
      return null
    }
    if (node._type === 'object') {
      var r = {}
      if (node._inner.children !== null) {
        node._inner.children.forEach((keySchemaPair) => {
          r[keySchemaPair.key] = keySchemaPair.schema
        })
      } else {
        return null
      }
      this.update(r)
      return mapNode(r)
    }
  }
}

module.exports = function (joiSchema) {
  debug('schema to transform: ', joiSchema)
  return traverse(joiSchema).map(mapNode)
}
