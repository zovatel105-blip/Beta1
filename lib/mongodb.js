import { MongoClient } from 'mongodb'

if (!process.env.MONGO_URL) {
  throw new Error('Please define MONGO_URL in .env')
}

const uri = process.env.MONGO_URL
const options = {}

let client
let clientPromise

if (process.env.NODE_ENV === 'development') {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options)
    global._mongoClientPromise = client.connect()
  }
  clientPromise = global._mongoClientPromise
} else {
  client = new MongoClient(uri, options)
  clientPromise = client.connect()
}

export default clientPromise

export async function getDb() {
  const client = await clientPromise
  return client.db(process.env.DB_NAME)
}

export async function getCollection(name) {
  const db = await getDb()
  return db.collection(name)
}
