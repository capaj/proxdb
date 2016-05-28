const proxdb = require('../index')

proxdb.init('./test-db-self-refs')
const {joi} = proxdb

const Human = proxdb.model('human', {
    name: joi.string(),
    birth: joi.number(),
    likes: proxdb.ref('human')
  })

// const joe = new Human({name: 'Joe'})
// const sally = new Human({name: 'Sally'})
// joe.likes = sally
// sally.likes = joe

console.log('aa')
Human.resolveDoc('20160527T065543.355Z7b2bcc344c17e630325a').then((doc) => {
  console.log(doc)
})
setTimeout(() => {
  console.log('end')
}, 4000)
