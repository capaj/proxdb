import test from 'ava'
import getRefPaths from '../../lib/get-ref-paths-for-schema'
import mobxdb from '../../index'
const {joi} = mobxdb

test((t) => {
  let schema = {
    author: mobxdb.ref('author'),
    name: joi.string().required()
  }

  t.deepEqual(getRefPaths(schema), {author: 'author'})
})
