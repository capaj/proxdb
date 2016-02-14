/* eslint-env node, mocha */
'use strict'
const expect = require('chai').expect
const Joi = require('joi')
const joiToNulled = require('../../lib/joi-to-nulled')
const nmDb = require('../../index')
const _ = require('lodash')

describe('joi to nulled object', function () {
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
  it('should convert a simple joi schema to nulled object', function () {
    const cloneOfSchema = _.cloneDeep(schema)
    const nulled = joiToNulled(schema)
    expect(cloneOfSchema).to.eql(schema)

    expect(nulled.name).to.equal(null)
    expect(nulled.bool).to.equal(null)
    expect(nulled.age).to.equal(null)
    expect(nulled.any).to.equal(null)
    expect(nulled.created).to.equal(null)
  })

  it('should convert a more complicated joi schema', function () {
    const ts = Joi.object().keys(schema)
    const cloneOfSchema = _.cloneDeep(ts)

    const nulled = joiToNulled(ts)

    expect(nulled.name).to.equal(null)
    expect(nulled.bool).to.equal(null)
    expect(nulled.age).to.equal(null)
    expect(nulled.any).to.equal(null)
    expect(nulled.created).to.equal(null)
    expect(cloneOfSchema).to.eql(ts)
  })

  it('should convert a schema with nmDb.ref() type', function () {
    const ts = {
      author: nmDb.ref('author')
    }
    const nulled = joiToNulled(ts)
    expect(nulled.author).to.equal(null)
  })

  it('should throw when supplied with undefined', function () {
    let e
    try {
      joiToNulled()
    } catch (err) {
      e = err
    }
    expect(e.toString()).to.equal("TypeError: Cannot read property 'isJoi' of undefined")
  })

  it('should throw when trying to use alternatives', function () {
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
    expect(e.toString()).to.equal('Error: alternatives in Joi schemas are not supported')
  })
})
