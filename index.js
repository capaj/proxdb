const sub = require('./lib/backing-store')
const joi = require('joi')
const model = require('./lib/model')
const ref = (name) => {
  const objSchema = joi.object()
  objSchema._proxDbRefTo = name
  const origAllow = objSchema.allow
  objSchema.allow = (what) => {
    const schema = origAllow.call(objSchema, what)
    schema._proxDbRefTo = name
    return schema
  }
  return objSchema
}

const arrayOfRefs = (name) => {
  const objSchema = joi.array()
  objSchema._proxDbRefTo = name
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
