const proxdb = require('../index')
import test from 'ava'

proxdb.init('./dbs/self-refs')
const {joi} = proxdb

test.only('self refs', (t) => {
  const Human = proxdb.model('human', {
      name: joi.string(),
      birth: joi.number(),
      likes: proxdb.ref('human')
    }, {
      create: (human) => {

      }
    })

  // const joe = new Human({name: 'Joe'})
  // const sally = new Human({name: 'Sally'})
  // joe.likes = sally
  // sally.likes = joe
  return Human.initPromise.then((doc) => {
    console.log(doc)
  })
})
