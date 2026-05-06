const mysql = require("mysql2");

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "digitale_store_db"
});

db.connect((err) => {
  if (err) console.log("Erreur ❌", err);
  else console.log("DB connectée ✅");
});

module.exports = db;