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
   START SERVER
========================= */
app.listen(3000, () => {
  console.log("🚀 Serveur lancé sur http://localhost:3000");
  console.log("📦 Boutique  → http://localhost:3000/FenetrePrincipale.html");
  console.log("🔐 Admin     → http://localhost:3000/FenetreAdmine.html");
});