var traverse = require('traverse')

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
      node._inner.children.forEach((keySchemaPair) => {
        r[keySchemaPair.key] = keySchemaPair.schema
      })
      this.update(r)
      return mapNode(r)
    }
  }
}

module.exports = function (joiSchema) {
  return traverse(joiSchema).map(mapNode)
}
