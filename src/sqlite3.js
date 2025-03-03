const sqlite3 = require("sqlite3").verbose()
let sql

//Connect to db

const db = new sqlite3.Database("src/database.db", sqlite3.OPEN_READWRITE,(err) => {
    if (err) return console.error(err.message)
})

module.exports = {db}