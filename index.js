var mobservable = require('mobservable')

var levelup = require('level')
var sublevel = require('level-sublevel')

var db = sublevel(levelup('./mydb', { valueEncoding: 'json' }))

const collection = require('./lib/collection')

const books = collection.call(db, 'books')
// const authors = collection.call(db, 'authors')
books.initPromise.then(() => {
	console.log(books)
	//
	books.push({author: 'A.C.Clarke', name: 'Space oddysey', birth: 1965, id: 3})
	// books.push({author: 'George R. R. Martin', name: 'Game of thrones', birth: 1948, id: 2})
	console.log(books[0].author)
})


// books.splice(1, 1)
// 2) put a key & value
// books.put(2, {a: 10, b: new Date()}).then(() => {
//   books.get(2).then(value => { console.log(value) })
// })

//
// authors.put(1, {name: 'J.K.Rowling', birth: 1965}, function (err) {
//   if (err) return console.log('Ooops!', err) // some kind of I/O error
//   // 3) fetch by key
//   authors.get(1, function (err, value) {
//     if (err) return console.log('Ooops!', err) // likely the key was not found
//
//     // ta da!
//     console.log('1=',  value)
//   })
// })

process.on('unhandledRejection', (reason, p) => {
    console.log("Unhandled Rejection at: Promise ", p, " reason: ", reason);
    // application specific logging, throwing an error, or other logic here
})
