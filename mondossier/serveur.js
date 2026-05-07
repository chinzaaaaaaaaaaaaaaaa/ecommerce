const express = require("express");
const mysql = require("mysql2");
const path = require("path");
const bcrypt = require("bcrypt");
const cors = require("cors");
const crypto = require("crypto");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

/* =========================
   DB
========================= */
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "digital_store_db"
});

const ADMIN_DATA_KEYS = ["products","users","orders","reviews","categories","criteria","deliveries","reco"];
const adminSessions = new Map();

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

function createAdminToken(email) {
  const token = crypto.randomBytes(24).toString("hex");
  adminSessions.set(token, { email, createdAt: Date.now() });
  return token;
}

function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token || !adminSessions.has(token))
    return res.status(401).json({ success: false, message: "Session admin invalide" });
  req.adminSession = adminSessions.get(token);
  next();
}

async function ensureAdminStorage() {
  await query(`
    CREATE TABLE IF NOT EXISTS admin_state (
      state_key VARCHAR(100) PRIMARY KEY,
      state_value LONGTEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}

db.connect(async (err) => {
  if (err) { console.log("❌ DB error:", err); return; }
  console.log("✅ MySQL connected");
  try { await ensureAdminStorage(); console.log("✅ Admin storage ready"); }
  catch (e) { console.log("❌ Admin storage error:", e); }
});

/* =========================
   FRONTEND
========================= */
const FRONTEND_DIR = path.join(__dirname, "FrontEnd");

// ← PROTECTION ADMIN EN PREMIER (avant static)
app.get("/FenetreAdmine.html", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "FenetreAdmine.html"));
});



// ← STATIC APRÈS
app.use(express.static(FRONTEND_DIR));

app.get("/", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "FenetreDemarage.HTML"));
});

app.get("/boutique", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "FenetrePrincipale.html"));
});

app.get("/admin", (req, res) => {
  res.redirect('/FenetreAdmine.html');
});

/* =========================
   REGISTER
========================= */
app.post("/api/register", async (req, res) => {
  const { nom, prenom, email, password, telephone } = req.body;
  if (!email || !password) return res.json({ success: false, message: "Champs manquants" });
  try {
    const existing = await query(
      "SELECT idUtilisateur FROM utilisateur WHERE email = ?", 
      [email]
    );
    if (existing.length > 0) 
      return res.json({ success: false, message: "Email déjà utilisé" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO utilisateur (nom, prenom, email, motDePasse, telephone, typeUtilisateur, dateInscription, estActif)
       VALUES (?, ?, ?, ?, ?, 'client', NOW(), 1)`,
      [nom || "", prenom || "", email, hashedPassword, telephone || ""]
    );
    const newId = result.insertId;

    await query(
      `INSERT IGNORE INTO client (idUtilisateur, adresseLivraison, wilaya) VALUES (?, '', '')`,
      [newId]
    ).catch(() => {});

    await query(
      `INSERT IGNORE INTO comptefidelite (pointsTotal, dateMAJ, idClient, idNiveau) VALUES (0, NOW(), ?, 1)`,
      [newId]
    ).catch(() => {});

    res.json({ success: true });
  } catch (err) {
    console.log("Register error:", err);
    res.json({ success: false, message: "Erreur inscription" });
  }
});

/* =========================
   LOGIN
========================= */
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) 
    return res.json({ success: false, message: "Champs manquants" });
  try {
    const results = await query(
      "SELECT * FROM utilisateur WHERE email = ? AND estActif = 1",
      [email]
    );
    if (!results.length) 
      return res.json({ success: false, message: "Utilisateur introuvable" });

    const user = results[0];
    const match = await bcrypt.compare(password, user.motDePasse);
    if (!match) 
      return res.json({ success: false, message: "Mot de passe incorrect" });

    res.json({
      success: true,
      user: {
        id: user.idUtilisateur,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        type: user.typeUtilisateur
      }
    });
  } catch (err) {
    console.log("Login error:", err);
    res.json({ success: false, message: "Erreur serveur" });
  }
});

/* =========================
   GET PROFILE
========================= */
app.get("/api/profile/:id", async (req, res) => {
  try {
    const results = await query(`
      SELECT u.idUtilisateur, u.nom, u.prenom, u.email, u.telephone,
             c.adresseLivraison, c.wilaya,
             COALESCE(cf.pointsTotal, 0) AS pointsTotal,
             nf.libelle AS niveauFidelite
      FROM utilisateur u
      LEFT JOIN client c ON c.idUtilisateur = u.idUtilisateur
      LEFT JOIN comptefidelite cf ON cf.idClient = u.idUtilisateur
      LEFT JOIN niveaufidelite nf ON nf.idNiveau = cf.idNiveau
      WHERE u.idUtilisateur = ?
    `, [req.params.id]);

    if (!results.length) 
      return res.json({ success: false, message: "Profil introuvable" });
    res.json({ success: true, profile: results[0] });
  } catch (err) {
    console.log("Profile error:", err);
    res.json({ success: false, message: "Erreur serveur" });
  }
});

/* =========================
   UPDATE PROFILE
========================= */
app.put("/api/profile/:id", async (req, res) => {
  const { nom, prenom, telephone, adresseLivraison, wilaya } = req.body;
  try {
    await query(
      "UPDATE utilisateur SET nom=?, prenom=?, telephone=? WHERE idUtilisateur=?",
      [nom || "", prenom || "", telephone || "", req.params.id]
    );
    await query(
      `INSERT INTO client (idUtilisateur, adresseLivraison, wilaya) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE adresseLivraison=VALUES(adresseLivraison), wilaya=VALUES(wilaya)`,
      [req.params.id, adresseLivraison || "", wilaya || ""]
    );
    res.json({ success: true });
  } catch (err) {
    console.log("Profile update error:", err);
    res.json({ success: false, message: "Erreur mise à jour" });
  }
});

/* =========================
   CHANGE PASSWORD
========================= */
app.put("/api/password/:id", async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8)
    return res.json({ success: false, message: "Mot de passe trop court" });
  try {
    const hashed = await bcrypt.hash(newPassword, 10);
    await query(
      "UPDATE utilisateur SET motDePasse=? WHERE idUtilisateur=?", 
      [hashed, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: "Erreur changement mot de passe" });
  }
});

/* =========================
   GET ORDERS
========================= */
app.get("/api/orders/:id", async (req, res) => {
  try {
    const rows = await query(`
      SELECT c.idCommande, c.statut, c.dateCommande, c.montantTotal,
             lc.quantite, lc.prixUnitaire, p.nom AS nomProduit
      FROM commande c
      JOIN lignecommande lc ON lc.idCommande = c.idCommande
      JOIN produit p ON p.idProduit = lc.idProduit
      WHERE c.idClient = ?
      ORDER BY c.dateCommande DESC
    `, [req.params.id]);

    const map = {};
    rows.forEach(r => {
      if (!map[r.idCommande]) {
        map[r.idCommande] = {
          id: "DS-" + r.idCommande,
          date: new Date(r.dateCommande).toLocaleDateString("fr-FR", { 
            day: "numeric", month: "long", year: "numeric" 
          }),
          status: r.statut,
          total: Number(r.montantTotal),
          items: []
        };
      }
      map[r.idCommande].items.push({ 
        name: r.nomProduit, 
        qty: r.quantite, 
        price: Number(r.prixUnitaire) 
      });
    });
    res.json({ success: true, orders: Object.values(map) });
  } catch (err) {
    console.log("Orders error:", err);
    res.json({ success: false, orders: [] });
  }
});

/* =========================
   GET ALL ORDERS (Admin)
========================= */
app.get("/api/orders", async (req, res) => {
  try {
    const rows = await query(`
      SELECT c.idCommande, c.statut, c.dateCommande, c.montantTotal,
             u.prenom, u.nom,
             lc.quantite, lc.prixUnitaire, p.nom AS nomProduit
      FROM commande c
      JOIN utilisateur u ON u.idUtilisateur = c.idClient
      JOIN lignecommande lc ON lc.idCommande = c.idCommande
      JOIN produit p ON p.idProduit = lc.idProduit
      ORDER BY c.dateCommande DESC
    `);

    const map = {};
    rows.forEach(r => {
      if (!map[r.idCommande]) {
        map[r.idCommande] = {
          id: "DS-" + r.idCommande,
          client: (r.prenom + " " + r.nom).trim(),
          date: new Date(r.dateCommande).toLocaleDateString("fr-FR"),
          status: r.statut,
          total: Number(r.montantTotal),
          items: r.nomProduit
        };
      }
    });
    res.json({ success: true, orders: Object.values(map) });
  } catch (err) {
    console.log("All orders error:", err);
    res.json({ success: false, orders: [] });
  }
});

/* =========================
   SAVE ORDER
========================= */
app.post("/api/orders", async (req, res) => {
  const { idClient, adresseLivraison, wilaya, montantTotal, items, typePaiement } = req.body;
  if (!idClient || !items || !items.length)
    return res.json({ success: false, message: "Données incomplètes" });
  try {
    const result = await query(
      `INSERT INTO commande (statut, adresseLivraison, wilaya, montantTotal, idClient, dateCommande)
       VALUES ('en préparation', ?, ?, ?, ?, NOW())`,
      [adresseLivraison || "", wilaya || "", montantTotal, idClient]
    );
    const idCommande = result.insertId;

    for (const item of items) {
      await query(
        "INSERT INTO lignecommande (idCommande, idProduit, quantite, prixUnitaire) VALUES (?, ?, ?, ?)",
        [idCommande, item.idProduit || 0, item.quantite || item.qty || 1, item.prix || item.price || 0]
      );
    }

    await query(
      "INSERT INTO paiement (typePaiement, montant, datePaiement, statut, idCommande) VALUES (?, ?, NOW(), 'en attente', ?)",
      [typePaiement || "cod", montantTotal, idCommande]
    );

    const pts = Math.floor(montantTotal / 1000);
    await query(
      `INSERT INTO comptefidelite (pointsTotal, dateMAJ, idClient, idNiveau)
       VALUES (?, NOW(), ?, 1)
       ON DUPLICATE KEY UPDATE pointsTotal = pointsTotal + ?, dateMAJ = NOW()`,
      [pts, idClient, pts]
    );

    res.json({ success: true, idCommande: "DS-" + idCommande });
  } catch (err) {
    console.log("Order save error:", err);
    res.json({ success: false, message: "Erreur création commande" });
  }
});

/* =========================
   UPDATE ORDER STATUS (Admin)
========================= */
app.put("/api/orders/:id/status", async (req, res) => {
  const { statut } = req.body;
  try {
    const realId = req.params.id.replace("DS-", "");
    await query(
      "UPDATE commande SET statut=? WHERE idCommande=?",
      [statut, realId]
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: "Erreur mise à jour statut" });
  }
});

/* =========================
   GET ALL PRODUCTS (catalogue public - disponibles uniquement)
========================= */
app.get("/api/products", async (req, res) => {
  try {
    const rows = await query(`
      SELECT p.idProduit, p.nom, p.description, p.prix, p.stock,
             p.image, p.marque, p.noteMoyenne,
             cat.nom AS categorie,
             COALESCE(AVG(a.note), 0) AS rating,
             COUNT(a.idAvis) AS ratingCount
      FROM produit p
      LEFT JOIN categorie cat ON cat.idCategorie = p.idCategorie
      LEFT JOIN avis a ON a.idProduit = p.idProduit AND a.estVisible = 1
      WHERE p.estDisponible = 1
      GROUP BY p.idProduit
      ORDER BY p.idProduit
    `);

    const products = rows.map(r => ({
      id: r.idProduit,
      name: r.nom,
      cat: r.categorie || "Divers",
      price: Number(r.prix),
      oldPrice: null,
      stock: r.stock > 0,
      img: r.image || "",
      marque: r.marque || "",
      badge: null,
      specs: r.description || "",
      desc: r.description || "",
      specItems: {},
      rating: Math.round(Number(r.rating) * 10) / 10 || 0,
      ratingCount: Number(r.ratingCount) || 0
    }));

    res.json({ success: true, products });
  } catch (err) {
    console.log("Products error:", err);
    res.json({ success: false, products: [] });
  }
});

/* =========================
   GET ALL PRODUCTS ADMIN (TOUS - y compris masqués)
========================= */
app.get("/api/admin/products", async (req, res) => {
  try {
    const rows = await query(`
      SELECT p.idProduit, p.nom, p.description, p.prix, p.stock,
             p.image, p.marque, p.noteMoyenne, p.estDisponible,
             cat.nom AS categorie,
             COALESCE(AVG(a.note), 0) AS rating,
             COUNT(a.idAvis) AS ratingCount
      FROM produit p
      LEFT JOIN categorie cat ON cat.idCategorie = p.idCategorie
      LEFT JOIN avis a ON a.idProduit = p.idProduit AND a.estVisible = 1
      GROUP BY p.idProduit
      ORDER BY p.estDisponible DESC, p.idProduit DESC
    `);

    const products = rows.map(r => ({
      id: r.idProduit,
      name: r.nom,
      cat: r.categorie || "Divers",
      price: Number(r.prix),
      oldPrice: null,
      stock: r.stock,
      img: r.image || "",
      marque: r.marque || "",
      badge: null,
      specs: r.description || "",
      desc: r.description || "",
      specItems: {},
      rating: Math.round(Number(r.rating) * 10) / 10 || 0,
      ratingCount: Number(r.ratingCount) || 0,
      estDisponible: r.estDisponible
    }));

    res.json({ success: true, products });
  } catch (err) {
    console.log("Admin products error:", err);
    res.json({ success: false, products: [] });
  }
});

/* =========================
   HARD DELETE PRODUCT (Admin - suppression physique)
========================= */
app.delete("/api/admin/products/:id", async (req, res) => {
  try {
    // Supprimer d'abord les lignes commandes liées
    await query("DELETE FROM lignecommande WHERE idProduit = ?", [req.params.id]).catch(() => {});
    // Supprimer les avis liés
    await query("DELETE FROM avis WHERE idProduit = ?", [req.params.id]).catch(() => {});
    // Supprimer les questions liées
    await query("DELETE FROM question WHERE idProduit = ?", [req.params.id]).catch(() => {});
    // Supprimer le produit
    await query("DELETE FROM produit WHERE idProduit = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.log("Hard delete product error:", err);
    res.json({ success: false, message: "Erreur suppression produit: " + err.message });
  }
});

/* =========================
   TOGGLE PRODUIT DISPONIBLE (Admin)
========================= */
app.put("/api/admin/products/:id/toggle", async (req, res) => {
  try {
    await query(
      "UPDATE produit SET estDisponible = NOT estDisponible WHERE idProduit = ?",
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: "Erreur toggle produit" });
  }
});

/* =========================
   ADD PRODUCT (Admin)
========================= */
app.post("/api/products", async (req, res) => {
  const { nom, description, prix, stock, image, marque, idCategorie } = req.body;
  if (!nom || !prix)
    return res.json({ success: false, message: "Nom et prix obligatoires" });
  try {
    let catId = idCategorie || null;
    if (!catId && req.body.categorie) {
      const catRows = await query(
        "SELECT idCategorie FROM categorie WHERE nom = ?",
        [req.body.categorie]
      );
      if (catRows.length) {
        catId = catRows[0].idCategorie;
      } else {
        const catResult = await query(
          "INSERT INTO categorie (nom, description, icone) VALUES (?, '', '')",
          [req.body.categorie]
        );
        catId = catResult.insertId;
      }
    }

    const result = await query(
      `INSERT INTO produit 
        (nom, description, prix, stock, image, marque, noteMoyenne, dateAjout, estDisponible, idCategorie)
       VALUES (?, ?, ?, ?, ?, ?, 0, NOW(), 1, ?)`,
      [nom, description || "", parseFloat(prix), parseInt(stock) || 0, image || "", marque || "", catId]
    );
    res.json({ success: true, idProduit: result.insertId });
  } catch (err) {
    console.log("Add product error:", err);
    res.json({ success: false, message: "Erreur ajout produit" });
  }
});

/* =========================
   UPDATE PRODUCT (Admin)
========================= */
app.put("/api/products/:id", async (req, res) => {
  const { nom, description, prix, stock, image, marque } = req.body;
  try {
    let catId = null;
    if (req.body.categorie) {
      const catRows = await query(
        "SELECT idCategorie FROM categorie WHERE nom = ?",
        [req.body.categorie]
      );
      if (catRows.length) {
        catId = catRows[0].idCategorie;
      } else {
        const catResult = await query(
          "INSERT INTO categorie (nom, description, icone) VALUES (?, '', '')",
          [req.body.categorie]
        );
        catId = catResult.insertId;
      }
    }

    await query(
      `UPDATE produit SET
        nom=?, description=?, prix=?, stock=?, image=?, marque=?, idCategorie=?
       WHERE idProduit=?`,
      [
        nom || "", description || "", parseFloat(prix) || 0,
        parseInt(stock) || 0, image || "", marque || "",
        catId, req.params.id
      ]
    );
    res.json({ success: true });
  } catch (err) {
    console.log("Update product error:", err);
    res.json({ success: false, message: "Erreur modification produit" });
  }
});

/* =========================
   SOFT DELETE PRODUCT (Admin - masque le produit)
========================= */
app.delete("/api/products/:id", async (req, res) => {
  try {
    await query(
      "UPDATE produit SET estDisponible = 0 WHERE idProduit = ?",
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.log("Delete product error:", err);
    res.json({ success: false, message: "Erreur suppression produit" });
  }
});

/* =========================
   PRODUCT DETAIL
========================= */
app.get("/api/products/:id", async (req, res) => {
  try {
    const rows = await query(`
      SELECT p.idProduit, p.nom, p.description, p.prix, p.stock,
             p.image, p.marque, cat.nom AS categorie
      FROM produit p
      LEFT JOIN categorie cat ON cat.idCategorie = p.idCategorie
      WHERE p.idProduit = ? AND p.estDisponible = 1
    `, [req.params.id]);

    if (!rows.length) 
      return res.json({ success: false, message: "Produit introuvable" });
    const p = rows[0];

    const avisRows = await query(`
      SELECT a.idAvis, u.prenom AS nom, a.note, a.commentaire, a.dateAvis
      FROM avis a
      LEFT JOIN utilisateur u ON u.idUtilisateur = a.idClient
      WHERE a.idProduit = ? AND a.estVisible = 1
      ORDER BY a.dateAvis DESC
      LIMIT 20
    `, [req.params.id]);

    const reviews = avisRows.map(r => ({
      idAvis: r.idAvis,
      name: r.nom || "Anonyme",
      stars: r.note,
      date: new Date(r.dateAvis).toLocaleDateString("fr-FR", { 
        day: "numeric", month: "long", year: "numeric" 
      }),
      text: r.commentaire,
      helpful: 0
    }));

    const qRows = await query(`
      SELECT q.idQuestion, q.texte AS question, q.dateQuestion,
             u.prenom AS auteur, q.reponse, q.dateReponse
      FROM question q
      LEFT JOIN utilisateur u ON u.idUtilisateur = q.idClient
      WHERE q.idProduit = ?
      ORDER BY q.dateQuestion DESC
      LIMIT 10
    `, [req.params.id]);

    const questions = qRows.map(r => ({
      q: r.question,
      a: r.reponse || null,
      author: r.reponse ? "Support DigitalStore" : r.auteur || "Anonyme",
      date: new Date(r.dateQuestion).toLocaleDateString("fr-FR", { 
        day: "numeric", month: "long", year: "numeric" 
      }),
      votes: 0
    }));

    res.json({
      success: true,
      product: {
        id: p.idProduit,
        name: p.nom,
        cat: p.categorie || "Divers",
        price: Number(p.prix),
        oldPrice: null,
        stock: p.stock > 0,
        img: p.image || "",
        imgs: [p.image || ""],
        badge: null,
        specs: p.description || "",
        desc: p.description || "",
        specItems: {},
        reviews,
        questions
      }
    });
  } catch (err) {
    console.log("Product detail error:", err);
    res.json({ success: false, message: "Erreur serveur" });
  }
});

/* =========================
   SUBMIT REVIEW
========================= */
app.post("/api/reviews", async (req, res) => {
  const { idProduit, idUtilisateur, note, commentaire } = req.body;
  if (!idProduit || !note || !commentaire)
    return res.json({ success: false, message: "Champs manquants" });
  try {
    await query(
      `INSERT INTO avis (idProduit, idClient, note, commentaire, dateAvis, estVisible)
       VALUES (?, ?, ?, ?, NOW(), 1)`,
      [idProduit, idUtilisateur || null, note, commentaire]
    );
    res.json({ success: true });
  } catch (err) {
    console.log("Review error:", err);
    res.json({ success: false, message: "Erreur avis" });
  }
});

/* =========================
   SUBMIT QUESTION
========================= */
app.post("/api/questions", async (req, res) => {
  const { idProduit, idUtilisateur, contenu } = req.body;
  if (!idProduit || !contenu)
    return res.json({ success: false, message: "Champs manquants" });
  try {
    await query(
      `INSERT INTO question (idProduit, idClient, texte, dateQuestion, estRepondue)
       VALUES (?, ?, ?, NOW(), 0)`,
      [idProduit, idUtilisateur || null, contenu]
    );
    res.json({ success: true });
  } catch (err) {
    console.log("Question error:", err);
    res.json({ success: false, message: "Erreur question" });
  }
});

/* =========================
   CATEGORIES
========================= */
app.get("/api/categories", async (req, res) => {
  try {
    const rows = await query(`
      SELECT cat.idCategorie, cat.nom,
             COUNT(p.idProduit) AS nbProduits
      FROM categorie cat
      LEFT JOIN produit p ON p.idCategorie = cat.idCategorie AND p.estDisponible = 1
      GROUP BY cat.idCategorie
      ORDER BY cat.nom
    `);
    res.json({ success: true, categories: rows });
  } catch (err) {
    res.json({ success: false, categories: [] });
  }
});

/* =========================
   GET ALL USERS (Admin)
========================= */
app.get("/api/users", async (req, res) => {
  try {
    const rows = await query(`
      SELECT u.idUtilisateur, u.nom, u.prenom, u.email, 
             u.telephone, u.typeUtilisateur, u.estActif,
             COALESCE(cf.pointsTotal, 0) AS pts
      FROM utilisateur u
      LEFT JOIN comptefidelite cf ON cf.idClient = u.idUtilisateur
      ORDER BY u.idUtilisateur DESC
    `);
    res.json({ success: true, users: rows });
  } catch (err) {
    res.json({ success: false, users: [] });
  }
});

/* =========================
   TOGGLE USER STATUS (Admin)
========================= */
app.put("/api/users/:id/status", async (req, res) => {
  const { estActif } = req.body;
  try {
    await query(
      "UPDATE utilisateur SET estActif=? WHERE idUtilisateur=?",
      [estActif ? 1 : 0, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: "Erreur mise à jour" });
  }
});

/* =========================
   ADMIN AUTH
========================= */
app.post("/api/admin/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ success: false, message: "Champs manquants" });

  try {
    const results = await query(
      `SELECT u.*, a.niveauAcces 
       FROM utilisateur u
       JOIN administrateur a ON a.idUtilisateur = u.idUtilisateur
       WHERE u.email = ? AND u.estActif = 1`,
      [email]
    );

    if (!results.length)
      return res.status(401).json({ success: false, message: "Identifiants admin invalides" });

    const user = results[0];
    const match = await bcrypt.compare(password, user.motDePasse);

    if (!match)
      return res.status(401).json({ success: false, message: "Mot de passe incorrect" });

    const token = createAdminToken(email);
    return res.json({
      success: true,
      user: {
        id: user.idUtilisateur,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        niveauAcces: user.niveauAcces
      },
      token
    });
  } catch (err) {
    console.log("Admin login error:", err);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

/* =========================
   ADMIN DATA API
========================= */
app.get("/api/admin/data", requireAdminAuth, async (req, res) => {
  try {
    const rows = await query(
      "SELECT state_key, state_value FROM admin_state WHERE state_key IN (?)",
      [ADMIN_DATA_KEYS]
    );
    const data = {};
    for (const row of rows) {
      try { data[row.state_key] = JSON.parse(row.state_value); }
      catch { data[row.state_key] = row.state_value; }
    }
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: "Erreur chargement admin" });
  }
});

app.put("/api/admin/data/:key", requireAdminAuth, async (req, res) => {
  const { key } = req.params;
  if (!ADMIN_DATA_KEYS.includes(key))
    return res.status(400).json({ success: false, message: "Clé inconnue" });
  try {
    const payload = JSON.stringify(req.body?.value ?? null);
    await query(
      `INSERT INTO admin_state (state_key, state_value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE state_value = VALUES(state_value), updated_at = CURRENT_TIMESTAMP`,
      [key, payload]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: "Erreur sauvegarde admin" });
  }
});





// AJOUTER avant app.listen
app.get("/api/admin/verify", (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token || !adminSessions.has(token)) {
    return res.json({ success: false, message: "Token invalide" });
  }
  res.json({ success: true });
});


/* =========================
   REDEEM REWARD (Points fidélité)
========================= */
app.post("/api/loyalty/redeem", async (req, res) => {
  const { idClient, rewardId, pointsCost } = req.body;
  if (!idClient || !rewardId || !pointsCost)
    return res.json({ success: false, message: "Données manquantes" });

  try {
    // Vérifier les points disponibles
    const rows = await query(
      "SELECT pointsTotal FROM comptefidelite WHERE idClient = ?",
      [idClient]
    );
    if (!rows.length)
      return res.json({ success: false, message: "Compte fidélité introuvable" });

    if (rows[0].pointsTotal < pointsCost)
      return res.json({ success: false, message: "Points insuffisants" });

    // Déduire les points
    await query(
      "UPDATE comptefidelite SET pointsTotal = pointsTotal - ?, dateMAJ = NOW() WHERE idClient = ?",
      [pointsCost, idClient]
    );

    // Enregistrer la récompense utilisée (dans admin_state comme log simple)
    const logKey = "reward_log";
    const existing = await query(
      "SELECT state_value FROM admin_state WHERE state_key = ?",
      [logKey]
    ).catch(() => []);

    let logs = [];
    if (existing.length) {
      try { logs = JSON.parse(existing[0].state_value); } catch(_) {}
    }
    logs.unshift({
      idClient,
      rewardId,
      pointsCost,
      date: new Date().toISOString()
    });
    // Garder les 200 derniers logs
    logs = logs.slice(0, 200);

    await query(
      `INSERT INTO admin_state (state_key, state_value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE state_value = VALUES(state_value), updated_at = CURRENT_TIMESTAMP`,
      [logKey, JSON.stringify(logs)]
    );

    // Récupérer les nouveaux points
    const updated = await query(
      "SELECT pointsTotal FROM comptefidelite WHERE idClient = ?",
      [idClient]
    );

    res.json({
      success: true,
      newPoints: updated[0]?.pointsTotal || 0
    });
  } catch (err) {
    console.log("Redeem error:", err);
    res.json({ success: false, message: "Erreur serveur" });
  }
});

/* =========================
   GET LOYALTY POINTS
========================= */
app.get("/api/loyalty/:idClient", async (req, res) => {
  try {
    const rows = await query(
      `SELECT cf.pointsTotal, nf.libelle AS niveau
       FROM comptefidelite cf
       LEFT JOIN niveaufidelite nf ON nf.idNiveau = cf.idNiveau
       WHERE cf.idClient = ?`,
      [req.params.idClient]
    );
    if (!rows.length)
      return res.json({ success: false, points: 0 });

    res.json({ success: true, points: rows[0].pointsTotal, niveau: rows[0].niveau });
  } catch (err) {
    res.json({ success: false, points: 0 });
  }
});

/* ================================================================
   PATCH server.js — Ajouter ces routes AVANT app.listen(3000)
   
   Utilise la table Promotion existante (étendue par la migration).
   Plus besoin de promo_code séparée.
================================================================ */

/* =========================
   COORDONNÉES WILAYAS — carte de suivi
========================= */
const WILAYA_COORDS = {
  "Adrar":{"lat":27.87,"lng":0.29},   "Chlef":{"lat":36.17,"lng":1.33},
  "Laghouat":{"lat":33.80,"lng":2.87},"Oum el Bouaghi":{"lat":35.88,"lng":7.11},
  "Batna":{"lat":35.56,"lng":6.17},   "Béjaïa":{"lat":36.75,"lng":5.08},
  "Biskra":{"lat":34.85,"lng":5.73},  "Béchar":{"lat":31.62,"lng":-2.22},
  "Blida":{"lat":36.47,"lng":2.82},   "Bouira":{"lat":36.38,"lng":3.90},
  "Tamanrasset":{"lat":22.79,"lng":5.52},"Tébessa":{"lat":35.40,"lng":8.12},
  "Tlemcen":{"lat":34.88,"lng":-1.32},"Tiaret":{"lat":35.37,"lng":1.32},
  "Tizi Ouzou":{"lat":36.72,"lng":4.05},"Alger":{"lat":36.74,"lng":3.06},
  "Djelfa":{"lat":34.67,"lng":3.26},  "Jijel":{"lat":36.82,"lng":5.77},
  "Sétif":{"lat":36.19,"lng":5.41},   "Saïda":{"lat":34.83,"lng":0.15},
  "Skikda":{"lat":36.88,"lng":6.90},  "Sidi Bel Abbès":{"lat":35.19,"lng":-0.63},
  "Annaba":{"lat":36.90,"lng":7.76},  "Guelma":{"lat":36.46,"lng":7.43},
  "Constantine":{"lat":36.37,"lng":6.61},"Médéa":{"lat":36.27,"lng":2.75},
  "Mostaganem":{"lat":35.93,"lng":0.09},"M'Sila":{"lat":35.70,"lng":4.54},
  "Mascara":{"lat":35.40,"lng":0.14}, "Ouargla":{"lat":31.95,"lng":5.32},
  "Oran":{"lat":35.69,"lng":-0.63},   "El Bayadh":{"lat":33.68,"lng":1.02},
  "Illizi":{"lat":26.49,"lng":8.47},  "Bordj Bou Arréridj":{"lat":36.07,"lng":4.76},
  "Boumerdès":{"lat":36.76,"lng":3.48},"El Tarf":{"lat":36.77,"lng":8.31},
  "Tindouf":{"lat":27.67,"lng":-8.15},"Tissemsilt":{"lat":35.60,"lng":1.81},
  "El Oued":{"lat":33.37,"lng":6.86}, "Khenchela":{"lat":35.44,"lng":7.14},
  "Souk Ahras":{"lat":36.28,"lng":7.95},"Tipaza":{"lat":36.59,"lng":2.44},
  "Mila":{"lat":36.45,"lng":6.26},    "Aïn Defla":{"lat":36.27,"lng":1.97},
  "Naâma":{"lat":33.27,"lng":-0.31},  "Aïn Témouchent":{"lat":35.30,"lng":-1.14},
  "Ghardaïa":{"lat":32.49,"lng":3.67},"Relizane":{"lat":35.74,"lng":0.56}
};

app.get("/api/wilayas/coords", (req, res) => {
  res.json({ success: true, wilayas: WILAYA_COORDS, depot: { lat:36.75, lng:5.08, city:"Béjaïa" } });
});

/* =========================
   GÉNÉRATION CODE PROMO (via table Promotion)
========================= */
app.post("/api/promo/generate", async (req, res) => {
  const { idClient, rewardId } = req.body;
  if (!idClient || !rewardId)
    return res.json({ success: false, message: "Données manquantes" });

  const REWARD_CONFIG = {
    disc5:    { typeReduction: "percent", taux: 5,    prefix: "FIDE5",  days: 30  },
    delivery: { typeReduction: "delivery",taux: 0,    prefix: "LIVEXP", days: 60  },
    disc50k:  { typeReduction: "fixed",   taux: 5000, prefix: "GOLD5K", days: 30  },
    vip:      { typeReduction: "vip",     taux: 10,   prefix: "VIP10",  days: 365 }
  };

  const cfg = REWARD_CONFIG[rewardId];
  if (!cfg) return res.json({ success: false, message: "Récompense inconnue" });

  try {
    // Vérifier qu'il n'a pas déjà un code actif pour cette récompense
    const existing = await query(
      `SELECT codePromo FROM Promotion
       WHERE idClientOwner = ? AND rewardId = ?
         AND estUtilise = 0 AND dateFin > NOW() AND estActive = 1`,
      [idClient, rewardId]
    );
    if (existing.length) {
      return res.json({
        success: true,
        code:    existing[0].codePromo,
        already: true
      });
    }

    // Générer un code unique
    const suffix = require("crypto").randomBytes(3).toString("hex").toUpperCase();
    const code   = `${cfg.prefix}-${suffix}`;
    const now    = new Date();
    const expiry = new Date(Date.now() + cfg.days * 86400000);
    const fmt    = d => d.toISOString().slice(0, 19).replace("T", " ");

    await query(
      `INSERT INTO Promotion
         (titre, codePromo, typeReduction, tauxReduction,
          dateDebut, dateFin, estActive,
          idClientOwner, rewardId, estUtilise)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, 0)`,
      [
        `Récompense fidélité — ${rewardId}`,
        code,
        cfg.typeReduction,
        cfg.taux,
        fmt(now),
        fmt(expiry),
        idClient,
        rewardId
      ]
    );

    res.json({ success: true, code, expiry: expiry.toISOString() });
  } catch (err) {
    console.log("Generate promo error:", err);
    res.json({ success: false, message: "Erreur génération code" });
  }
});

/* =========================
   VÉRIFICATION CODE PROMO AU PANIER (via table Promotion)
========================= */
app.post("/api/promo/verify", async (req, res) => {
  const { code, idClient, montantPanier } = req.body;
  if (!code) return res.json({ success: false, message: "Code manquant" });

  try {
    const rows = await query(
      `SELECT * FROM Promotion
       WHERE codePromo = UPPER(?)
         AND estActive  = 1
         AND estUtilise = 0
         AND dateFin    > NOW()`,
      [code.toUpperCase()]
    );

    if (!rows.length)
      return res.json({ success: false, message: "Code invalide ou expiré" });

    const promo = rows[0];

    // Vérifier que le code appartient au bon client (si code personnel)
    if (promo.idClientOwner !== null && idClient && promo.idClientOwner !== idClient) {
      return res.json({ success: false, message: "Ce code ne vous appartient pas" });
    }

    const montant = parseFloat(montantPanier) || 0;
    let reduction = 0;
    let label     = "";

    switch (promo.typeReduction) {
      case "percent":
        reduction = Math.round(montant * promo.tauxReduction / 100);
        label     = `−${promo.tauxReduction}% (${promo.titre})`;
        break;
      case "fixed":
        reduction = Math.min(promo.tauxReduction, montant);
        label     = `−${Number(promo.tauxReduction).toLocaleString("fr-DZ")} DA (${promo.titre})`;
        break;
      case "delivery":
        reduction = 0;
        label     = "Livraison express offerte";
        break;
      case "vip":
        reduction = Math.round(montant * promo.tauxReduction / 100);
        label     = `−${promo.tauxReduction}% VIP Diamond`;
        break;
      default:
        reduction = Math.round(montant * (promo.tauxReduction || 0) / 100);
        label     = promo.titre || "Promotion";
    }

    res.json({
      success:     true,
      type:        promo.typeReduction,
      valeur:      promo.tauxReduction,
      reduction,
      label,
      idPromotion: promo.idPromotion
    });
  } catch (err) {
    console.log("Verify promo error:", err);
    res.json({ success: false, message: "Erreur vérification code" });
  }
});

/* =========================
   MARQUER CODE UTILISÉ APRÈS COMMANDE
========================= */
app.put("/api/promo/use", async (req, res) => {
  const { code, idCommande } = req.body;
  if (!code) return res.json({ success: false });
  try {
    await query(
      `UPDATE Promotion
       SET estUtilise      = 1,
           dateUtilisation = NOW(),
           idCommandeUsed  = ?
       WHERE codePromo = UPPER(?) AND estUtilise = 0`,
      [idCommande || null, code]
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

/* =========================
   CODES ACTIFS D'UN CLIENT (pour page fidélité / profil)
========================= */
app.get("/api/promo/client/:idClient", async (req, res) => {
  try {
    const rows = await query(
      `SELECT codePromo, typeReduction, tauxReduction, rewardId,
              dateDebut, dateFin, estUtilise, titre
       FROM Promotion
       WHERE idClientOwner = ?
       ORDER BY dateDebut DESC
       LIMIT 20`,
      [req.params.idClient]
    );
    res.json({ success: true, codes: rows });
  } catch (err) {
    res.json({ success: false, codes: [] });
  }
});














// ── GET panier d'un client
app.get("/api/cart/:idClient", async (req, res) => {
  try {
    let panierRows = await query(
      "SELECT idPanier FROM panier WHERE idClient=?",
      [req.params.idClient]
    );

    if (!panierRows.length) {
      await query(
        "INSERT INTO panier (dateCreation, idClient) VALUES (NOW(), ?)",
        [req.params.idClient]
      );
      panierRows = await query(
        "SELECT idPanier FROM panier WHERE idClient=?",
        [req.params.idClient]
      );
    }

    if (!panierRows.length) {
      return res.json({ success: false, message: "Panier introuvable" });
    }

    const idPanier = panierRows[0].idPanier;

    const rows = await query(`
      SELECT lp.idProduit AS id, lp.quantite AS qty, lp.prixUnitaire AS price,
             p.nom AS name, p.image AS img, cat.nom AS cat
      FROM lignepanier lp
      JOIN produit p    ON p.idProduit    = lp.idProduit
      LEFT JOIN categorie cat ON cat.idCategorie = p.idCategorie
      WHERE lp.idPanier = ?
    `, [idPanier]);

    res.json({ success: true, items: rows });
  } catch (err) {
    console.error("Get cart error:", err.message);
    res.json({ success: false, items: [] });
  }
});

// ── PUT panier (sync complète : vide + réinsère)
// ── PUT panier (sync complète : vide + réinsère)
app.put("/api/cart/:idClient", async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) {
    return res.json({ success: false, message: "Items doit être un tableau" });
  }
  try {
    let panierRows = await query(
      "SELECT idPanier FROM panier WHERE idClient=?",
      [req.params.idClient]
    );
    if (!panierRows.length) {
      await query(
        "INSERT INTO panier (dateCreation, idClient) VALUES (NOW(), ?)",
        [req.params.idClient]
      );
      panierRows = await query(
        "SELECT idPanier FROM panier WHERE idClient=?",
        [req.params.idClient]
      );
    }
    const idPanier = panierRows[0].idPanier;
    await query("DELETE FROM lignepanier WHERE idPanier=?", [idPanier]);
    for (const item of items) {
      if (!item.idProduit || !item.quantite || item.quantite <= 0) continue;
      await query(
        "INSERT INTO lignepanier (quantite, prixUnitaire, idPanier, idProduit) VALUES (?, ?, ?, ?)",
        [item.quantite, item.prixUnitaire || 0, idPanier, item.idProduit]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Sync cart error:", err.message);
    res.json({ success: false, message: err.message });
  }
});


/* =========================
   GESTION DES AVIS (Admin)
========================= */

/* =========================
   GESTION DES AVIS (Admin)
========================= */
app.get("/api/admin/reviews", async (req, res) => {
  try {
    const rows = await query(`
      SELECT 
        a.idAvis, a.note, a.commentaire, a.dateAvis, a.estVisible,
        p.nom AS nomProduit, p.idProduit,
        u.prenom AS prenomClient, u.nom AS nomClient, u.email AS emailClient
      FROM avis a
      LEFT JOIN produit p ON p.idProduit = a.idProduit
      LEFT JOIN utilisateur u ON u.idUtilisateur = a.idClient
      ORDER BY a.dateAvis DESC
    `);
    const reviews = rows.map(r => ({
      id: r.idAvis,
      note: r.note,
      commentaire: r.commentaire,
      date: new Date(r.dateAvis).toLocaleDateString("fr-FR", {
        day: "numeric", month: "long", year: "numeric"
      }),
      estVisible: r.estVisible === 1,
      produit: { id: r.idProduit, nom: r.nomProduit || "Produit supprimé" },
      client: {
        nom: (r.prenomClient + " " + r.nomClient).trim() || "Anonyme",
        email: r.emailClient || ""
      }
    }));
    res.json({ success: true, reviews });
  } catch (err) {
    res.json({ success: false, reviews: [] });
  }
});

app.put("/api/admin/reviews/:id/approve", async (req, res) => {
  try {
    await query("UPDATE avis SET estVisible = 1 WHERE idAvis = ?", [req.params.id]);
    res.json({ success: true, message: "Avis approuvé" });
  } catch (err) {
    res.json({ success: false, message: "Erreur approbation" });
  }
});

app.put("/api/admin/reviews/:id/hide", async (req, res) => {
  try {
    await query("UPDATE avis SET estVisible = 0 WHERE idAvis = ?", [req.params.id]);
    res.json({ success: true, message: "Avis masqué" });
  } catch (err) {
    res.json({ success: false, message: "Erreur masquage" });
  }
});

app.delete("/api/admin/reviews/:id", async (req, res) => {
  try {
    await query("DELETE FROM avis WHERE idAvis = ?", [req.params.id]);
    res.json({ success: true, message: "Avis supprimé" });
  } catch (err) {
    res.json({ success: false, message: "Erreur suppression" });
  }
});

/* =========================
   GESTION DES QUESTIONS (Admin)
========================= */

// 1. Lister toutes les questions
app.get("/api/admin/questions", async (req, res) => {
  try {
    const rows = await query(`
      SELECT 
        q.idQuestion,
        q.texte,
        q.reponse,
        q.dateQuestion,
        q.dateReponse,
        q.estRepondue,
        p.nom AS nomProduit,
        p.idProduit,
        u.prenom AS prenomClient,
        u.nom AS nomClient
      FROM question q
      LEFT JOIN produit p ON p.idProduit = q.idProduit
      LEFT JOIN utilisateur u ON u.idUtilisateur = q.idClient
      ORDER BY q.estRepondue ASC, q.dateQuestion DESC
    `);

    const questions = rows.map(r => ({
      id: r.idQuestion,
      texte: r.texte,
      reponse: r.reponse || null,
      dateQuestion: new Date(r.dateQuestion).toLocaleDateString("fr-FR", {
        day: "numeric", month: "long", year: "numeric"
      }),
      dateReponse: r.dateReponse ? new Date(r.dateReponse).toLocaleDateString("fr-FR", {
        day: "numeric", month: "long", year: "numeric"
      }) : null,
      estRepondue: r.estRepondue === 1,
      produit: {
        id: r.idProduit,
        nom: r.nomProduit || "Produit supprimé"
      },
      client: {
        nom: (r.prenomClient + " " + r.nomClient).trim() || "Anonyme"
      }
    }));

    res.json({ success: true, questions });
  } catch (err) {
    console.log("Admin questions error:", err);
    res.json({ success: false, questions: [] });
  }
});

// 2. Répondre à une question
app.put("/api/admin/questions/:id/reponse", async (req, res) => {
  const { reponse } = req.body;
  if (!reponse || reponse.trim() === "")
    return res.json({ success: false, message: "Réponse vide" });
  try {
    await query(
      `UPDATE question 
       SET reponse = ?, dateReponse = NOW(), estRepondue = 1
       WHERE idQuestion = ?`,
      [reponse.trim(), req.params.id]
    );
    res.json({ success: true, message: "Réponse enregistrée" });
  } catch (err) {
    console.log("Answer question error:", err);
    res.json({ success: false, message: "Erreur réponse" });
  }
});

// 3. Supprimer une question
app.delete("/api/admin/questions/:id", async (req, res) => {
  try {
    await query("DELETE FROM question WHERE idQuestion = ?", [req.params.id]);
    res.json({ success: true, message: "Question supprimée" });
  } catch (err) {
    console.log("Delete question error:", err);
    res.json({ success: false, message: "Erreur suppression" });
  }
});

/* =========================
   STATISTIQUES DE VENTE (Admin)
========================= */
app.get("/api/admin/stats", async (req, res) => {
  try {
    // Chiffre d'affaires total et nombre de commandes
    const [totals] = await query(`
      SELECT 
        COUNT(*) AS nbCommandes,
        COALESCE(SUM(montantTotal), 0) AS caTotal,
        COALESCE(AVG(montantTotal), 0) AS caMoyen
      FROM commande
    `);

    // Commandes par statut
    const statutRows = await query(`
      SELECT statut, COUNT(*) AS nb
      FROM commande
      GROUP BY statut
    `);

    // CA par mois (12 derniers mois)
    const monthRows = await query(`
      SELECT 
        DATE_FORMAT(dateCommande, '%Y-%m') AS mois,
        COUNT(*) AS nb,
        COALESCE(SUM(montantTotal), 0) AS ca
      FROM commande
      WHERE dateCommande >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY mois
      ORDER BY mois ASC
    `);

    // Top 5 produits les plus vendus
    const topProducts = await query(`
      SELECT p.nom, SUM(lc.quantite) AS qteVendue, SUM(lc.quantite * lc.prixUnitaire) AS caGenere
      FROM lignecommande lc
      JOIN produit p ON p.idProduit = lc.idProduit
      GROUP BY lc.idProduit
      ORDER BY qteVendue DESC
      LIMIT 5
    `);

    // Nombre de clients actifs (ayant commandé)
    const [clientsActifs] = await query(`
      SELECT COUNT(DISTINCT idClient) AS nb FROM commande
    `);

    // Nouveaux clients ce mois
    const [newClients] = await query(`
      SELECT COUNT(*) AS nb FROM utilisateur
      WHERE typeUtilisateur = 'client'
        AND dateInscription >= DATE_FORMAT(NOW(), '%Y-%m-01')
    `);

    // Total avis en attente (masqués)
    const [pendingReviews] = await query(`
      SELECT COUNT(*) AS nb FROM avis WHERE estVisible = 0
    `);

    res.json({
      success: true,
      stats: {
        nbCommandes: totals.nbCommandes,
        caTotal: Number(totals.caTotal),
        caMoyen: Math.round(Number(totals.caMoyen || totals.caTotal / Math.max(totals.nbCommandes, 1))),
        parStatut: statutRows,
        parMois: monthRows,
        topProduits: topProducts,
        clientsActifs: clientsActifs.nb,
        nouveauxClients: newClients.nb,
        avisEnAttente: pendingReviews.nb
      }
    });
  } catch (err) {
    console.log("Admin stats error:", err);
    res.status(500).json({ success: false, message: "Erreur statistiques" });
  }
});

/* =========================
   GESTION DES CATÉGORIES (Admin)
========================= */

// Lister toutes les catégories
app.get("/api/admin/categories", async (req, res) => {
  try {
    const rows = await query(`
      SELECT c.idCategorie, c.nom, c.description, c.icone,
             COUNT(p.idProduit) AS nbProduits
      FROM categorie c
      LEFT JOIN produit p ON p.idCategorie = c.idCategorie
      GROUP BY c.idCategorie
      ORDER BY c.nom
    `);
    res.json({ success: true, categories: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: "Erreur chargement catégories" });
  }
});

// Ajouter une catégorie
app.post("/api/admin/categories", async (req, res) => {
  const { nom, description, icone } = req.body;
  if (!nom || nom.trim() === "")
    return res.status(400).json({ success: false, message: "Nom obligatoire" });
  try {
    const result = await query(
      "INSERT INTO categorie (nom, description, icone) VALUES (?, ?, ?)",
      [nom.trim(), description || "", icone || ""]
    );
    res.json({ success: true, idCategorie: result.insertId, message: "Catégorie créée" });
  } catch (err) {
    console.log("Add category error:", err);
    res.status(500).json({ success: false, message: "Erreur création catégorie" });
  }
});

// Modifier une catégorie
app.put("/api/admin/categories/:id", async (req, res) => {
  const { nom, description, icone } = req.body;
  if (!nom || nom.trim() === "")
    return res.status(400).json({ success: false, message: "Nom obligatoire" });
  try {
    await query(
      "UPDATE categorie SET nom=?, description=?, icone=? WHERE idCategorie=?",
      [nom.trim(), description || "", icone || "", req.params.id]
    );
    res.json({ success: true, message: "Catégorie modifiée" });
  } catch (err) {
    console.log("Update category error:", err);
    res.status(500).json({ success: false, message: "Erreur modification catégorie" });
  }
});

// Supprimer une catégorie (met les produits à NULL)
app.delete("/api/admin/categories/:id", async (req, res) => {
  try {
    await query(
      "UPDATE produit SET idCategorie = NULL WHERE idCategorie = ?",
      [req.params.id]
    );
    await query("DELETE FROM categorie WHERE idCategorie = ?", [req.params.id]);
    res.json({ success: true, message: "Catégorie supprimée" });
  } catch (err) {
    console.log("Delete category error:", err);
    res.status(500).json({ success: false, message: "Erreur suppression catégorie" });
  }
});

/* =========================
   GESTION DES PROMOTIONS (Admin)
========================= */

// Lister toutes les promos admin (pas les codes fidélité personnels)
app.get("/api/admin/promotions", async (req, res) => {
  try {
    const rows = await query(`
      SELECT idPromotion, titre, codePromo, typeReduction, tauxReduction,
             dateDebut, dateFin, estActive,
             COALESCE(estUtilise, 0) AS estUtilise,
             idClientOwner
      FROM Promotion
      WHERE idClientOwner IS NULL
      ORDER BY dateDebut DESC
    `);
    res.json({ success: true, promotions: rows });
  } catch (err) {
    console.log("Admin promotions error:", err);
    res.status(500).json({ success: false, message: "Erreur chargement promotions" });
  }
});

// Créer une promo admin
app.post("/api/admin/promotions", async (req, res) => {
  const { titre, codePromo, typeReduction, tauxReduction, dateDebut, dateFin } = req.body;
  if (!titre || !codePromo || !typeReduction || tauxReduction == null || !dateDebut || !dateFin)
    return res.status(400).json({ success: false, message: "Tous les champs sont obligatoires" });
  try {
    // Vérifier unicité du code
    const existing = await query(
      "SELECT idPromotion FROM Promotion WHERE codePromo = UPPER(?)", [codePromo]
    );
    if (existing.length)
      return res.status(409).json({ success: false, message: "Ce code promo existe déjà" });

    const result = await query(
      `INSERT INTO Promotion (titre, codePromo, typeReduction, tauxReduction, dateDebut, dateFin, estActive)
       VALUES (?, UPPER(?), ?, ?, ?, ?, 1)`,
      [titre, codePromo, typeReduction, parseFloat(tauxReduction), dateDebut, dateFin]
    );
    res.json({ success: true, idPromotion: result.insertId, message: "Promotion créée" });
  } catch (err) {
    console.log("Create promotion error:", err);
    res.status(500).json({ success: false, message: "Erreur création promotion" });
  }
});

// Activer / désactiver une promo
app.put("/api/admin/promotions/:id/toggle", async (req, res) => {
  try {
    await query(
      "UPDATE Promotion SET estActive = NOT estActive WHERE idPromotion = ?",
      [req.params.id]
    );
    res.json({ success: true, message: "Statut promotion modifié" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Erreur toggle promotion" });
  }
});

// Supprimer une promo admin
app.delete("/api/admin/promotions/:id", async (req, res) => {
  try {
    await query("DELETE FROM Promotion WHERE idPromotion = ? AND idClientOwner IS NULL", [req.params.id]);
    res.json({ success: true, message: "Promotion supprimée" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Erreur suppression promotion" });
  }
});

/* =========================
   GESTION DES LIVRAISONS (Admin)
========================= */

// Lister toutes les livraisons avec détail commande
app.get("/api/admin/livraisons", async (req, res) => {
  try {
    const rows = await query(`
      SELECT 
        l.idLivraison, l.statut, l.adresse, l.wilaya,
        l.dateEstimee, l.dateEffective, l.fraisLivraison,
        c.idCommande, c.montantTotal, c.dateCommande,
        u.prenom, u.nom, u.email, u.telephone
      FROM livraison l
      JOIN commande c ON c.idCommande = l.idCommande
      JOIN utilisateur u ON u.idUtilisateur = c.idClient
      ORDER BY c.dateCommande DESC
    `);

    const livraisons = rows.map(r => ({
      id: r.idLivraison,
      statut: r.statut,
      adresse: r.adresse,
      wilaya: r.wilaya,
      dateEstimee: r.dateEstimee,
      dateEffective: r.dateEffective,
      frais: Number(r.fraisLivraison) || 0,
      commande: {
        id: "DS-" + r.idCommande,
        total: Number(r.montantTotal),
        date: new Date(r.dateCommande).toLocaleDateString("fr-FR")
      },
      client: {
        nom: (r.prenom + " " + r.nom).trim(),
        email: r.email,
        tel: r.telephone
      }
    }));

    res.json({ success: true, livraisons });
  } catch (err) {
    console.log("Admin livraisons error:", err);
    res.status(500).json({ success: false, message: "Erreur chargement livraisons" });
  }
});

// Créer une livraison pour une commande
app.post("/api/admin/livraisons", async (req, res) => {
  const { idCommande, adresse, wilaya, dateEstimee, fraisLivraison } = req.body;
  if (!idCommande)
    return res.status(400).json({ success: false, message: "idCommande obligatoire" });
  try {
    // Vérifier qu'il n'y a pas déjà une livraison pour cette commande
    const existing = await query(
      "SELECT idLivraison FROM livraison WHERE idCommande = ?", [idCommande]
    );
    if (existing.length)
      return res.status(409).json({ success: false, message: "Livraison déjà créée pour cette commande" });

    const result = await query(
      `INSERT INTO livraison (statut, adresse, wilaya, dateEstimee, fraisLivraison, idCommande)
       VALUES ('En préparation', ?, ?, ?, ?, ?)`,
      [adresse || "", wilaya || "", dateEstimee || null, parseFloat(fraisLivraison) || 0, idCommande]
    );
    res.json({ success: true, idLivraison: result.insertId, message: "Livraison créée" });
  } catch (err) {
    console.log("Create livraison error:", err);
    res.status(500).json({ success: false, message: "Erreur création livraison" });
  }
});

// Mettre à jour le statut d'une livraison
app.put("/api/admin/livraisons/:id/statut", async (req, res) => {
  const { statut, dateEffective } = req.body;
  const STATUTS_VALIDES = ["En préparation", "Expédié", "En transit", "Livré", "Échec livraison"];
  if (!statut || !STATUTS_VALIDES.includes(statut))
    return res.status(400).json({ success: false, message: "Statut invalide" });
  try {
    await query(
      `UPDATE livraison SET statut=?, dateEffective=? WHERE idLivraison=?`,
      [statut, dateEffective || null, req.params.id]
    );
    // Synchroniser le statut de la commande liée
    if (statut === "Livré") {
      await query(
        `UPDATE commande c
         JOIN livraison l ON l.idCommande = c.idCommande
         SET c.statut = 'Livré'
         WHERE l.idLivraison = ?`,
        [req.params.id]
      );
    }
    res.json({ success: true, message: "Statut mis à jour" });
  } catch (err) {
    console.log("Update livraison error:", err);
    res.status(500).json({ success: false, message: "Erreur mise à jour statut" });
  }
});

// Ajouter une étape de suivi
app.post("/api/admin/livraisons/:id/suivi", async (req, res) => {
  const { statut, localisation, description } = req.body;
  if (!statut)
    return res.status(400).json({ success: false, message: "Statut obligatoire" });
  try {
    await query(
      `INSERT INTO suivilivraison (statut, localisation, description, dateEtape, idLivraison)
       VALUES (?, ?, ?, NOW(), ?)`,
      [statut, localisation || "", description || "", req.params.id]
    );
    // Mettre à jour aussi le statut principal de la livraison
    await query(
      "UPDATE livraison SET statut=? WHERE idLivraison=?",
      [statut, req.params.id]
    );
    res.json({ success: true, message: "Étape de suivi ajoutée" });
  } catch (err) {
    console.log("Add suivi error:", err);
    res.status(500).json({ success: false, message: "Erreur ajout suivi" });
  }
});

// Récupérer le suivi complet d'une livraison
app.get("/api/admin/livraisons/:id/suivi", async (req, res) => {
  try {
    const rows = await query(
      `SELECT idSuivi, statut, localisation, description, dateEtape
       FROM suivilivraison
       WHERE idLivraison = ?
       ORDER BY dateEtape ASC`,
      [req.params.id]
    );
    res.json({ success: true, suivi: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: "Erreur chargement suivi" });
  }
});

/* =========================
   START SERVER (unique)
========================= */
app.listen(3000, () => {
  console.log("🚀 Serveur lancé sur http://localhost:3000");
  console.log("📦 Boutique  → http://localhost:3000/FenetrePrincipale.html");
  console.log("🔐 Admin     → http://localhost:3000/FenetreAdmine.html");
});
