'use strict'
import test from 'ava'
import nmDb from '../../index'
import _ from 'lodash'
import Joi from 'joi'
import joiToNulled from '../../lib/joi-to-nulled'

const generateUsername = (context) => {
  return context.firstname.toLowerCase() + '-' + context.lastname.toLowerCase()
}
generateUsername.description = 'generated'
const schema = {
  name: Joi.string().default(generateUsername),
  bool: Joi.boolean(),
  age: Joi.number(),
  any: Joi.any().allow(['a', 'b']),
  created: Joi.date().default(Date.now, 'time of creation')
}

test('converts simple joi schema to nulled object', (t) => {
  const cloneOfSchema = _.cloneDeep(schema)
  const nulled = joiToNulled(schema)
  t.deepEqual(cloneOfSchema, schema)

  t.deepEqual(nulled.name, null)
  t.deepEqual(nulled.bool, null)
  t.deepEqual(nulled.age, null)
  t.deepEqual(nulled.any, null)
  t.deepEqual(nulled.created, null)
})

test('convert a more complicated joi schema', (t) => {
  const ts = Joi.object().keys(schema)
  const cloneOfSchema = _.cloneDeep(ts)

  const nulled = joiToNulled(ts)

  t.deepEqual(nulled.name, null)
  t.deepEqual(nulled.bool, null)
  t.deepEqual(nulled.age, null)
  t.deepEqual(nulled.any, null)
  t.deepEqual(nulled.created, null)
  t.deepEqual(cloneOfSchema, ts)
})

test('convert a schema with nmDb.ref() type', (t) => {
  const ts = {
    author: nmDb.ref('author')
  }
  const nulled = joiToNulled(ts)
  t.deepEqual(nulled.author, null)
})

test('convert a schema with nmDb.arrayOfRefs()', (t) => {
  const ts = {
    authors: nmDb.arrayOfRefs('author')
  }
  const nulled = joiToNulled(ts)
  t.deepEqual(nulled.authors, null)
})

test('throws when called on undefined', (t) => {
  let e
  try {
    joiToNulled()
  } catch (err) {
    e = err
  }
  t.deepEqual(e.toString(), "TypeError: Cannot read property 'isJoi' of undefined")
})

test('throws when trying to use alternatives', (t) => {
  let e
  const sBad = Joi.alternatives().try([
    Joi.string().valid('key'),
    Joi.number().valid(5),
    Joi.object().keys({
      a: Joi.boolean().valid(true),
      b: Joi.alternatives().try([
        Joi.string().regex(/^a/),
        Joi.string().valid('boom')
      ])
    })
  ])
  try {
    joiToNulled(sBad)
  } catch (err) {
    e = err
  }
  t.deepEqual(e.toString(), 'Error: alternatives in Joi schemas are not supported')
})
