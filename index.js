const sub = require('./lib/backing-store')
const joi = require('joi')
const model = require('./lib/model')
const ref = (name) => {
  const objSchema = joi.object()
  objSchema._nmDbRefTo = name
  return objSchema
}

const arrayOfRefs = (name) => {
  const objSchema = joi.array().items(joi.object())
  objSchema._nmDbRefTo = name
  return objSchema
}

module.exports = {
  init: sub.init,
  backingStore: sub,
  joi,
  model,
  ref,
  arrayOfRefs
}
